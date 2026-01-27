import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { colors, spacing, typography } from '../../src/constants/theme';

// ============================================
// Onboarding Complete Screen
// Confirmation before entering main app
// ============================================

export default function CompleteScreen() {
  const { user, completeOnboarding } = useUserStore();

  const handleStart = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={colors.primary} />
        </View>

        <Text style={styles.title}>You're all set!</Text>
        <Text style={styles.subtitle}>
          DopaMenu will be here when you need a gentle nudge
        </Text>

        {user && user.identityAnchors.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Your identities</Text>
            <View style={styles.identityTags}>
              {user.identityAnchors.map((anchor) => (
                <View key={anchor.id} style={styles.tag}>
                  <Text style={styles.tagText}>{anchor.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          title="Start Using DopaMenu"
          onPress={handleStart}
          size="large"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  summary: {
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  identityTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.primaryFaded,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
  },
  tagText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.primary,
  },
  footer: {
    padding: spacing.lg,
  },
});
