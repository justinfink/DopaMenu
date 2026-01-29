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
   * Open settings to grant usage stats permission (Android only)
   */
  async requestPermission(): Promise<void> {
    if (!this.isSupported()) {
      console.log('[AppUsage] Not supported on this platform');
      return;
    }

    try {
      // Open Android Usage Access settings
      if (Platform.OS === 'android') {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('[AppUsage] Failed to open settings:', error);
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
};

export default appUsageService;
