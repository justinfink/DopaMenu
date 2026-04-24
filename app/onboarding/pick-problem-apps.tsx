import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform } from 'react-native';
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

  const handleNext = async () => {
    if (Platform.OS === 'ios') {
      // iOS: tokens are opaque, we don't maintain our own list. The selection
      // is already persisted to App Group by the picker. Flip on blocking now
      // so the Shield is armed by the time the user exits onboarding.
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

  const canContinue =
    Platform.OS === 'ios' ? iosSelectionCount > 0 : selected.length > 0;

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
            title="Which apps pull you in?"
            subtitle="Pick the ones you'd like a gentle redirect from. We'll keep this private to your device."
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
