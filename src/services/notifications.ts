import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { InterventionDecision } from '../models';

// ============================================
// Notifications Service
// Handles intervention notifications and
// scheduled high-risk time reminders
// ============================================

// High-risk time configuration
export interface HighRiskTime {
  id: string;
  label: string;
  hour: number;
  minute: number;
  enabled: boolean;
  daysOfWeek: number[]; // 1=Sunday, 2=Monday, ..., 7=Saturday (Expo format)
}

// Default high-risk times based on behavioral research
export const DEFAULT_HIGH_RISK_TIMES: HighRiskTime[] = [
  {
    id: 'morning',
    label: 'Morning check-in',
    hour: 8,
    minute: 0,
    enabled: true,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7], // Every day
  },
  {
    id: 'lunch',
    label: 'Lunch break',
    hour: 12,
    minute: 30,
    enabled: true,
    daysOfWeek: [2, 3, 4, 5, 6], // Mon-Fri
  },
  {
    id: 'afternoon',
    label: 'Afternoon slump',
    hour: 15,
    minute: 0,
    enabled: true,
    daysOfWeek: [2, 3, 4, 5, 6], // Mon-Fri
  },
  {
    id: 'evening',
    label: 'Evening wind-down',
    hour: 21,
    minute: 0,
    enabled: true,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7], // Every day
  },
];

// Motivational messages for high-risk time notifications
const HIGH_RISK_MESSAGES = [
  { title: 'Mindful moment', body: 'Before you scroll, take a breath. What do you actually need right now?' },
  { title: 'Quick check-in', body: 'This is usually a high-scroll time. How are you feeling?' },
  { title: 'Pause point', body: 'Caught yourself reaching? Tap to explore alternatives.' },
  { title: 'DopaMenu', body: 'Your future self will thank you. What would feel good right now?' },
  { title: 'Gentle nudge', body: 'This is a vulnerable moment. Take 3 breaths before deciding.' },
  { title: 'Awareness bell', body: 'Feeling the pull? You have other options.' },
];

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
   * Schedule a high-risk time reminder notification
   */
  async scheduleHighRiskReminder(highRiskTime: HighRiskTime): Promise<string[]> {
    const notificationIds: string[] = [];

    // Get a random motivational message
    const message = HIGH_RISK_MESSAGES[Math.floor(Math.random() * HIGH_RISK_MESSAGES.length)];

    try {
      // Schedule for each enabled day of the week
      for (const weekday of highRiskTime.daysOfWeek) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: message.title,
            body: message.body,
            data: {
              type: 'high_risk_reminder',
              highRiskTimeId: highRiskTime.id,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: highRiskTime.hour,
            minute: highRiskTime.minute,
          },
        });
        notificationIds.push(notificationId);
      }
    } catch (error) {
      console.error('Failed to schedule high-risk reminder:', error);
    }

    return notificationIds;
  },

  /**
   * Schedule all high-risk time reminders
   */
  async scheduleAllHighRiskReminders(highRiskTimes: HighRiskTime[]): Promise<Map<string, string[]>> {
    const scheduledIds = new Map<string, string[]>();

    // Cancel existing high-risk reminders first
    await this.cancelHighRiskReminders();

    for (const hrt of highRiskTimes) {
      if (hrt.enabled) {
        const ids = await this.scheduleHighRiskReminder(hrt);
        scheduledIds.set(hrt.id, ids);
      }
    }

    console.log(`[Notifications] Scheduled ${scheduledIds.size} high-risk time reminder groups`);
    return scheduledIds;
  },

  /**
   * Cancel all high-risk reminder notifications
   */
  async cancelHighRiskReminders(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduled) {
      if (notification.content.data?.type === 'high_risk_reminder') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  },

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
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
   * Send an immediate check-in notification (iOS proactive trigger)
   */
  async sendImmediateCheckIn(): Promise<string | null> {
    const message = HIGH_RISK_MESSAGES[Math.floor(Math.random() * HIGH_RISK_MESSAGES.length)];

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.body,
          data: {
            type: 'immediate_checkin',
          },
        },
        trigger: null, // Immediate
      });
      return notificationId;
    } catch (error) {
      console.error('Failed to send immediate check-in:', error);
      return null;
    }
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
   * Register for push notifications and set up Android channel
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (Platform.OS === 'android') {
      // Create notification channels for Android
      await Notifications.setNotificationChannelAsync('default', {
        name: 'DopaMenu',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#9B7BB8',
      });

      await Notifications.setNotificationChannelAsync('high_risk', {
        name: 'High-Risk Time Reminders',
        description: 'Reminders at times you typically reach for your phone',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#9B7BB8',
      });

      await Notifications.setNotificationChannelAsync('app_detection', {
        name: 'App Detection Alerts',
        description: 'Alerts when you open tracked apps',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500],
        lightColor: '#9B7BB8',
      });
    }

    const { granted } = await this.requestPermissions();

    if (!granted) {
      return null;
    }

    return null;
  },
};

export default notificationService;
