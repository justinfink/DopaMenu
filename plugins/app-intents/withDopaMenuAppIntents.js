/**
 * Expo config plugin that drops DopaMenuAppIntents.swift into the iOS app
 * target during prebuild. Without this, the AppIntent would never be
 * compiled into the binary and Shortcuts.app would never see "Take a Pause"
 * as a usable action.
 *
 * Two phases:
 *   1. withDangerousMod (post-prebuild)  — copy the .swift file into
 *      ios/DopaMenu/.
 *   2. withXcodeProject (post-prebuild) — register the file as a source
 *      input on the main app target so Xcode actually compiles it.
 *
 * Both phases are idempotent. Re-running prebuild won't duplicate the file
 * or its Xcode reference.
 */
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FILE_NAME = 'DopaMenuAppIntents.swift';
const SWIFT_SOURCE_PATH = path.join(__dirname, SWIFT_FILE_NAME);

function withSwiftFileCopy(config) {
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
      const dest = path.join(projectRoot, appFolder, SWIFT_FILE_NAME);
      fs.copyFileSync(SWIFT_SOURCE_PATH, dest);
      return cfg;
    },
  ]);
}

function withSwiftFileInXcode(config) {
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

    // Use the project-relative path so Xcode resolves the file unambiguously
    // regardless of whether the PBX group has a path or only a name. Our
    // first build failed because addSourceFile registered the file with
    // path = "DopaMenuAppIntents.swift" relative to the group, and the
    // group had no path attribute, so Xcode looked at ios/<file> and not
    // ios/DopaMenu/<file>. Pre-pending the target name fixes this.
    const projectRelativePath = `${mainTargetName}/${SWIFT_FILE_NAME}`;

    // Skip if already registered (idempotent)
    const existingFiles = project.pbxFileReferenceSection();
    const alreadyAdded = Object.values(existingFiles).some(
      (f) => typeof f === 'object' && f.path && f.path.includes(SWIFT_FILE_NAME),
    );
    if (alreadyAdded) {
      return cfg;
    }

    // Add as a source file to the main app target. lastKnownFileType is
    // important — without it Xcode may guess the wrong type from extension
    // and skip compiling our Swift file. The target argument auto-adds the
    // file to that target's PBXSourcesBuildPhase (compile-sources phase).
    // sourceTree explicitly anchors the file to the project root so the
    // path resolves correctly even when the parent group is name-only.
    project.addSourceFile(
      projectRelativePath,
      {
        target: mainTargetUUID,
        lastKnownFileType: 'sourcecode.swift',
        sourceTree: '"<group>"',
      },
      groupKey,
    );

    return cfg;
  });
}

module.exports = function withDopaMenuAppIntents(config) {
  config = withSwiftFileCopy(config);
  config = withSwiftFileInXcode(config);
  return config;
};
