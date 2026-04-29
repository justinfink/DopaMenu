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
import {
  hasProblemAppSelection,
  getAuthorizationStatus as getIosFamilyControlsStatus,
} from '../../src/services/iosFamilyControls';

// ─── Permissions screen ───────────────────────────────────────────────────────
//
// Linear, device-aware, and built around an empirical fact about Android 14/15
// on stock Pixel: the App Info ⋮ menu's "Allow restricted settings" entry is
// HIDDEN until the user has *attempted* a restricted toggle (Accessibility or
// Usage Access). We previously opened App Info first and asked the user to
// flip the unlock — they couldn't, because the entry wasn't there yet.
//
// The flow now does it in the order the OS expects:
//
//   • Android < 13: notifications → usage_access → accessibility
//
//   • Android 13+ with the install ungated (Accessibility OR Usage Access
//     already grantable on first probe): same as < 13.
//
//   • Android 13+ with the install gated (the common case for sideload AND
//     for Play Store internal-testing builds that haven't been reviewed):
//       notifications
//         → trigger_restricted   (open Accessibility, expected failure —
//                                 this is what summons the ⋮ entry)
//         → unlock_restricted    (open App Info, ⋮ is now there, grant)
//         → accessibility        (real attempt, now actually works)
//         → usage_access         (covered by the same unlock)
//
// Completion of trigger_restricted and unlock_restricted is detected by
// "user returned from settings after we sent them there", NOT by the
// AppOps probe OPSTR_ACCESS_RESTRICTED_SETTINGS — that probe is unreliable
// from a non-privileged app and was the reason the unlock step never
// auto-completed. If the user didn't actually do the action, the next
// step's toggle will fail and they can use the "Re-check" link or tap a
// pill to redo any step.

type StepId =
  | 'notifications'
  | 'trigger_restricted'
  | 'unlock_restricted'
  | 'usage_access'
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

function getTriggerMeta(): StepMeta {
  // The "wake up Android" step. Sending the user to Accessibility Settings
  // and asking them to TRY the toggle is what summons the "Allow restricted
  // settings" entry into the App Info ⋮ menu in the next step. We frame this
  // honestly — telling the user "this is supposed to fail" prevents the
  // confused bounce-back loop ("the toggle didn't work, what do I do?").
  return {
    icon: 'flash',
    title: 'Wake up Android',
    pillTitle: 'Wake up Android',
    activeBlurb:
      "Android hides the unlock switch until we *try* a restricted permission first. Tap below to open Accessibility Settings and try to flip DopaMenu's toggle. You'll see a \"Restricted setting\" message or the toggle won't budge — that's exactly what we want. Tap OK on the dialog, then come back. The unlock option will be there in the next step.",
    steps: [
      'Tap "Installed apps" (or "Downloaded apps")',
      'Tap "DopaMenu", then tap the toggle',
      'When you see "Restricted setting", tap OK and come back',
    ],
    cta: 'Open Accessibility (expect a block)',
    watchTarget: null,
  };
}

function getUnlockMeta(device: DeviceProfile | null): StepMeta {
  const isSamsungOneUI6Plus =
    !!device?.isSamsung && device.oneUIVersion >= 6;

  const why =
    'Now Android knows DopaMenu wants a restricted permission, the unlock option is available. Flip it once and Accessibility + Usage Access will both work.';

  if (isSamsungOneUI6Plus) {
    return {
      icon: 'lock-open',
      title: 'Allow restricted settings',
      pillTitle: 'Allow restricted settings',
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
    title: 'Allow restricted settings',
    pillTitle: 'Allow restricted settings',
    activeBlurb: `${why}\n\nIn the top-right of App Info you'll see ⋮ — tap it, then tap "Allow restricted settings" and confirm with your fingerprint or PIN.`,
    steps: [
      'Tap ⋮ in the top-right of App Info',
      'Tap "Allow restricted settings"',
      'Confirm with fingerprint / PIN, then come back',
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
      // Concrete and human: tell the user what notifications are actually
      // FOR — the gentle reminders + the "you opened Instagram" alert when
      // the in-app modal can't surface. Without notifications they still
      // get blocking + the redirect modal, but they lose the at-the-moment
      // nudge that makes DopaMenu feel like a friend, not a wall.
      activeBlurb:
        "DopaMenu sends you a gentle reminder when you reach for a distraction app, plus a quick check-in at moments you usually scroll. We really recommend turning these on — without them DopaMenu still works, but the magic of \"caught yourself\" mostly happens here. You can change your mind any time.",
      cta: 'Turn on notifications',
      watchTarget: null,
    },
    trigger_restricted: getTriggerMeta(),
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

  // Restricted-settings gate. On Android 13+ with an install Google hasn't
  // fully blessed (sideload OR Play internal-testing), Accessibility and
  // Usage Access toggles are gated until the user grants "Allow restricted
  // settings" via App Info → ⋮. The kicker: that ⋮ entry only appears
  // AFTER the user has *attempted* a restricted toggle. So we walk them
  // through trigger → unlock in that order. Completion is tracked by
  // "user returned from Settings after we sent them there", not by the
  // OPSTR_ACCESS_RESTRICTED_SETTINGS AppOps probe (third-party apps get a
  // default-allowed value from that op — useless as a gate signal).
  const [triggerVisited, setTriggerVisited] = useState(false);
  const [unlockVisited, setUnlockVisited] = useState(false);

  // Permission state
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [usageGranted, setUsageGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);
  // Set on the first refresh — if either real permission was already
  // grantable then, the install isn't gated and we skip both trigger +
  // unlock steps. We capture this once on mount so a mid-flow grant
  // doesn't suddenly delete steps from under the user.
  const [installLikelyGated, setInstallLikelyGated] = useState(true);
  const initialProbeDoneRef = useRef(false);

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
  // Order: trigger BEFORE unlock BEFORE the real permissions. The trigger
  // step's whole job is to make the OS surface the ⋮ → "Allow restricted
  // settings" entry that the unlock step depends on. Skip the trigger +
  // unlock pair entirely if the initial probe found the install ungated
  // (the user already has Accessibility or Usage Access grantable —
  // possible on real Play production installs).

  const sdkInt = device?.sdkInt ?? 0;

  const stepIds: StepId[] = React.useMemo(() => {
    const list: StepId[] = ['notifications'];
    if (Platform.OS === 'android') {
      if (sdkInt >= 33 && installLikelyGated) {
        // Gated path: summon the ⋮ entry, unlock, then the real
        // permissions. Accessibility comes immediately after unlock
        // because the trigger step has already familiarized the user
        // with the Accessibility list.
        list.push(
          'trigger_restricted',
          'unlock_restricted',
          'accessibility',
          'usage_access',
        );
      } else {
        // Ungated path (pre-13, or 13+ already-passed): original order.
        list.push('usage_access', 'accessibility');
      }
    }
    return list;
  }, [sdkInt, installLikelyGated]);

  // Trigger / unlock are "done" once the user has been sent to the
  // relevant Settings screen and returned. That's enough — if they
  // didn't actually do the action, the next step's toggle will fail and
  // they can tap a pill or the manual re-check link to redo. We also
  // mark them done if Accessibility or Usage Access ended up granted
  // (which means the gate was passed somehow).
  const gatePassed = accessibilityGranted || usageGranted;
  const grantedMap: Record<StepId, boolean> = {
    notifications: notificationsGranted,
    trigger_restricted: triggerVisited || gatePassed,
    unlock_restricted: unlockVisited || gatePassed,
    accessibility: accessibilityGranted,
    usage_access: usageGranted,
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

    // First probe only: ask the OS who installed us. com.android.vending
    // (Play Store, including Internal Testing) is NEVER subject to the
    // "Allow restricted settings" gate — the trigger + unlock onboarding
    // pair would just confuse Play users (no ⋮ entry will appear because
    // there's nothing to gate). For sideloads/ADB/file-manager installs
    // we keep the gate steps in. We also skip the gate if the user
    // already has either real permission (defensive fallback for cases
    // where the installer probe fails).
    if (!initialProbeDoneRef.current) {
      initialProbeDoneRef.current = true;
      let isRestrictedInstall = true;
      try {
        isRestrictedInstall = await appUsageService.checkIsRestrictedInstall();
      } catch {
        // Probe failed — fall back to the granted-permission heuristic.
      }
      if (!isRestrictedInstall || u || a) {
        setInstallLikelyGated(false);
      }
    }

    return { n, u, a };
  };

  // ─── Step launcher ─────────────────────────────────────────────────────

  const launchStep = async (
    id: StepId,
    triggeredBy: 'user' | 'auto' = 'user',
  ) => {
    // HARD GUARD: the accessibility step's prominent-disclosure card MUST
    // remain on screen until the user explicitly taps "I understand" — both
    // for Google Play policy and basic UX consent. Auto-callers (the post-
    // permission-grant chain in advanceAfterRecheck, the AppState listener)
    // pass triggeredBy='auto' and are refused here. The CTA, pill tap, and
    // start button pass 'user' and proceed normally. Belt-and-braces in
    // case any future call site forgets the check upstream.
    if (id === 'accessibility' && triggeredBy === 'auto') {
      console.warn('Refusing auto-launch of accessibility step');
      return;
    }

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
        case 'trigger_restricted':
          // Same intent as the real Accessibility step. The user is
          // expected to fail the toggle here — that's how the OS unlocks
          // the ⋮ → "Allow restricted settings" entry for the next step.
          await appUsageService.requestAccessibilityPermission();
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

      // If we sent the user to a return-detected step (trigger or unlock)
      // and they just came back, mark it visited. This is what makes those
      // steps complete — we don't trust the OPSTR_ACCESS_RESTRICTED_SETTINGS
      // probe because it returns default-allowed for non-privileged callers.
      let triggerNow = triggerVisited;
      let unlockNow = unlockVisited;
      if (lastLaunchedRef.current === 'trigger_restricted') {
        triggerNow = true;
        setTriggerVisited(true);
      }
      if (lastLaunchedRef.current === 'unlock_restricted') {
        unlockNow = true;
        setUnlockVisited(true);
      }

      const gatePassedNow = a || u;
      const latest: Record<StepId, boolean> = {
        notifications: n,
        trigger_restricted: triggerNow || gatePassedNow,
        unlock_restricted: unlockNow || gatePassedNow,
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

      // NEVER auto-launch the trigger step either. Its whole point is the
      // "this will fail on purpose" framing on the card — if we teleport
      // the user straight into Accessibility Settings without that context,
      // they'll think the app is broken when the toggle won't budge.
      if (next === 'trigger_restricted') {
        setBanner(
          `Nice ✓ Read the next card before tapping — this one's a bit weird on purpose.`,
        );
        return;
      }

      setBanner(`Nice ✓ Opening ${stepMeta[next].title}…`);
      setTimeout(() => {
        launchStep(next, 'auto').catch((e) => {
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
    bumpProgress();

    const gatePassedNow = a || u;
    const latest: Record<StepId, boolean> = {
      notifications: n,
      trigger_restricted: triggerVisited || gatePassedNow,
      unlock_restricted: unlockVisited || gatePassedNow,
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
        // refreshPermissions also captures installLikelyGated from the
        // first probe, so the step list is correct on first render.
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
    // Same idea for trigger_restricted: the "this will fail on purpose"
    // framing on the card has to land before we send the user into the
    // expected-failure dance. Don't auto-launch on Start.
    if (currentStep.id === 'trigger_restricted') {
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
    // Tapping a return-detected pill resets its visited flag — the user is
    // explicitly redoing the step. Without this, an already-DONE unlock pill
    // wouldn't actually advance the gate flow when re-tapped, leaving the
    // user stuck on a still-restricted Accessibility toggle.
    if (id === 'trigger_restricted') setTriggerVisited(false);
    if (id === 'unlock_restricted') setUnlockVisited(false);
    await launchStep(id).catch((e) =>
      console.warn('handlePillPress launch failed:', e),
    );
  };

  const handleManualCheck = async () => {
    setBanner('Checking…');
    await recheckOnly();
  };

  // "Skip — I'll decide later" for the notifications step. The user can
  // proceed without ever seeing the OS prompt; we still register them as
  // having declined for now so the home-screen banner can offer to
  // re-enable later. Granted state stays whatever the OS already says.
  const handleSkipNotifications = async () => {
    setBanner(null);
    await advanceAfterRecheck();
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

  // iOS-specific copy: only one permission step (notifications), and the
  // word "permissions" plural is misleading. Keep Android copy unchanged.
  const headerCopy =
    Platform.OS === 'ios'
      ? {
          stepLabel: total <= 1 ? 'LAST STEP' : `STEP ${completed + 1} OF ${total}`,
          title: allDone
            ? "You're all set."
            : !started
            ? 'One small thing left.'
            : currentStep
            ? 'Allow notifications'
            : '',
          subtitle: allDone
            ? "Notifications are on, and the Shield's armed for the apps you picked. DopaMenu will step in for you when you reach for them."
            : !started
            ? "DopaMenu sometimes uses a notification to gently get your attention — for example if Apple's Shield can't open the app for some reason. One tap and you're done."
            : currentStep
            ? "Tap the button below. iPhone will ask if DopaMenu can send notifications. Tap Allow."
            : '',
        }
      : {
          stepLabel: `PERMISSIONS · ${completed} OF ${total}`,
          title: allDone
            ? "You're all set."
            : !started
            ? 'One tap, then just flip the toggles.'
            : currentStep
            ? stepMeta[currentStep.id].title
            : '',
          subtitle: allDone
            ? 'Every permission is granted. DopaMenu is ready to step in.'
            : !started
            ? "We'll walk you through each permission. Between steps we'll bring you back here — you just follow the on-screen list."
            : currentStep
            ? stepMeta[currentStep.id].activeBlurb
            : '',
        };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: r.scale(20) }]}
      >
        <Text style={[styles.step, { fontSize: r.ms(11) }]}>
          {headerCopy.stepLabel}
        </Text>
        <Text style={[styles.title, { fontSize: r.ms(26) }]}>{headerCopy.title}</Text>
        <Text style={[styles.subtitle, { fontSize: r.ms(14) }]}>{headerCopy.subtitle}</Text>

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
            {currentStep.id === 'notifications' && (
              <Pressable
                onPress={handleSkipNotifications}
                style={[styles.checkLink, { paddingVertical: r.scale(8) }]}
              >
                <Text style={[styles.declineLinkText, { fontSize: r.ms(12) }]}>
                  Skip — I'll decide later
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
          <IosShieldStatusCard scale={r.scale} ms={r.ms} />
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

/**
 * iOS-only banner that tells the user, in plain English, whether DopaMenu's
 * Shield is actually wired up. We probe the two things that matter:
 *   1. Did Apple grant Family Controls authorization? (status === 'approved')
 *   2. Did the user save a problem-app selection in step 1?
 *
 * If either is missing, this card explains it and offers a single button to
 * jump back to step 1. If both are good, it reassures them that the Shield
 * is on and silently doing its job.
 */
function IosShieldStatusCard({ scale, ms }: { scale: (n: number) => number; ms: (n: number) => number }) {
  const [shieldReady, setShieldReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<'approved' | 'denied' | 'notDetermined' | 'unknown'>('unknown');
  const [hasSelection, setHasSelection] = useState(false);

  // Re-check every time we come back to this screen (user might have just
  // returned from setting things up).
  useEffect(() => {
    const check = () => {
      const status = getIosFamilyControlsStatus();
      const sel = hasProblemAppSelection();
      setAuthStatus(status);
      setHasSelection(sel);
      setShieldReady(status === 'approved' && sel);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  if (shieldReady) {
    return (
      <View
        style={[
          styles.iosNote,
          styles.iosNoteOk,
          { padding: scale(14), marginTop: scale(18) },
        ]}
      >
        <Ionicons name="shield-checkmark" size={scale(20)} color="#3B7A4B" />
        <Text style={[styles.iosNoteText, { fontSize: ms(12), color: '#2E5535' }]}>
          The Shield's armed. When you open one of the apps you picked,
          DopaMenu will gently step in. You can change which apps any time
          from Settings.
        </Text>
      </View>
    );
  }

  // Something's off — explain it human-style and route them back to fix.
  let body = '';
  if (authStatus !== 'approved' && !hasSelection) {
    body =
      "DopaMenu isn't doing anything yet — Screen Time access wasn't granted, and no apps have been picked. Tap below to go back to step 1.";
  } else if (authStatus !== 'approved') {
    body =
      "Screen Time access wasn't granted, so the Shield can't run. Tap below to go back to step 1 and allow it.";
  } else {
    body =
      "You haven't picked any apps yet, so the Shield has nothing to watch. Tap below to go back to step 1.";
  }

  return (
    <View
      style={[
        styles.iosNote,
        styles.iosNoteWarn,
        { padding: scale(14), marginTop: scale(18) },
      ]}
    >
      <Ionicons name="alert-circle" size={scale(20)} color="#A05A2A" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.iosNoteText, { fontSize: ms(12), color: '#5A3818', marginBottom: scale(8) }]}>
          {body}
        </Text>
        <Pressable
          onPress={() => router.replace('/onboarding/pick-problem-apps')}
          style={[styles.iosNoteAction, { paddingVertical: scale(8), paddingHorizontal: scale(12) }]}
        >
          <Text style={[styles.iosNoteActionText, { fontSize: ms(13) }]}>Go back to step 1</Text>
        </Pressable>
      </View>
    </View>
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
  iosNoteOk: {
    backgroundColor: '#E8F4EA',
    borderWidth: 1,
    borderColor: '#B7DFC0',
  },
  iosNoteWarn: {
    backgroundColor: '#FBF1E5',
    borderWidth: 1,
    borderColor: '#E8C9A0',
  },
  iosNoteAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8C9A0',
  },
  iosNoteActionText: { color: '#A05A2A', fontWeight: '700' },
  iosNoteText: { flex: 1, color: '#6D6378', lineHeight: 18 },
  footer: { borderTopWidth: 1, borderTopColor: '#EAE2F1' },
  footerHint: {
    color: '#7A6F85',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
