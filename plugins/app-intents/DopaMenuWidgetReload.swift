//
//  DopaMenuWidgetReload.swift
//
//  Tiny RN bridge module that exposes WidgetCenter.shared.reloadAllTimelines()
//  to JavaScript. Without this, JS-side widget data writes only show up on
//  the next system-scheduled timeline refresh (up to ~30 minutes out). With
//  this, JS calls NativeModules.DopaMenuWidget.reloadAllTimelines() after
//  every refreshWidget() and the widget UI updates within seconds.
//
//  Lives in the MAIN app target (not the widget extension target) — the
//  widget extension is the consumer of WidgetCenter, the host app is the
//  producer. App Group already shared between the two by entitlement.
//
//  Patched into the iOS app target by plugins/widget-ios/withDopaMenuWidget.js.

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

@objc(DopaMenuWidget)
class DopaMenuWidgetBridge: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    // No UIKit work — pure WidgetCenter call. WidgetCenter is documented
    // safe to call from any thread, but RN's bridge prefers explicit
    // background scheduling for non-UI modules.
    return false
  }

  /// Tell iOS to refresh every DopaMenu widget timeline immediately. Cheap
  /// no-op if no widgets are placed; safe to call repeatedly.
  @objc
  func reloadAllTimelines() {
    #if canImport(WidgetKit)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }
}
