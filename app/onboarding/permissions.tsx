import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Button } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import {
  appUsageService,
  DeviceProfile,
  OnboardingWatchTarget,
} from '../../src/services/appUsage';
import { useResponsive } from '../../src/utils/responsive';
import { colors } from '../../src/constants/theme';

// ─── Permissions screen ───────────────────────────────────────────────────────
//
// Linear, auto-advancing, device-aware. The whole screen is designed so the
// user never has to choose what to do next, and the copy always matches what
// they're about to see in Settings on *their specific device*.
//
// Flow:
//   non-restricted install (Play Store / Android < 13):
//     notifications → usage_access → accessibility
//   restricted install (sideloaded on Android 13+):
//     notifications → usage_access_try → unlock_restricted → usage_access_flip → accessibility
//
// Why "try" + "flip" are two steps: Android 13 hides the ⋮ "Allow restricted
// settings" option until you've ALREADY tried to enable a blocked toggle. So
// the try step explicitly triggers the block; we detect return, auto-advance
// to unlock with device-specific copy; then come back for the real flip.
//
// Progress model:
//   Each step has a "done" predicate that doesn't require the target
//   permission to be granted — the "try" step is done the moment the user has
//   been out and returned; unlock is done the moment the user has been out to
//   App Info and returned. Only the final step in each pair requires the
//   actual permission. This is what keeps us from getting stuck when Android
//   blocks the toggle.

type StepId =
  | 'notifications'
  | 'usage_access'
  | 'usage_access_try'
  | 'unlock_restricted'
  | 'usage_access_flip'
  | 'accessibility';

interface StepMeta {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  activeBlurb: string;
  steps?: string[];
  cta: string;
  watchTarget: OnboardingWatchTarget | null;
}

function getUnlockMeta(device: DeviceProfile | null): StepMeta {
  const isSamsungOneUI6Plus =
    !!device?.isSamsung && device.oneUIVersion >= 6;

  if (isSamsungOneUI6Plus) {
    return {
      icon: 'lock-open',
      title: 'Allow restricted settings',
      activeBlurb:
        "Your Samsung surfaces this as a row on the App Info page (no menu).",
      steps: [
        'Scroll down the App Info page',
        'Tap "Allow restricted settings"',
        'Confirm, then come back here',
      ],
      cta: 'Open App Info',
      watchTarget: 'restricted_unlock',
    };
  }

  return {
    icon: 'lock-open',
    title: 'Allow restricted settings',
    activeBlurb:
      "Tap the ⋮ menu at the top of App Info. If ⋮ isn't there yet, you need to trigger the block first — go back and try Usage Access again.",
    steps: [
      'Tap ⋮ in the top-right of App Info',
      'Tap "Allow restricted settings"',
      'Confirm, then come back here',
    ],
    cta: 'Open App Info',
    watchTarget: 'restricted_unlock',
  };
}

function buildStepMeta(device: DeviceProfile | null): Record<StepId, StepMeta> {
  return {
    notifications: {
      icon: 'notifications',
      title: 'Notifications',
      activeBlurb: 'So we can step in at the right moment.',
      cta: 'Allow notifications',
      watchTarget: null,
    },
    usage_access: {
      icon: 'stats-chart',
      title: 'Usage Access',
      activeBlurb:
        "Find DopaMenu in the list and flip it on. We'll pull you back.",
      steps: [
        'Find "DopaMenu" in the list',
        'Tap it, then flip the toggle on',
      ],
      cta: 'Open Usage Access',
      watchTarget: 'usage_access',
    },
    usage_access_try: {
      icon: 'stats-chart',
      title: 'Try Usage Access',
      activeBlurb:
        "Android will block this first attempt — that's expected. Just trigger the block, dismiss the dialog, come back. We'll take it from there.",
      steps: [
        'Tap "DopaMenu" in the list',
        'Try the toggle — a "Restricted setting" dialog will appear',
        'Tap OK or Close to dismiss',
        'Come back to DopaMenu',
      ],
      cta: 'Open Usage Access',
      watchTarget: null,
    },
    unlock_restricted: getUnlockMeta(device),
    usage_access_flip: {
      icon: 'checkmark-done',
      title: 'Flip Usage Access on',
      activeBlurb:
        'Now the toggle works. Find DopaMenu and turn Usage Access on.',
      steps: [
        'Tap "DopaMenu" in the list',
        'Flip the toggle on (it should work this time)',
        'Come back to DopaMenu',
      ],
      cta: 'Open Usage Access',
      watchTarget: 'usage_access',
    },
    accessibility: {
      icon: 'eye',
      // Prominent disclosure required by Google Play for non-tool uses of the
      // Accessibility API. Reviewers check that the user sees this language
      // BEFORE the system permission flow; that's why every detail (what we
      // see, why we need it, where it goes) is spelled out here. Don't soften
      // this copy without re-confirming the policy.
      title: 'Why DopaMenu needs Accessibility',
      activeBlurb:
        "DopaMenu uses Android's Accessibility Service to notice when you open an app you've chosen to intercept (like Instagram or TikTok) so it can bring the intervention screen up instantly.\n\nWhat we see: only which app is in the foreground — its package name (e.g. \"com.instagram.android\"). DopaMenu does NOT read screen content, capture text, monitor passwords, or access any other personal data through this API.\n\nWhere it goes: everything stays on your device. Nothing is sent to our servers or any third party.\n\nTap below to consent and open Settings, or decline to skip.",
      steps: [
        'Tap "Installed apps" (or "Downloaded apps")',
        'Tap "DopaMenu"',
        'Flip the toggle on, confirm',
      ],
      cta: 'I understand — Open Accessibility',
      watchTarget: 'accessibility',
    },
  };
}

export default function PermissionsScreen() {
  const r = useResponsive();
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);
  const updateOnboardingProgress = useUserStore(
    (s) => s.updateOnboardingProgress,
  );
  const persistedProgress = useUserStore(
    (s) => s.user?.preferences.onboardingProgress,
  );

  // Platform / device probes
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [isRestricted, setIsRestricted] = useState(false);
  const [platformLoaded, setPlatformLoaded] = useState(false);

  // Permission state
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [usageGranted, setUsageGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);

  // Visit-based progress. Refs are seeded from persisted state on mount so
  // progress survives process death (Android can kill the app while the user
  // is in Settings). Every flip goes through markUsageTried / markUnlockVisited
  // which also writes back to the persisted store.
  const usageTriedRef = useRef(!!persistedProgress?.usageAccessTried);
  const unlockVisitedRef = useRef(!!persistedProgress?.restrictedUnlockVisited);
  const [progressTick, setProgressTick] = useState(0); // trigger re-render
  const bumpProgress = () => setProgressTick((t) => t + 1);

  const markUsageTried = () => {
    if (usageTriedRef.current) return;
    usageTriedRef.current = true;
    updateOnboardingProgress({ usageAccessTried: true });
  };
  const markUnlockVisited = () => {
    if (unlockVisitedRef.current) return;
    unlockVisitedRef.current = true;
    updateOnboardingProgress({ restrictedUnlockVisited: true });
  };

  const [started, setStarted] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // The last step we launched — used to decide whether a re-foreground is
  // "new progress" (advance to a different step) vs "same step, no progress"
  // (user returned without doing anything, don't re-launch automatically).
  const lastLaunchedRef = useRef<StepId | null>(null);
  const activeWatchRef = useRef<OnboardingWatchTarget | null>(null);
  const advancingRef = useRef(false);

  const stepMeta = buildStepMeta(device);

  // ─── Step list ─────────────────────────────────────────────────────────

  const stepIds: StepId[] = React.useMemo(() => {
    const list: StepId[] = ['notifications'];
    if (Platform.OS === 'android') {
      if (isRestricted) {
        list.push('usage_access_try', 'unlock_restricted', 'usage_access_flip');
      } else {
        list.push('usage_access');
      }
      list.push('accessibility');
    }
    return list;
  }, [isRestricted]);

  const grantedMap: Record<StepId, boolean> = {
    notifications: notificationsGranted,
    usage_access: usageGranted,
    // "Try" is done as soon as the user has returned from Usage Access once,
    // regardless of whether the toggle was actually granted. That's what lets
    // us move the user on to the unlock step after Android blocks them.
    usage_access_try: usageGranted || usageTriedRef.current,
    // Unlock is done once the user has returned from the unlock step, OR
    // (functional probe) once Usage Access ends up granted later.
    unlock_restricted: usageGranted || unlockVisitedRef.current,
    usage_access_flip: usageGranted,
    accessibility: accessibilityGranted,
  };
  // Keep progressTick referenced so TS doesn't elide it and React re-renders
  // when the visit flags flip via refs.
  void progressTick;

  const steps = stepIds.map((id) => ({ id, granted: grantedMap[id] }));
  const currentStep = steps.find((s) => !s.granted) ?? null;
  const allDone = steps.length > 0 && currentStep === null;
  const completed = steps.filter((s) => s.granted).length;
  const total = steps.length;

  // ─── Permission refresh ─────────────────────────────────────────────────

  const refreshPermissions = async (): Promise<{
    n: boolean;
    u: boolean;
    a: boolean;
  }> => {
    const np = await Notifications.getPermissionsAsync();
    const n = np.status === 'granted';
    setNotificationsGranted(n);

    if (Platform.OS !== 'android') return { n, u: false, a: false };

    let u = false;
    let a = false;
    try {
      [u, a] = await Promise.all([
        appUsageService.checkPermission().then((p) => p.granted),
        appUsageService.checkAccessibilityPermission(),
      ]);
    } catch {
      // native module unavailable
    }
    setUsageGranted(u);
    setAccessibilityGranted(a);
    return { n, u, a };
  };

  // ─── Step launcher ─────────────────────────────────────────────────────

  const launchStep = async (id: StepId) => {
    setBanner(null);
    lastLaunchedRef.current = id;

    if (id === 'notifications') {
      const res = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(res.status === 'granted');
      // Advance on the next tick so state has committed.
      setTimeout(() => void advanceAfterRecheck(), 50);
      return;
    }

    const meta = stepMeta[id];
    if (meta.watchTarget) {
      await appUsageService.startOnboardingWatch(meta.watchTarget);
      activeWatchRef.current = meta.watchTarget;
    } else {
      // Defensive: clear any stale watcher if this step doesn't need one.
      await appUsageService.stopOnboardingWatch();
      activeWatchRef.current = null;
    }

    try {
      switch (id) {
        case 'usage_access':
        case 'usage_access_flip':
          await appUsageService.requestPermission();
          break;
        case 'usage_access_try':
          markUsageTried();
          bumpProgress();
          await appUsageService.requestPermission();
          break;
        case 'unlock_restricted':
          await appUsageService.openAppInfo();
          break;
        case 'accessibility':
          await appUsageService.requestAccessibilityPermission();
          break;
      }
    } catch {
      setBanner("Couldn't open Settings. Tap the button to retry.");
    }
  };

  // ─── Advance after re-foreground ───────────────────────────────────────
  //
  // Called on every AppState=active. Does TWO things:
  //   1. Updates progress from whatever the user did while we were in the
  //      background (marks "visit" flags if we were watching a step).
  //   2. If the first un-granted step has CHANGED since we last launched,
  //      auto-launches it. If it's the same step, we don't auto-relaunch —
  //      otherwise the user would keep getting teleported back to Settings
  //      every time they came back without making progress.

  const advanceAfterRecheck = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      // If we were watching a "visit-based" target, record the visit.
      const watched = activeWatchRef.current;
      if (watched === 'restricted_unlock') {
        markUnlockVisited();
      }
      // Treat any return from Usage Access as having "tried" it, even if the
      // user never tapped a toggle — they saw the screen, that's enough for
      // the flow to advance.
      if (lastLaunchedRef.current === 'usage_access_try') {
        markUsageTried();
      }

      const { n, u, a } = await refreshPermissions();
      const latest: Record<StepId, boolean> = {
        notifications: n,
        usage_access: u,
        usage_access_try: u || usageTriedRef.current,
        unlock_restricted: u || unlockVisitedRef.current,
        usage_access_flip: u,
        accessibility: a,
      };
      const next = stepIds.find((id) => !latest[id]) ?? null;

      // Free the watcher if either the target flipped or there's no step left.
      if (activeWatchRef.current) {
        await appUsageService.stopOnboardingWatch();
        activeWatchRef.current = null;
      }

      bumpProgress();

      if (!started) return;
      if (!next) {
        setBanner(null);
        return;
      }

      // Only auto-relaunch when the step is DIFFERENT from whatever we last
      // opened. Same-step returns are either "still working on it" (silent)
      // or manual rechecks (handled elsewhere with their own banner).
      if (lastLaunchedRef.current === next) {
        setBanner(null);
        return;
      }

      setBanner(`Nice ✓ Opening ${stepMeta[next].title}…`);
      setTimeout(() => {
        void launchStep(next);
      }, 450);
    } finally {
      advancingRef.current = false;
    }
  };

  // Manual re-check: same as advanceAfterRecheck but never auto-launches a
  // Settings screen. Just refreshes state and tells the user what it found.
  const recheckOnly = async () => {
    // If activeWatchRef.current is restricted_unlock, treat the re-check as
    // "I've returned from unlocking" so unlock_restricted flips to done.
    if (activeWatchRef.current === 'restricted_unlock') {
      markUnlockVisited();
      await appUsageService.stopOnboardingWatch();
      activeWatchRef.current = null;
    }
    if (lastLaunchedRef.current === 'usage_access_try') {
      markUsageTried();
    }

    const { n, u, a } = await refreshPermissions();
    bumpProgress();

    const latest: Record<StepId, boolean> = {
      notifications: n,
      usage_access: u,
      usage_access_try: u || usageTriedRef.current,
      unlock_restricted: u || unlockVisitedRef.current,
      usage_access_flip: u,
      accessibility: a,
    };
    const next = stepIds.find((id) => !latest[id]) ?? null;

    if (!next) {
      setBanner("Nice ✓ All set.");
    } else if (next === lastLaunchedRef.current) {
      setBanner(
        "Still waiting on this step. Follow the numbered steps in the card above, then tap Open again.",
      );
    } else {
      setBanner(`Nice ✓ Next: ${stepMeta[next].title}`);
    }
  };

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Stamp this as the active onboarding step immediately — so if the process
    // is killed while the user is in Settings, the next cold launch routes them
    // back here instead of the welcome screen.
    updateOnboardingProgress({ currentStep: 'permissions' });

    void (async () => {
      if (Platform.OS === 'android') {
        const [restricted, profile] = await Promise.all([
          appUsageService.checkIsRestrictedInstall().catch(() => false),
          appUsageService.getDeviceProfile().catch(() => null),
        ]);
        setIsRestricted(restricted);
        setDevice(profile);
      }
      await refreshPermissions();
      setPlatformLoaded(true);
    })();

    const sub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state !== 'active') return;
        setTimeout(() => void advanceAfterRecheck(), 350);
      },
    );

    return () => {
      sub.remove();
      void appUsageService.stopOnboardingWatch();
      activeWatchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleStart = async () => {
    setStarted(true);
    if (currentStep) {
      await launchStep(currentStep.id);
    }
  };

  const handleCta = async () => {
    if (currentStep) await launchStep(currentStep.id);
  };

  const handlePillPress = async (id: StepId) => {
    if (!started) setStarted(true);
    await launchStep(id);
  };

  const handleManualCheck = async () => {
    setBanner('Checking…');
    await recheckOnly();
  };

  // Explicit "decline" path for Accessibility. Google's prominent disclosure
  // policy expects the in-app screen to offer a clear opt-out before sending
  // the user to system settings. We don't actually advance past this step
  // without the permission — DopaMenu's intercept can't function — but the
  // user can come back and tap consent any time, or enable from Settings.
  const handleDeclineAccessibility = async () => {
    await appUsageService.stopOnboardingWatch();
    activeWatchRef.current = null;
    lastLaunchedRef.current = null;
    setBanner(
      "Got it — DopaMenu won't intercept apps until you turn this on. " +
      "You can enable it any time from Settings → Apps → DopaMenu → Accessibility, " +
      "or come back here and tap \"I understand\" above.",
    );
  };

  const handleDone = async () => {
    await appUsageService.stopOnboardingWatch();
    activeWatchRef.current = null;
    completeOnboarding();
    router.replace('/(tabs)');
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!platformLoaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: r.scale(20) }]}
      >
        <Text style={[styles.step, { fontSize: r.ms(11) }]}>
          PERMISSIONS · {completed} OF {total}
        </Text>
        <Text style={[styles.title, { fontSize: r.ms(26) }]}>
          {allDone
            ? "You're all set."
            : !started
            ? 'One tap, then just flip the toggles.'
            : currentStep
            ? stepMeta[currentStep.id].title
            : ''}
        </Text>
        <Text style={[styles.subtitle, { fontSize: r.ms(14) }]}>
          {allDone
            ? 'Every permission is granted. DopaMenu is ready to step in.'
            : !started
            ? "We'll walk you through each permission. Between steps we'll bring you back here — you just follow the on-screen list."
            : currentStep
            ? stepMeta[currentStep.id].activeBlurb
            : ''}
        </Text>

        {started && currentStep && (
          <View style={[styles.activeCard, { padding: r.scale(16) }]}>
            <View style={styles.activeHeader}>
              <Ionicons
                name={stepMeta[currentStep.id].icon}
                size={r.scale(26)}
                color="#9B7BB8"
              />
              <Text style={[styles.activeTitle, { fontSize: r.ms(17) }]}>
                {stepMeta[currentStep.id].title}
              </Text>
            </View>

            {stepMeta[currentStep.id].steps && (
              <View style={{ gap: r.scale(6), marginBottom: r.scale(12) }}>
                {stepMeta[currentStep.id].steps!.map((s, i) => (
                  <View key={i} style={styles.walkRow}>
                    <View
                      style={[
                        styles.walkNum,
                        { width: r.scale(22), height: r.scale(22) },
                      ]}
                    >
                      <Text
                        style={[styles.walkNumText, { fontSize: r.ms(11) }]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={[styles.walkText, { fontSize: r.ms(13) }]}>
                      {s}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {banner && (
              <View style={[styles.banner, { padding: r.scale(10) }]}>
                <Text style={[styles.bannerText, { fontSize: r.ms(13) }]}>
                  {banner}
                </Text>
              </View>
            )}

            <View style={{ height: r.scale(12) }} />
            <Button
              title={stepMeta[currentStep.id].cta}
              onPress={handleCta}
              size="large"
              fullWidth
            />
            <Pressable
              onPress={handleManualCheck}
              style={[styles.checkLink, { paddingVertical: r.scale(8) }]}
            >
              <Text style={[styles.checkLinkText, { fontSize: r.ms(12) }]}>
                Already did this? Tap to re-check
              </Text>
            </Pressable>
            {currentStep.id === 'accessibility' && (
              <Pressable
                onPress={handleDeclineAccessibility}
                style={[styles.checkLink, { paddingVertical: r.scale(8) }]}
              >
                <Text style={[styles.declineLinkText, { fontSize: r.ms(12) }]}>
                  Decline — DopaMenu won't be able to intercept apps
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Progress pills — pressable so the user can jump to or retry any
            step directly. Tapping a done pill re-launches that step; tapping
            a future pill jumps ahead. */}
        <View style={{ marginTop: r.scale(18), gap: r.scale(8) }}>
          {steps.map((s) => {
            const isCurrent = !s.granted && currentStep?.id === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => handlePillPress(s.id)}
                style={({ pressed }) => [
                  styles.pill,
                  { padding: r.scale(12) },
                  s.granted && styles.pillDone,
                  isCurrent && styles.pillCurrent,
                  pressed && styles.pillPressed,
                ]}
              >
                <Ionicons
                  name={
                    s.granted
                      ? 'checkmark-circle'
                      : stepMeta[s.id].icon
                  }
                  size={r.scale(20)}
                  color={
                    s.granted
                      ? '#3B7A4B'
                      : isCurrent
                      ? '#9B7BB8'
                      : '#B6ADC2'
                  }
                />
                <Text
                  style={[
                    styles.pillText,
                    { fontSize: r.ms(14) },
                    s.granted && styles.pillTextDone,
                    isCurrent && styles.pillTextCurrent,
                  ]}
                >
                  {stepMeta[s.id].title}
                </Text>
                {s.granted ? (
                  <Text style={[styles.pillBadge, { fontSize: r.ms(11) }]}>
                    DONE
                  </Text>
                ) : isCurrent ? (
                  <Text
                    style={[styles.pillBadgeCurrent, { fontSize: r.ms(11) }]}
                  >
                    NEXT
                  </Text>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={r.scale(16)}
                    color="#B6ADC2"
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {Platform.OS === 'ios' && (
          <View
            style={[
              styles.iosNote,
              { padding: r.scale(14), marginTop: r.scale(18) },
            ]}
          >
            <Ionicons
              name="information-circle"
              size={r.scale(18)}
              color="#7A6F85"
            />
            <Text style={[styles.iosNoteText, { fontSize: r.ms(12) }]}>
              iOS can't directly monitor other apps. After onboarding we'll
              install a one-tap Shortcut that triggers DopaMenu when you open
              a tracked app.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { padding: r.scale(20) }]}>
        {!started ? (
          <Button title="Start" onPress={handleStart} size="large" fullWidth />
        ) : allDone ? (
          <Button
            title="Finish Setup"
            onPress={handleDone}
            size="large"
            fullWidth
          />
        ) : (
          // In-progress: no escape-hatch button. Quitting here would disable
          // the whole point of the app. User can tap the active step's CTA
          // or any pill above to keep moving.
          <Text style={[styles.footerHint, { fontSize: r.ms(12) }]}>
            Tap the card above to continue. Every step is needed for DopaMenu
            to work.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1 },
  step: {
    color: '#7A6F85',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: { fontWeight: '700', color: '#2E2639', marginBottom: 10 },
  subtitle: { color: '#6D6378', lineHeight: 21, marginBottom: 4 },
  activeCard: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  activeTitle: { fontWeight: '700', color: '#2E2639' },
  walkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  walkNum: {
    borderRadius: 999,
    backgroundColor: '#F4EEFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  walkNumText: { color: '#5C4A72', fontWeight: '700' },
  walkText: { flex: 1, color: '#3D354A', lineHeight: 19 },
  banner: {
    marginTop: 6,
    backgroundColor: '#F4EEFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2D7EC',
  },
  bannerText: { color: '#5C4A72', fontWeight: '500' },
  checkLink: { alignItems: 'center', marginTop: 4 },
  checkLinkText: { color: '#9B7BB8', fontWeight: '600' },
  declineLinkText: { color: '#7A6F85', fontWeight: '500', textDecorationLine: 'underline' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAE2F1',
  },
  pillPressed: { opacity: 0.6 },
  pillCurrent: {
    borderColor: '#C9B4E2',
    backgroundColor: '#F7F1FC',
  },
  pillDone: {
    borderColor: '#B7DFC0',
    backgroundColor: '#F1FAF3',
  },
  pillText: { flex: 1, color: '#2E2639', fontWeight: '600' },
  pillTextCurrent: { color: '#5C4A72' },
  pillTextDone: { color: '#3B7A4B' },
  pillBadge: { color: '#3B7A4B', fontWeight: '800', letterSpacing: 0.8 },
  pillBadgeCurrent: { color: '#9B7BB8', fontWeight: '800', letterSpacing: 0.8 },
  iosNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#F2EEF7',
    borderRadius: 12,
  },
  iosNoteText: { flex: 1, color: '#6D6378', lineHeight: 18 },
  footer: { borderTopWidth: 1, borderTopColor: '#EAE2F1' },
  footerHint: {
    color: '#7A6F85',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
