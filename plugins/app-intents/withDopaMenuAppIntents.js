/**
 * Expo config plugin that drops DopaMenu's iOS-only Swift + ObjC sources
 * into the main app target during prebuild. Without this, the AppIntent
 * implementations and the native bridge for reading FamilyActivitySelection
 * app names would never be compiled into the binary, and Shortcuts.app
 * would never see "Take a Pause" / "Check Pause Bounce" as usable actions
 * + setup-automation.tsx couldn't render real app names from Apple's
 * FamilyActivityPicker selection.
 *
 * Two phases:
 *   1. withDangerousMod (post-prebuild)  — copy each source file into
 *      ios/DopaMenu/.
 *   2. withXcodeProject (post-prebuild)  — register each file as a source
 *      input on the main app target so Xcode actually compiles it.
 *
 * Both phases are idempotent. Re-running prebuild won't duplicate files
 * or their Xcode references.
 */
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Each entry: { name, type } where type is 'sourcecode.swift' or
// 'sourcecode.c.objc'. Plugin copies the named file from `__dirname` into
// ios/<appFolder>/ and registers it on the main app target.
const FILES = [
  { name: 'DopaMenuAppIntents.swift', type: 'sourcecode.swift' },
  { name: 'DopaMenuFamilyControls.swift', type: 'sourcecode.swift' },
  { name: 'DopaMenuFamilyControls.m', type: 'sourcecode.c.objc' },
  // v19: reload-widget bridge. Lives in the MAIN app target (not the
  // widget extension target) — main app is the producer of WidgetCenter
  // calls, the widget extension is the consumer. App Group is shared
  // between them via the iOS app's entitlement plus the widget target's
  // own entitlement file. SAFE to ship even before the widget extension
  // target exists: WidgetCenter.reloadAllTimelines() is a documented
  // no-op when no widgets are placed (and harmless if the widget
  // extension target is parked in plugins/widget-ios-pending/ — see the
  // README there for v19.1 activation steps).
  { name: 'DopaMenuWidgetReload.swift', type: 'sourcecode.swift' },
  { name: 'DopaMenuWidgetReload.m', type: 'sourcecode.c.objc' },
];

function withSourceFilesCopy(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      // Expo names the iOS app folder by the slug/iosName. We resolve it
      // dynamically so we don't break if the bundle id ever changes.
      const candidates = fs
        .readdirSync(projectRoot)
        .filter((n) =>
          fs
            .statSync(path.join(projectRoot, n))
            .isDirectory() &&
          fs.existsSync(path.join(projectRoot, n, 'Info.plist')),
        );
      if (candidates.length === 0) {
        throw new Error(
          '[withDopaMenuAppIntents] could not locate iOS app folder under ' +
            projectRoot +
            ' — looked for a subdir containing Info.plist',
        );
      }
      const appFolder = candidates[0];
      for (const f of FILES) {
        const src = path.join(__dirname, f.name);
        const dest = path.join(projectRoot, appFolder, f.name);
        fs.copyFileSync(src, dest);
      }
      return cfg;
    },
  ]);
}

function withSourceFilesInXcode(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    // Find the main app target (not extensions). Expo names it after the
    // app slug; we'll match by being the first non-test, non-extension
    // native target.
    const targets = project.pbxNativeTargetSection();
    let mainTargetUUID = null;
    let mainTargetName = null;
    for (const [uuid, target] of Object.entries(targets)) {
      if (uuid.endsWith('_comment')) continue;
      if (typeof target !== 'object') continue;
      if (target.productType !== '"com.apple.product-type.application"') continue;
      mainTargetUUID = uuid;
      mainTargetName = target.name.replace(/"/g, '');
      break;
    }
    if (!mainTargetUUID) {
      throw new Error('[withDopaMenuAppIntents] could not find main app target in Xcode project');
    }

    const groupKey = project.findPBXGroupKey({ name: mainTargetName }) ||
      project.findPBXGroupKey({ path: mainTargetName });
    if (!groupKey) {
      throw new Error(
        '[withDopaMenuAppIntents] could not locate PBX group for target "' +
          mainTargetName +
          '"',
      );
    }

    const existingFiles = project.pbxFileReferenceSection();

    for (const f of FILES) {
      // Skip if already registered (idempotent)
      const alreadyAdded = Object.values(existingFiles).some(
        (ref) =>
          typeof ref === 'object' &&
          ref.path &&
          ref.path.includes(f.name),
      );
      if (alreadyAdded) continue;

      // Use the project-relative path so Xcode resolves the file unambiguously
      // regardless of whether the PBX group has a path or only a name. Our
      // first build failed because addSourceFile registered the file with
      // path = "DopaMenuAppIntents.swift" relative to the group, and the
      // group had no path attribute, so Xcode looked at ios/<file> and not
      // ios/DopaMenu/<file>. Pre-pending the target name fixes this.
      const projectRelativePath = `${mainTargetName}/${f.name}`;

      project.addSourceFile(
        projectRelativePath,
        {
          target: mainTargetUUID,
          lastKnownFileType: f.type,
          sourceTree: '"<group>"',
        },
        groupKey,
      );
    }

    return cfg;
  });
}

module.exports = function withDopaMenuAppIntents(config) {
  config = withSourceFilesCopy(config);
  config = withSourceFilesInXcode(config);
  return config;
};
