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
} from '../src/services/iosFamilyControls';
import { colors, spacing, borderRadius, typography, shadows } from '../src/constants/theme';

// How long to suppress re-intercepts on the trigger package after the user
// dismisses/continues/accepts. Enough to cover the trigger app coming back
// to foreground + a few activity transitions, without leaving the user
// permanently exempt if they open it again later.
const SUPPRESSION_WINDOW_MS = 30000;

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
      // Silently ignore — nothing to route to
    }
  }
  return false;
}

// When the intervention has no launch fields (e.g. "take 3 breaths") or the
// user taps "continue what I was doing", we want to put them back where they
// were — not leave them stuck on a DopaMenu screen with no back stack. On
// Android we exit the activity so the OS returns to the previously focused
// app (or the home screen). On iOS we have no way to programmatically leave
// an app, so we send the user to the tabs view.
async function exitDopaMenu(triggerPackage: string | null): Promise<void> {
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
    // Exits the current activity — Android returns to the previous task.
    BackHandler.exitApp();
    return;
  }
  // iOS: land somewhere valid so the user doesn't see a blank screen.
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)');
  }
}

export default function InterventionScreen() {
  const { activeIntervention, activeTriggerPackage, recordOutcome, clearActiveIntervention } =
    useInterventionStore();
  const { user } = useUserStore();

  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedAlternative, setSelectedAlternative] = useState<InterventionCandidate | null>(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
  }, []);

  // closeAndExit: animate out, clear store, then either (a) leave the user on
  // the launched intervention app, or (b) actively exit DopaMenu so Android
  // surfaces the previous app or home screen. Never leave the user stranded
  // on a back-stack-empty white screen, which was the custom-tracked-app bug.
  const closeAndExit = (launched: boolean) => {
    const triggerPackage = activeTriggerPackage;
    // Suppress the trigger package before we hand control back to it. The FGS
    // poller and AccessibilityService both see the foreground flip right after
    // we exit — without suppression, they'd immediately re-fire this same
    // intervention and trap the user in a loop. We suppress in every path
    // (continue, dismiss, accept) because even handleAccept can land the user
    // back in the trigger app when the chosen intervention has no launch
    // target of its own.
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
      // If an external app was launched via Linking, the OS already moved the
      // user away; no exit needed (calling exitApp would race & sometimes
      // kill the process before the other app foregrounds cleanly).
      if (launched) return;
      exitDopaMenu(triggerPackage);
    });
  };

  const handleAccept = async (intervention?: InterventionCandidate) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    recordOutcome('accepted');
    const chosen = intervention ?? displayIntervention;
    const launched = await launchIntervention(chosen);
    closeAndExit(launched);
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('dismissed');
    closeAndExit(false);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordOutcome('continued_default');
    // iOS: lift the Shield for the suppression window so the user's next tap
    // on the trigger app goes through. The DeviceActivityMonitor extension
    // re-arms the shield autonomously after cumulative usage crosses the
    // threshold — no host-app wake-up required.
    if (Platform.OS === 'ios') {
      const { tokenHash } = readShieldTrigger();
      suppressIosBlocking(tokenHash).catch((err) =>
        console.warn('[iOSFamilyControls] suppress failed', err),
      );
    }
    closeAndExit(false);
  };

  const handleSelectAlternative = (intervention: InterventionCandidate) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAlternative(intervention);
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

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
            >
              <Text style={styles.continueText}>Continue what I was doing</Text>
            </TouchableOpacity>

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
