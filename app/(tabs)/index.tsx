import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, ProgressRing, UrgeButton } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { useInterventionStore } from '../../src/stores/interventionStore';
import { usePortfolioStore } from '../../src/stores/portfolioStore';
import { simulateSituation, generateIntervention } from '../../src/engine/InterventionEngine';
import { getGreeting, getTimeBucket } from '../../src/utils/helpers';
import { analyticsService, AnalyticsEvents } from '../../src/services';
import { colors, spacing, borderRadius, typography, shadows } from '../../src/constants/theme';

// ============================================
// Dashboard / Home Screen
// Main hub for the app
// ============================================

export default function DashboardScreen() {
  const { user } = useUserStore();
  const { showIntervention, totalInterventions, acceptedCount } = useInterventionStore();
  const { getTodayPortfolio } = usePortfolioStore();
  const [refreshing, setRefreshing] = useState(false);

  const portfolio = getTodayPortfolio();
  const completedCategories = portfolio.categories.filter((c) => c.completed).length;
  const totalCategories = portfolio.categories.length;
  const portfolioProgress = totalCategories > 0 ? completedCategories / totalCategories : 0;

  const acceptanceRate = totalInterventions > 0 ? acceptedCount / totalInterventions : 0;

  const timeBucket = getTimeBucket();
  const greeting = getGreeting();

  // Track screen view
  useEffect(() => {
    analyticsService.screen('Dashboard');
    analyticsService.track(AnalyticsEvents.APP_OPENED, {
      timeBucket,
      hasCompletedOnboarding: user?.onboardingCompleted ?? false,
    });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleUrgePress = () => {
    if (!user) return;

    // Track the urge event
    analyticsService.track(AnalyticsEvents.INTERVENTION_SHOWN, {
      trigger: 'urge_button',
      timeBucket,
    });

    const situation = simulateSituation();
    const decision = generateIntervention(situation, user);

    showIntervention(decision, situation);
    router.push('/intervention');
  };

  const handleTriggerDemo = () => {
    if (!user) return;

    analyticsService.track(AnalyticsEvents.DEMO_TRIGGERED, { timeBucket });

    const situation = simulateSituation();
    const decision = generateIntervention(situation, user);

    showIntervention(decision, situation);
    router.push('/intervention');
  };

  const getEnergyLabel = () => {
    switch (timeBucket) {
      case 'early_morning':
        return 'Waking up';
      case 'morning':
        return 'Peak energy';
      case 'afternoon':
        return 'Afternoon focus';
      case 'evening':
        return 'Winding down';
      case 'night':
      case 'late_night':
        return 'Rest time';
      default:
        return 'Balanced';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            {user && user.identityAnchors.length > 0 && (
              <Text style={styles.identityHint}>
                Being: {user.identityAnchors.map((a) => a.label).join(', ')}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.profileButton}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.identityAnchors[0]?.label.charAt(0) || 'D'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Main Urge Button */}
        <Card style={styles.urgeCard}>
          <UrgeButton
            onPress={handleUrgePress}
            label="Feeling the urge?"
          />
        </Card>

        {/* Current State Card */}
        <Card style={styles.stateCard}>
          <View style={styles.stateHeader}>
            <Ionicons name="pulse" size={20} color={colors.primary} />
            <Text style={styles.stateTitle}>Current State</Text>
          </View>
          <View style={styles.stateContent}>
            <View style={styles.stateItem}>
              <Text style={styles.stateLabel}>Time</Text>
              <Text style={styles.stateValue}>{timeBucket.replace('_', ' ')}</Text>
            </View>
            <View style={styles.stateDivider} />
            <View style={styles.stateItem}>
              <Text style={styles.stateLabel}>Energy</Text>
              <Text style={styles.stateValue}>{getEnergyLabel()}</Text>
            </View>
          </View>
        </Card>

        {/* Today's Progress */}
        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Today's Balance</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/portfolio')}>
              <Text style={styles.seeAllLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.progressContent}>
            <ProgressRing
              progress={portfolioProgress}
              size={80}
              strokeWidth={8}
              label="complete"
            />
            <View style={styles.progressDetails}>
              <Text style={styles.progressText}>
                {completedCategories} of {totalCategories} categories
              </Text>
              <Text style={styles.progressSubtext}>
                Tap to reflect on your day
              </Text>
            </View>
          </View>
        </Card>

        {/* Stats Card */}
        {totalInterventions > 0 && (
          <Card style={styles.statsCard}>
            <Text style={styles.sectionTitle}>Your Journey</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{totalInterventions}</Text>
                <Text style={styles.statLabel}>Interventions</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{Math.round(acceptanceRate * 100)}%</Text>
                <Text style={styles.statLabel}>Accepted</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Demo Trigger */}
        <Card variant="filled" style={styles.demoCard}>
          <View style={styles.demoContent}>
            <Ionicons name="flash" size={24} color={colors.primary} />
            <View style={styles.demoText}>
              <Text style={styles.demoTitle}>Try an Intervention</Text>
              <Text style={styles.demoSubtitle}>
                See how DopaMenu works with a demo
              </Text>
            </View>
          </View>
          <Button
            title="Demo"
            variant="primary"
            size="small"
            onPress={handleTriggerDemo}
          />
        </Card>

        {/* Identity Anchors */}
        {user && user.identityAnchors.length > 0 && (
          <View style={styles.anchorsSection}>
            <Text style={styles.sectionTitle}>Your Identities</Text>
            <View style={styles.anchorsList}>
              {user.identityAnchors.map((anchor) => (
                <View key={anchor.id} style={styles.anchorChip}>
                  <Ionicons
                    name={(anchor.icon as any) || 'star'}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.anchorText}>{anchor.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  greeting: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  identityHint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  profileButton: {
    padding: spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textInverse,
  },
  urgeCard: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  stateCard: {
    marginBottom: spacing.md,
  },
  stateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stateTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  stateContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stateItem: {
    flex: 1,
  },
  stateLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  stateValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  stateDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  progressCard: {
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  seeAllLink: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  progressContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  progressDetails: {
    flex: 1,
  },
  progressText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  progressSubtext: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  statsCard: {
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  demoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  demoText: {
    flex: 1,
  },
  demoTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  demoSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  anchorsSection: {
    marginTop: spacing.sm,
  },
  anchorsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  anchorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryFaded,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  anchorText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.primary,
  },
});
