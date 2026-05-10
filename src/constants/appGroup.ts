export const IOS_APP_GROUP = 'group.ai.dopamenu.app';

export const IOS_FAMILY_CONTROLS_ACTIVITY_NAME = 'DopaMenuShieldMonitor';
export const IOS_FAMILY_ACTIVITY_SELECTION_ID = 'problemApps';

export const IOS_EVENT_ANALYTICS_FIRST_OPEN = 'firstOpen';
export const IOS_EVENT_SUPPRESSION_EXPIRED = 'suppressionExpired';

export const IOS_USERDEFAULTS_SUPPRESSED_UNTIL = 'suppressedUntil';
export const IOS_USERDEFAULTS_LAST_SHIELD_TRIGGER = 'lastShieldTrigger';
export const IOS_USERDEFAULTS_LAST_INTERVENTION_SHOWN = 'lastInterventionShown';
/** Stamped by DopaMenuAppIntents.swift when the user's Personal Automation
 *  fires "Take a Pause" before opening a tracked app. Read on app foreground
 *  so we can route straight to the intervention modal instead of the tabs.
 *  Stored as Unix epoch *seconds* (Date.timeIntervalSince1970 — not ms). */
export const IOS_USERDEFAULTS_AUTOMATION_TRIGGERED_AT = 'automationTriggeredAt';
/** How long after `automationTriggeredAt` we still treat a foreground as
 *  "this is the automation handoff." 6 seconds covers Apple's worst-case
 *  app-launch latency without false-positive routing on a normal manual
 *  open of DopaMenu. */
export const IOS_AUTOMATION_HANDOFF_WINDOW_MS = 6_000;
/** Boot-time idempotence: lets `_layout.tsx` skip re-running startBlocking
 *  if a recent run already armed the Shield. Stored as epoch ms. */
export const IOS_USERDEFAULTS_SHIELD_ARMED_AT = 'shieldArmedAt';
/** TTL for the above flag — anything older means we re-arm. 5 minutes is
 *  short enough to recover from any drift in the extension's state but long
 *  enough that a foreground bounce doesn't burn extension-side work. */
export const IOS_SHIELD_ARMED_TTL_MS = 5 * 60 * 1000;

export const IOS_SUPPRESSION_WINDOW_MS = 30_000;
export const IOS_INTERVENTION_DEBOUNCE_MS = 5_000;

/**
 * "Automation bounce-back" — the antidote to the infinite loop where opening
 * Instagram fires the user's Personal Automation → DopaMenu opens → user
 * taps Continue → JS opens Instagram → automation fires AGAIN → DopaMenu
 * opens AGAIN → ...
 *
 * v18 architecture: the bounce flag is read by an iOS 16+ AppIntent named
 * IsBouncingIntent (openAppWhenRun=false, runs entirely in background) which
 * a hosted iCloud-shared Shortcut wraps in an If/Otherwise gate. When the
 * user picks Continue, JS arms three values:
 *   - automationBounceTo:        the target URL we'll openURL into (e.g.
 *                                "instagram://"). Used as the fallback path
 *                                if a JS-side bounce check fires (defense
 *                                in depth for users on the v17-style direct
 *                                AppIntent setup).
 *   - automationBounceUntil:     epoch ms when the bounce window expires.
 *   - automationBounceTriggerKey: a normalized lookup key (e.g. the
 *                                trigger app's bundle id, lowercased,
 *                                whitespace-stripped). IsBouncingIntent
 *                                compares this against whatever
 *                                "Shortcut Input" the Personal Automation
 *                                passes in, so a tap on a *different*
 *                                tracked app within the window still
 *                                intervenes correctly.
 *
 * Window dropped from v17's 60_000 to 8_000: the spurious re-fire happens
 * within ~1-2s of openURL, so 8s gives ample margin while keeping fresh
 * app-taps (~10s after Continue) treated as fresh user intent. The longer
 * window had a worse failure mode where tapping a different app inside the
 * window would silently route through the stale bounce target.
 *
 * Unit asymmetry on the App Group keys: `automationBounceUntil` is JS-
 * authored as epoch *ms*. `automationTriggeredAt` (different key) is
 * Swift-authored as epoch *seconds*. IsBouncingIntent reads
 * automationBounceUntil as ms (multiplies Date().timeIntervalSince1970 by
 * 1000 before comparing). Don't flip a unit.
 */
export const IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO = 'automationBounceTo';
export const IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL = 'automationBounceUntil';
export const IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TRIGGER_KEY =
  'automationBounceTriggerKey';
export const IOS_AUTOMATION_BOUNCE_WINDOW_MS = 8_000;

/**
 * v19 dynamic-state keys.
 *
 * Apple won't let us reconfigure a user's Personal Automation trigger list
 * after onboarding. So we make the trigger list a one-time decision and put
 * day-to-day control in App Group state that AppIntents read on every
 * Shortcut fire. JS owns the source of truth, native AppIntents read.
 *
 * All four are JSON-stringified before writing — kingstinct's bridge prefers
 * primitives/strings, so we serialize ourselves rather than rely on native
 * NSArray/NSDictionary marshalling that varies by iOS version.
 */

/**
 * User-configured quiet hours, mirrored from `userPreferences.quietHours`.
 * Shape: JSON-stringified `[{start: 'HH:mm', end: 'HH:mm'}]` (overnight ranges
 * supported, e.g. start='22:00', end='07:00'). Read by the Pause Shortcut's
 * silence gate; if now is in any range, the gate returns true and the
 * Shortcut halts before TakePauseIntent fires. Also consulted by the
 * DeviceActivityMonitor segments so the Shield itself respects quiet hours.
 */
export const IOS_USERDEFAULTS_QUIET_HOURS = 'quietHours';

/**
 * Apps the user has explicitly disarmed in the home-page trigger toggle —
 * the equivalent of unchecking Instagram in QuickEditPanel.Triggers. The
 * Personal Automation still fires for these apps (we can't edit the trigger
 * list), but the silence gate short-circuits the Shortcut so DopaMenu never
 * intervenes. Re-arming removes the entry, restoring intervention.
 *
 * Shape: JSON-stringified `string[]`. Each entry is a normalizeTriggerKey()
 * canonicalization (lowercased, whitespace + scheme suffix stripped, NFKD)
 * — same normalization both Swift and JS apply before comparison.
 *
 * NOTE: Shield-side enforcement (Apple's block screen on the same apps) is
 * NOT affected by disarm — disarming only silences the Shortcut path. The
 * Shield will still gate any disarmed app the user has in their
 * FamilyActivityPicker selection. Document this trade-off; the alternative
 * (rebuilding FamilyActivitySelection on every toggle) is a larger
 * round-trip that we defer.
 */
export const IOS_USERDEFAULTS_DISARMED_KEYS = 'disarmedKeys';

/**
 * Per-app monitoring windows. Apps not in this map default to "monitor
 * 24/7." Apps with an entry are monitored only inside the listed range(s)
 * on the listed day(s). Outside those windows the silence gate fires →
 * Shortcut halts → menu doesn't show.
 *
 * Shape: JSON-stringified `Record<string, Array<{start, end, daysOfWeek?}>>`
 * keyed by normalizeTriggerKey() canonical key. start/end are 'HH:mm'.
 * daysOfWeek is 1=Mon..7=Sun (omit/undefined = all days). Multiple windows
 * per app supported (e.g. 09:00–12:00 + 14:00–17:00 weekdays).
 */
export const IOS_USERDEFAULTS_APP_WINDOWS = 'appWindows';

/**
 * Trigger app passed from the Personal Automation through Shortcut Input →
 * OpenDopaMenuPauseIntent's `triggerApp` parameter → stamped here in App
 * Group on every fire. JS reads on handoff so we can:
 *   • Include the actual triggerApp in PostHog events (v18 logged 'unknown'
 *     because Apple doesn't pipe trigger context through AppIntents
 *     automatically — the user has to wire Shortcut Input as a parameter).
 *   • Apply the silence gate JS-side as defense-in-depth (so quiet hours
 *     work even for users on the v17-style direct-AppIntent setup who
 *     haven't re-imported the wrapper Shortcut with the silence gate).
 *
 * Stored as a string (the raw value the Shortcut passes — could be a bundle
 * id, display name, or scheme prefix). Cleared after consumption.
 */
export const IOS_USERDEFAULTS_AUTOMATION_TRIGGER_APP = 'automationTriggerApp';

/**
 * What set the current `suppressedUntil` window. Three sources:
 *   • 'manual' — the user tapped a Pause-for-X chip in the home page
 *   • 'quiet'  — JS auto-paused for the rest of the current quiet window
 *   • 'suppress' — the post-Continue suppression after intervention.tsx
 *
 * Used to decide whether a quiet-hours EDIT should clear the auto-pause.
 * If the user removes a quiet range while the only thing keeping the
 * Shield down is THAT quiet range's auto-pause (source='quiet'), we
 * resume blocking immediately. If source='manual' (user explicitly
 * paused 1h), we leave the pause alone — they wanted that, regardless
 * of quiet-hour edits.
 *
 * Stored as a string — empty/missing is treated as 'unknown' (legacy
 * builds had no source tag; we default to leaving the pause alone in
 * that case to avoid a regression on existing users).
 */
export const IOS_USERDEFAULTS_SUPPRESSED_SOURCE = 'suppressedSource';
