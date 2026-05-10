import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus, Platform, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '../src/stores/userStore';
import { useInterventionStore } from '../src/stores/interventionStore';
import { notificationService, analyticsService, AnalyticsEvents, appUsageService } from '../src/services';
import { deriveQuietHourRanges } from '../src/services/appUsage';
import {
  buildTrackedAppsFromIosSelection,
  clearAutomationBounceIfExpired,
  consumeAutomationHandoff,
  consumeAutomationTriggerApp,
  deriveAppWindowsForIos,
  ensureQuietHoursPause,
  ensureShieldArmedIfWindowExpired,
  getAuthorizationStatus as getFamilyControlsStatus,
  getSelectedApplicationNames,
  hasProblemAppSelection,
  markInterventionShown,
  peekAutomationBounce,
  recordShieldTrigger,
  setAppWindowsForIos,
  setDisarmedKeysForIos,
  setQuietHoursForIos,
  shouldShowIntervention,
  shouldSilenceForTriggerJs,
  startBlocking as startIosBlocking,
} from '../src/services/iosFamilyControls';
import { APP_CATALOG, findCatalogEntryByTriggerKey } from '../src/constants/appCatalog';
import { simulateSituation, generateIntervention } from '../src/engine/InterventionEngine';
import { buildCandidatePool, launchOrShow } from '../src/services/interventionResolver';
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

      // Initialize analytics — always on during testing; the service
      // itself no-ops when the API key is missing.
      await analyticsService.initialize({ enableAnalytics: true });
      analyticsService.identify(currentUser.id);
      analyticsService.track(AnalyticsEvents.APP_OPENED, {
        platform: Platform.OS,
      });

      // Schedule high-risk time reminders if enabled. Pass quietHours so any
      // reminder that falls inside a quiet range is dropped from the schedule
      // (the userStore subscription below re-runs this on quiet-hour edits).
      if (currentUser.preferences.highRiskRemindersEnabled) {
        const enabledTimes = currentUser.preferences.highRiskTimes.filter(t => t.enabled);
        if (enabledTimes.length > 0) {
          await notificationService.scheduleAllHighRiskReminders(
            enabledTimes,
            currentUser.preferences.quietHours,
          );
        }
      }

      // Start app monitoring on Android if enabled
      if (Platform.OS === 'android' && currentUser.preferences.appMonitoringEnabled) {
        const enabledApps = currentUser.preferences.trackedApps.filter(a => a.enabled);
        if (enabledApps.length > 0) {
          await appUsageService.startMonitoring(enabledApps);
        }
      }

      // Push quiet-hour ranges to the native dispatch gate on every boot so
      // the AccessibilityService and FGS poller silently drop intercepts
      // during user-configured quiet windows. Runs unconditionally on Android
      // — the native side just consults an empty list when there's nothing
      // to suppress, and pushing now means the gate is ready the moment the
      // user later toggles monitoring on.
      if (Platform.OS === 'android') {
        await appUsageService.setQuietHours(
          deriveQuietHourRanges(currentUser.preferences.quietHours),
        );
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

      // iOS v19.2 backfill: if the user has a FamilyActivityPicker
      // selection but trackedApps is empty (because they ran an earlier
      // build that didn't populate it on iOS 16+), fetch the selection
      // names via the Swift bridge and synthesize a trackedApps list.
      // Without this, iOS 16+ users have an empty Triggers list in
      // QuickEditPanel and disarm is unreachable. Idempotent — only
      // backfills when trackedApps is empty. iOS-version gate is
      // implicit: hasProblemAppSelection() returns false on iOS 15,
      // and getSelectedApplicationNames() returns [] there too.
      if (
        Platform.OS === 'ios' &&
        hasProblemAppSelection() &&
        currentUser.preferences.trackedApps.length === 0
      ) {
        try {
          const selectedApps = await getSelectedApplicationNames();
          if (selectedApps.length > 0) {
            const trackedApps = buildTrackedAppsFromIosSelection(
              selectedApps,
              APP_CATALOG,
            );
            const { updatePreferences: storeUpdatePrefs } = useUserStore.getState();
            storeUpdatePrefs({ trackedApps });
            // Note: the userStore subscription below will fire on this
            // update and push the v19 state to App Group automatically.
            // We don't need to also call setDisarmedKeysForIos here.
          }
        } catch (err) {
          console.warn(
            '[iOSFamilyControls] v19.2 trackedApps backfill failed',
            err,
          );
        }
      }

      // iOS v19: push dynamic-state mirrors to App Group at boot so the
      // Pause Shortcut's silence gate sees the latest values on the very
      // first fire after install/restart — no race between user opening a
      // tracked app and our subscription writing the state. Cheap; same
      // shape we re-push on every preferences change in the userStore
      // subscription below.
      if (Platform.OS === 'ios') {
        try {
          // Re-read prefs in case the v19.2 backfill above just mutated
          // trackedApps — useUserStore.getState() returns the latest
          // snapshot synchronously, even though `currentUser` was
          // captured at useEffect entry.
          const latestPrefs =
            useUserStore.getState().user?.preferences ?? currentUser.preferences;
          setQuietHoursForIos(latestPrefs.quietHours);
          // Disarmed = trackedApps with enabled=false. Each app contributes
          // every key shape we might see from the Shortcut (bundleId, label,
          // catalogId, packageName) so the Swift normalizer matches whatever
          // Shortcut Input passes through.
          const disarmedTracked = latestPrefs.trackedApps.filter(
            (a) => !a.enabled,
          );
          const disarmedKeys: string[] = [];
          for (const a of disarmedTracked) {
            if (a.iosBundleId) disarmedKeys.push(a.iosBundleId);
            if (a.label) disarmedKeys.push(a.label);
            if (a.catalogId) disarmedKeys.push(a.catalogId);
            if (a.packageName) disarmedKeys.push(a.packageName);
          }
          setDisarmedKeysForIos(disarmedKeys);
          setAppWindowsForIos(deriveAppWindowsForIos(latestPrefs.trackedApps));
          // If the user is currently inside a quiet window, drop the Shield
          // for the rest of that window. The DeviceActivityMonitor's
          // suppressionExpired event will re-arm exactly when quiet hours
          // end — even if DopaMenu isn't running. Idempotent; no-op when
          // not in quiet hours or already paused longer.
          await ensureQuietHoursPause(latestPrefs.quietHours);
        } catch (err) {
          console.warn('[iOSFamilyControls] v19 state push failed', err);
        }
      }
    }

    setupServices();

    // Bind the merged candidate pool to the current user. The resolver pulls
    // custom interventions from its own store reference each call, so this
    // stays in sync as the user adds/edits.
    const buildPool = () => buildCandidatePool(currentUser);

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

      // v19: read the trigger app passed through Shortcut Input →
      // OpenDopaMenuPauseIntent → App Group. May be empty when the user
      // hasn't bound Shortcut Input as a parameter on the AppIntent step
      // (their Shortcut still works, just with no per-app context).
      let triggerInfo: { raw: string; key: string } | null = null;
      try { triggerInfo = consumeAutomationTriggerApp(); } catch {}
      const triggerRaw = triggerInfo?.raw ?? '';

      // v19 silence gate (JS-side mirror). The user's Pause Shortcut may not
      // yet include the Swift ShouldSilencePauseIntent gate (re-import lag).
      // We check the same conditions JS-side: quiet hours, paused, app
      // disarmed, outside per-app monitoring window. If any fire, we route
      // back to the trigger app silently instead of showing the menu.
      if (shouldSilenceForTriggerJs(triggerRaw)) {
        analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
          trigger: 'ios_automation_silenced',
          triggerApp: triggerRaw || 'unknown',
        });
        // Try to bounce back to the trigger app. If we can resolve a URL
        // scheme, openURL it so the user lands where they were going. If
        // we can't, drop them on the home tab — better than the menu
        // during quiet hours.
        const catalogEntry = triggerRaw
          ? findCatalogEntryByTriggerKey(triggerRaw)
          : undefined;
        const scheme = catalogEntry?.iosScheme;
        if (scheme) {
          void Linking.openURL(scheme).catch(() => {
            router.replace('/(tabs)');
          });
        } else {
          router.replace('/(tabs)');
        }
        return;
      }

      // Debounce: if a Shield-source intervention or another automation
      // handoff just fired in the last 5s, don't double-fire.
      if (!shouldShowIntervention()) return;
      markInterventionShown();
      analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
        trigger: 'ios_automation',
        triggerApp: triggerRaw || 'unknown',
      });
      // Mark setup as complete the first time the automation actually fires.
      // We never want to keep nagging the user about setup once it works.
      if (!currentUser.preferences.iosAutomationConfigured) {
        const { updatePreferences } = useUserStore.getState();
        updatePreferences({ iosAutomationConfigured: true });
      }

      // v19: try to resolve the triggering app from the catalog so the
      // intervention has app-specific context (alternatives can be biased
      // by category, the Continue path knows the right URL scheme, etc.).
      // Falls back to the v18 generic situation when the trigger is empty
      // or doesn't match the catalog.
      const triggerEntry = triggerRaw
        ? findCatalogEntryByTriggerKey(triggerRaw)
        : undefined;
      let triggerPackageName: string | undefined =
        triggerEntry?.androidPackage ?? triggerEntry?.iosBundleId ?? undefined;
      const triggerLabel = triggerEntry?.label;

      const situation = simulateSituation();
      const decision = generateIntervention(
        situation,
        currentUser,
        buildPool(),
        triggerPackageName ? { triggerPackageName } : undefined,
      );
      showIntervention(decision, situation, triggerPackageName, triggerLabel);
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
          // Keep the native quiet-hours gate AND the high-risk reminder
          // schedule in lockstep with the store so edits in the home page's
          // QuietHoursEditor take effect on the very next intercept attempt
          // and the next scheduled reminder — no app restart, no second tap.
          const quietChanged =
            state.user?.preferences.quietHours !==
            prev.user?.preferences.quietHours;
          const trackedAppsChanged =
            state.user?.preferences.trackedApps !==
            prev.user?.preferences.trackedApps;
          if (quietChanged) {
            if (Platform.OS === 'android') {
              void appUsageService.setQuietHours(
                deriveQuietHourRanges(state.user?.preferences.quietHours ?? []),
              );
            }
            // iOS v19: mirror quiet hours into App Group so the silence
            // gate (and JS-side guard) sees the new ranges immediately.
            // Also auto-pause the Shield if the user just edited a range
            // such that we're now inside one — Shield drops, monitor
            // re-arms when quiet hours end.
            if (Platform.OS === 'ios') {
              setQuietHoursForIos(state.user?.preferences.quietHours ?? []);
              void ensureQuietHoursPause(
                state.user?.preferences.quietHours ?? [],
              );
            }
            // Re-schedule reminders so any newly-quiet time is dropped and
            // any newly-unquiet time is restored. Only when the user has
            // reminders enabled — otherwise leave the cancelled state alone.
            if (state.user?.preferences.highRiskRemindersEnabled) {
              const enabledTimes = state.user.preferences.highRiskTimes.filter(
                (t) => t.enabled,
              );
              void notificationService.scheduleAllHighRiskReminders(
                enabledTimes,
                state.user.preferences.quietHours,
              );
            }
          }
          // iOS v19: re-mirror disarmed apps + per-app windows whenever
          // trackedApps changes. Toggling Instagram off in QuickEditPanel
          // flips a.enabled → we add Instagram's keys to disarmedKeys →
          // ShouldSilencePauseIntent halts the Shortcut on the next
          // Instagram tap. No Shortcuts.app trip required.
          if (trackedAppsChanged && Platform.OS === 'ios') {
            const apps = state.user?.preferences.trackedApps ?? [];
            const disarmed: string[] = [];
            for (const a of apps) {
              if (a.enabled) continue;
              if (a.iosBundleId) disarmed.push(a.iosBundleId);
              if (a.label) disarmed.push(a.label);
              if (a.catalogId) disarmed.push(a.catalogId);
              if (a.packageName) disarmed.push(a.packageName);
            }
            setDisarmedKeysForIos(disarmed);
            setAppWindowsForIos(deriveAppWindowsForIos(apps));
          }
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
          // iOS v19: re-evaluate the quiet-hours auto-pause every time we
          // foreground. Catches cases where the user came back into
          // DopaMenu DURING their quiet window (e.g. they checked the time
          // at 11pm while quiet hours start at 22:00) and the boot path
          // didn't catch it because they weren't yet in a quiet window
          // when DopaMenu last loaded. Use a fresh getState() read instead
          // of `currentUser` because the user may have edited quiet hours
          // while DopaMenu was backgrounded — the closure here captured
          // setupServices's snapshot.
          if (Platform.OS === 'ios') {
            const latestQuiet =
              useUserStore.getState().user?.preferences.quietHours ?? [];
            void ensureQuietHoursPause(latestQuiet);
          }
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
          buildPool(),
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
        const pool = buildPool();
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
        // Widget taps exit DopaMenu after launch so the user lands cleanly
        // on the trigger app instead of stranded on our home screen.
        void launchOrShow(intervention, {
          exitAfterLaunch: true,
          source: 'widget',
        });
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

            // v19 silence gate (also applies to iOS 15 path). The iOS 15
            // shortcut is a single Open-URL action with no AppIntent
            // gates available, so this JS check is the ONLY place the
            // silence rules can fire for those users. Quiet hours +
            // disarmed apps + paused state still work.
            const triggerAppFromUrl = params.get('app') || '';
            if (shouldSilenceForTriggerJs(triggerAppFromUrl)) {
              analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
                trigger: 'ios_automation_url_silenced',
                triggerApp: triggerAppFromUrl || 'unknown',
              });
              const catalogEntryDL = triggerAppFromUrl
                ? findCatalogEntryByTriggerKey(triggerAppFromUrl)
                : undefined;
              const schemeDL = catalogEntryDL?.iosScheme;
              if (schemeDL) {
                void Linking.openURL(schemeDL).catch(() => {
                  router.replace('/(tabs)');
                });
              } else {
                router.replace('/(tabs)');
              }
              return;
            }

            if (!shouldShowIntervention()) return;
            markInterventionShown();
            if (!currentUser.preferences.iosAutomationConfigured) {
              const { updatePreferences } = useUserStore.getState();
              updatePreferences({ iosAutomationConfigured: true });
            }
            analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
              trigger: 'ios_automation_url',
              triggerApp: triggerAppFromUrl || 'unknown',
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
          buildPool(),
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
          buildPool(),
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
