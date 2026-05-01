import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Linking,
  Platform,
  BackHandler,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card, InterventionCard } from '../src/components';
import { useInterventionStore } from '../src/stores/interventionStore';
import { useUserStore } from '../src/stores/userStore';
import { InterventionCandidate } from '../src/models';
import { appUsageService } from '../src/services/appUsage';
import {
  suppressBlocking as suppressIosBlocking,
  readShieldTrigger,
  setAutomationBounce,
  normalizeTriggerKey,
} from '../src/services/iosFamilyControls';
import { APP_CATALOG, AppCatalogEntry, getPopularProblemApps } from '../src/constants/appCatalog';
import { installedAppsService } from '../src/services/installedApps';
import { colors, spacing, borderRadius, typography, shadows } from '../src/constants/theme';

// How long to suppress re-intercepts on the trigger package after the user
// dismisses/continues/accepts. Enough to cover the trigger app coming back
// to foreground + a few activity transitions, without leaving the user
// permanently exempt if they open it again later. Also matches the native
// cross-path debounce floor — see DopaMenuAppUsageModule.
const SUPPRESSION_WINDOW_MS = 5000;

// Throttle "I'll do this" double-taps. handleAccept calls Linking.openURL,
// and a rapid double-tap can queue two intent launches before the first
// modal animation finishes — visible to the user as a flicker into the
// alternative app twice. 1s is well above accidental double-tap and well
// below any deliberate retry.
const ACCEPT_RATE_LIMIT_MS = 1000;

// ============================================
// Intervention Modal
// The core intercept UI for suggesting alternatives
// ============================================

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================
// Platform-aware launch
// DopaMenu is fundamentally an app router — if an intervention points at a
// native app, we try to open that app first, and only fall back to a web URL
// if the app isn't installed.
//
// Android: uses intent:// URL with S.browser_fallback_url so the OS handles
// "app installed? → open app. not installed? → open fallback URL" without us
// needing to probe for the app.
//
// iOS: tries the URL scheme first via canOpenURL (requires LSApplicationQueriesSchemes
// in Info.plist for schemes to be detectable — universal HTTPS links always
// work), then falls back to launchTarget.
// ============================================

function buildAndroidIntentUrl(packageName: string, fallbackUrl?: string): string {
  const parts = [`package=${packageName}`, 'end'];
  // Most app launchers respond to a MAIN/LAUNCHER intent with just the package
  // set. Including S.browser_fallback_url lets the OS route to the web if the
  // app isn't installed.
  const base = 'intent://#Intent;';
  const fallback = fallbackUrl
    ? `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};`
    : '';
  return `${base}${parts[0]};${fallback}${parts[1]}`;
}

async function launchIntervention(intervention: InterventionCandidate): Promise<boolean> {
  const { launchAppPackage, launchIosScheme, launchTarget } = intervention;

  // Nothing to launch — off-phone activity
  if (!launchAppPackage && !launchIosScheme && !launchTarget) return false;

  if (Platform.OS === 'android' && launchAppPackage) {
    const intentUrl = buildAndroidIntentUrl(launchAppPackage, launchTarget);
    try {
      await Linking.openURL(intentUrl);
      return true;
    } catch {
      // Fall through to web fallback below
    }
  }

  if (Platform.OS === 'ios' && launchIosScheme) {
    try {
      const supported = await Linking.canOpenURL(launchIosScheme);
      if (supported) {
        await Linking.openURL(launchIosScheme);
        return true;
      }
    } catch {
      // Fall through to web fallback
    }
  }

  if (launchTarget) {
    try {
      await Linking.openURL(launchTarget);
      return true;
    } catch {
      // Fall through to store fallback
    }
  }

  // Last resort on Android: if the user picked a redirect app they don't have
  // installed yet, send them to the Play Store listing instead of failing
  // silently. Better to land them somewhere actionable than nowhere.
  if (Platform.OS === 'android' && launchAppPackage) {
    try {
      const playUrl = `https://play.google.com/store/apps/details?id=${launchAppPackage}`;
      await Linking.openURL(playUrl);
      return true;
    } catch {
      // Out of options.
    }
  }
  return false;
}

// When the intervention has no launch fields (e.g. "take 3 breaths") or the
// user taps "continue what I was doing", we want to put them back where they
// were — not leave them stuck on a DopaMenu screen with no back stack.
//
// Android: an intent:// URL re-opens the trigger app, then we exitApp() so
// the OS returns to whatever was on top.
//
// iOS: we can't programmatically "leave" an app, but if we know the trigger
// app's URL scheme (Instagram, TikTok, YouTube, Reddit, etc. all expose
// one), we can openURL(scheme://) which iOS treats as an app switch. That
// sends the user where they were going. If we don't know the scheme, we at
// least don't strand them — we land on the tabs view.
async function exitDopaMenu(triggerPackage: string | null, triggerLabel: string | null): Promise<void> {
  if (Platform.OS === 'android' && triggerPackage) {
    const intentUrl = buildAndroidIntentUrl(triggerPackage);
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      // fall through
    }
  }
  if (Platform.OS === 'android') {
    BackHandler.exitApp();
    return;
  }

  // iOS: try to deep-link back into the trigger app. Match by package name
  // (== androidPackage in the catalog), iosBundleId, or label as a last
  // resort — whatever we have on the trigger.
  if (Platform.OS === 'ios' && (triggerPackage || triggerLabel)) {
    const norm = (s?: string | null) =>
      (s ?? '').normalize('NFKD').replace(/\s+/g, '').toLowerCase();
    const t = norm(triggerLabel);
    const p = norm(triggerPackage);
    const entry = APP_CATALOG.find(
      (a) =>
        (a.androidPackage && norm(a.androidPackage) === p) ||
        (a.iosBundleId && norm(a.iosBundleId) === p) ||
        (a.id && norm(a.id) === p) ||
        (a.label && norm(a.label) === t),
    );
    if (entry?.iosScheme) {
      try {
        const supported = await Linking.canOpenURL(entry.iosScheme);
        if (supported) {
          await Linking.openURL(entry.iosScheme);
          return;
        }
      } catch {
        // fall through to tabs
      }
    }
  }

  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)');
  }
}

export default function InterventionScreen() {
  const { activeIntervention, activeTriggerPackage, activeTriggerLabel, recordOutcome, clearActiveIntervention } =
    useInterventionStore();
  const { user } = useUserStore();

  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedAlternative, setSelectedAlternative] = useState<InterventionCandidate | null>(null);
  // Catalog entries to show as Continue chips when we don't know which trigger
  // app fired (Path B / iOS tap-free automation — Apple doesn't pass the app
  // through to the AppIntent). Computed once on mount: on iOS 16+ we probe
  // the popular problem apps for installed status (since user.trackedApps is
  // empty when Apple's native picker is used); on iOS 15 / Android we fall
  // back to the user's own trackedApps list.
  const [continueOptions, setContinueOptions] = useState<AppCatalogEntry[]>([]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Last accept-time guard for rate-limiting double-taps. Lives across re-
  // renders but resets on unmount, which is what we want — a fresh modal
  // mount means a legitimately new intervention.
  const lastAcceptAtRef = useRef(0);

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 90,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Haptic feedback on open
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Tell the native FGS poller the modal is up. Belt-and-suspenders with
    // the same call in app/_layout.tsx — _layout sets it BEFORE navigation
    // (which catches the FGS poll race), this catches the case where the
    // modal got mounted via some other path (e.g. notification-tap fallback
    // when startActivity was BAL-blocked). cancel() of any stale notification
    // happens inside setModalActive(true) in the native module.
    if (Platform.OS === 'android') {
      void appUsageService.setModalActive(true);
    }
    return () => {
      if (Platform.OS === 'android') {
        void appUsageService.setModalActive(false);
      }
    };
  }, []);

  // Populate the Continue-chip row when we don't know the trigger app. On
  // iOS 16+ we have no trackedApps list (Apple's tokens are opaque), so we
  // probe popular catalog entries for installed status. On iOS 15 / Android
  // we use the user's own trackedApps list — they explicitly picked these
  // in onboarding, so they're the most likely set of apps the user was
  // reaching for.
  useEffect(() => {
    if (activeTriggerPackage || activeTriggerLabel) return; // Path A — no chip row needed
    let cancelled = false;
    (async () => {
      const fromTracked = (user?.preferences.trackedApps ?? [])
        .filter((a) => a.enabled && a.catalogId)
        .map((a) => APP_CATALOG.find((c) => c.id === a.catalogId))
        .filter((e): e is AppCatalogEntry => !!e);
      if (fromTracked.length > 0) {
        if (!cancelled) setContinueOptions(fromTracked.slice(0, 8));
        return;
      }
      // iOS 16+ (Apple-picker path) or any platform with no tracked list yet.
      // Probe popular problem apps for installed-state and surface the
      // installed ones first.
      const popular = getPopularProblemApps();
      const installed = await installedAppsService.probe(popular);
      if (cancelled) return;
      const ranked = popular
        .filter((a) => installed[a.id])
        .concat(popular.filter((a) => !installed[a.id]));
      setContinueOptions(ranked.slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTriggerPackage, activeTriggerLabel, user]);

  // closeAndExit: animate out, clear store, then route the user somewhere
  // sensible based on what they just did:
  //   • launched=true                   → an external app already foregrounded;
  //                                       OS already moved them; we just clean up.
  //   • returnToTriggerApp=true         → user explicitly chose to keep going
  //                                       to the trigger app (Continue button).
  //                                       On iOS we openURL(scheme) after
  //                                       suppression. On Android we open the
  //                                       package via intent.
  //   • else (Dismiss / Accept-no-launch) → user aborted or chose an off-phone
  //                                       activity. Don't auto-launch ANYTHING.
  //                                       Just close the modal and leave them
  //                                       on tabs (iOS) or exit so OS surfaces
  //                                       the previous task (Android). We
  //                                       deliberately do NOT openURL the
  //                                       trigger app here — doing so would
  //                                       contradict the user's choice and on
  //                                       iOS would also re-trigger the Shield
  //                                       in a loop because no suppression
  //                                       was applied.
  const closeAndExit = (
    launched: boolean,
    options: { returnToTriggerApp?: boolean } = {},
  ) => {
    const { returnToTriggerApp = false } = options;
    const triggerPackage = activeTriggerPackage;
    const trackedHit = user?.preferences.trackedApps.find(
      (a) => a.packageName === triggerPackage,
    );
    const triggerLabel = activeTriggerLabel ?? trackedHit?.label ?? null;

    if (Platform.OS === 'android' && triggerPackage) {
      appUsageService.suppressIntercept(triggerPackage, SUPPRESSION_WINDOW_MS);
    }
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      clearActiveIntervention();
      if (launched) return;
      if (returnToTriggerApp) {
        exitDopaMenu(triggerPackage, triggerLabel);
        return;
      }
      // Dismiss / off-phone accept — leave the user on a sane screen.
      // Android: pop our activity so the OS shows the previous task.
      // iOS: we can't programmatically leave the app, so route to tabs.
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    });
  };

  const handleAccept = async (intervention?: InterventionCandidate) => {
    // Rate-limit double-taps so we don't queue two intent launches for the
    // same accept. Without this, a quick double-tap on "I'll do this" can
    // briefly flicker into the alternative app twice while the first launch
    // is still resolving.
    const now = Date.now();
    if (now - lastAcceptAtRef.current < ACCEPT_RATE_LIMIT_MS) return;
    lastAcceptAtRef.current = now;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    recordOutcome('accepted');
    const chosen = intervention ?? displayIntervention;
    const launched = await launchIntervention(chosen);
    // Accept never returns to the trigger app — the user chose an alternative.
    closeAndExit(launched);
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('dismissed');
    // Dismiss = "I aborted, leave me alone." Don't auto-open the trigger app —
    // on iOS that would just re-trigger the Shield since no suppression ran.
    closeAndExit(false);
  };

  const handleContinue = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('continued_default');
    // iOS: lift the Shield for the suppression window so the user's next tap
    // on the trigger app goes through. The DeviceActivityMonitor extension
    // re-arms the shield autonomously after cumulative usage crosses the
    // threshold — no host-app wake-up required. If something goes wrong, we
    // tell the user instead of silently keeping them blocked.
    if (Platform.OS === 'ios') {
      const { tokenHash } = readShieldTrigger();
      try {
        await suppressIosBlocking(tokenHash);
      } catch (err: any) {
        Alert.alert(
          "Couldn't unlock that app",
          "DopaMenu tried to step out of the way for 30 seconds, but iPhone said no. " +
            "Try again, or open Settings → Screen Time → DopaMenu and toggle it off and back on. " +
            (err?.message ? `\n\nDetails: ${err.message}` : ''),
        );
        return;
      }
      // Arm bounce-back so the imminent automation re-fire (caused by our
      // openURL of the trigger app) is silenced by IsBouncingIntent. Look
      // up the trigger's catalog entry since trackedApps is empty on iOS
      // 16+ (Apple's FamilyActivityPicker tokens are opaque). The trigger
      // key is the bundle id when known — that's what the user's hosted
      // Pause Shortcut passes via Shortcut Input. Falls back to the catalog
      // id (e.g. "instagram") if no bundle id is available.
      const t = normalizeTriggerKey(activeTriggerLabel);
      const p = normalizeTriggerKey(activeTriggerPackage);
      const entry = APP_CATALOG.find(
        (a) =>
          (a.androidPackage && normalizeTriggerKey(a.androidPackage) === p) ||
          (a.iosBundleId && normalizeTriggerKey(a.iosBundleId) === p) ||
          (a.id && normalizeTriggerKey(a.id) === p) ||
          (a.label && normalizeTriggerKey(a.label) === t),
      );
      if (entry?.iosScheme) {
        const triggerKey = normalizeTriggerKey(
          entry.iosBundleId ?? entry.id ?? entry.label,
        );
        setAutomationBounce(entry.iosScheme, triggerKey);
      }
    }
    // Continue is the one path that explicitly hands the user back to the app
    // they were trying to open in the first place.
    closeAndExit(false, { returnToTriggerApp: true });
  };

  const handleSelectAlternative = (intervention: InterventionCandidate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAlternative(intervention);
  };

  // Used when the modal can't auto-route Continue to the originating app
  // because the trigger context wasn't passed through (Path B / iOS tap-free).
  // The user picks the app they meant from the chip row; we suppress the
  // Shield (so the launch doesn't re-fire any safety net) and deep-link there.
  const handleContinueToApp = async (entry: AppCatalogEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('continued_default');
    if (Platform.OS === 'ios') {
      try {
        // No tokenHash because the Shield never fired in the tap-free path —
        // suppressBlocking just lifts any active managed-settings shield for
        // the standard window so we don't bounce.
        await suppressIosBlocking(undefined);
      } catch (err: any) {
        Alert.alert(
          "Couldn't unlock that app",
          "DopaMenu tried to step out of the way for 30 seconds, but iPhone said no. " +
            (err?.message ? `\n\nDetails: ${err.message}` : ''),
        );
        return;
      }
      // Arm bounce-back so the imminent automation re-fire (caused by us
      // opening the chosen app right below) is silenced by IsBouncingIntent.
      // The trigger key is the chosen app's bundle id (preferred) so iOS
      // 16+'s wrapper Shortcut can do per-app comparison; falls back to
      // catalog id when no bundle id is on the entry.
      const triggerKey = normalizeTriggerKey(
        entry.iosBundleId ?? entry.id ?? entry.label,
      );
      if (entry.iosScheme) {
        setAutomationBounce(entry.iosScheme, triggerKey);
      } else if (entry.webUrl) {
        setAutomationBounce(entry.webUrl, triggerKey);
      }
    }
    let opened = false;
    if (Platform.OS === 'ios' && entry.iosScheme) {
      try {
        const supported = await Linking.canOpenURL(entry.iosScheme);
        if (supported) {
          await Linking.openURL(entry.iosScheme);
          opened = true;
        }
      } catch {
        // fall through
      }
    } else if (Platform.OS === 'android' && entry.androidPackage) {
      try {
        const intentUrl = buildAndroidIntentUrl(entry.androidPackage);
        await Linking.openURL(intentUrl);
        opened = true;
      } catch {
        // fall through
      }
    }
    // Last-resort web fallback so the user lands somewhere they can use.
    if (!opened && entry.webUrl) {
      try {
        await Linking.openURL(entry.webUrl);
        opened = true;
      } catch {
        // give up
      }
    }
    closeAndExit(opened);
  };

  if (!activeIntervention) {
    return null;
  }

  const displayIntervention = selectedAlternative || activeIntervention.primary;
  const tone = user?.preferences.tone || 'gentle';

  // Adjust messaging based on tone
  const getMessage = () => {
    switch (tone) {
      case 'gentle':
        return activeIntervention.explanation;
      case 'direct':
        return 'Noticed a pattern. Here\'s an option.';
      case 'minimal':
        return '';
      default:
        return activeIntervention.explanation;
    }
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleDismiss}
      />

      <Animated.View
        style={[
          styles.modalContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Explanation */}
            {getMessage() && (
              <Text style={styles.explanation}>{getMessage()}</Text>
            )}

            {/* Main title */}
            <Text style={styles.title}>
              {showAlternatives ? 'Other options' : 'Instead, you could...'}
            </Text>

            {/* Primary suggestion or alternatives */}
            {!showAlternatives ? (
              <>
                <TouchableOpacity
                  style={styles.primaryCard}
                  onPress={() => handleAccept()}
                  activeOpacity={0.8}
                >
                  <InterventionCard
                    intervention={displayIntervention}
                    isPrimary
                  />
                </TouchableOpacity>

                {/* See other options */}
                {activeIntervention.alternatives.length > 0 && (
                  <TouchableOpacity
                    style={styles.alternativesLink}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAlternatives(true);
                    }}
                  >
                    <Text style={styles.alternativesLinkText}>
                      See {activeIntervention.alternatives.length} other options
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {/* Back to primary */}
                <TouchableOpacity
                  style={styles.backLink}
                  onPress={() => {
                    setShowAlternatives(false);
                    setSelectedAlternative(null);
                  }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.backLinkText}>Back to suggestion</Text>
                </TouchableOpacity>

                {/* Alternative list */}
                <View style={styles.alternativesList}>
                  {activeIntervention.alternatives.map((alt) => (
                    <TouchableOpacity
                      key={alt.id}
                      onPress={() => handleSelectAlternative(alt)}
                      activeOpacity={0.7}
                    >
                      <InterventionCard
                        intervention={alt}
                        isPrimary={selectedAlternative?.id === alt.id}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedAlternative && (
                  <Button
                    title={`Do: ${selectedAlternative.label}`}
                    onPress={() => handleAccept(selectedAlternative)}
                    fullWidth
                    style={styles.selectButton}
                  />
                )}
              </>
            )}
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            {!showAlternatives && (
              <Button
                title="I'll do this"
                onPress={() => handleAccept()}
                size="large"
                fullWidth
              />
            )}

            {/* Continue affordance — branches based on whether we know the
                originating app. Path A (Shield-fired or Android FGS-fired)
                always passes a trigger label/package, so we render the
                standard single-tap "Continue what I was doing" link that
                routes them right back. Path B (iOS tap-free Personal
                Automation) doesn't pipe the trigger app through Apple's
                AppIntent perform context, so we render a quick chip row of
                their tracked apps + popular suggestions; one tap on the app
                they meant suppresses the Shield and deep-links them there.
                Either way it's one tap from this screen back into the app —
                no setup-time per-automation wiring required. */}
            {(activeTriggerLabel || activeTriggerPackage) ? (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
              >
                <Text style={styles.continueText}>Continue what I was doing</Text>
              </TouchableOpacity>
            ) : continueOptions.length > 0 ? (
              <View style={styles.continuePickerWrap}>
                <Text style={styles.continuePickerLabel}>
                  Continue to which one?
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.continuePickerRow}
                >
                  {continueOptions.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      onPress={() => handleContinueToApp(entry)}
                      style={styles.continueChip}
                      accessibilityLabel={`Continue to ${entry.label}`}
                    >
                      <Text style={styles.continueChipText} numberOfLines={1}>
                        {entry.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleDismiss}
              >
                <Text style={styles.continueText}>Close</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.reassurance}>
              No judgment. Your choice.
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.9,
    ...shadows.lg,
  },
  safeArea: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  explanation: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: typography.sizes.md * typography.lineHeights.normal,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryCard: {
    marginBottom: spacing.md,
  },
  alternativesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  alternativesLinkText: {
    fontSize: typography.sizes.md,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  backLinkText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  alternativesList: {
    gap: spacing.sm,
  },
  selectButton: {
    marginTop: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  continueButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  continuePickerWrap: {
    paddingVertical: spacing.sm,
  },
  continuePickerLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: typography.weights.medium,
  },
  continuePickerRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  continueChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#F4EEFB',
    borderWidth: 1,
    borderColor: '#E2D7EC',
    minWidth: 84,
    alignItems: 'center',
  },
  continueChipText: {
    color: '#5C4A72',
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
  },
  continueText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  reassurance: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
