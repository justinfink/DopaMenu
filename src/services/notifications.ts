import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { InterventionDecision } from '../models';

// ============================================
// Notifications Service
// Handles intervention notifications
// ============================================

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationPermissions {
  granted: boolean;
  canAskAgain: boolean;
}

export const notificationService = {
  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<NotificationPermissions> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return {
      granted: finalStatus === 'granted',
      canAskAgain: finalStatus !== 'denied',
    };
  },

  /**
   * Check current permission status
   */
  async checkPermissions(): Promise<NotificationPermissions> {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();

    return {
      granted: status === 'granted',
      canAskAgain,
    };
  },

  /**
   * Schedule an intervention notification
   */
  async scheduleInterventionNotification(
    decision: InterventionDecision,
    delaySeconds: number = 0
  ): Promise<string | null> {
    try {
      const trigger: Notifications.NotificationTriggerInput = delaySeconds > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
            repeats: false,
          }
        : null;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'DopaMenu',
          body: decision.primary.label,
          subtitle: decision.explanation,
          data: {
            type: 'intervention',
            interventionId: decision.id,
          },
        },
        trigger,
      });

      return notificationId;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  },

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  },

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  /**
   * Add notification response listener
   */
  addResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },

  /**
   * Add notification received listener
   */
  addReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  },

  /**
   * Register for push notifications (for future use)
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'DopaMenu',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#9B7BB8',
      });
    }

    const { granted } = await this.requestPermissions();

    if (!granted) {
      return null;
    }

    // For local-only notifications, we don't need a push token
    // This would be used if we add server-side notifications later
    return null;
  },
};

export default notificationService;
