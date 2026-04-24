import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Image,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components';
import { colors, spacing, typography } from '../../src/constants/theme';
import { useResponsive } from '../../src/utils/responsive';

// ============================================
// Welcome Screen
// First screen in onboarding flow
// ============================================

export default function WelcomeScreen() {
  const r = useResponsive();
  const handleGetStarted = () => {
    router.push('/onboarding/pick-problem-apps');
  };

  const logoSize = r.isTiny ? 72 : r.isSmall ? 96 : 120;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingHorizontal: r.scale(20), paddingTop: r.vscale(32), paddingBottom: r.vscale(16) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.logoContainer, { marginBottom: r.vscale(24) }]}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </View>

        <Text style={[styles.title, { fontSize: r.ms(32), marginBottom: r.vscale(8) }]}>DopaMenu</Text>
        <Text style={[styles.subtitle, { fontSize: r.ms(16), marginBottom: r.vscale(28) }]}>
          Mindful choices at the right moments
        </Text>

        <View style={styles.features}>
          <FeatureItem
            icon="🎯"
            title="Contextual awareness"
            description="Understands when you might want a nudge"
          />
          <FeatureItem
            icon="✨"
            title="Your alternatives"
            description="Suggestions that match your energy and values"
          />
          <FeatureItem
            icon="🤝"
            title="No judgment"
            description="Conscious continuation is always an option"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Get Started"
          onPress={handleGetStarted}
          size="large"
          fullWidth
        />

        <Text style={styles.privacy}>
          Your data stays on your device.{'\n'}
          No tracking. No guilt.
        </Text>
      </View>
    </SafeAreaView>
  );
}

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  features: {
    gap: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureIcon: {
    fontSize: 28,
    width: 40,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * typography.lineHeights.normal,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  privacy: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: typography.sizes.xs * typography.lineHeights.relaxed,
  },
});
