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
import {
  hasProblemAppSelection,
  getAuthorizationStatus as getFamilyControlsStatus,
  startBlocking as startIosBlocking,
  recordShieldTrigger,
  shouldShowIntervention,
  markInterventionShown,
  ensureShieldArmedIfWindowExpired,
} from '../src/services/iosFamilyControls';
import { simulateSituation, generateIntervention } from '../src/engine/InterventionEngine';
import { DEFAULT_INTERVENTIONS, getInterventionPool } from '../src/constants/interventions';
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

      // iOS: re-arm the Shield on every app start so it survives reboots,
      // package updates, and user toggles. If the user's suppression window
      // elapsed while we weren't running, this also re-applies the block.
      if (
        Platform.OS === 'ios' &&
        currentUser.preferences.appMonitoringEnabled &&
        getFamilyControlsStatus() === 'approved' &&
        hasProblemAppSelection()
      ) {
        try {
          ensureShieldArmedIfWindowExpired();
          await startIosBlocking();
        } catch (err) {
          console.warn('[iOSFamilyControls] boot re-arm failed', err);
        }
      }
    }

    setupServices();

    // Build the merged candidate pool once per effect run: built-in + user custom
    const buildCandidatePool = () => [
      ...getInterventionPool(currentUser),
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
        showIntervention(decision, situation, event.packageName);
        router.push('/intervention');
      });
    }

    // Handle deep links from the native AppUsageMonitorService (Android),
    // iOS Shortcuts automation, or the iOS ShieldAction extension. Shapes:
    //   Android:  dopamenu://intervention?trigger=app_intercept&package=com.instagram.android
    //   iOS Shc:  dopamenu://intervention?app=com.burbn.instagram
    //   iOS Shld: dopamenu://intervention?source=shield&token=<hash>&name=Instagram
    // Fires when the app is backgrounded or closed and the notification is
    // tapped, Shortcuts fires the "App is Opened" automation, or the user
    // taps "Take a pause" on the Apple Shield (opens via NSExtensionContext).
    const handleDeepLink = ({ url }: { url: string }) => {
      if (url.startsWith('dopamenu://intervention')) {
        let triggerPackageName: string | undefined;
        let source: string | undefined;
        let shieldToken: string | undefined;
        let shieldName: string | undefined;
        const queryIdx = url.indexOf('?');
        if (queryIdx >= 0) {
          const params = new URLSearchParams(url.substring(queryIdx + 1));
          source = params.get('source') || undefined;
          triggerPackageName = params.get('package') || undefined;

          if (source === 'shield') {
            // Shield-originated deep links: the extension can't pass us a
            // bundle id (tokens are opaque), only the display name. Debounce
            // to avoid doubling with a concurrent Shortcuts fire for the
            // same app open.
            if (!shouldShowIntervention()) {
              return;
            }
            shieldToken = params.get('token') || undefined;
            shieldName = params.get('name') || undefined;
            if (shieldToken) {
              recordShieldTrigger(shieldToken, shieldName);
            }
            markInterventionShown();
            if (shieldName) {
              const match = currentUser.preferences.trackedApps.find(
                (a) => a.label.toLowerCase() === shieldName!.toLowerCase()
              );
              triggerPackageName = match?.packageName;
            }
          } else if (!triggerPackageName) {
            const iosBundleId = params.get('app') || undefined;
            if (iosBundleId) {
              const match = currentUser.preferences.trackedApps.find(
                (a) => a.iosBundleId === iosBundleId
              );
              triggerPackageName = match?.packageName;
              // Auto-detect: the fact that this deep link fired at all proves
              // the Shortcuts automation is wired up correctly for this app.
              if (match && !match.iosShortcutConfigured) {
                const { user: latestUser, updatePreferences } =
                  useUserStore.getState();
                if (latestUser) {
                  const updated = latestUser.preferences.trackedApps.map((a) =>
                    a.iosBundleId === iosBundleId
                      ? { ...a, iosShortcutConfigured: true }
                      : a
                  );
                  updatePreferences({ trackedApps: updated });
                }
              }
              if (Platform.OS === 'ios') {
                if (!shouldShowIntervention()) {
                  return;
                }
                markInterventionShown();
              }
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
        showIntervention(decision, situation, triggerPackageName);
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
