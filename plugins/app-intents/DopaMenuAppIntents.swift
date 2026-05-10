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

  // v19: pipe the trigger app through to the host app for analytics + the
  // JS-side silence gate (defense-in-depth for users who haven't re-imported
  // the wrapper Shortcut with the silence gate). Same default-empty pattern
  // as IsBouncingIntent — Personal Automations bind Shortcut Input here, but
  // the data type is sometimes opaque/empty depending on iOS version, so we
  // tolerate the empty case and treat it as "unknown trigger".
  @Parameter(
    title: "Trigger app",
    description: "The app whose open caused this automation to run. Bind Shortcut Input here when calling from a Personal Automation.",
    default: ""
  )
  var triggerApp: String

  func perform() async throws -> some IntentResult {
    // Stamp the App Group so the JS layer knows this launch came from the
    // Personal Automation chain rather than a manual icon tap. Group ID is
    // hard-coded to match `IOS_APP_GROUP` in src/constants/appGroup.ts —
    // keep them in sync.
    if let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app") {
      defaults.set(Date().timeIntervalSince1970, forKey: "automationTriggeredAt")
      // v19: stamp the trigger app too. JS uses it for (a) analytics
      // (replaces the v18 'unknown' triggerApp in INTERVENTION_SHOWN events)
      // and (b) the JS-side silence gate (so quiet hours / disarmed / per-
      // app windows still apply if the user hasn't re-imported the gated
      // wrapper Shortcut yet). Empty string when Shortcut Input isn't bound.
      let trimmed = triggerApp.trimmingCharacters(in: .whitespaces)
      if !trimmed.isEmpty {
        defaults.set(trimmed, forKey: "automationTriggerApp")
      } else {
        defaults.removeObject(forKey: "automationTriggerApp")
      }
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

  // Single string literal (NOT concat with `+`). IntentDescription's init
  // takes LocalizedStringResource, which is ExpressibleByStringLiteral —
  // that conversion only fires for *literals*, not for `String` values
  // produced by `+`. Concatenating with `+` triggers
  // "no exact matches in call to initializer" in iOS 16/17 toolchains.
  static let description = IntentDescription(
    "Internal action used by DopaMenu's hosted Pause Shortcut. Reads a flag from the App Group and reports whether the current automation fire should be silenced. Users don't run this directly."
  )

  // CRITICAL: must be false. This is the entire mechanism that prevents
  // DopaMenu from foregrounding on the spurious automation re-fires. If this
  // ever flips to true, the loop returns immediately on every Continue tap.
  static let openAppWhenRun: Bool = false

  // Personal Automations triggered by "App is Opened" pass the trigger app
  // reference into the called Shortcut as Shortcut Input. Apple's public docs
  // don't fully specify the exact data type the called shortcut receives —
  // so when the user binds Shortcut Input to this parameter, what we see in
  // `triggerApp` may be a bundle id, a localized display name, an opaque
  // reference, or empty.
  //
  // Declared as non-optional `String` with `default: ""` so AppIntent's
  // `@Parameter` macro generates a clean init — making the parameter
  // optional via `String?` triggers an init-overload mismatch in some
  // iOS 16/17 toolchains. Empty default behaves identically (we
  // explicitly check `passed.isEmpty` below).
  @Parameter(
    title: "Trigger app",
    description: "The app whose open is being checked against the bounce window. Bind Shortcut Input here when calling from a Personal Automation.",
    default: ""
  )
  var triggerApp: String

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
    let passed = triggerApp.trimmingCharacters(in: .whitespaces)

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

// ─── Silence gate (v19) ───────────────────────────────────────────────────
//
// The dynamic-control unlock. Before v19, every Personal Automation fire ran
// straight through to TakePauseIntent → DopaMenu foregrounded. Editing which
// apps gate, pausing for an hour, or honoring quiet hours all required
// Shortcuts.app trips. v19 puts that control inside the user's existing
// Pause wrapper Shortcut as one extra If/Stop step:
//
//   1. Run IsBouncingIntent (existing, v18 loop fix)
//      → if true, Stop
//   2. Run ShouldSilencePauseIntent (new, v19)
//      → if true, Stop
//   3. Otherwise Run Take a Pause (foregrounds DopaMenu)
//
// One read of App Group state covers ALL silencing reasons — pause-everything,
// quiet hours, per-app disarm, per-app schedules. This means the user toggles
// armed apps in DopaMenu and changes take effect on the very next tap, with
// zero Shortcut edits.
//
// `openAppWhenRun = false` is what makes this work — runs entirely in the
// background, returns Bool to the wrapper, no DopaMenu flash on silence.
@available(iOS 16.0, *)
struct ShouldSilencePauseIntent: AppIntent {
  static let title: LocalizedStringResource = "Should Silence Pause"

  static let description = IntentDescription(
    "Internal action used by DopaMenu's hosted Pause Shortcut. Reads quiet hours, pause-everything state, per-app disarm list, and per-app monitoring windows from the App Group, and reports whether the current automation fire should be silenced. Users don't run this directly."
  )

  // CRITICAL: must be false, same as IsBouncingIntent. If this ever flips
  // to true, the silence iterations cause DopaMenu to foreground for a
  // moment on every gate hit.
  static let openAppWhenRun: Bool = false

  // Same default-empty pattern as IsBouncingIntent — Personal Automations
  // bind Shortcut Input here, but the type sometimes comes through empty
  // depending on iOS version. Empty trigger means we still check the
  // global gates (paused / quiet hours) but skip the per-app gates
  // (disarm list / per-app windows).
  @Parameter(
    title: "Trigger app",
    description: "The app whose open is being checked. Bind Shortcut Input here when calling from a Personal Automation.",
    default: ""
  )
  var triggerApp: String

  func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
    guard let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app") else {
      return .result(value: false)
    }

    // ── Gate 1: pause-everything ────────────────────────────────────────
    // The home-page "Pause for an hour" / "Pause until tomorrow" buttons
    // write `suppressedUntil` (epoch ms). Same key used by the Shield
    // suppression mechanism — reusing it means one App Group key drives
    // both the Shield's clear-managed-settings behavior AND the Shortcut
    // path's silence. No double-bookkeeping.
    let suppressedUntilMs = defaults.double(forKey: "suppressedUntil")
    let nowMs = Date().timeIntervalSince1970 * 1000
    if suppressedUntilMs > nowMs {
      return .result(value: true)
    }

    // ── Gate 2: quiet hours ─────────────────────────────────────────────
    // JSON-stringified [{start: 'HH:mm', end: 'HH:mm'}]. Overnight ranges
    // supported (start > end means "wraps midnight"). Computed from the
    // user's local time — `Calendar.current.dateComponents` honors the
    // device timezone automatically.
    if let quietRaw = defaults.string(forKey: "quietHours"),
       let quietData = quietRaw.data(using: .utf8),
       let quietRanges = try? JSONDecoder().decode([QuietRange].self, from: quietData),
       !quietRanges.isEmpty {
      let cal = Calendar.current
      let comps = cal.dateComponents([.hour, .minute], from: Date())
      let nowMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
      for range in quietRanges {
        guard let startMin = parseHHMMToMinutes(range.start),
              let endMin = parseHHMMToMinutes(range.end) else { continue }
        let inRange: Bool
        if startMin <= endMin {
          inRange = nowMinutes >= startMin && nowMinutes < endMin
        } else {
          // Overnight, e.g. 22:00 → 07:00.
          inRange = nowMinutes >= startMin || nowMinutes < endMin
        }
        if inRange {
          return .result(value: true)
        }
      }
    }

    // ── Gate 3: per-app disarm ──────────────────────────────────────────
    // JSON-stringified string[] of normalized trigger keys. Apps the user
    // toggled OFF in the home-page Triggers editor land here; the
    // Personal Automation still fires for them (we can't edit the trigger
    // list), but the Shortcut halts and DopaMenu never intervenes.
    let normTrigger = normalizeTriggerKey(triggerApp)
    if !normTrigger.isEmpty,
       let disarmedRaw = defaults.string(forKey: "disarmedKeys"),
       let disarmedData = disarmedRaw.data(using: .utf8),
       let disarmedKeys = try? JSONDecoder().decode([String].self, from: disarmedData),
       disarmedKeys.contains(normTrigger) {
      return .result(value: true)
    }

    // ── Gate 4: per-app monitoring windows ──────────────────────────────
    // JSON-stringified Record<key, [{start, end, daysOfWeek?}]>. If the
    // app has any windows configured, we silence UNLESS now is inside one.
    // Day-of-week is 1=Mon..7=Sun (omit/empty array = all days).
    if !normTrigger.isEmpty,
       let windowsRaw = defaults.string(forKey: "appWindows"),
       let windowsData = windowsRaw.data(using: .utf8),
       let windowsMap = try? JSONDecoder().decode([String: [AppWindow]].self, from: windowsData),
       let appWindows = windowsMap[normTrigger],
       !appWindows.isEmpty {
      let cal = Calendar.current
      let comps = cal.dateComponents([.hour, .minute, .weekday], from: Date())
      let nowMinutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
      // Calendar.weekday: 1=Sun..7=Sat. Translate to our 1=Mon..7=Sun.
      let translatedDow = (((comps.weekday ?? 1) + 5) % 7) + 1
      var insideAnyWindow = false
      for win in appWindows {
        if let days = win.daysOfWeek, !days.isEmpty, !days.contains(translatedDow) {
          continue
        }
        guard let startMin = parseHHMMToMinutes(win.start),
              let endMin = parseHHMMToMinutes(win.end) else { continue }
        let inWindow: Bool
        if startMin <= endMin {
          inWindow = nowMinutes >= startMin && nowMinutes < endMin
        } else {
          inWindow = nowMinutes >= startMin || nowMinutes < endMin
        }
        if inWindow {
          insideAnyWindow = true
          break
        }
      }
      if !insideAnyWindow {
        // App has windows but we're outside them — silence.
        return .result(value: true)
      }
    }

    // No gate matched — let the Shortcut fall through to TakePauseIntent.
    return .result(value: false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private struct QuietRange: Decodable {
    let start: String
    let end: String
  }

  private struct AppWindow: Decodable {
    let start: String
    let end: String
    let daysOfWeek: [Int]?
  }

  /// Parse "HH:mm" to minutes-since-midnight. Returns nil on malformed input.
  private func parseHHMMToMinutes(_ s: String) -> Int? {
    let parts = s.split(separator: ":")
    guard parts.count == 2,
          let h = Int(parts[0]),
          let m = Int(parts[1]),
          h >= 0, h < 24,
          m >= 0, m < 60
    else { return nil }
    return h * 60 + m
  }

  /// Mirrors normalizeTriggerKey() in src/services/iosFamilyControls.ts AND
  /// the inline normalizer in IsBouncingIntent.perform(). Keep these three
  /// implementations in lockstep — divergence here means false negatives
  /// that re-introduce per-app silence misses.
  private func normalizeTriggerKey(_ raw: String) -> String {
    let stripped = raw
      .replacingOccurrences(of: "://", with: "")
      .replacingOccurrences(of: ":", with: "")
      .replacingOccurrences(of: " ", with: "")
    return stripped.precomposedStringWithCanonicalMapping.lowercased()
  }
}

@available(iOS 16.0, *)
struct DopaMenuAppShortcutsProvider: AppShortcutsProvider {
  // Purple to match DopaMenu's brand. Shows in Shortcuts.app + Spotlight.
  static let shortcutTileColor: ShortcutTileColor = .purple

  static var appShortcuts: [AppShortcut] {
    // Only Take a Pause is registered as a featured AppShortcut here.
    // IsBouncingIntent is intentionally NOT in this list:
    //   1. AppShortcutsBuilder rejected it as a multi-element body alongside
    //      the parameter-bearing IsBouncingIntent — first attempt errored
    //      with "no exact matches in call to initializer".
    //   2. We don't WANT IsBouncingIntent surfaced as a Siri/Spotlight
    //      suggestion. It's an internal helper for our hosted Pause
    //      Shortcut, not a user-facing voice action.
    //   3. iOS 17+ indexes ALL AppIntents from the app target into
    //      Shortcuts.app's editor action search regardless of provider
    //      registration — so IsBouncingIntent IS still selectable when
    //      Justin (or any user) searches "DopaMenu" while building a
    //      Shortcut. AppShortcuts == featured / surfaced; bare AppIntents
    //      == discoverable in the editor.
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
  }
}
