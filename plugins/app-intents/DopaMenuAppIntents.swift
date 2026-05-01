//
//  DopaMenuAppIntents.swift
//  DopaMenu
//
//  Declares the App Intent and App Shortcut that lets a user wire DopaMenu
//  into a Shortcuts.app Personal Automation. Once the user creates an
//  automation that runs this intent on app open (multi-select all their
//  tracked apps), iOS fires the intent BEFORE the tracked app foregrounds —
//  meaning DopaMenu opens first and gets to show the intervention modal.
//
//  Why this exists: Apple does not let an app create Personal Automations
//  programmatically. The smoothest possible setup is:
//    (a) declare an App Shortcut with a clear name + icon so it shows up
//        prominently in Shortcuts.app's action picker, and
//    (b) deep-link the user straight to `shortcuts://create-automation`
//        from inside DopaMenu so they skip every navigation step.
//
//  When the intent runs:
//    1. We stamp an App Group flag with the current timestamp so the host
//       app knows it was opened via automation.
//    2. We return `.result()` and rely on `openAppWhenRun = true` to bring
//       DopaMenu to the foreground.
//    3. JS-side, app/_layout.tsx checks the flag on every foreground; if
//       it's recent (within IOS_AUTOMATION_HANDOFF_WINDOW_MS, currently 6s),
//       we route to /intervention so the React Native modal renders. The
//       window is intentionally generous because cold-launching DopaMenu
//       through the automation chain can take ~2s on older devices.
//
//  Patched into the iOS app target by plugins/app-intents/withDopaMenuAppIntents.js.

import AppIntents
import Foundation

@available(iOS 16.0, *)
struct OpenDopaMenuPauseIntent: AppIntent {
  static let title: LocalizedStringResource = "Take a Pause"

  static let description = IntentDescription(
    "Lets DopaMenu step in before a tracked app opens. Use this as the action of an Open App automation in Shortcuts."
  )

  // Bringing the host app to the foreground is the entire point of this
  // intent — without this, the AppIntent would run silently and the user
  // would land directly in Instagram (or whichever tracked app fired the
  // automation) without seeing DopaMenu.
  static let openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    // Stamp the App Group so the JS layer knows this launch came from the
    // Personal Automation chain rather than a manual icon tap. Group ID is
    // hard-coded to match `IOS_APP_GROUP` in src/constants/appGroup.ts —
    // keep them in sync.
    if let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app") {
      defaults.set(Date().timeIntervalSince1970, forKey: "automationTriggeredAt")
    }
    return .result()
  }
}

// ─── Bounce gate (v18) ───────────────────────────────────────────────────
//
// Solves the v17 infinite loop. Instead of the user's Personal Automation
// running OpenDopaMenuPauseIntent directly, the user imports a hosted
// iCloud-shared Shortcut named "Pause" that wraps:
//
//   1. Run IsBouncingIntent (this struct, openAppWhenRun=false → background)
//   2. If [Result is true] → Stop Shortcut
//      Otherwise → Run Take a Pause (foregrounds DopaMenu)
//
// JS arms a bounce flag in the App Group when the user taps Continue. On
// the side-effect re-fire of the automation (caused by JS's openURL of the
// trigger app), iOS launches our Shortcut, which calls IsBouncingIntent
// silently. We see the flag is fresh and matches the trigger app, return
// true, the Shortcut hits Stop, TakePauseIntent never runs, DopaMenu never
// foregrounds. Loop dead.
//
// `openAppWhenRun = false` is what makes this work — without it, every
// automation re-fire would foreground DopaMenu before perform() even ran.
// The static-let constraint that bit us in v17 is honored: this intent is
// always background, the OTHER intent (TakePauseIntent) is always foreground,
// and the user's Shortcut chooses which one runs based on our return value.
@available(iOS 16.0, *)
struct IsBouncingIntent: AppIntent {
  static let title: LocalizedStringResource = "Check Pause Bounce"

  static let description = IntentDescription(
    "Internal action used by DopaMenu's hosted Pause Shortcut. Reads a flag "
    + "from the App Group and reports whether the current automation fire "
    + "should be silenced. Users don't run this directly."
  )

  // CRITICAL: must be false. This is the entire mechanism that prevents
  // DopaMenu from foregrounding on the spurious automation re-fires. If this
  // ever flips to true, the loop returns immediately on every Continue tap.
  static let openAppWhenRun: Bool = false

  // Optional. Personal Automations triggered by "App is Opened" pass the
  // trigger app reference into the called Shortcut as Shortcut Input. Apple's
  // public docs don't fully specify the exact data type the Shortcut receives
  // — so when the user binds Shortcut Input to this parameter, what we see
  // in `triggerApp` may be a bundle id, a localized display name, an opaque
  // reference, or empty.
  //
  // We accept all of those: we lowercase + strip whitespace + drop URL
  // scheme suffixes from both `triggerApp` and the JS-armed
  // `automationBounceTriggerKey`, and consider them a match if the
  // normalized strings are equal.
  //
  // If `triggerApp` is empty (Shortcut Input wasn't passed, or Apple gives
  // us nothing usable), we fall back to time-only bounce — the time window
  // is short enough (8 seconds) that the false-positive risk is small.
  @Parameter(
    title: "Trigger app",
    description: "The app whose open is being checked against the bounce window. Bind Shortcut Input here when calling from a Personal Automation."
  )
  var triggerApp: String?

  func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
    guard let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app") else {
      return .result(value: false)
    }
    // automationBounceUntil is JS-authored as epoch *milliseconds* (matches
    // Date.now() + window). Compare to nowMs accordingly. See the unit-
    // asymmetry note in src/constants/appGroup.ts — automationTriggeredAt
    // is seconds, automationBounceUntil is ms.
    let untilMs = defaults.double(forKey: "automationBounceUntil")
    let nowMs = Date().timeIntervalSince1970 * 1000
    guard untilMs > nowMs else { return .result(value: false) }

    // Per-app comparison — only silences re-fires for the SAME app the user
    // hit Continue on. A tap on a different tracked app inside the bounce
    // window still intervenes correctly.
    let storedKey =
      defaults.string(forKey: "automationBounceTriggerKey") ?? ""
    let passed = (triggerApp ?? "").trimmingCharacters(in: .whitespaces)

    if !passed.isEmpty && !storedKey.isEmpty {
      // Same normalization as JS's normalizeTriggerKey() in
      // src/services/iosFamilyControls.ts. Keep these two implementations in
      // lockstep — divergence here means false negatives that re-introduce
      // the loop intermittently.
      let norm = { (s: String) -> String in
        let stripped = s
          .replacingOccurrences(of: "://", with: "")
          .replacingOccurrences(of: ":", with: "")
          .replacingOccurrences(of: " ", with: "")
        return stripped.precomposedStringWithCanonicalMapping.lowercased()
      }
      return .result(value: norm(passed) == norm(storedKey))
    }

    // Time-only bounce: window is fresh, but we don't have both a passed
    // app reference AND a stored trigger key to compare. Silence anyway.
    // The 8-second window keeps the false-positive blast radius small.
    return .result(value: true)
  }
}

@available(iOS 16.0, *)
struct DopaMenuAppShortcutsProvider: AppShortcutsProvider {
  // Purple to match DopaMenu's brand. Shows in Shortcuts.app + Spotlight.
  static let shortcutTileColor: ShortcutTileColor = .purple

  static var appShortcuts: [AppShortcut] {
    // Both intents must be registered here so Shortcuts.app's action picker
    // surfaces them when the user (or Justin, when building the hosted Pause
    // Shortcut) searches "DopaMenu" or "Take a Pause" or "Check Pause Bounce".
    // Without this provider entry, the AppIntent compiles into the binary
    // but Shortcuts.app never knows it exists.
    AppShortcut(
      intent: OpenDopaMenuPauseIntent(),
      phrases: [
        "Take a pause with \(.applicationName)",
        "Pause with \(.applicationName)",
        "Open \(.applicationName) intervention",
      ],
      shortTitle: "Take a Pause",
      systemImageName: "leaf.circle.fill"
    )
    AppShortcut(
      intent: IsBouncingIntent(),
      phrases: [
        "Check \(.applicationName) pause bounce",
        "Is \(.applicationName) bouncing",
      ],
      shortTitle: "Check Pause Bounce",
      systemImageName: "arrow.triangle.2.circlepath.circle"
    )
  }
}
