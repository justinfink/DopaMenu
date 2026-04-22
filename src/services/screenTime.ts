import { Platform, Linking } from 'react-native';
import type { TrackedAppConfig } from '../models';

// ============================================
// Screen Time Service (iOS)
// ============================================
// Phase 1: Shortcuts-based redirect.
//
// iOS does not expose a "detect app launch" API to third-party apps the way
// Android does via UsageStats/AccessibilityService. The Family Controls API
// can shield apps but its ShieldAction extension cannot open another app
// (confirmed Apple limitation, feedback FB17261679).
//
// The Shortcuts app has an "App is Opened" automation trigger that CAN open
// DopaMenu via URL scheme. On iOS 16.4+, personal automations with this
// trigger can run without a confirmation prompt when the user disables "Ask
// Before Running." We cannot create these automations programmatically
// (Apple privacy restriction), so we walk the user through manual setup
// during onboarding / settings.
//
// This module provides the deep link to launch the Shortcuts app and builds
// the DopaMenu intervention URL the user will paste into the automation's
// "Open URLs" action.
// ============================================

const DOPAMENU_SCHEME = 'dopamenu://';

export interface ShortcutSetupInstructions {
  app: TrackedAppConfig;
  interventionUrl: string;
  steps: string[];
}

export const screenTimeService = {
  /**
   * Whether the Shortcuts redirect path is usable on the current platform.
   * iOS 16.4+ is required for silent automation runs, but the automation
   * works on older iOS versions too (with a confirmation banner).
   */
  isSupported(): boolean {
    return Platform.OS === 'ios';
  },

  /**
   * Build the intervention URL that the user will paste into the Shortcuts
   * automation. Tagging it with ?app=<bundleId> so the DopaMenu deep link
   * handler knows which tracked app triggered the intervention.
   */
  buildInterventionUrl(bundleId: string | undefined): string {
    if (!bundleId) return `${DOPAMENU_SCHEME}intervention`;
    return `${DOPAMENU_SCHEME}intervention?app=${encodeURIComponent(bundleId)}`;
  },

  /**
   * Open the iOS Shortcuts app so the user can create the automation.
   * The shortcuts:// scheme just opens the Shortcuts app landing page —
   * iOS does not provide a deeper URL to pre-fill automation triggers.
   * The user follows the in-app instructions from there.
   */
  async openShortcutsApp(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      // shortcuts:// opens the app. Fallback to App Store if not installed
      // (Shortcuts is a system app, so this is only a defensive path).
      const canOpen = await Linking.canOpenURL('shortcuts://');
      if (canOpen) {
        await Linking.openURL('shortcuts://');
      } else {
        await Linking.openURL('https://apps.apple.com/app/shortcuts/id1462947752');
      }
    } catch (error) {
      console.error('[ScreenTime] Failed to open Shortcuts app:', error);
    }
  },

  /**
   * Build the step-by-step instructions for setting up a single app's
   * automation. Designed to be rendered as a numbered list in the UI.
   */
  getSetupInstructions(app: TrackedAppConfig): ShortcutSetupInstructions {
    const interventionUrl = this.buildInterventionUrl(app.iosBundleId);
    return {
      app,
      interventionUrl,
      steps: [
        `In Shortcuts, tap the Automation tab at the bottom`,
        `Tap + (top right), then New Automation`,
        `Tap "App" in the list of triggers`,
        `Tap "Choose" next to App, select ${app.label}, then Done`,
        `Leave "Is Opened" selected, tap Run Immediately, then Next`,
        `Search for "Open URLs" and tap it`,
        `Tap the URL field and paste: ${interventionUrl}`,
        `Tap Done in the top right to save`,
      ],
    };
  },

  /**
   * Open a test deep link to confirm DopaMenu's URL scheme is wired up.
   * Useful before the user goes through the Shortcuts setup flow.
   */
  async testDeepLink(bundleId?: string): Promise<void> {
    const url = this.buildInterventionUrl(bundleId);
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('[ScreenTime] Test deep link failed:', error);
    }
  },
};

export default screenTimeService;
