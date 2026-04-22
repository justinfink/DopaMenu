import { useEffect, useState, useRef } from 'react';
import { Platform, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '../src/stores/userStore';
import { useInterventionStore } from '../src/stores/interventionStore';
import { useCustomInterventionsStore } from '../src/stores/customInterventionsStore';
import { notificationService, analyticsService, AnalyticsEvents, appUsageService } from '../src/services';
import { simulateSituation, generateIntervention } from '../src/engine/InterventionEngine';
import { DEFAULT_INTERVENTIONS } from '../src/constants/interventions';
import { colors } from '../src/constants/theme';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { user, isLoading, initializeUser } = useUserStore();
  const { showIntervention } = useInterventionStore();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const appLaunchUnsubscribe = useRef<(() => void) | null>(null);

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
        }
      }
    }

    setupServices();

    // Build the merged candidate pool once per effect run: built-in + user custom
    const buildCandidatePool = () => [
      ...DEFAULT_INTERVENTIONS,
      ...useCustomInterventionsStore.getState().interventions,
    ];

    // Listen for app launch events via NativeEventEmitter — fires when DopaMenu is in the foreground
    if (Platform.OS === 'android' && currentUser.preferences.appMonitoringEnabled) {
      appLaunchUnsubscribe.current = appUsageService.onAppLaunched((event) => {
        console.log('[AppUsage] Detected app launch:', event.label);
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'app_detection',
          detectedApp: event.label,
        });
        const situation = simulateSituation();
        const decision = generateIntervention(
          situation,
          currentUser,
          buildCandidatePool(),
          { triggerPackageName: event.packageName }
        );
        showIntervention(decision, situation);
        router.push('/intervention');
      });
    }

    // Handle deep links from the native AppUsageMonitorService (Android) or
    // iOS Shortcuts automation. URL shapes:
    //   Android: dopamenu://intervention?trigger=app_intercept&package=com.instagram.android
    //   iOS:     dopamenu://intervention?app=com.burbn.instagram
    // Fires when the app is backgrounded or closed and the notification is
    // tapped, or when Shortcuts fires the "App is Opened" automation.
    const handleDeepLink = ({ url }: { url: string }) => {
      if (url.startsWith('dopamenu://intervention')) {
        // Extract ?package=... (Android) or ?app=... (iOS Shortcuts) from
        // the deep link. iOS passes the iOS bundle id, which we then map
        // back to the tracked app by iosBundleId to find the corresponding
        // Android packageName (interventions are keyed by packageName).
        let triggerPackageName: string | undefined;
        const queryIdx = url.indexOf('?');
        if (queryIdx >= 0) {
          const params = new URLSearchParams(url.substring(queryIdx + 1));
          triggerPackageName = params.get('package') || undefined;
          if (!triggerPackageName) {
            const iosBundleId = params.get('app') || undefined;
            if (iosBundleId) {
              const match = currentUser.preferences.trackedApps.find(
                (a) => a.iosBundleId === iosBundleId
              );
              triggerPackageName = match?.packageName;
            }
          }
        }
        const situation = simulateSituation();
        const decision = generateIntervention(
          situation,
          currentUser,
          buildCandidatePool(),
          { triggerPackageName }
        );
        showIntervention(decision, situation);
        router.push('/intervention');
      }
    };

    const deepLinkSub = Linking.addEventListener('url', handleDeepLink);

    // Check if the app was launched via the deep link while it was closed
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Listen for notification taps
    responseListener.current = notificationService.addResponseListener((response) => {
      const data = response.notification.request.content.data;

      // Track notification tap
      analyticsService.track(AnalyticsEvents.NOTIFICATION_TAPPED, {
        type: String(data?.type || 'unknown'),
      });

      // Handle different notification types
      if (data?.type === 'intervention' || data?.type === 'high_risk_reminder' || data?.type === 'immediate_checkin') {
        // Generate an intervention and show it (no trigger app — generic check-in)
        const situation = simulateSituation();
        const decision = generateIntervention(
          situation,
          currentUser,
          buildCandidatePool()
        );
        showIntervention(decision, situation);
        router.push('/intervention');
      }
    });

    // Listen for foreground notifications
    notificationListener.current = notificationService.addReceivedListener((notification) => {
      // Log that notification was received while app is in foreground
      console.log('[Notification] Received in foreground:', notification.request.content.title);
    });

    return () => {
      deepLinkSub.remove();
      if (appLaunchUnsubscribe.current) {
        appLaunchUnsubscribe.current();
        appLaunchUnsubscribe.current = null;
      }
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
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
        <Stack.Screen name="ios-setup" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
