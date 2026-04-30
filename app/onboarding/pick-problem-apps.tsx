import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, Alert } from 'react-native';
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
    Platform.OS === 'ios' && hasProblemAppSelection() ? 1 : 0,
  );

  // True if the user has actually picked something to track. We use this to
  // (a) decide what the bottom button says and (b) warn before letting them
  // skip the whole step.
  const canContinue =
    Platform.OS === 'ios' ? iosSelectionCount > 0 : selected.length > 0;

  const persistAndAdvance = async () => {
    if (Platform.OS === 'ios') {
      // iOS: tokens are opaque, we don't keep our own list. Apple's picker
      // already wrote the selection to App Group storage. Flip blocking on
      // now so the Shield is armed before they leave this screen.
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

  const handleNext = async () => {
    if (canContinue) {
      await persistAndAdvance();
      return;
    }
    // No selection — make sure the user knows what skipping means before we
    // let them through. On iOS especially, skipping leaves them with zero
    // app blocking; better to warn than ship a "feature" that isn't there.
    Alert.alert(
      'Skip this step?',
      Platform.OS === 'ios'
        ? "Without picking apps here, DopaMenu can't step in when you open Instagram, TikTok, or anything else. You can come back any time from Settings, but the rest of the app won't have much to do until you do."
        : "DopaMenu won't have any apps to gently interrupt. You can come back any time from Settings.",
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
        {Platform.OS === 'ios' ? (
          <IosFamilyControlsPicker onSelectionChange={setIosSelectionCount} />
        ) : (
          <AppPicker
            role="problem"
            selectedIds={selected}
            onChange={setSelected}
            preselectInstalledPopular
            title="Which apps pull you in?"
            subtitle="Pick the ones you want a gentler relationship with. We've already checked off the four most people choose, if they're on your phone — adjust to taste."
          />
        )}
      </View>
      <View style={[styles.footer, { padding: r.scale(20) }]}>
        <Button
          title={canContinue ? 'Continue' : 'Skip for now'}
          onPress={handleNext}
          size="large"
          fullWidth
        />
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
});
