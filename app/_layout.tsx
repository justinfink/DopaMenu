import { useEffect, useState, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '../src/stores/userStore';
import { useInterventionStore } from '../src/stores/interventionStore';
import { useRedirectStore } from '../src/stores/redirectStore';
import { useAppLibraryStore } from '../src/stores/appLibraryStore';
import { notificationService, analyticsService, AnalyticsEvents, appUsageService } from '../src/services';
import { phenotypeCollector } from '../src/services/phenotypeCollector';
import { simulateSituation, generateIntervention, createRedirectSituation } from '../src/engine/InterventionEngine';
import { DEFAULT_PHENOTYPE_SETTINGS } from '../src/models';
import { APP_CATALOG } from '../src/constants/appCatalog';
import { colors } from '../src/constants/theme';

// Social/messaging categories for phenotype tracking
const SOCIAL_CATEGORIES = new Set(['social_media', 'communication']);
const MESSAGING_CATEGORIES = new Set(['communication']);

function isSocialApp(packageName: string): boolean {
  const app = APP_CATALOG.find(a => a.packageName === packageName);
  return app ? SOCIAL_CATEGORIES.has(app.category) : false;
}

function isMessagingApp(packageName: string): boolean {
  const app = APP_CATALOG.find(a => a.packageName === packageName);
  return app ? MESSAGING_CATEGORIES.has(app.category) : false;
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { user, isLoading, initializeUser } = useUserStore();
  const { showIntervention } = useInterventionStore();
  const { startRedirect, getStats: getRedirectStats } = useRedirectStore();
  const { getRedirectApps } = useAppLibraryStore();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Initialize app
  useEffect(() => {
    async function prepare() {
      try {
        // Initialize user with timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        initializeUser(timezone);
      } catch (e) {
        console.warn('Error preparing app:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  // Check for pending redirects from the background service
  const checkPendingRedirect = useCallback(async () => {
    if (Platform.OS !== 'android' || !user) return;
    if (!user.preferences.appMonitoringEnabled) return;

    const pending = await appUsageService.getPendingRedirect();
    if (!pending) return;

    // Clear it immediately so we don't re-process
    await appUsageService.clearPendingRedirect();

    // Record app switch in phenotype collector
    phenotypeCollector.recordAppSwitch();
    if (isSocialApp(pending.packageName)) {
      phenotypeCollector.recordSocialAppUse(1, isMessagingApp(pending.packageName));
    }

    // Check cooldown
    const { isInCooldown } = useRedirectStore.getState();
    if (isInCooldown()) return;

    // Find the app label from tracked apps
    const trackedApp = user.preferences.trackedApps.find(
      a => a.packageName === pending.packageName
    );
    const sourceAppName = trackedApp?.label || pending.packageName.split('.').pop() || 'App';

    // Generate intervention and show redirect
    const situation = createRedirectSituation(pending.packageName);
    const decision = generateIntervention(situation, user, undefined, undefined, sourceAppName);
    startRedirect(pending.packageName, sourceAppName, decision);
    showIntervention(decision, situation);
    router.push('/redirect');
  }, [user]);

  // Listen for app coming to foreground to check for pending redirects + phenotype tracking
  useEffect(() => {
    if (!user) return;

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      // Track screen on/off for phenotype
      if (user.preferences.phenotypeCollectionEnabled) {
        if (nextState === 'active') {
          phenotypeCollector.recordScreenOn();
          phenotypeCollector.recordUnlock();
        } else if (nextState === 'background' || nextState === 'inactive') {
          phenotypeCollector.recordScreenOff();
        }
      }

      // Check pending redirects (Android only)
      if (Platform.OS === 'android' && nextState === 'active') {
        checkPendingRedirect();
      }
    });

    // Also check immediately on mount
    if (Platform.OS === 'android') {
      checkPendingRedirect();
    }

    return () => subscription.remove();
  }, [checkPendingRedirect, user?.preferences.phenotypeCollectionEnabled]);

  // Set up notifications and monitoring after user is ready
  useEffect(() => {
    if (!user) return;

    // Capture user reference for closures
    const currentUser = user;

    async function setupServices() {
      // Register for notifications
      await notificationService.registerForPushNotifications();

      // Initialize analytics if enabled
      if (currentUser.preferences.analyticsEnabled) {
        await analyticsService.initialize({ enableAnalytics: true });
        analyticsService.identify(currentUser.id);
      }

      // Schedule high-risk time reminders if enabled
      if (currentUser.preferences.highRiskRemindersEnabled) {
        const enabledTimes = currentUser.preferences.highRiskTimes.filter(t => t.enabled);
        if (enabledTimes.length > 0) {
          await notificationService.scheduleAllHighRiskReminders(enabledTimes);
        }
      }

      // Start app monitoring on Android if enabled
      if (Platform.OS === 'android' && currentUser.preferences.appMonitoringEnabled) {
        const enabledApps = currentUser.preferences.trackedApps.filter(a => a.enabled);
        if (enabledApps.length > 0) {
          await appUsageService.startMonitoring(enabledApps);
          // Sync tracked apps to SharedPreferences for the AccessibilityService
          await appUsageService.updateTrackedApps(enabledApps.map(a => a.packageName));
        }
      } else if (Platform.OS === 'android') {
        // Even if monitoring is "off", sync tracked apps in case user enables AccessibilityService directly
        const enabledApps = currentUser.preferences.trackedApps.filter(a => a.enabled);
        if (enabledApps.length > 0) {
          await appUsageService.updateTrackedApps(enabledApps.map(a => a.packageName));
        }
      }

      // Start phenotype collection if enabled
      if (currentUser.preferences.phenotypeCollectionEnabled) {
        const settings = currentUser.preferences.phenotypeSettings || DEFAULT_PHENOTYPE_SETTINGS;
        await phenotypeCollector.initialize(settings);
      }
    }

    setupServices();

    // Listen for native app launch events (backup to SharedPreferences polling)
    let unsubscribeAppLaunch: (() => void) | null = null;
    if (Platform.OS === 'android' && currentUser.preferences.appMonitoringEnabled) {
      unsubscribeAppLaunch = appUsageService.onAppLaunched((event) => {
        // Record in phenotype collector
        phenotypeCollector.recordAppSwitch();
        if (isSocialApp(event.packageName)) {
          phenotypeCollector.recordSocialAppUse(1, isMessagingApp(event.packageName));
        }

        const { isInCooldown } = useRedirectStore.getState();
        if (isInCooldown()) return;

        const sourceAppName = event.label || event.packageName.split('.').pop() || 'App';
        const situation = createRedirectSituation(event.packageName);
        const decision = generateIntervention(situation, currentUser, undefined, undefined, sourceAppName);
        startRedirect(event.packageName, sourceAppName, decision);
        showIntervention(decision, situation);
        router.push('/redirect');
      });
    }

    // Listen for notification taps
    responseListener.current = notificationService.addResponseListener((response) => {
      const data = response.notification.request.content.data;

      // Track notification tap
      analyticsService.track(AnalyticsEvents.NOTIFICATION_TAPPED, {
        type: String(data?.type || 'unknown'),
      });

      // Record in phenotype collector (approximate response time)
      if (currentUser.preferences.phenotypeCollectionEnabled) {
        phenotypeCollector.recordNotificationResponse(5000); // Estimate 5s response
      }

      // Handle different notification types
      if (data?.type === 'redirect' && data?.sourceApp) {
        // Redirect from tracked app detection
        const sourceApp = String(data.sourceApp);
        const sourceAppName = String(data.sourceAppName || sourceApp);
        const situation = createRedirectSituation(sourceApp);
        const decision = generateIntervention(situation, currentUser, undefined, undefined, sourceAppName);
        startRedirect(sourceApp, sourceAppName, decision);
        showIntervention(decision, situation);
        router.push('/redirect');
      } else if (data?.type === 'intervention' || data?.type === 'high_risk_reminder' || data?.type === 'immediate_checkin') {
        // Generate an intervention and show it
        const situation = simulateSituation();
        const decision = generateIntervention(situation, currentUser);
        showIntervention(decision, situation);
        router.push('/intervention');
      }
    });

    // Listen for foreground notifications
    notificationListener.current = notificationService.addReceivedListener((notification) => {
      console.log('[Notification] Received in foreground:', notification.request.content.title);
      // Track in phenotype collector
      if (currentUser.preferences.phenotypeCollectionEnabled) {
        phenotypeCollector.recordNotificationReceived();
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (unsubscribeAppLaunch) {
        unsubscribeAppLaunch();
      }
      phenotypeCollector.stop();
    };
  }, [user?.id, user?.preferences.highRiskRemindersEnabled, user?.preferences.appMonitoringEnabled]);

  useEffect(() => {
    if (appIsReady && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [appIsReady, isLoading]);

  if (!appIsReady || isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="onboarding"
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="intervention"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="redirect"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="insights"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="app-config"
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </>
  );
}
