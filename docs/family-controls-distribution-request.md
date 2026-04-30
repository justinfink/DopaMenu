---
Purpose: Text to submit at developer.apple.com/contact/request/family-controls-distribution/
App: DopaMenu (ai.dopamenu.app)
Author: Justin Fink
Updated: 2026-04-24
---

# Family Controls (Distribution) Request — DopaMenu

Apple's request form has five fields. Copy/paste below; edit the bracketed
placeholders (team ID, App IDs, your name) before sending. Keep answers
factual and short — this is a gating review and fluffy language reads as
dodging the real use case.

## Apple Developer Team ID
```
M7CDD4UUDS
```

## App Bundle IDs (all four)
```
ai.dopamenu.app
ai.dopamenu.app.ShieldConfiguration
ai.dopamenu.app.ShieldAction
ai.dopamenu.app.ActivityMonitorExtension
```

## App name
```
DopaMenu
```

## Description of your app and how it uses Family Controls
DopaMenu is a self-directed behavior-change app for people trying to reduce
compulsive use of specific apps they've chosen themselves (social media, news,
short-form video, etc.). It is not a parental-control product and never
monitors another person's device — the authorizing user is always the same
person using the device.

The user selects their own dopamine-trigger apps via the standard
FamilyActivityPicker. DopaMenu then uses:
- ManagedSettings to shield the user's chosen apps with a short intentional
  pause before those apps open.
- ShieldConfiguration / ShieldAction extensions to present DopaMenu's own
  shield copy and route the user into a short in-app intervention (a breath,
  a reframe, a pre-committed alternative activity the user picked during
  onboarding).
- DeviceActivityMonitor extension to re-apply the shield after the user's
  chosen "continue with intention" grace window elapses, so the block holds
  across app backgrounding and device reboots without needing DopaMenu to be
  in the foreground.

Nothing in the pipeline reads bundle IDs, usage totals, or app names out of
the opaque ApplicationTokens — DopaMenu only reasons about the user's own
selection via the picker. No data leaves the device.

## Why Family Controls is required (not a substitute)
Screen Time via Settings is the only other Apple-supported way to block an
app, but it requires the user to pre-commit to a fixed time window and
exposes no API for an app to show contextual, in-the-moment content. The
entire point of DopaMenu is to put a single thoughtful pause between the
user and the app they're reaching for, with a user-authored alternative
surfaced in the moment — that requires ShieldConfiguration + ShieldAction +
DeviceActivityMonitor, which only the Family Controls framework provides.

## Distribution channel
Initial release: TestFlight (internal + external beta) followed by public
App Store. No sideloading, no enterprise distribution.

## Individual use (not Child/Parent)
DopaMenu uses `.individual` authorization
(`AuthorizationCenter.shared.requestAuthorization(for: .individual)`). The
user authorizes Family Controls on their own device for their own selection.
DopaMenu never attempts to manage a child's device or request parental
authorization.

---

## Submission checklist
- [ ] Submit at https://developer.apple.com/contact/request/family-controls-distribution/
- [ ] Use the Team ID owner's Apple ID (that's you)
- [ ] Attach App Store Connect screenshot showing the 4 bundle IDs under the
      DopaMenu team (the portal asks for "App IDs that should receive the
      entitlement")
- [ ] Expected turnaround: **2–6 weeks**. Don't block the Phase 2 rollout on
      this — development-level Family Controls is already enabled and covers
      TestFlight internal testing with the team's own devices.
