/**
 * iOS WidgetKit extension target. Auto-discovered by @kingstinct/expo-apple-targets
 * via its scan of `targets/<name>/expo-target.config.js`. The plugin handles
 * Xcode project surgery (target creation, build phase wiring, framework
 * linking, Embed App Extensions copy phase) so we only need to declare the
 * type + entitlements here. App Group is shared with the main app and the
 * other extensions so the widget reads the same `iosWidgetMenuData` blob
 * the JS side writes via writeIosWidgetData() in liveMenuService.ts.
 *
 * NOTE: this target does NOT need the `com.apple.developer.family-controls`
 * entitlement — it's purely a UI surface that reads serialized menu data
 * from App Group UserDefaults, never touches FamilyActivitySelection or
 * ManagedSettings APIs. Only the App Group entitlement is required.
 */
const APP_GROUP = 'group.ai.dopamenu.app';

module.exports = {
  type: 'widget',
  entitlements: {
    'com.apple.security.application-groups': [APP_GROUP],
  },
};
