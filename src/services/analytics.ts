import PostHog from 'posthog-react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ============================================
// Analytics Service
// Privacy-respecting product analytics
// ============================================

// PostHog API key - replace with your own from https://app.posthog.com
// You can self-host PostHog for full data ownership
const POSTHOG_API_KEY = 'phc_s2pTafDSGfRlVG2gblKqqA9dVxFcfJiPXKCB0dQksSe';
const POSTHOG_HOST = 'https://app.posthog.com'; // or your self-hosted URL

let posthog: PostHog | null = null;
let isInitialized = false;

interface AnalyticsConfig {
  enableAnalytics: boolean; // User opt-in preference
}

export const analyticsService = {
  /**
   * Initialize analytics - call once at app start
   * Only initializes if user has opted in
   */
  async initialize(config: AnalyticsConfig): Promise<void> {
    if (!config.enableAnalytics || isInitialized) {
      return;
    }

    if (!POSTHOG_API_KEY || POSTHOG_API_KEY.startsWith('phc_REPLACE')) {
      console.log('[Analytics] No API key configured, skipping initialization');
      return;
    }

    try {
      posthog = new PostHog(POSTHOG_API_KEY, {
        host: POSTHOG_HOST,
        // Don't capture IP addresses
        captureMode: 'form',
        // Batch events to reduce network calls
        flushAt: 20,
        flushInterval: 30000,
      });

      isInitialized = true;
      console.log('[Analytics] Initialized');
    } catch (error) {
      console.error('[Analytics] Failed to initialize:', error);
    }
  },

  /**
   * Identify user (anonymous ID only - no PII)
   */
  async identify(userId: string): Promise<void> {
    if (!posthog) return;

    try {
      posthog.identify(userId, {
        // Only capture non-identifying device info
        platform: Platform.OS,
        osVersion: Platform.Version,
        appVersion: Application.nativeApplicationVersion,
        deviceType: Device.deviceType,
        // No email, name, or other PII
      });
    } catch (error) {
      console.error('[Analytics] Identify failed:', error);
    }
  },

  /**
   * Track an event
   */
  track(event: string, properties?: Record<string, unknown>): void {
    if (!posthog) return;

    try {
      posthog.capture(event, properties);
    } catch (error) {
      console.error('[Analytics] Track failed:', error);
    }
  },

  /**
   * Track screen view
   */
  screen(screenName: string, properties?: Record<string, unknown>): void {
    if (!posthog) return;

    try {
      posthog.screen(screenName, properties);
    } catch (error) {
      console.error('[Analytics] Screen failed:', error);
    }
  },

  /**
   * Disable analytics and clear data
   */
  async disable(): Promise<void> {
    if (!posthog) return;

    try {
      posthog.optOut();
      await posthog.flush();
      isInitialized = false;
      posthog = null;
    } catch (error) {
      console.error('[Analytics] Disable failed:', error);
    }
  },

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (!posthog) return;
    await posthog.flush();
  },
};

// ============================================
// Event Constants - what you'll track
// ============================================

export const AnalyticsEvents = {
  // Onboarding funnel
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_IDENTITY_SELECTED: 'onboarding_identity_selected',
  ONBOARDING_FREQUENCY_SET: 'onboarding_frequency_set',
  ONBOARDING_TONE_SET: 'onboarding_tone_set',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Core engagement
  INTERVENTION_SHOWN: 'intervention_shown',
  INTERVENTION_ACCEPTED: 'intervention_accepted',
  INTERVENTION_DISMISSED: 'intervention_dismissed',
  INTERVENTION_CONTINUED: 'intervention_continued', // "conscious continuation"
  ALTERNATIVES_VIEWED: 'alternatives_viewed',

  // Portfolio/reflection
  PORTFOLIO_OPENED: 'portfolio_opened',
  PORTFOLIO_CATEGORY_CHECKED: 'portfolio_category_checked',
  PORTFOLIO_COMPLETED: 'portfolio_completed',

  // Settings
  SETTINGS_CHANGED: 'settings_changed',
  QUIET_HOURS_UPDATED: 'quiet_hours_updated',

  // Retention signals
  APP_OPENED: 'app_opened',
  APP_BACKGROUNDED: 'app_backgrounded',
  NOTIFICATION_TAPPED: 'notification_tapped',

  // Feature usage
  DEMO_TRIGGERED: 'demo_triggered',
} as const;

export default analyticsService;
