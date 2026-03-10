import { Platform, Linking, NativeModules } from 'react-native';

// ============================================
// Permissions Service
// Centralized permission management with
// in-app UI that opens exact settings pages.
// ============================================

export type PermissionType =
  | 'accessibility'
  | 'usage_access'
  | 'overlay'
  | 'notifications'
  | 'battery_optimization'
  | 'sensors'
  | 'calendar';

export interface PermissionStatus {
  type: PermissionType;
  granted: boolean;
  label: string;
  description: string;
  required: boolean;
  platform: 'android' | 'ios' | 'both';
}

class PermissionsService {
  // ── Check Permissions ─────────────────────────

  async checkAllPermissions(): Promise<PermissionStatus[]> {
    const statuses: PermissionStatus[] = [];

    if (Platform.OS === 'android') {
      statuses.push({
        type: 'accessibility',
        granted: await this.checkAccessibilityService(),
        label: 'Accessibility Service',
        description: 'Recommended. Enables real-time app detection when you open a tracked app.',
        required: true,
        platform: 'android',
      });

      statuses.push({
        type: 'usage_access',
        granted: await this.checkUsageAccess(),
        label: 'Usage Access',
        description: 'Fallback detection + usage statistics. Enable if you prefer not to use Accessibility Service.',
        required: false,
        platform: 'android',
      });

      statuses.push({
        type: 'battery_optimization',
        granted: false, // Cannot easily check, assume not granted
        label: 'Battery Optimization',
        description: 'Disable to ensure app monitoring works in background',
        required: false,
        platform: 'android',
      });
    }

    statuses.push({
      type: 'notifications',
      granted: await this.checkNotificationPermission(),
      label: 'Notifications',
      description: 'Required for high-risk reminders and redirect alerts',
      required: true,
      platform: 'both',
    });

    statuses.push({
      type: 'sensors',
      granted: true, // Most sensor APIs don't need explicit permission
      label: 'Motion & Activity',
      description: 'Used for step counting and movement tracking',
      required: false,
      platform: 'both',
    });

    statuses.push({
      type: 'calendar',
      granted: false, // Would need to check via expo-calendar
      label: 'Calendar',
      description: 'Used to detect meetings and cognitive load',
      required: false,
      platform: 'both',
    });

    return statuses;
  }

  // ── Individual Checks ─────────────────────────

  private async checkAccessibilityService(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const { DopaMenuAppUsage } = NativeModules;
      if (DopaMenuAppUsage?.isAccessibilityServiceEnabled) {
        return await DopaMenuAppUsage.isAccessibilityServiceEnabled();
      }
    } catch {
      // Module may not be available
    }
    return false;
  }

  private async checkUsageAccess(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const { DopaMenuAppUsage } = NativeModules;
      if (DopaMenuAppUsage?.hasUsagePermission) {
        return await DopaMenuAppUsage.hasUsagePermission();
      }
    } catch {
      // Module may not be available
    }
    return false;
  }

  private async checkOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const { DopaMenuAppUsage } = NativeModules;
      if (DopaMenuAppUsage?.canDrawOverlays) {
        return await DopaMenuAppUsage.canDrawOverlays();
      }
    } catch {
      // Module may not be available
    }
    return false;
  }

  private async checkNotificationPermission(): Promise<boolean> {
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  // ── Open Settings Pages ───────────────────────

  async openPermissionSettings(type: PermissionType): Promise<void> {
    switch (type) {
      case 'accessibility':
        await this.openAccessibilitySettings();
        break;
      case 'usage_access':
        await this.openUsageAccessSettings();
        break;
      case 'overlay':
        await this.openOverlaySettings();
        break;
      case 'notifications':
        await this.openNotificationSettings();
        break;
      case 'battery_optimization':
        await this.openBatteryOptimizationSettings();
        break;
      case 'sensors':
        // Sensors usually don't have a settings page
        await this.openAppSettings();
        break;
      case 'calendar':
        await this.openAppSettings();
        break;
    }
  }

  async openAccessibilitySettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        const { DopaMenuAppUsage } = NativeModules;
        if (DopaMenuAppUsage?.openAccessibilitySettings) {
          await DopaMenuAppUsage.openAccessibilitySettings();
          return;
        }
      } catch {
        // Fallback
      }
      await Linking.openSettings();
    }
  }

  async openUsageAccessSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        const { DopaMenuAppUsage } = NativeModules;
        if (DopaMenuAppUsage?.openUsageAccessSettings) {
          await DopaMenuAppUsage.openUsageAccessSettings();
          return;
        }
      } catch {
        // Fallback
      }
      await Linking.openSettings();
    }
  }

  async openOverlaySettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        const { DopaMenuAppUsage } = NativeModules;
        if (DopaMenuAppUsage?.requestOverlayPermission) {
          await DopaMenuAppUsage.requestOverlayPermission();
          return;
        }
      } catch {
        // Fallback
      }
      // Fallback to general settings
      await Linking.sendIntent('android.settings.MANAGE_OVERLAY_PERMISSION');
    }
  }

  async openNotificationSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
          { key: 'android.provider.extra.APP_PACKAGE', value: 'com.dopamenu.app' },
        ]);
        return;
      } catch {
        // Fallback
      }
    }
    await Linking.openSettings();
  }

  async openBatteryOptimizationSettings(): Promise<void> {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
        return;
      } catch {
        // Fallback
      }
    }
    await Linking.openSettings();
  }

  async openAppSettings(): Promise<void> {
    await Linking.openSettings();
  }

  // ── Request Permission Flow ───────────────────

  async requestPermission(type: PermissionType): Promise<boolean> {
    switch (type) {
      case 'notifications': {
        try {
          const Notifications = await import('expo-notifications');
          const { status } = await Notifications.requestPermissionsAsync();
          return status === 'granted';
        } catch {
          return false;
        }
      }
      case 'calendar': {
        try {
          const Calendar = await import('expo-calendar');
          const { status } = await Calendar.requestCalendarPermissionsAsync();
          return status === 'granted';
        } catch {
          return false;
        }
      }
      default:
        // For Android system settings, open the settings page
        await this.openPermissionSettings(type);
        return false; // User must return to app after granting
    }
  }
}

export const permissionsService = new PermissionsService();
export default permissionsService;
