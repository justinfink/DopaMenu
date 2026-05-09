//
//  DopaMenuFamilyControls.swift
//  DopaMenu
//
//  Native bridge that exposes the names of apps the user picked in Apple's
//  FamilyActivityPicker so JS can render them in the Pause Shortcut setup
//  walkthrough's chip card. v18.1's chip card on iOS 16+ fell back to "look
//  for these popular apps" because we couldn't get the real names — that
//  was the friction point that killed onboarding completion in testing.
//
//  Apple's FamilyActivitySelection.applications is a Set<Application> where
//  each Application exposes:
//    let bundleIdentifier: String
//    let localizedDisplayName: String
//    let token: ApplicationToken
//
//  Both bundleIdentifier and localizedDisplayName are documented as non-
//  optional. In practice, when the Application instance was created from a
//  user-picked token, these may be empty strings if Apple's privacy layer
//  strips them. We fall back to bundleIdentifier-as-displayName if
//  localizedDisplayName is empty, and skip entries that have neither.
//
//  Storage: kingstinct's react-native-device-activity package serializes
//  selections as base64-encoded JSON of FamilyActivitySelection, stored in
//  App Group UserDefaults under key `familyActivitySelectionIds` as a
//  dictionary keyed by selection id. Our id is `problemApps` (matches
//  IOS_FAMILY_ACTIVITY_SELECTION_ID in src/constants/appGroup.ts).
//
//  Patched into the iOS app target by plugins/app-intents/withDopaMenuAppIntents.js.

import FamilyControls
import Foundation
import ManagedSettings
import React

@available(iOS 16.0, *)
@objc(DopaMenuFamilyControls)
class DopaMenuFamilyControls: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    // No UIKit work happens in this module; we just read App Group
    // UserDefaults and decode JSON. No need to require main-queue setup.
    return false
  }

  /// Returns the apps the user has picked via FamilyActivityPicker as an
  /// array of `{ bundleIdentifier, displayName }` dicts. Returns empty
  /// array if there's no saved selection, the App Group can't be reached,
  /// or decoding fails.
  ///
  /// JS-callable as an async function:
  ///   const apps = await NativeModules.DopaMenuFamilyControls
  ///     .getSelectedApplicationNames();
  @objc
  func getSelectedApplicationNames(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // App Group ID hard-coded to match `IOS_APP_GROUP` in
    // src/constants/appGroup.ts. Selection ID hard-coded to match
    // IOS_FAMILY_ACTIVITY_SELECTION_ID. Keep these in sync.
    guard let defaults = UserDefaults(suiteName: "group.ai.dopamenu.app") else {
      resolve([])
      return
    }

    // kingstinct stores selections as a dictionary keyed by selection id.
    // The value at our id key is a base64-encoded JSON string.
    guard
      let selectionDict = defaults.dictionary(forKey: "familyActivitySelectionIds"),
      let serialized = selectionDict["problemApps"] as? String,
      let data = Data(base64Encoded: serialized)
    else {
      resolve([])
      return
    }

    do {
      let selection = try JSONDecoder().decode(FamilyActivitySelection.self, from: data)
      let entries: [[String: String]] = selection.applications.compactMap { app in
        // Apple's docs say bundleIdentifier and localizedDisplayName are
        // non-optional Strings, but practically either may be empty when
        // the Application was constructed from a user-picked token (Apple's
        // privacy layer can strip them). Skip entries with neither; fall
        // back to bundleIdentifier as display when localizedDisplayName is
        // missing.
        let bundleId = app.bundleIdentifier ?? ""
        let displayName = app.localizedDisplayName ?? ""
        if bundleId.isEmpty && displayName.isEmpty {
          return nil
        }
        return [
          "bundleIdentifier": bundleId,
          "displayName": displayName.isEmpty ? bundleId : displayName,
        ]
      }
      resolve(entries)
    } catch {
      // JSON decode failure is rare in practice (kingstinct serializes the
      // same struct we're decoding) but we don't want a corrupted blob to
      // break the whole onboarding. Return empty and let JS fall back to
      // the popular-installed-apps hint.
      resolve([])
    }
  }
}
