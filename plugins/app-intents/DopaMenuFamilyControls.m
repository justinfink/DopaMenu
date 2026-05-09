//
//  DopaMenuFamilyControls.m
//
//  Objective-C bridge that registers DopaMenuFamilyControls (defined in
//  Swift) with the React Native module system. Required because RCT_*
//  registration macros are preprocessor-only and don't expand from Swift
//  — even when the implementation itself is Swift.
//
//  JS-side accesses this via NativeModules.DopaMenuFamilyControls. The
//  Swift class name matches; RN strips no suffix because there's no
//  "Manager" / "Module" suffix to strip.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DopaMenuFamilyControls, NSObject)

// Async method: returns array of { bundleIdentifier, displayName } for each
// app the user has picked in FamilyActivityPicker. Empty array if no
// selection or read failure. Documented to never reject; failures resolve
// to an empty list and let JS fall back to the popular-apps hint.
RCT_EXTERN_METHOD(
  getSelectedApplicationNames:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
