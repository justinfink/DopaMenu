# iOS WidgetKit Widget — Pending Provisioning

This folder contains the source for DopaMenu's iOS Home Screen + Lock Screen
widget. The Swift code, Info.plist, and entitlements file are complete and
checked in for review. The widget is **not active in v19** because activating
it requires manual Apple Developer portal work that has to be done outside
the codebase.

## What's here

- `DopaMenuWidget.swift` — the WidgetKit timeline provider + SwiftUI views
  (small / medium / large families). Reads JSON-serialized live menu data
  from App Group UserDefaults under `iosWidgetMenuData`. Tap behavior:
  deep-links into the host app via `dopamenu://widget-launch?id=<id>` —
  same handler the Android widget uses.
- `Info.plist` — extension Info.plist with `NSExtensionPointIdentifier`
  set to `com.apple.widgetkit-extension`.
- `DopaMenuWidget.entitlements` — App Group sharing entitlement only
  (intentionally NOT requesting Family Controls; the widget is purely a
  read-only UI surface for serialized menu data).
- `expo-target.config.js` — declares the target type as `widget` for
  `@kingstinct/expo-apple-targets` auto-discovery.

## What's already wired (active in v19)

- `src/widget/liveMenuService.ts:writeIosWidgetData()` writes the JSON
  payload to App Group on every refreshWidget() call.
- `plugins/app-intents/DopaMenuWidgetReload.{swift,m}` exposes a
  `WidgetCenter.reloadAllTimelines()` bridge to JS so widget data updates
  reflect immediately. The bridge is harmless when no widget extension
  exists — it's a no-op call in that case.
- `src/widget/refreshWidget.tsx` calls `writeIosWidgetData()` on iOS,
  which triggers the reload bridge if the native module is registered.

So as soon as the widget extension target is added back (steps below),
data flow works end-to-end with no JS changes needed.

## What v19.1 needs to do to activate

1. **Move this folder back to `targets/DopaMenuWidget/`** so
   `@kingstinct/expo-apple-targets` discovers it during `npx expo prebuild`.
2. **Register the new bundle ID** `ai.dopamenu.app.DopaMenuWidget` in
   the Apple Developer portal (Certificates, Identifiers & Profiles →
   Identifiers → "+").
3. **Add the App Group capability** to that identifier (`group.ai.dopamenu.app`).
4. **Generate an Ad Hoc provisioning profile** for the widget bundle ID
   that includes all 5 tester UDIDs (Andrew, Roric, Garrison, Mateo,
   DopaMenu Test iPhone — see `ios-credentials/main.mobileprovision` for
   the canonical UDID list).
5. **Download the .mobileprovision** to
   `ios-credentials/main_DopaMenuWidget.mobileprovision`.
6. **Add an entry to `credentials.json`**:
   ```json
   "DopaMenuWidget": {
     "provisioningProfilePath": "ios-credentials/main_DopaMenuWidget.mobileprovision",
     "distributionCertificate": {
       "path": "ios-credentials/dist.p12",
       "password": "dopamenu-eas-dev-2026"
     }
   }
   ```
7. **Build + install**. The widget appears in the iOS widget gallery
   under "DopaMenu" and renders the live menu.

## Why this isn't done in v19

EAS preview-device builds use `credentialsSource: "local"` (see
`eas.json`). With local credentials, EAS expects every signed target to
have an entry in `credentials.json` pointing at a real .mobileprovision.
A new target without that entry causes the build to fail with a missing-
credentials error. Generating the .mobileprovision requires Apple
Developer portal access and the Family Controls Distribution approval
process is still in-flight, so this is best done as a focused follow-up
session.
