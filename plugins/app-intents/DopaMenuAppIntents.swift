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

@available(iOS 16.0, *)
struct DopaMenuAppShortcutsProvider: AppShortcutsProvider {
  // Purple to match DopaMenu's brand. Shows in Shortcuts.app + Spotlight.
  static let shortcutTileColor: ShortcutTileColor = .purple

  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenDopaMenuPauseIntent(),
      // Phrases matter — they make the intent searchable when the user
      // types "DopaMenu" or "pause" in the action picker. Keep at least
      // one phrase that includes `\(.applicationName)` so Apple's voice
      // detection works for Siri too.
      phrases: [
        "Take a pause with \(.applicationName)",
        "Pause with \(.applicationName)",
        "Open \(.applicationName) intervention",
      ],
      shortTitle: "Take a Pause",
      systemImageName: "leaf.circle.fill"
    )
  }
}
