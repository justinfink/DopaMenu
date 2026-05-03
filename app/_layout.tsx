import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus, BackHandler, Platform, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '../src/stores/userStore';
import { useInterventionStore } from '../src/stores/interventionStore';
import { useCustomInterventionsStore } from '../src/stores/customInterventionsStore';
import { notificationService, analyticsService, AnalyticsEvents, appUsageService } from '../src/services';
import {
  clearAutomationBounceIfExpired,
  consumeAutomationHandoff,
  hasProblemAppSelection,
  getAuthorizationStatus as getFamilyControlsStatus,
  peekAutomationBounce,
  startBlocking as startIosBlocking,
  recordShieldTrigger,
  shouldShowIntervention,
  markInterventionShown,
  ensureShieldArmedIfWindowExpired,
} from '../src/services/iosFamilyControls';
import { simulateSituation, generateIntervention } from '../src/engine/InterventionEngine';
import { DEFAULT_INTERVENTIONS, getInterventionPool } from '../src/constants/interventions';
import { launchIntervention } from '../src/services/interventionLauncher';
import { colors } from '../src/constants/theme';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from '../src/widget/WidgetTaskHandler';
import { refreshWidget } from '../src/widget/refreshWidget';

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}

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
      // startBlocking() is idempotent — if the Shield was armed within the
      // last 5 min it short-circuits and doesn't burn extension cycles.
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

    // ─── iOS tap-free mode handoff ────────────────────────────────────────
    // When the user has set up the Personal Automation that runs our
    // "Take a Pause" App Intent, the Swift-side AppIntent stamps an App
    // Group flag *milliseconds* before iOS foregrounds DopaMenu. We check
    // that stamp on every foreground (and once at launch) and route into
    // the intervention modal if it's fresh — that's what makes the
    // Shortcuts handoff feel instant. consumeAutomationHandoff clears the
    // stamp so the same handoff can't fire twice.
    const handleAutomationHandoff = () => {
      if (Platform.OS !== 'ios') return;
      if (!currentUser.preferences.appMonitoringEnabled) return;

      // ── v18 bounce check ────────────────────────────────────────────────
      // The PRIMARY loop fix in v18 is the hosted iCloud Shortcut wrapper:
      // when the user is set up correctly, IsBouncingIntent intercepts the
      // re-fire BEFORE iOS even foregrounds DopaMenu, so this JS handler
      // never runs on the bounce iteration. But if the user is on the
      // v17-style direct-AppIntent setup (didn't migrate to the wrapper
      // shortcut), we still need a JS-side fallback to avoid showing the
      // modal on the bounce. peekAutomationBounce is read-only and
      // expires by time only — replaces v17's single-shot consume which
      // re-introduced the loop after one iteration.
      let bouncePeek:
        | { targetUrl: string; triggerKey: string }
        | null = null;
      try { bouncePeek = peekAutomationBounce(); } catch {}
      if (bouncePeek) {
        // Drain the handoff stamp opportunistically so it doesn't
        // accumulate (Swift may or may not have stamped it depending on
        // which path we're in).
        try { consumeAutomationHandoff(); } catch {}
        void Linking.openURL(bouncePeek.targetUrl).catch(() => {
          /* user lands on tabs; not a loop */
        });
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'ios_automation_bounce',
          bounceTo: bouncePeek.targetUrl,
        });
        return;
      }
      // No active bounce — opportunistic cleanup of stale keys, then run
      // the normal handoff path.
      try { clearAutomationBounceIfExpired(); } catch {}

      try {
        if (!consumeAutomationHandoff()) return;
      } catch {
        return;
      }
      // Debounce: if a Shield-source intervention or another automation
      // handoff just fired in the last 5s, don't double-fire.
      if (!shouldShowIntervention()) return;
      markInterventionShown();
      analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
        trigger: 'ios_automation',
      });
      // Mark setup as complete the first time the automation actually fires.
      // We never want to keep nagging the user about setup once it works.
      if (!currentUser.preferences.iosAutomationConfigured) {
        const { updatePreferences } = useUserStore.getState();
        updatePreferences({ iosAutomationConfigured: true });
      }
      // The automation doesn't tell us *which* tracked app fired it (Apple
      // doesn't pipe that through the AppIntent perform context yet), so
      // we surface a generic intervention with no specific trigger label.
      // The redirect engine still picks a personalized alternative.
      const situation = simulateSituation();
      const decision = generateIntervention(
        situation,
        currentUser,
        buildCandidatePool(),
      );
      showIntervention(decision, situation, undefined, undefined);
      router.push('/intervention');
    };
    // Refresh the Android home screen widget whenever an outcome is recorded
    // or user preferences change, so the widget stays in sync.
    const unsubInterventionWidget = useInterventionStore.subscribe(
      (state, prev) => {
        if (state.lastInterventionTime !== prev.lastInterventionTime) {
          void refreshWidget();
        }
      },
    );
    const unsubUserWidget = useUserStore.subscribe(
      (state, prev) => {
        if (state.user?.preferences !== prev.user?.preferences) {
          void refreshWidget();
        }
      },
    );

    // Run once at first launch in case the automation fired right before
    // we mounted.
    handleAutomationHandoff();
    const automationHandoffSub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          handleAutomationHandoff();
          void refreshWidget();
        }
      },
    );

    // Listen for app launch events via NativeEventEmitter — fires when DopaMenu is in the foreground
    if (Platform.OS === 'android' && currentUser.preferences.appMonitoringEnabled) {
      appLaunchUnsubscribe.current = appUsageService.onAppLaunched((event) => {
        console.log('[AppUsage] Detected app launch:', event.label);
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'app_detection',
          detectedApp: event.label,
        });
        // Cover the FGS-poll race: suppress + flag modal-active immediately.
        // Without this, the poller's next 2s tick can re-fire the same
        // intervention before the modal mounts.
        if (event.packageName) {
          void appUsageService.suppressIntercept(event.packageName, 5000);
        }
        void appUsageService.setModalActive(true);
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
      // Home screen widget tap: dopamenu://widget-launch?id=<interventionId>
      // Resolve the intervention from the merged candidate pool, then either
      // launch its target app (and exit DopaMenu so we don't strand the user
      // on our home screen) or — for off-phone activities like "Take 3 deep
      // breaths" — show the intervention modal so they can act on it.
      if (url.startsWith('dopamenu://widget-launch')) {
        const queryIdx = url.indexOf('?');
        if (queryIdx < 0) return;
        const params = new URLSearchParams(url.substring(queryIdx + 1));
        const id = params.get('id');
        if (!id) return;
        const pool = buildCandidatePool();
        const intervention = pool.find((c) => c.id === id);
        if (!intervention) {
          // Intervention was deleted between widget-render and tap — open
          // DopaMenu so the user can re-open or ignore.
          router.replace('/(tabs)');
          return;
        }
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'widget',
          interventionId: id,
        });
        const hasLaunchTarget =
          !!intervention.launchAppPackage ||
          !!intervention.launchIosScheme ||
          !!intervention.launchTarget;
        if (hasLaunchTarget) {
          void launchIntervention(intervention).then((launched) => {
            // The target app foregrounded — pop DopaMenu so the user lands
            // there cleanly. Without this, hitting back from the target app
            // would put them on DopaMenu's home screen instead of their
            // home screen.
            if (launched && Platform.OS === 'android') {
              BackHandler.exitApp();
            }
          });
          return;
        }
        // Off-phone activity (e.g. "Take 3 deep breaths"). Show the modal so
        // the user can engage with the suggestion.
        const situation = simulateSituation();
        const decision = {
          id: 'widget-' + id,
          situationId: situation.id,
          primary: intervention,
          alternatives: [],
          explanation: 'From your widget',
          timestamp: Date.now(),
        };
        showIntervention(decision, situation);
        router.push('/intervention');
        return;
      }
      if (url.startsWith('dopamenu://intervention')) {
        let triggerPackageName: string | undefined;
        let triggerLabel: string | undefined;
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
              // Apple's display name can include accents / unicode quirks
              // ("Instagram" vs. "ínstagram"). Normalize on both sides so a
              // weird spelling doesn't lose us the package name.
              const norm = (s: string) =>
                s.normalize('NFKD').replace(/\s+/g, '').toLowerCase();
              const target = norm(shieldName);
              const match = currentUser.preferences.trackedApps.find(
                (a) => norm(a.label) === target
              );
              triggerPackageName = match?.packageName;
              // Always carry the Shield's display name through. On iOS the
              // React-side trackedApps array is empty (selection lives in
              // App Group as opaque tokens), so without this label the
              // intervention screen can't find the trigger app's URL scheme
              // to send the user back into when they tap Continue.
              triggerLabel = shieldName;
            }
          } else if (source === 'automation') {
            // iOS 15 fallback path: Personal Automation runs an iCloud-shared
            // shortcut whose only action is "Open URL
            // dopamenu://intervention?source=automation". On iOS 16+ this
            // same source can fire either via the App Group handoff in
            // handleAutomationHandoff OR via this deep-link path. v18
            // bounce check applies here too — when the user picks Continue,
            // the openURL re-launch fires the same iCloud shortcut, which
            // re-enters this branch. Without the peek check below, we'd
            // re-render the modal and the loop returns.
            let bouncePeekDL: { targetUrl: string; triggerKey: string } | null = null;
            try { bouncePeekDL = peekAutomationBounce(); } catch {}
            if (bouncePeekDL) {
              void Linking.openURL(bouncePeekDL.targetUrl).catch(() => {});
              analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
                trigger: 'ios_automation_url_bounce',
                bounceTo: bouncePeekDL.targetUrl,
              });
              return;
            }
            try { clearAutomationBounceIfExpired(); } catch {}

            if (!shouldShowIntervention()) return;
            markInterventionShown();
            if (!currentUser.preferences.iosAutomationConfigured) {
              const { updatePreferences } = useUserStore.getState();
              updatePreferences({ iosAutomationConfigured: true });
            }
            analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
              trigger: 'ios_automation_url',
            });
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
        // Suppress the trigger package and flag the modal as active BEFORE we
        // navigate. The FGS poller in the native service polls every 2s — if
        // we wait until intervention.tsx mounts to set these flags, the next
        // poll cycle slips through and the user gets a duplicate intervention
        // notification stacked on the modal. Doing it here guarantees the
        // first foreground flip after navigation is already covered.
        if (Platform.OS === 'android') {
          if (triggerPackageName) {
            void appUsageService.suppressIntercept(triggerPackageName, 5000);
          }
          void appUsageService.setModalActive(true);
        }
        const situation = simulateSituation();
        const decision = generateIntervention(
          situation,
          currentUser,
          buildCandidatePool(),
          { triggerPackageName }
        );
        showIntervention(decision, situation, triggerPackageName, triggerLabel);
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
        // Pull through any trigger context from the notification's userInfo —
        // specifically the iOS Shield fallback path, where the ShieldAction
        // extension sends a local notification when its openUrl trick can't
        // open us directly. Carrying the trigger label means "Continue what
        // I was doing" can still deep-link back into Instagram (or whatever).
        let triggerLabel: string | undefined;
        let triggerPackageName: string | undefined;
        if (data?.source === 'shield_fallback' || data?.triggerLabel) {
          if (typeof data.triggerLabel === 'string') {
            triggerLabel = data.triggerLabel;
            const norm = (s: string) =>
              s.normalize('NFKD').replace(/\s+/g, '').toLowerCase();
            const target = norm(triggerLabel);
            const match = currentUser.preferences.trackedApps.find(
              (a) => norm(a.label) === target
            );
            triggerPackageName = match?.packageName;
            if (data.token && typeof data.token === 'string') {
              recordShieldTrigger(data.token, triggerLabel);
            }
            if (!shouldShowIntervention()) return;
            markInterventionShown();
          }
        }
        const situation = simulateSituation();
        const decision = generateIntervention(
          situation,
          currentUser,
          buildCandidatePool(),
          { triggerPackageName }
        );
        showIntervention(decision, situation, triggerPackageName, triggerLabel);
        router.push('/intervention');
      }
    });

    // Listen for foreground notifications
    notificationListener.current = notificationService.addReceivedListener((notification) => {
      // Log that notification was received while app is in foreground
      console.log('[Notification] Received in foreground:', notification.request.content.title);
    });

    return () => {
      unsubInterventionWidget();
      unsubUserWidget();
      automationHandoffSub.remove();
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
        <Stack.Screen
          name="onboarding/setup-automation"
          options={{ headerShown: false, presentation: 'card' }}
        />
      </Stack>
    </>
  );
}
