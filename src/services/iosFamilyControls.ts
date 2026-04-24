import { Platform } from 'react-native';
import {
  IOS_APP_GROUP,
  IOS_EVENT_ANALYTICS_FIRST_OPEN,
  IOS_EVENT_SUPPRESSION_EXPIRED,
  IOS_FAMILY_ACTIVITY_SELECTION_ID,
  IOS_FAMILY_CONTROLS_ACTIVITY_NAME,
  IOS_INTERVENTION_DEBOUNCE_MS,
  IOS_SUPPRESSION_WINDOW_MS,
  IOS_USERDEFAULTS_LAST_INTERVENTION_SHOWN,
  IOS_USERDEFAULTS_LAST_SHIELD_TRIGGER,
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
  const purple = { red: 0.608, green: 0.482, blue: 0.722, alpha: 1 };
  const white = { red: 1, green: 1, blue: 1, alpha: 1 };
  const softBg = { red: 0.972, green: 0.964, blue: 0.98, alpha: 1 };
  const dark = { red: 0.12, green: 0.1, blue: 0.16, alpha: 1 };

  RNDA!.userDefaultsSet('shield_configuration', {
    backgroundColor: softBg,
    title: 'Pause.',
    titleColor: dark,
    subtitle:
      'Before you open {applicationOrDomainDisplayName}, take a breath with DopaMenu.',
    subtitleColor: dark,
    primaryButtonLabel: 'Take a pause',
    primaryButtonLabelColor: white,
    primaryButtonBackgroundColor: purple,
    secondaryButtonLabel: 'Not now',
    secondaryButtonLabelColor: purple,
    iconSystemName: 'leaf.circle.fill',
    iconTint: { red: 0.608, green: 0.482, blue: 0.722, alpha: 1 },
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
  RNDA!.userDefaultsSet('shield_actions', {
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
      behavior: 'close',
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
 * Turn on the full blocking pipeline. Applies shield UI + actions + block
 * targeting + DeviceActivity monitor. Idempotent.
 */
export async function startBlocking(): Promise<void> {
  if (!isSupported()) return;
  if (!hasProblemAppSelection()) {
    console.warn('[iOSFamilyControls] startBlocking called without selection');
    return;
  }

  applyShieldAppearance();
  applyShieldActions();
  configureMonitorActions();

  RNDA!.blockSelection({ activitySelectionId: IOS_FAMILY_ACTIVITY_SELECTION_ID });

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
}

export async function stopBlocking(): Promise<void> {
  if (!isSupported()) return;
  try {
    RNDA!.clearAllManagedSettingsStoreSettings();
    RNDA!.stopMonitoring([IOS_FAMILY_CONTROLS_ACTIVITY_NAME]);
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
