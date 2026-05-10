//
//  DopaMenuWidget.swift
//
//  iOS WidgetKit widget for DopaMenu's "Right now" calibrated menu. Mirrors
//  the Android home-screen widget at src/widget/DopaMenuWidget.tsx so both
//  surfaces stay in lockstep.
//
//  Data source: App Group UserDefaults under key `iosWidgetMenuData`. JS
//  serializes the live menu via writeIosWidgetData() in liveMenuService.ts —
//  shape MUST match `WidgetMenuData` below or the timeline silently shows
//  the placeholder. App Group ID is hard-coded to match IOS_APP_GROUP in
//  src/constants/appGroup.ts.
//
//  Tap behavior: each row deep-links into DopaMenu via the existing
//  dopamenu://widget-launch?id=<interventionId> URL scheme. The handler in
//  app/_layout.tsx resolves the id to a candidate from the merged pool and
//  either launches the trigger app (for on-phone redirects) or shows the
//  intervention modal (for off-phone activities). Same as Android.

import WidgetKit
import SwiftUI

// MARK: - Data shape (matches projectForIosWidget in liveMenuService.ts)

struct WidgetMenuItem: Codable {
  let id: String
  let label: String
  let icon: String
  let effort: String
}

struct WidgetMenuData: Codable {
  let primary: WidgetMenuItem
  let alternatives: [WidgetMenuItem]
  let timeBucket: String
  let greeting: String
  let updatedAt: Double  // epoch ms
}

// MARK: - Timeline provider

struct DopaMenuWidgetEntry: TimelineEntry {
  let date: Date
  let data: WidgetMenuData?
  /// True when the JS process hasn't written widget data yet (fresh install,
  /// not onboarded). The view shows a "finish setup in DopaMenu" placeholder.
  let isPlaceholder: Bool
}

struct DopaMenuWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> DopaMenuWidgetEntry {
    DopaMenuWidgetEntry(date: Date(), data: nil, isPlaceholder: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (DopaMenuWidgetEntry) -> Void) {
    completion(loadCurrentEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DopaMenuWidgetEntry>) -> Void) {
    let entry = loadCurrentEntry()
    // Refresh every 30 minutes — the menu can shift across time-bucket
    // boundaries (morning → afternoon → evening). JS writes also force an
    // immediate reload via WidgetCenter.shared.reloadAllTimelines() (see
    // DopaMenuWidgetReload module), so this is just the floor refresh rate.
    let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  /// Read the JS-serialized live-menu blob from App Group UserDefaults.
  /// Empty/missing/stale data returns a placeholder entry.
  private func loadCurrentEntry() -> DopaMenuWidgetEntry {
    guard
      let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app"),
      let raw = defaults.string(forKey: "iosWidgetMenuData"),
      let data = raw.data(using: .utf8),
      let payload = try? JSONDecoder().decode(WidgetMenuData.self, from: data)
    else {
      return DopaMenuWidgetEntry(date: Date(), data: nil, isPlaceholder: true)
    }
    return DopaMenuWidgetEntry(date: Date(), data: payload, isPlaceholder: false)
  }
}

// MARK: - View

struct DopaMenuWidgetView: View {
  let entry: DopaMenuWidgetEntry
  @Environment(\.widgetFamily) var family

  // Brand colors mirrored from src/constants/theme.ts so the widget renders
  // the same purple as the LiveMenu hero on the home page.
  private let brandPrimary = Color(red: 155/255, green: 123/255, blue: 184/255)  // #9B7BB8
  private let brandFaded = Color(red: 244/255, green: 238/255, blue: 251/255)    // #F4EEFB
  private let brandSurface = Color.white
  private let brandText = Color(red: 31/255, green: 26/255, blue: 41/255)        // #1F1A29
  private let brandSecondaryText = Color(red: 109/255, green: 99/255, blue: 120/255)  // #6D6378

  var body: some View {
    if entry.isPlaceholder || entry.data == nil {
      placeholderView
    } else if let data = entry.data {
      switch family {
      case .systemSmall:
        smallView(data: data)
      case .systemMedium:
        mediumView(data: data)
      case .systemLarge:
        largeView(data: data)
      default:
        smallView(data: data)
      }
    }
  }

  // MARK: Sized views

  private func smallView(data: WidgetMenuData) -> some View {
    Link(destination: deepLink(for: data.primary.id)) {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 4) {
          Image(systemName: "sparkles")
            .font(.system(size: 11, weight: .semibold))
          Text("Right now")
            .font(.system(size: 11, weight: .semibold))
            .textCase(.uppercase)
        }
        .foregroundColor(brandSecondaryText)
        Spacer(minLength: 4)
        Text(data.primary.label)
          .font(.system(size: 18, weight: .bold))
          .foregroundColor(brandText)
          .multilineTextAlignment(.leading)
          .lineLimit(3)
        if !data.primary.effort.isEmpty {
          Text(effortLabel(data.primary.effort))
            .font(.system(size: 10))
            .foregroundColor(brandSecondaryText)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .padding(12)
    }
  }

  private func mediumView(data: WidgetMenuData) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Image(systemName: "sparkles")
          .font(.system(size: 11, weight: .semibold))
        Text("Right now")
          .font(.system(size: 11, weight: .semibold))
          .textCase(.uppercase)
        Spacer()
        Text(timeBucketLabel(data.timeBucket))
          .font(.system(size: 11, weight: .semibold))
      }
      .foregroundColor(brandSecondaryText)
      // Primary row — bigger, branded background.
      Link(destination: deepLink(for: data.primary.id)) {
        rowView(item: data.primary, isPrimary: true)
      }
      if let first = data.alternatives.first {
        Link(destination: deepLink(for: first.id)) {
          rowView(item: first, isPrimary: false)
        }
      }
    }
    .padding(12)
  }

  private func largeView(data: WidgetMenuData) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 4) {
        Image(systemName: "sparkles")
          .font(.system(size: 11, weight: .semibold))
        Text("Right now")
          .font(.system(size: 11, weight: .semibold))
          .textCase(.uppercase)
        Spacer()
        Text(timeBucketLabel(data.timeBucket))
          .font(.system(size: 11, weight: .semibold))
      }
      .foregroundColor(brandSecondaryText)
      Link(destination: deepLink(for: data.primary.id)) {
        rowView(item: data.primary, isPrimary: true)
      }
      ForEach(data.alternatives, id: \.id) { alt in
        Link(destination: deepLink(for: alt.id)) {
          rowView(item: alt, isPrimary: false)
        }
      }
      Spacer()
    }
    .padding(12)
  }

  // MARK: Row component

  private func rowView(item: WidgetMenuItem, isPrimary: Bool) -> some View {
    HStack(spacing: 10) {
      ZStack {
        RoundedRectangle(cornerRadius: 8)
          .fill(brandSurface)
          .frame(width: isPrimary ? 36 : 28, height: isPrimary ? 36 : 28)
        Image(systemName: mapIconName(item.icon))
          .font(.system(size: isPrimary ? 16 : 13, weight: .semibold))
          .foregroundColor(brandPrimary)
      }
      VStack(alignment: .leading, spacing: 1) {
        Text(item.label)
          .font(.system(size: isPrimary ? 14 : 12, weight: isPrimary ? .bold : .semibold))
          .foregroundColor(brandText)
          .lineLimit(1)
        if !item.effort.isEmpty {
          Text(effortLabel(item.effort))
            .font(.system(size: 10))
            .foregroundColor(brandSecondaryText)
            .lineLimit(1)
        }
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(isPrimary ? brandPrimary : brandSecondaryText)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: 12)
        .fill(isPrimary ? brandFaded : Color(red: 250/255, green: 248/255, blue: 252/255))
        .overlay(
          RoundedRectangle(cornerRadius: 12)
            .stroke(isPrimary ? brandPrimary : Color(red: 234/255, green: 226/255, blue: 241/255), lineWidth: 1)
        )
    )
  }

  // MARK: Placeholder

  private var placeholderView: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Image(systemName: "sparkles")
          .font(.system(size: 11, weight: .semibold))
        Text("DopaMenu")
          .font(.system(size: 11, weight: .semibold))
          .textCase(.uppercase)
      }
      .foregroundColor(brandSecondaryText)
      Spacer(minLength: 4)
      Text("Finish setup in the app to see your live menu.")
        .font(.system(size: 13, weight: .medium))
        .foregroundColor(brandText)
        .multilineTextAlignment(.leading)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(12)
  }

  // MARK: Helpers

  /// Map intervention.icon (Ionicons names) → SF Symbol names. Most common
  /// names round-trip; unknowns fall back to "sparkles" which is universally
  /// available in SF Symbols.
  private func mapIconName(_ ionicon: String) -> String {
    let map: [String: String] = [
      "sparkles": "sparkles",
      "leaf": "leaf",
      "footsteps": "figure.walk",
      "book": "book",
      "fitness": "figure.run",
      "color-palette": "paintpalette",
      "moon": "moon",
      "people": "person.2",
      "hammer": "hammer",
      "sunny": "sun.max",
      "cafe": "cup.and.saucer",
      "musical-note": "music.note",
      "headset": "headphones",
      "water": "drop",
      "happy": "face.smiling",
      "heart": "heart",
      "bicycle": "bicycle",
      "barbell": "dumbbell",
      "restaurant": "fork.knife",
      "pizza": "fork.knife",
      "phone-portrait-outline": "iphone",
      "phone-portrait": "iphone",
      "chatbubbles": "bubble.left.and.bubble.right",
      "calendar": "calendar",
      "bed": "bed.double",
    ]
    return map[ionicon] ?? "sparkles"
  }

  private func effortLabel(_ raw: String) -> String {
    switch raw {
    case "very_low": return "Very easy"
    case "low": return "Easy"
    case "medium": return "Moderate"
    case "high": return "Bigger lift"
    default: return ""
    }
  }

  private func timeBucketLabel(_ raw: String) -> String {
    switch raw {
    case "early_morning": return "Morning"
    case "morning": return "Morning"
    case "afternoon": return "Afternoon"
    case "evening": return "Evening"
    case "night": return "Night"
    case "late_night": return "Late night"
    default: return ""
    }
  }

  private func deepLink(for interventionId: String) -> URL {
    URL(string: "dopamenu://widget-launch?id=\(interventionId)")
      ?? URL(string: "dopamenu://")!
  }
}

// MARK: - Widget bundle entry

@main
struct DopaMenuWidgetBundle: WidgetBundle {
  var body: some Widget {
    DopaMenuWidget()
  }
}

struct DopaMenuWidget: Widget {
  let kind: String = "DopaMenuWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: DopaMenuWidgetProvider()) { entry in
      // iOS 17+ requires explicit containerBackground for widget previews;
      // iOS 16 ignores the modifier. Conditional cast keeps the binary
      // building against an iOS 16+ deployment target.
      if #available(iOS 17.0, *) {
        DopaMenuWidgetView(entry: entry)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        DopaMenuWidgetView(entry: entry)
      }
    }
    .configurationDisplayName("DopaMenu")
    .description("Your right-now alternative to opening Instagram. Updates as your day shifts.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
