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

export interface PendingRedirect {
  packageName: string;
  timestamp: number;
}

export interface PermissionsStatus {
  usageAccess: boolean;
  overlay: boolean;
  accessibilityService: boolean;
}

// Native module interface (Android only)
interface AppUsageModule {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<void>;
  getRecentApps(minutes: number): Promise<string[]>;
  startMonitoring(packageNames: string[]): Promise<void>;
  stopMonitoring(): Promise<void>;
  getPendingRedirect(): Promise<PendingRedirect | null>;
  clearPendingRedirect(): Promise<void>;
  checkPermissionsStatus(): Promise<PermissionsStatus>;
  canDrawOverlays(): Promise<boolean>;
  requestOverlayPermission(): Promise<void>;
  isAccessibilityServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<void>;
  updateTrackedApps(packageNames: string[]): Promise<void>;
  getAppUsageStats(days: number): Promise<Array<{ packageName: string; totalTimeMs: number; lastUsed: number }>>;
}

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
      return 'iOS does not allow apps to detect other app launches. DopaMenu uses scheduled notifications at high-risk times instead. You can also use the Urge Button when you feel the pull.';
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
      // Also sync tracked apps to SharedPreferences for the AccessibilityService
      await NativeAppUsage.updateTrackedApps(packageNames);
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
   * Check for a pending redirect from the background service (Android only)
   * The service stores detected app launches in SharedPreferences
   * so the JS layer can pick them up when the app comes to foreground
   */
  async getPendingRedirect(): Promise<PendingRedirect | null> {
    if (!this.isSupported() || !NativeAppUsage) return null;
    try {
      return await NativeAppUsage.getPendingRedirect();
    } catch {
      return null;
    }
  },

  /**
   * Clear the pending redirect after it has been handled
   */
  async clearPendingRedirect(): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage) return;
    try {
      await NativeAppUsage.clearPendingRedirect();
    } catch {
      // ignore
    }
  },

  /**
   * Check all Android permission statuses at once (Android only)
   * Returns real-time permission state without leaving the app
   */
  async checkPermissionsStatus(): Promise<PermissionsStatus> {
    if (!this.isSupported() || !NativeAppUsage) {
      return { usageAccess: false, overlay: false, accessibilityService: false };
    }
    try {
      return await NativeAppUsage.checkPermissionsStatus();
    } catch {
      return { usageAccess: false, overlay: false, accessibilityService: false };
    }
  },

  /**
   * Check if the AccessibilityService is enabled (Android only)
   * This is the PRIMARY detection mechanism - real-time, event-driven
   */
  async isAccessibilityServiceEnabled(): Promise<boolean> {
    if (!this.isSupported() || !NativeAppUsage) return false;
    try {
      return await NativeAppUsage.isAccessibilityServiceEnabled();
    } catch {
      return false;
    }
  },

  /**
   * Open Android Accessibility Settings so user can enable the service
   */
  async openAccessibilitySettings(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      if (NativeAppUsage) {
        await NativeAppUsage.openAccessibilitySettings();
      } else {
        // Fallback when native module is unavailable
        await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
      }
    } catch {
      try {
        await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
      } catch {
        await Linking.openSettings();
      }
    }
  },

  /**
   * Sync tracked apps to SharedPreferences for the AccessibilityService to read
   * Call this whenever the tracked apps list changes
   */
  async updateTrackedApps(packageNames: string[]): Promise<void> {
    if (!this.isSupported() || !NativeAppUsage) return;
    try {
      await NativeAppUsage.updateTrackedApps(packageNames);
    } catch {
      // ignore
    }
  },

  /**
   * Get app usage statistics for the last N days (Android only)
   * Returns sorted list of apps with time spent
   */
  async getAppUsageStats(days: number = 1): Promise<Array<{ packageName: string; totalTimeMs: number; lastUsed: number }>> {
    if (!this.isSupported() || !NativeAppUsage) return [];
    try {
      return await NativeAppUsage.getAppUsageStats(days);
    } catch {
      return [];
    }
  },
};

export default appUsageService;
