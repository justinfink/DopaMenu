import { Platform, NativeModules, NativeEventEmitter, Linking } from 'react-native';

// ============================================
// App Usage Service
// Detects when specific apps are launched (Android only)
// iOS does not allow this - uses notification triggers instead
// ============================================

// Apps commonly associated with dopamine-seeking behavior
export const DEFAULT_TRACKED_APPS = [
  { packageName: 'com.instagram.android', label: 'Instagram' },
  { packageName: 'com.twitter.android', label: 'Twitter/X' },
  { packageName: 'com.zhiliaoapp.musically', label: 'TikTok' },
  { packageName: 'com.facebook.katana', label: 'Facebook' },
  { packageName: 'com.reddit.frontpage', label: 'Reddit' },
  { packageName: 'com.snapchat.android', label: 'Snapchat' },
  { packageName: 'com.google.android.youtube', label: 'YouTube' },
  { packageName: 'com.netflix.mediaclient', label: 'Netflix' },
];

export interface TrackedApp {
  packageName: string;
  label: string;
}

export interface AppLaunchEvent {
  packageName: string;
  label: string;
  timestamp: number;
}

export interface UsageStatsPermission {
  granted: boolean;
  canRequest: boolean;
}

// Native module interface (Android only)
interface AppUsageModule {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<void>;
  getRecentApps(minutes: number): Promise<string[]>;
  startMonitoring(packageNames: string[]): Promise<void>;
  stopMonitoring(): Promise<void>;
  checkAccessibilityPermission(): Promise<boolean>;
  requestAccessibilityPermission(): Promise<void>;
  openAppInfo(): Promise<void>;
  checkIsRestrictedInstall(): Promise<boolean>;
  checkRestrictedSettingsGranted(): Promise<boolean>;
  startOnboardingWatch(target: string): Promise<void>;
  stopOnboardingWatch(): Promise<void>;
  getDeviceProfile(): Promise<DeviceProfile>;
  suppressIntercept(packageName: string, durationMs: number): Promise<void>;
  setModalActive(active: boolean): Promise<void>;
}

export interface DeviceProfile {
  manufacturer: string;
  brand: string;
  model: string;
  sdkInt: number;
  isSamsung: boolean;
  isPixel: boolean;
  isOnePlus: boolean;
  isXiaomi: boolean;
  // 0 when not Samsung or unknown. 6+ on OneUI 6 (Android 14 base), 7+ on OneUI 7.
  oneUIVersion: number;
}

export type OnboardingWatchTarget =
  | 'restricted_unlock'
  | 'usage_access'
  | 'accessibility';

// Get native module if available
const NativeAppUsage: AppUsageModule | null = Platform.OS === 'android'
  ? NativeModules.DopaMenuAppUsage
  : null;

// Event emitter for app launch events (Android)
let appLaunchEmitter: NativeEventEmitter | null = null;
if (Platform.OS === 'android' && NativeAppUsage) {
  appLaunchEmitter = new NativeEventEmitter(NativeModules.DopaMenuAppUsage);
}

export const appUsageService = {
  /**
   * Check if the platform supports app usage detection
   */
  isSupported(): boolean {
    return Platform.OS === 'android';
  },

  /**
   * Get platform-specific explanation for app detection
   */
  getPlatformExplanation(): string {
    if (Platform.OS === 'ios') {
      return 'On iOS, DopaMenu uses the Shortcuts app to redirect you here when you open a tracked app. Set up the automation once per app — iOS 16.4+ runs it automatically without prompts.';
    }
    return 'DopaMenu can detect when you open certain apps and show you alternatives. This requires the Usage Access permission.';
  },

  /**
   * Check if usage stats permission is granted (Android only)
   */
  async checkPermission(): Promise<UsageStatsPermission> {
    if (!this.isSupported() || !NativeAppUsage) {
      return { granted: false, canRequest: false };
    }

    try {
      const granted = await NativeAppUsage.checkPermission();
      return { granted, canRequest: true };
    } catch (error) {
      console.error('[AppUsage] Permission check failed:', error);
      return { granted: false, canRequest: true };
    }
  },

  /**
   * Open Usage Access settings directly to grant permission (Android only)
   * This takes the user directly to the correct settings page
   */
  async requestPermission(): Promise<void> {
    if (!this.isSupported()) {
      console.log('[AppUsage] Not supported on this platform');
      return;
    }

    try {
      if (NativeAppUsage) {
        // Use native module to open Usage Access settings directly
        await NativeAppUsage.requestPermission();
      } else {
        // Fallback to general settings if native module not available
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('[AppUsage] Failed to open settings:', error);
      // Fallback to general settings
      await Linking.openSettings();
    }
  },

  /**
   * Get recently used apps (Android only)
   * @param minutes Number of minutes to look back
   */
  async getRecentApps(minutes: number = 5): Promise<string[]> {
    if (!this.isSupported() || !NativeAppUsage) {
      return [];
    }

    try {
      return await NativeAppUsage.getRecentApps(minutes);
    } catch (error) {
      console.error('[AppUsage] Failed to get recent apps:', error);
      return [];
    }
  },

  /**
   * Check if a specific app was recently used (Android only)
   */
  async wasAppRecentlyUsed(packageName: string, minutes: number = 1): Promise<boolean> {
    const recentApps = await this.getRecentApps(minutes);
    return recentApps.includes(packageName);
  },

  /**
   * Start monitoring for app launches (Android only)
   * This runs a background service that checks for app launches
   */
  async startMonitoring(trackedApps: TrackedApp[]): Promise<boolean> {
    if (!this.isSupported() || !NativeAppUsage) {
      console.log('[AppUsage] Monitoring not supported on this platform');
      return false;
    }

    const { granted } = await this.checkPermission();
    if (!granted) {
      console.log('[AppUsage] Permission not granted, cannot start monitoring');
      return false;
    }

    try {
      const packageNames = trackedApps.map(app => app.packageName);
      await NativeAppUsage.startMonitoring(packageNames);
      console.log('[AppUsage] Started monitoring', packageNames.length, 'apps');
      return true;
    } catch (error) {
      console.error('[AppUsage] Failed to start monitoring:', error);
      return false;
    }
  },

  /**
   * Stop monitoring for app launches (Android only)
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage) {
      return;
    }

    try {
      await NativeAppUsage.stopMonitoring();
      console.log('[AppUsage] Stopped monitoring');
    } catch (error) {
      console.error('[AppUsage] Failed to stop monitoring:', error);
    }
  },

  /**
   * Subscribe to app launch events (Android only)
   * @param callback Function called when a tracked app is launched
   * @returns Unsubscribe function
   */
  onAppLaunched(callback: (event: AppLaunchEvent) => void): () => void {
    if (!appLaunchEmitter) {
      console.log('[AppUsage] App launch events not supported on this platform');
      return () => {};
    }

    const subscription = appLaunchEmitter.addListener('onAppLaunched', (event: AppLaunchEvent) => {
      callback(event);
    });

    return () => subscription.remove();
  },

  /**
   * Get the list of default tracked apps
   */
  getDefaultTrackedApps(): TrackedApp[] {
    return DEFAULT_TRACKED_APPS;
  },

  /**
   * Check if native module is available
   * If false, the Expo config plugin may not be installed correctly
   */
  isNativeModuleAvailable(): boolean {
    return NativeAppUsage !== null;
  },

  /**
   * Check if the Accessibility Service is enabled for DopaMenu (Android only).
   * When granted, app launches are detected in real-time (~100ms) via
   * TYPE_WINDOW_STATE_CHANGED events — no polling delay.
   */
  async checkAccessibilityPermission(): Promise<boolean> {
    if (!this.isSupported() || !NativeAppUsage) return false;
    try {
      return await NativeAppUsage.checkAccessibilityPermission();
    } catch {
      return false;
    }
  },

  /**
   * Open the Android Accessibility settings screen so the user can enable
   * DopaMenu's accessibility service (Android only).
   */
  async requestAccessibilityPermission(): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage) return;
    try {
      await NativeAppUsage.requestAccessibilityPermission();
    } catch (error) {
      console.error('[AppUsage] Failed to open accessibility settings:', error);
    }
  },

  /**
   * Returns true when the restricted-settings unlock step is required before
   * the user can toggle Usage Access or Accessibility. Combines
   * checkIsRestrictedInstall + checkRestrictedSettingsGranted into one call.
   */
  async needsRestrictedUnlock(): Promise<boolean> {
    const [isRestricted, alreadyGranted] = await Promise.all([
      this.checkIsRestrictedInstall(),
      this.checkRestrictedSettingsGranted(),
    ]);
    return isRestricted && !alreadyGranted;
  },

  /**
   * Returns true if the user has already granted "Allow restricted settings"
   * for this app (App Info → ⋮ → Allow restricted settings). Always returns
   * true on Android < 13 since restricted settings don't apply there.
   * Use this together with checkIsRestrictedInstall() to decide whether to
   * show the App Info unlock step or jump straight to the permission screen.
   */
  async checkRestrictedSettingsGranted(): Promise<boolean> {
    if (!this.isSupported() || !NativeAppUsage) return true;
    try {
      return await NativeAppUsage.checkRestrictedSettingsGranted();
    } catch {
      return false;
    }
  },

  /**
   * Returns true when the app was NOT installed via the Play Store AND the
   * device is Android 13+. In that state, Android's "Restricted Settings"
   * greys out the Accessibility and Usage Access toggles until the user
   * unlocks them via App Info → ⋮ → "Allow restricted settings".
   */
  async checkIsRestrictedInstall(): Promise<boolean> {
    if (!this.isSupported() || !NativeAppUsage) return false;
    try {
      return await NativeAppUsage.checkIsRestrictedInstall();
    } catch {
      return false;
    }
  },

  /**
   * Open DopaMenu's own App Info screen (Android only).
   * Required for Android 13+ sideloaded APKs where Usage Access and
   * Accessibility show "Controlled by Restricted Setting" until the user
   * taps ⋮ → "Allow restricted settings" from this page.
   */
  async openAppInfo(): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage) {
      // Best-effort fallback for when the native module isn't registered.
      await Linking.openSettings();
      return;
    }
    try {
      await NativeAppUsage.openAppInfo();
    } catch (error) {
      console.error('[AppUsage] Failed to open app info:', error);
      await Linking.openSettings();
    }
  },

  /**
   * Start the onboarding foreground-service watcher. While the user is in
   * Settings flipping a toggle, the FGS polls the target AppOp/service at
   * 500ms and uses its background-activity-start allowance to yank DopaMenu
   * back to the foreground the moment the flip happens. Falls back to a
   * full-screen-intent notification on devices where startActivity is
   * blocked even for FGSes (rare — some OEMs).
   *
   * target: 'restricted_unlock' | 'usage_access' | 'accessibility'
   *
   * Caller is responsible for stopping the watch via stopOnboardingWatch()
   * when the user cancels or onboarding completes.
   */
  async startOnboardingWatch(target: OnboardingWatchTarget): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage?.startOnboardingWatch) return;
    try {
      await NativeAppUsage.startOnboardingWatch(target);
    } catch (error) {
      console.error('[AppUsage] startOnboardingWatch failed:', error);
    }
  },

  async stopOnboardingWatch(): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage?.stopOnboardingWatch) return;
    try {
      await NativeAppUsage.stopOnboardingWatch();
    } catch (error) {
      console.error('[AppUsage] stopOnboardingWatch failed:', error);
    }
  },

  /**
   * Returns a snapshot of the current device (manufacturer, OneUI version,
   * Android SDK, etc.). Used by onboarding to tailor the "Allow restricted
   * settings" instructions to what the user will actually see on their
   * device — no generic "on Samsung…" branches in the copy. On iOS or when
   * the native module isn't available, returns null.
   */
  async getDeviceProfile(): Promise<DeviceProfile | null> {
    if (!this.isSupported() || !NativeAppUsage?.getDeviceProfile) return null;
    try {
      return await NativeAppUsage.getDeviceProfile();
    } catch (error) {
      console.error('[AppUsage] getDeviceProfile failed:', error);
      return null;
    }
  },

  /**
   * Tell the native detectors to ignore the given package for the next
   * durationMs. Used when the user explicitly chose to enter a tracked app
   * (tapped "Keep doing what I was doing", dismissed the intervention, or
   * accepted a redirect that lands them in that app). Without this, the FGS
   * poller + AccessibilityService re-fire on the resulting foreground flip
   * and the user gets trapped in an intercept loop.
   */
  async suppressIntercept(packageName: string, durationMs: number = 5000): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage?.suppressIntercept) return;
    try {
      await NativeAppUsage.suppressIntercept(packageName, durationMs);
    } catch (error) {
      console.error('[AppUsage] suppressIntercept failed:', error);
    }
  },

  /**
   * Tell the native FGS poller whether the JS-side intervention modal is
   * currently mounted. While true, the poller skips its HIGH-priority
   * full-screen-intent notification (the "Caught yourself!" one) — the
   * user already sees DopaMenu, a tray notification stacked on top is
   * just noise. Setting it true ALSO cancels any in-flight intervention
   * notification posted during the brief race window before the modal
   * mounted, so it can't sit stale in the shade.
   */
  async setModalActive(active: boolean): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage?.setModalActive) return;
    try {
      await NativeAppUsage.setModalActive(active);
    } catch (error) {
      console.error('[AppUsage] setModalActive failed:', error);
    }
  },
};

export default appUsageService;
