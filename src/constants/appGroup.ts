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
