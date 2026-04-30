import { Platform } from 'react-native';
import {
  IOS_APP_GROUP,
  IOS_AUTOMATION_BOUNCE_WINDOW_MS,
  IOS_AUTOMATION_HANDOFF_WINDOW_MS,
  IOS_EVENT_ANALYTICS_FIRST_OPEN,
  IOS_EVENT_SUPPRESSION_EXPIRED,
  IOS_FAMILY_ACTIVITY_SELECTION_ID,
  IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
  IOS_INTERVENTION_DEBOUNCE_MS,
  IOS_SHIELD_ARMED_TTL_MS,
  IOS_SUPPRESSION_WINDOW_MS,
  IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO,
  IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL,
  IOS_USERDEFAULTS_AUTOMATION_TRIGGERED_AT,
  IOS_USERDEFAULTS_LAST_INTERVENTION_SHOWN,
  IOS_USERDEFAULTS_LAST_SHIELD_TRIGGER,
  IOS_USERDEFAULTS_SHIELD_ARMED_AT,
  IOS_USERDEFAULTS_SUPPRESSED_UNTIL,
} from '../constants/appGroup';

// react-native-device-activity is iOS-only. Guard every call so Android and
// web don't blow up trying to import the native module.
type RNDAModule = typeof import('react-native-device-activity');
let RNDA: RNDAModule | null = null;
if (Platform.OS === 'ios') {
  try {
    RNDA = require('react-native-device-activity') as RNDAModule;
  } catch {
    RNDA = null;
  }
}

const isSupported = () => Platform.OS === 'ios' && !!RNDA;

export type FamilyControlsAuthStatus = 'approved' | 'denied' | 'notDetermined' | 'unknown';

export async function requestFamilyControlsAuthorization(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    await RNDA!.requestAuthorization('individual');
    return getAuthorizationStatus() === 'approved';
  } catch (err) {
    console.warn('[iOSFamilyControls] auth failed', err);
    return false;
  }
}

export function getAuthorizationStatus(): FamilyControlsAuthStatus {
  if (!isSupported()) return 'unknown';
  try {
    const raw = RNDA!.getAuthorizationStatus();
    if (raw === 2) return 'approved';
    if (raw === 1) return 'denied';
    if (raw === 0) return 'notDetermined';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function saveProblemAppSelection(selection: string): void {
  if (!isSupported()) return;
  RNDA!.setFamilyActivitySelectionId({
    id: IOS_FAMILY_ACTIVITY_SELECTION_ID,
    familyActivitySelection: selection,
  });
}

export function getProblemAppSelection(): string | undefined {
  if (!isSupported()) return undefined;
  return RNDA!.getFamilyActivitySelectionId(IOS_FAMILY_ACTIVITY_SELECTION_ID);
}

export function hasProblemAppSelection(): boolean {
  const s = getProblemAppSelection();
  return !!s && s.length > 0;
}

/**
 * Configure the Shield UI — what the user sees when iOS intercepts their tap.
 * Shield layout is Apple-owned (icon, title, subtitle, two buttons) and can't
 * host arbitrary views. We use every customizable property.
 *
 * {applicationOrDomainDisplayName} is substituted at render time inside the
 * ShieldConfiguration extension against the specific app the user tapped.
 */
export function applyShieldAppearance(): void {
  if (!isSupported()) return;
  // IMPORTANT: kingstinct's getColor() in node_modules/.../Shared.swift divides
  // each channel by 255. So we MUST send RGB values in 0..255 range, NOT the
  // 0..1 normalized form. Sending 0..1 here means everything renders near
  // black (e.g., 0.608/255 ≈ 0.0024). That was the "primary button is a
  // black pill with invisible text" bug Garrison saw in the first iOS test.
  // Alpha is the exception — kingstinct does NOT divide it, so keep 0..1.
  const purple = { red: 155, green: 123, blue: 184, alpha: 1 };  // #9B7BB8
  const white = { red: 255, green: 255, blue: 255, alpha: 1 };
  const softBg = { red: 248, green: 246, blue: 250, alpha: 1 };  // #F8F6FA
  const dark = { red: 31, green: 26, blue: 41, alpha: 1 };       // #1F1A29

  // Key MUST be 'shieldConfiguration' (camelCase). The kingstinct extension's
  // FALLBACK_SHIELD_CONFIGURATION_KEY is 'shieldConfiguration'; if we write
  // anything else (e.g. 'shield_configuration'), the extension never finds
  // our config and Apple falls back to its default Shield — which blocks the
  // app but has no "Take a pause" button and no path back to DopaMenu. This
  // exact bug stranded the Shield in the first Garrison test.
  // Copy is honest about what each button DOES on this Shield. The primary
  // button just closes the Shield (no promise of opening DopaMenu — Apple
  // does not officially support host-app launches from ShieldActionDelegate
  // and the undocumented NSExtensionContext.open() trick is unreliable on
  // iOS 18). The actual redirect-to-DopaMenu experience runs through the
  // Personal Automation set up in Settings (the tap-free path). Without
  // tap-free, the Shield is pure friction — which is still useful as a
  // "do you really want to?" prompt — but we don't lie about it routing
  // anywhere. With tap-free set up, the automation intercepts the app open
  // BEFORE the Shield sees it, so most users never view this Shield at all.
  RNDA!.userDefaultsSet('shieldConfiguration', {
    backgroundColor: softBg,
    title: 'Pause.',
    titleColor: dark,
    subtitle:
      'Take a breath before opening {applicationOrDomainDisplayName}. Are you sure?',
    subtitleColor: dark,
    primaryButtonLabel: 'Take a breath',
    primaryButtonLabelColor: white,
    primaryButtonBackgroundColor: purple,
    secondaryButtonLabel: 'Open {applicationOrDomainDisplayName}',
    secondaryButtonLabelColor: purple,
    iconSystemName: 'leaf.circle.fill',
    iconTint: purple,
  });
}

/**
 * Configure the actions the Shield buttons trigger.
 *
 * Primary ("Take a pause") → opens dopamenu:// deep link via
 *   NSExtensionContext().open(url) — the undocumented-but-ships trick
 *   exposed by the package as the `openUrl` action.
 * Secondary ("Not now") → close the shield only.
 */
export function applyShieldActions(): void {
  if (!isSupported()) return;
  // Key MUST be 'shieldActions' (camelCase). The extension reads from this
  // key; a snake_case write is silently ignored and the buttons no-op.
  //
  // Primary ("Take a pause"): close the Shield AND fire openUrl with our
  // deep link so DopaMenu opens to the intervention modal. The openUrl
  // handler inside executeGenericAction is patched into node_modules via
  // patches/react-native-device-activity+0.6.1.patch — without that patch,
  // action lists with type:"openUrl" silently no-op when iterated.
  //
  // Secondary ("Not now"): behavior MUST be 'defer'. 'defer' closes the
  // Shield AND lets iOS continue opening the app the user originally
  // tapped. 'close' would just dismiss the Shield and dump the user on
  // their home screen — that's the "ignore button takes to home page"
  // bug. The user explicitly wants Not-now to mean "let me through this
  // time," not "block me harder."
  RNDA!.userDefaultsSet('shieldActions', {
    primary: {
      behavior: 'close',
      actions: [
        {
          type: 'openUrl',
          url: 'dopamenu://intervention?source=shield&token={token}&name={applicationOrDomainDisplayName}',
        },
      ],
    },
    secondary: {
      behavior: 'defer',
      actions: [],
    },
  });
}

/**
 * Configure the DeviceActivityMonitor extension to re-apply the shield when
 * the suppression window elapses. Fires eventDidReachThreshold for
 * IOS_EVENT_SUPPRESSION_EXPIRED → monitor runs the configured action
 * (blockSelection) entirely from the extension, without needing the host app.
 * This is the re-arm mechanism that makes "continue with intention" safe.
 */
export function configureMonitorActions(): void {
  if (!isSupported()) return;
  RNDA!.configureActions({
    activityName: IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
    callbackName: 'eventDidReachThreshold',
    eventName: IOS_EVENT_SUPPRESSION_EXPIRED,
    actions: [
      {
        type: 'blockSelection',
        familyActivitySelectionId: IOS_FAMILY_ACTIVITY_SELECTION_ID,
      },
    ],
  });
  // Analytics-only event — no action, just logs.
  RNDA!.configureActions({
    activityName: IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
    callbackName: 'eventDidReachThreshold',
    eventName: IOS_EVENT_ANALYTICS_FIRST_OPEN,
    actions: [],
  });
}

/**
 * Turn on the full blocking pipeline. Splits into two parts:
 *
 *   (A) ALWAYS-RUN config writes — applyShieldAppearance, applyShieldActions,
 *       configureMonitorActions, blockSelection. These are App-Group
 *       UserDefaults writes plus a single `store.shield.applications =`
 *       assignment. They're cheap and they MUST refresh every boot,
 *       because:
 *         • If we ship a new build with new keys/copy/behavior, an old
 *           ARMED_AT flag from a prior install would otherwise keep us
 *           short-circuiting and leave the *old* (potentially broken)
 *           config in UserDefaults forever.
 *         • This was the exact bug that left Garrison's first install
 *           reading the wrong-cased UserDefaults keys after we shipped
 *           the camelCase fix — the idempotence flag prevented re-write.
 *       So config writes don't honor the idempotence window.
 *
 *   (B) IDEMPOTENT heavy work — startMonitoring. Registering a
 *       DeviceActivityCenter monitor is the expensive native call.
 *       It's safe to skip on every foreground if we ran it recently.
 *
 * `force=true` skips the idempotence window (used after the user
 * explicitly changes their selection).
 */
export async function startBlocking(opts: { force?: boolean } = {}): Promise<void> {
  if (!isSupported()) return;
  if (!hasProblemAppSelection()) {
    console.warn('[iOSFamilyControls] startBlocking called without selection');
    return;
  }

  // (A) ALWAYS REFRESH CONFIG. Cheap UserDefaults writes plus a shield
  // assignment — guarantees the latest schema is in App Group storage no
  // matter what stale state the previous install left behind.
  applyShieldAppearance();
  applyShieldActions();
  configureMonitorActions();
  RNDA!.blockSelection({ activitySelectionId: IOS_FAMILY_ACTIVITY_SELECTION_ID });

  // (B) IDEMPOTENT START_MONITORING. Skip the expensive native call if
  // we ran it within the TTL window.
  if (!opts.force) {
    const armedAt = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_SHIELD_ARMED_AT) ?? 0;
    if (armedAt > 0 && Date.now() - armedAt < IOS_SHIELD_ARMED_TTL_MS) {
      return;
    }
  }

  await RNDA!.startMonitoring(
    IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
    {
      intervalStart: { hour: 0, minute: 0, second: 0 },
      intervalEnd: { hour: 23, minute: 59, second: 59 },
      repeats: true,
    },
    [
      // Analytics: cumulative 1s across all shielded apps.
      {
        familyActivitySelection: getProblemAppSelection()!,
        eventName: IOS_EVENT_ANALYTICS_FIRST_OPEN,
        threshold: { second: 1 },
      },
    ],
  );

  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_SHIELD_ARMED_AT, Date.now());
}

/**
 * Lift the Shield for an explicit duration (e.g. user taps "Pause for an
 * hour" in settings). The DeviceActivityMonitor extension auto-rearms when
 * the duration expires — same mechanism as suppressBlocking, just with a
 * caller-chosen window instead of the standard 30s after-Continue.
 */
export async function pauseBlockingFor(durationMs: number): Promise<void> {
  if (!isSupported()) return;
  if (durationMs <= 0) return;
  const until = Date.now() + durationMs;
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_SUPPRESSED_UNTIL, until);
  // Drop the shield for now; the monitor reapplies after the window.
  RNDA!.clearAllManagedSettingsStoreSettings();
  // Mark shield as un-armed so startBlocking will run fresh next time.
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_SHIELD_ARMED_AT, 0);
  const selection = getProblemAppSelection();
  if (!selection) return;
  await RNDA!.startMonitoring(
    IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
    {
      intervalStart: { hour: 0, minute: 0, second: 0 },
      intervalEnd: { hour: 23, minute: 59, second: 59 },
      repeats: true,
    },
    [
      {
        familyActivitySelection: selection,
        eventName: IOS_EVENT_SUPPRESSION_EXPIRED,
        threshold: { second: Math.round(durationMs / 1000) },
      },
    ],
  );
}

/**
 * Resume blocking before the pause window expires (e.g. user taps "Resume
 * now"). Re-arms the Shield immediately and clears the suppression flag.
 */
export async function resumeBlocking(): Promise<void> {
  if (!isSupported()) return;
  RNDA!.userDefaultsRemove(IOS_USERDEFAULTS_SUPPRESSED_UNTIL);
  await startBlocking({ force: true });
}

/** True if the Shield is currently paused (and the pause hasn't expired). */
export function isPaused(): boolean {
  if (!isSupported()) return false;
  const until = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_SUPPRESSED_UNTIL) ?? 0;
  return until > Date.now();
}

/** When the current pause expires, in epoch ms. 0 if not paused. */
export function pausedUntil(): number {
  if (!isSupported()) return 0;
  return RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_SUPPRESSED_UNTIL) ?? 0;
}

export async function stopBlocking(): Promise<void> {
  if (!isSupported()) return;
  try {
    RNDA!.clearAllManagedSettingsStoreSettings();
    RNDA!.stopMonitoring([IOS_FAMILY_CONTROLS_ACTIVITY_NAME]);
    RNDA!.userDefaultsSet(IOS_USERDEFAULTS_SHIELD_ARMED_AT, 0);
  } catch (err) {
    console.warn('[iOSFamilyControls] stopBlocking failed', err);
  }
}

/**
 * User chose "continue with intention". Temporarily lift all shields, then
 * schedule DeviceActivityMonitor to re-shield after IOS_SUPPRESSION_WINDOW_MS
 * of cumulative activity in the shielded selection.
 *
 * The re-arm happens inside the monitor extension — survives DopaMenu being
 * backgrounded / killed while the user is in Instagram.
 */
export async function suppressBlocking(tokenHash?: string): Promise<void> {
  if (!isSupported()) return;
  const until = Date.now() + IOS_SUPPRESSION_WINDOW_MS;
  if (tokenHash) {
    RNDA!.userDefaultsSet(`${IOS_USERDEFAULTS_SUPPRESSED_UNTIL}_${tokenHash}`, until);
  }
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_SUPPRESSED_UNTIL, until);

  // Drop the shield so the target app opens without friction.
  RNDA!.clearAllManagedSettingsStoreSettings();

  // Arm the re-shield event: after suppression-window seconds of cumulative
  // usage across shielded apps, fire eventDidReachThreshold →
  // IOS_EVENT_SUPPRESSION_EXPIRED → monitor re-applies blockSelection.
  const selection = getProblemAppSelection();
  if (!selection) return;
  await RNDA!.startMonitoring(
    IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
    {
      intervalStart: { hour: 0, minute: 0, second: 0 },
      intervalEnd: { hour: 23, minute: 59, second: 59 },
      repeats: true,
    },
    [
      {
        familyActivitySelection: selection,
        eventName: IOS_EVENT_SUPPRESSION_EXPIRED,
        threshold: { second: Math.round(IOS_SUPPRESSION_WINDOW_MS / 1000) },
      },
    ],
  );
}

/**
 * Fallback re-arm. Called when the RN app next foregrounds and we notice the
 * suppression window has elapsed but shield is still off (e.g. monitor
 * threshold didn't fire because user hadn't accumulated activity).
 */
export function ensureShieldArmedIfWindowExpired(): void {
  if (!isSupported()) return;
  const until = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_SUPPRESSED_UNTIL) ?? 0;
  if (!until || Date.now() < until) return;
  RNDA!.userDefaultsRemove(IOS_USERDEFAULTS_SUPPRESSED_UNTIL);
  if (hasProblemAppSelection()) {
    RNDA!.blockSelection({ activitySelectionId: IOS_FAMILY_ACTIVITY_SELECTION_ID });
  }
}

export function recordShieldTrigger(tokenHash: string, displayName?: string): void {
  if (!isSupported()) return;
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_LAST_SHIELD_TRIGGER, {
    tokenHash,
    displayName,
    triggeredAt: Date.now(),
  });
}

export function readShieldTrigger(): {
  tokenHash?: string;
  displayName?: string;
  triggeredAt?: number;
} {
  if (!isSupported()) return {};
  return (
    RNDA!.userDefaultsGet<{
      tokenHash?: string;
      displayName?: string;
      triggeredAt?: number;
    }>(IOS_USERDEFAULTS_LAST_SHIELD_TRIGGER) ?? {}
  );
}

export function shouldShowIntervention(): boolean {
  if (!isSupported()) return true;
  const last = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_LAST_INTERVENTION_SHOWN) ?? 0;
  return Date.now() - last > IOS_INTERVENTION_DEBOUNCE_MS;
}

export function markInterventionShown(): void {
  if (!isSupported()) return;
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_LAST_INTERVENTION_SHOWN, Date.now());
}

export const APP_GROUP_ID = IOS_APP_GROUP;

// ─── Tap-free mode (Personal Automation handoff) ─────────────────────────
//
// When the user has set up a Shortcuts.app Personal Automation that runs our
// "Take a Pause" App Intent on tracked-app open, the Swift intent stamps
// `automationTriggeredAt` in the App Group right before iOS foregrounds
// DopaMenu. The JS layer reads it on every foreground; if the timestamp is
// recent we know this launch is an automation handoff and we should route
// to the intervention modal instead of the tabs. We also clear the stamp
// after consuming so we never double-fire on a subsequent manual launch.

/**
 * Returns true if the App Group has a fresh automation-triggered timestamp
 * (within IOS_AUTOMATION_HANDOFF_WINDOW_MS). Side effect: clears the stamp
 * so the same handoff isn't consumed twice.
 */
export function consumeAutomationHandoff(): boolean {
  if (!isSupported()) return false;
  const ts = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_AUTOMATION_TRIGGERED_AT) ?? 0;
  if (!ts) return false;
  // Stamp is in epoch *seconds* (Swift's Date.timeIntervalSince1970).
  const stampMs = ts * 1000;
  RNDA!.userDefaultsRemove(IOS_USERDEFAULTS_AUTOMATION_TRIGGERED_AT);
  return Date.now() - stampMs <= IOS_AUTOMATION_HANDOFF_WINDOW_MS;
}

/**
 * Pure read — does NOT clear the stamp. Used for diagnostics ("is the
 * automation actually firing?") in the setup walkthrough.
 */
export function lastAutomationTriggerAt(): number {
  if (!isSupported()) return 0;
  const ts = RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_AUTOMATION_TRIGGERED_AT) ?? 0;
  return ts * 1000;
}

// ─── Automation bounce-back (loop fix) ───────────────────────────────────
//
// Problem: a Personal Automation that runs OpenDopaMenuPauseIntent on every
// tracked-app open creates an infinite loop with the Continue path:
//   tap Instagram → automation fires → DopaMenu → user taps Continue
//                  → JS openURL(instagram://) → Instagram opens
//                  → automation fires AGAIN → DopaMenu → ... forever
//
// We can't make the AppIntent's `openAppWhenRun` conditional (it's a static
// constant per Apple's design), so we accept that DopaMenu will briefly
// foreground on the second fire and use the App Group to short-circuit:
// JS sets a "bounce-back" target before opening the trigger app, and on the
// next foreground the layout's automation handler sees the bounce stamp and
// re-launches the target URL instead of routing to /intervention. Net effect:
// sub-second DopaMenu flash, then back to Instagram, then no further loops
// (the bounce stamp clears after one consumption).

/**
 * Mark "the next automation handoff should bounce back to <url> instead of
 * showing the intervention modal." Called from intervention.tsx right before
 * Linking.openURL on a Continue path.
 */
export function setAutomationBounce(targetUrl: string): void {
  if (!isSupported()) return;
  if (!targetUrl) return;
  RNDA!.userDefaultsSet(IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO, targetUrl);
  RNDA!.userDefaultsSet(
    IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL,
    Date.now() + IOS_AUTOMATION_BOUNCE_WINDOW_MS,
  );
}

/**
 * If a bounce is armed and unexpired, return its target URL and CLEAR the
 * stamps (single-shot consumption). If expired or absent, return null and
 * also clear stale stamps so they don't sit around.
 *
 * Called from `_layout.tsx` handleAutomationHandoff before deciding whether
 * to render the intervention modal. A truthy return short-circuits to a
 * Linking.openURL bounce.
 */
export function consumeAutomationBounce(): string | null {
  if (!isSupported()) return null;
  const until =
    RNDA!.userDefaultsGet<number>(IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL) ?? 0;
  if (!until) return null;
  // Always clear (single-shot) — whether it fired or expired.
  const target =
    RNDA!.userDefaultsGet<string>(IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO) ?? null;
  RNDA!.userDefaultsRemove(IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL);
  RNDA!.userDefaultsRemove(IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO);
  if (Date.now() > until) return null;
  return target;
}
