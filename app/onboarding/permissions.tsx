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
// Linear, device-aware, and designed around what the user will actually see.
//
// Two possible flows, chosen up-front from real device state:
//
//   • Android < 13, or Android 13+ with restricted settings already unlocked:
//       notifications → usage_access → accessibility
//
//   • Android 13+ with restricted settings LOCKED (which is the case for
//     sideloaded installs AND for Play Store internal-testing apps that
//     Google hasn't reviewed yet — both flow through the same gate):
//       notifications → unlock_restricted → usage_access → accessibility
//
// We decide which list to use by calling checkRestrictedSettingsGranted()
// on mount. If restricted settings are locked, Usage Access and
// Accessibility toggles will both fail with "This service is
// malfunctioning" or a silent bounce, so we surface the unlock step FIRST
// — before the user hits either wall. No reactive "if the toggle
// malfunctions, tap here" helper; the flow just includes the unlock when
// it's needed.

type StepId =
  | 'notifications'
  | 'usage_access'
  | 'unlock_restricted'
  | 'accessibility';

interface StepMeta {
  icon: keyof typeof Ionicons.glyphMap;
  title: string; // shown as the card heading and, when no pillTitle is set, the pill text
  pillTitle?: string; // shorter label for the progress pill, so long prose titles don't pollute the pill list
  activeBlurb: string;
  steps?: string[];
  cta: string;
  watchTarget: OnboardingWatchTarget | null;
}

function getUnlockMeta(device: DeviceProfile | null): StepMeta {
  const isSamsungOneUI6Plus =
    !!device?.isSamsung && device.oneUIVersion >= 6;

  // Shared preamble so the user understands WHY this step exists before
  // they follow the device-specific instructions. Without this, "Allow
  // restricted settings" sounds scary and arbitrary.
  const why =
    "Android blocks DopaMenu's next two permissions (Usage Access and Accessibility) until you flip this one switch in App Info. Do this once and the rest of setup is smooth.";

  if (isSamsungOneUI6Plus) {
    return {
      icon: 'lock-open',
      title: 'Unlock permissions',
      pillTitle: 'Unlock permissions',
      activeBlurb: `${why}\n\nOn your Samsung this is a row directly on the App Info page (no menu needed).`,
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
    title: 'Unlock permissions',
    pillTitle: 'Unlock permissions',
    activeBlurb: `${why}\n\nOn the App Info page, tap ⋮ in the top-right, then "Allow restricted settings." If you don't see ⋮, your Android version needs you to tap the DopaMenu app name once first.`,
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
    unlock_restricted: getUnlockMeta(device),
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
    accessibility: {
      icon: 'eye',
      // Prominent disclosure required by Google Play for non-tool uses of the
      // Accessibility API. Reviewers check that the user sees this language
      // BEFORE the system permission flow; that's why every detail (what we
      // see, why we need it, where it goes) is spelled out here. Don't soften
      // this copy without re-confirming the policy.
      title: 'Why DopaMenu needs Accessibility',
      pillTitle: 'Accessibility',
      activeBlurb:
        "DopaMenu uses Android's Accessibility Service to notice when you open an app you've chosen to intercept (like Instagram or TikTok) so it can bring the intervention screen up instantly.\n\nWhat we see: only which app is in the foreground — its package name (e.g. \"com.instagram.android\"). DopaMenu does NOT read screen content, capture text, monitor passwords, or access any other personal data through this API.\n\nWhere it goes: everything stays on your device. Nothing is sent to our servers or any third party.\n\nTap below to consent and open Settings, or decline to skip. If the toggle later says \"This service is malfunctioning,\" it just means Android is blocking it until you unlock restricted settings — we'll walk you through that.",
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
  const [platformLoaded, setPlatformLoaded] = useState(false);

  // Restricted-settings gate. On Android 13+, unreviewed apps (sideload OR
  // Play Store internal testing) must have this unlocked before the OS will
  // let the user enable Usage Access or Accessibility. Detected up-front so
  // the unlock step can appear at the right spot in a single linear flow
  // — no reactive "try and recover" helpers.
  const [needsRestrictedUnlock, setNeedsRestrictedUnlock] = useState(false);

  // Permission state
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [usageGranted, setUsageGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);

  const [progressTick, setProgressTick] = useState(0); // trigger re-render
  const bumpProgress = () => setProgressTick((t) => t + 1);

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
  //
  // Order matters: unlock_restricted (when needed) comes BEFORE the
  // permissions it gates. That way Usage Access and Accessibility toggles
  // won't "malfunction" by the time the user tries to enable them.

  const stepIds: StepId[] = React.useMemo(() => {
    const list: StepId[] = ['notifications'];
    if (Platform.OS === 'android') {
      if (needsRestrictedUnlock) {
        list.push('unlock_restricted');
      }
      list.push('usage_access', 'accessibility');
    }
    return list;
  }, [needsRestrictedUnlock]);

  const grantedMap: Record<StepId, boolean> = {
    notifications: notificationsGranted,
    // Unlock step is "done" the moment restricted settings are actually
    // granted at the OS level — no visit flags, no ambiguity, no risk of
    // the flow thinking we're done when we're not.
    unlock_restricted: !needsRestrictedUnlock,
    usage_access: usageGranted,
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

    // Re-evaluate the restricted-settings gate every refresh. If the user
    // just unlocked it, the unlock step flips to "done" automatically and
    // the flow advances on its own — no extra tap, no stale flag.
    try {
      const restrictedGranted =
        await appUsageService.checkRestrictedSettingsGranted();
      setNeedsRestrictedUnlock(!restrictedGranted);
    } catch {
      // Probe unavailable (very old Android, pre-Tiramisu). Don't block.
    }

    return { n, u, a };
  };

  // ─── Step launcher ─────────────────────────────────────────────────────

  const launchStep = async (id: StepId) => {
    // Every path in here is wrapped. A throw from any of these async calls
    // used to bubble up as an unhandled promise rejection and crash the app
    // while the user was mid-flow — that was the "setting change = crash"
    // bug testers reported.
    try {
      setBanner(null);
      lastLaunchedRef.current = id;

      if (id === 'notifications') {
        try {
          const res = await Notifications.requestPermissionsAsync();
          setNotificationsGranted(res.status === 'granted');
        } catch (e) {
          console.warn('requestPermissionsAsync failed:', e);
          setBanner("Couldn't open notifications prompt. Tap to retry.");
          return;
        }
        // Advance on the next tick so state has committed.
        setTimeout(() => {
          advanceAfterRecheck().catch((e) =>
            console.warn('advanceAfterRecheck (post-notif) failed:', e),
          );
        }, 50);
        return;
      }

      const meta = stepMeta[id];
      try {
        if (meta.watchTarget) {
          await appUsageService.startOnboardingWatch(meta.watchTarget);
          activeWatchRef.current = meta.watchTarget;
        } else {
          // Defensive: clear any stale watcher if this step doesn't need one.
          await appUsageService.stopOnboardingWatch();
          activeWatchRef.current = null;
        }
      } catch (e) {
        console.warn('onboarding watcher setup failed:', e);
        // Not fatal — the permission request below can still succeed.
      }

      switch (id) {
        case 'usage_access':
          await appUsageService.requestPermission();
          break;
        case 'unlock_restricted':
          await appUsageService.openAppInfo();
          break;
        case 'accessibility':
          await appUsageService.requestAccessibilityPermission();
          break;
      }
    } catch (e) {
      console.warn('launchStep failed:', e);
      setBanner("Couldn't open Settings. Tap the button to retry.");
    }
  };

  // ─── Advance after re-foreground ───────────────────────────────────────
  //
  // Called on every AppState=active. Refreshes permission state from the OS
  // and, if the next un-granted step has CHANGED since we last launched,
  // auto-launches it. Same-step returns are silent — we don't teleport the
  // user back to Settings on every "I'm still trying" bounce.

  const advanceAfterRecheck = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const { n, u, a } = await refreshPermissions();
      // needsRestrictedUnlock state is already updated inside
      // refreshPermissions (from the native AppOps probe). Read it back
      // via a direct OS check so we don't race React's state batching.
      let restrictedGranted = true;
      try {
        restrictedGranted =
          await appUsageService.checkRestrictedSettingsGranted();
      } catch {
        // probe unavailable — assume granted so we don't gate the flow
      }
      const latest: Record<StepId, boolean> = {
        notifications: n,
        unlock_restricted: restrictedGranted,
        usage_access: u,
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

      // NEVER auto-launch the accessibility step. The prominent-disclosure
      // card MUST stay on screen long enough for the user to read it and
      // tap "I understand" themselves — that's the Google Play policy
      // requirement for non-tool Accessibility uses. If we auto-open
      // Settings here, the disclosure flashes for ~450ms and review fails.
      if (next === 'accessibility') {
        setBanner(
          `Nice ✓ Read the next screen, then tap "I understand" when you're ready.`,
        );
        return;
      }

      setBanner(`Nice ✓ Opening ${stepMeta[next].title}…`);
      setTimeout(() => {
        void launchStep(next).catch((e) => {
          console.warn('launchStep auto-launch failed:', e);
          setBanner("Couldn't open Settings. Tap the card to retry.");
        });
      }, 450);
    } catch (e) {
      // Do not let an unhandled rejection from refreshPermissions /
      // stopOnboardingWatch / launchStep propagate — React Native will
      // crash the whole app. This listener fires on every return from
      // system settings, so a single thrown promise here = the "app
      // crashes every time I change a setting" bug.
      console.warn('advanceAfterRecheck failed:', e);
    } finally {
      advancingRef.current = false;
    }
  };

  // Manual re-check: same as advanceAfterRecheck but never auto-launches a
  // Settings screen. Just refreshes state and tells the user what it found.
  const recheckOnly = async () => {
    if (activeWatchRef.current) {
      await appUsageService.stopOnboardingWatch().catch(() => {});
      activeWatchRef.current = null;
    }

    const { n, u, a } = await refreshPermissions();
    let restrictedGranted = true;
    try {
      restrictedGranted =
        await appUsageService.checkRestrictedSettingsGranted();
    } catch {
      /* probe unavailable */
    }
    bumpProgress();

    const latest: Record<StepId, boolean> = {
      notifications: n,
      unlock_restricted: restrictedGranted,
      usage_access: u,
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

    (async () => {
      try {
        if (Platform.OS === 'android') {
          const profile = await appUsageService
            .getDeviceProfile()
            .catch(() => null);
          setDevice(profile);
        }
        // refreshPermissions also sets needsRestrictedUnlock from the
        // AppOps probe, so the step list is correct on first render.
        await refreshPermissions();
      } catch (e) {
        console.warn('permissions init failed:', e);
      } finally {
        // Always mark the screen as loaded so the user isn't stuck on a
        // blank SafeAreaView if the native probes fail.
        setPlatformLoaded(true);
      }
    })().catch((e) => console.warn('permissions IIFE rejected:', e));

    const sub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state !== 'active') return;
        setTimeout(() => {
          advanceAfterRecheck().catch((e) => {
            console.warn('AppState advanceAfterRecheck rejected:', e);
          });
        }, 350);
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
    if (!currentStep) return;
    // If the only remaining step is accessibility, don't auto-launch Settings
    // — the user has to see the disclosure card first and tap the CTA
    // themselves. Google Play policy + user confusion reports.
    if (currentStep.id === 'accessibility') {
      setBanner(null);
      return;
    }
    await launchStep(currentStep.id).catch((e) =>
      console.warn('handleStart launch failed:', e),
    );
  };

  const handleCta = async () => {
    if (!currentStep) return;
    await launchStep(currentStep.id).catch((e) =>
      console.warn('handleCta launch failed:', e),
    );
  };

  const handlePillPress = async (id: StepId) => {
    if (!started) setStarted(true);
    // Pill taps for the accessibility step must NOT open Settings. The user
    // has to see the disclosure card (which is already on screen) and tap
    // the "I understand" CTA to consent. Tapping the pill elsewhere would
    // bypass the disclosure — that was the "pill took me to Accessibility
    // even though I was reading the card" complaint.
    if (id === 'accessibility') {
      setBanner(null);
      return;
    }
    await launchStep(id).catch((e) =>
      console.warn('handlePillPress launch failed:', e),
    );
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
                  {stepMeta[s.id].pillTitle ?? stepMeta[s.id].title}
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
                ) : null}
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
              On iOS, DopaMenu intercepts your chosen apps through Apple's
              Screen Time framework — you set that up in step 1. We'll also
              offer an optional one-tap Shortcut for a tap-free redirect.
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
