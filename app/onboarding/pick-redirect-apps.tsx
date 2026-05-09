import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppPicker, Button } from '../../src/components';
import { APP_CATALOG } from '../../src/constants/appCatalog';
import { useUserStore } from '../../src/stores/userStore';
import { useResponsive } from '../../src/utils/responsive';
import { colors } from '../../src/constants/theme';

export default function PickRedirectApps() {
  const r = useResponsive();
  const user = useUserStore((s) => s.user);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const updateOnboardingProgress = useUserStore(
    (s) => s.updateOnboardingProgress,
  );

  useEffect(() => {
    updateOnboardingProgress({ currentStep: 'pick-redirect-apps' });
  }, [updateOnboardingProgress]);

  const initial = useMemo(
    () =>
      (user?.preferences.redirectApps || [])
        .filter((a) => a.enabled)
        .map((a) => a.catalogId),
    [user]
  );
  const [selected, setSelected] = useState<string[]>(initial);

  const persistAndAdvance = () => {
    const redirectApps = selected
      .map((id) => APP_CATALOG.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({
        catalogId: a.id,
        label: a.label,
        enabled: true,
        category: a.category,
        iosScheme: a.iosScheme,
        iosBundleId: a.iosBundleId,
        androidPackage: a.androidPackage,
        webUrl: a.webUrl,
      }));
    updatePreferences({ redirectApps });
    router.push('/onboarding/permissions');
  };

  const skipMessage =
    "Without redirect apps picked, DopaMenu can still intervene but won't have personalized 'instead try this' suggestions to offer. You can come back any time from Settings.";

  const handleContinue = () => {
    if (selected.length > 0) {
      persistAndAdvance();
      return;
    }
    Alert.alert(
      "You haven't picked any alternatives",
      skipMessage,
      [
        { text: 'Pick some', style: 'cancel' },
        {
          text: 'Continue without picks',
          style: 'destructive',
          onPress: persistAndAdvance,
        },
      ],
    );
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip this step?',
      skipMessage,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Skip anyway', style: 'destructive', onPress: persistAndAdvance },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, { paddingHorizontal: r.scale(20), paddingTop: r.vscale(16) }]}>
        <Text style={[styles.step, { fontSize: r.ms(11) }]}>STEP 2 OF 3</Text>
        <AppPicker
          role="redirect"
          selectedIds={selected}
          onChange={setSelected}
          title="What would you rather do?"
          subtitle="When you reach for one of those apps, DopaMenu will offer one of these instead. Pick a few you actually like — and tap Get on anything you want to install."
        />
      </View>
      <View style={[styles.footer, { padding: r.scale(20) }]}>
        {/* Primary CTA always Continue. Selection count shown in label so the
            user feels acknowledged for picking something. Skip is the
            secondary text-link below. */}
        <Button
          title={selected.length ? `Continue (${selected.length})` : 'Continue'}
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
  skipLinkText: {
    color: '#7A6F85',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
