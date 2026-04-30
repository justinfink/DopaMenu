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
 * Instagram fires the Shortcut → DopaMenu opens → user taps Continue → JS
 * opens Instagram → Shortcut fires AGAIN → DopaMenu opens AGAIN → ...
 *
 * When the user picks Continue, we stamp a target URL and an expiry. The next
 * time a Personal Automation handoff brings DopaMenu to the foreground, JS
 * checks the bounce stamp first; if it's fresh, JS immediately re-launches
 * the bounce target (e.g. instagram://) and skips the intervention render.
 * The user sees a sub-second flash of DopaMenu instead of being pinballed
 * back into the modal.
 *
 * Window must be long enough to cover the second automation fire that the
 * first openURL triggers, but short enough that the next legitimate "I just
 * tapped Instagram" event re-arms the intervention. 60 seconds is empirically
 * about right — fires once on the bounce, then expires before the user
 * notices iOS hasn't intervened on a fresh open.
 */
export const IOS_USERDEFAULTS_AUTOMATION_BOUNCE_TO = 'automationBounceTo';
export const IOS_USERDEFAULTS_AUTOMATION_BOUNCE_UNTIL = 'automationBounceUntil';
export const IOS_AUTOMATION_BOUNCE_WINDOW_MS = 60_000;
