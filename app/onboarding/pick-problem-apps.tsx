import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppPicker, Button } from '../../src/components';
import IosFamilyControlsPicker from '../../src/components/onboarding/IosFamilyControlsPicker';
import { APP_CATALOG } from '../../src/constants/appCatalog';
import { useUserStore } from '../../src/stores/userStore';
import { useResponsive } from '../../src/utils/responsive';
import { colors } from '../../src/constants/theme';
import {
  hasProblemAppSelection,
  startBlocking,
} from '../../src/services/iosFamilyControls';

// Apple's FamilyActivityPicker + ManagedSettings.shield only exist on iOS 16+.
// On iOS 15.x we still let the user pick problem apps via our own AppPicker —
// the selection feeds the redirect engine and gets shown as preview chips in
// the tap-free walkthrough so the user knows which apps to multi-select in
// Shortcuts.app's Personal Automation trigger. Without this iOS-version split,
// iOS 15 users hit the Family Controls "needs iOS 16+" gate and can never
// configure anything.
const IOS_VERSION_NUM =
  Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 0;
const USE_NATIVE_IOS_PICKER = Platform.OS === 'ios' && IOS_VERSION_NUM >= 16;

export default function PickProblemApps() {
  const r = useResponsive();
  const user = useUserStore((s) => s.user);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const updateOnboardingProgress = useUserStore(
    (s) => s.updateOnboardingProgress,
  );

  useEffect(() => {
    updateOnboardingProgress({ currentStep: 'pick-problem-apps' });
  }, [updateOnboardingProgress]);

  const initial = useMemo(
    () =>
      (user?.preferences.trackedApps || [])
        .filter((a) => a.enabled)
        .map((a) => a.catalogId)
        .filter((id): id is string => !!id),
    [user]
  );
  const [selected, setSelected] = useState<string[]>(initial);
  const [iosSelectionCount, setIosSelectionCount] = useState(
    USE_NATIVE_IOS_PICKER && hasProblemAppSelection() ? 1 : 0,
  );
  // Review-step gate. iOS 16+ users have to explicitly confirm their picks
  // are the high-time apps before we let them advance — without this, Apple's
  // picker can be tap-tap-Done in 1.5 seconds without the user actually
  // looking at the screen-time numbers Apple is showing them. Pre-filled true
  // for returning users (a saved selection means they reviewed previously).
  const [iosReviewed, setIosReviewed] = useState(
    USE_NATIVE_IOS_PICKER && hasProblemAppSelection(),
  );

  // Continue is only "real" if the user actually picked something. iOS 16+
  // uses the native picker (selection lives in App Group), iOS 15 + Android
  // use our React Native picker (selection is the `selected` array). On iOS
  // 16+ we additionally require the review confirmation.
  const canContinue = USE_NATIVE_IOS_PICKER
    ? iosSelectionCount > 0 && iosReviewed
    : selected.length > 0;

  const persistAndAdvance = async () => {
    if (USE_NATIVE_IOS_PICKER) {
      // iOS 16+: tokens are opaque, we don't keep our own list. Apple's
      // picker already wrote the selection to App Group storage. Flip
      // blocking on now so the Shield is armed before they leave this
      // screen.
      if (hasProblemAppSelection()) {
        try {
          await startBlocking();
        } catch (err) {
          console.warn('[onboarding] startBlocking failed', err);
        }
      }
      router.push('/onboarding/pick-redirect-apps');
      return;
    }

    // iOS 15 OR Android: persist the React Native picker selection. On iOS
    // 15 this list also drives the tap-free walkthrough's "look for these
    // in Shortcuts.app" preview chips, since there's no Shield to arm.
    const trackedApps = selected
      .map((id) => APP_CATALOG.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        packageName: a.androidPackage || a.id,
        label: a.label,
        enabled: true,
        iosBundleId: a.iosBundleId,
        catalogId: a.id,
        category: a.category,
      }));
    updatePreferences({ trackedApps });
    router.push('/onboarding/pick-redirect-apps');
  };

  // Skip-without-setup confirmation. Shared between the (now secondary) Skip
  // text-link and the Continue-with-no-selection guard. Copy adapts to
  // platform/iOS version so users know what they're giving up.
  const skipMessageFor = () =>
    USE_NATIVE_IOS_PICKER
      ? "Without picking apps here, DopaMenu can't step in when you open Instagram, TikTok, or anything else. You can come back any time from Settings, but the rest of the app won't have much to do until you do."
      : Platform.OS === 'ios'
      ? "Without picking apps here, the tap-free shortcut won't know what to gentle. You can come back any time from Settings."
      : "DopaMenu won't have any apps to gently interrupt. You can come back any time from Settings.";

  const handleContinue = async () => {
    if (canContinue) {
      await persistAndAdvance();
      return;
    }
    // User tapped Continue without picking — confirm before letting them
    // proceed empty-handed. Default action keeps them on the screen so
    // they can pick (the right outcome); destructive button is the
    // explicit escape hatch. Mirrors the explicit Skip link behavior so
    // there's only one no-pick code path.
    Alert.alert(
      "You haven't picked any apps yet",
      skipMessageFor(),
      [
        { text: 'Pick some apps', style: 'cancel' },
        {
          text: 'Continue without picks',
          style: 'destructive',
          onPress: () => {
            void persistAndAdvance();
          },
        },
      ],
    );
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip this step?',
      skipMessageFor(),
      [
        { text: 'Go back', style: 'cancel' },
        {
          text: 'Skip anyway',
          style: 'destructive',
          onPress: () => {
            void persistAndAdvance();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, { paddingHorizontal: r.scale(20), paddingTop: r.vscale(16) }]}>
        <Text style={[styles.step, { fontSize: r.ms(11) }]}>STEP 1 OF 3</Text>
        {USE_NATIVE_IOS_PICKER ? (
          <IosFamilyControlsPicker
            onSelectionChange={setIosSelectionCount}
            onSelectionReviewed={setIosReviewed}
          />
        ) : (
          <AppPicker
            role="problem"
            selectedIds={selected}
            onChange={setSelected}
            preselectInstalledPopular
            title="Which apps pull you in?"
            subtitle={
              Platform.OS === 'ios'
                ? "Pick the ones you'd like a gentler relationship with. We've already checked off the four most people choose, if they're on your phone — adjust to taste. (On iOS 15 we'll wire these into a Shortcut at the end.)"
                : "Pick the ones you want a gentler relationship with. We've already checked off the four most people choose, if they're on your phone — adjust to taste."
            }
          />
        )}
      </View>
      <View style={[styles.footer, { padding: r.scale(20) }]}>
        {/* Primary CTA is ALWAYS Continue. Tapping it with no picks shows a
            confirmation alert that defaults to "Pick some apps" (cancel),
            making the success path the obvious one. The Skip text-link below
            is the secondary affordance for users who actually want to defer
            setup. v18.1 had Skip as the primary button when canContinue was
            false, which trained users to skip the entire setup. */}
        <Button
          title="Continue"
          onPress={handleContinue}
          size="large"
          fullWidth
        />
        <Pressable onPress={handleSkip} style={[styles.skipLinkWrap, { marginTop: r.scale(12) }]}>
          <Text style={[styles.skipLinkText, { fontSize: r.ms(13) }]}>
            Skip for now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  step: {
    color: '#7A6F85',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  footer: { borderTopWidth: 1, borderTopColor: '#EAE2F1' },
  skipLinkWrap: { alignItems: 'center' },
  // Muted color + small font intentionally — Skip is a secondary affordance,
  // not the default tap target.
  skipLinkText: {
    color: '#7A6F85',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
