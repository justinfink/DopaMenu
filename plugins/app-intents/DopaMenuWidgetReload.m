//
//  DopaMenuWidgetReload.m
//
//  Objective-C bridge that registers DopaMenuWidget (defined in Swift) with
//  the React Native module system. Required because RCT_* registration
//  macros are preprocessor-only and don't expand from Swift — even when the
//  implementation itself is Swift. JS-side accesses this via
//  NativeModules.DopaMenuWidget.
//
//  Note: the Swift class is `DopaMenuWidgetBridge` but @objc-exposed under
//  name `DopaMenuWidget` to match the JS-facing module name. RCT_EXTERN_MODULE
//  doesn't have to match the Swift class name; it has to match the @objc name.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DopaMenuWidget, NSObject)

// Synchronous-style void method: tells WidgetKit to reload all DopaMenu
// widget timelines. JS calls this after writing fresh menu data to App
// Group so the widget renders the new data without waiting for the next
// system-scheduled refresh.
RCT_EXTERN_METHOD(reloadAllTimelines)

@end
