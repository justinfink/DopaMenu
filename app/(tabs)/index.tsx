import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  AppState,
  StatusBar as RNStatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button, ProgressRing, UrgeButton, WellbeingScore } from '../../src/components';
import { useUserStore } from '../../src/stores/userStore';
import { useInterventionStore } from '../../src/stores/interventionStore';
import { usePortfolioStore } from '../../src/stores/portfolioStore';
import { usePhenotypeStore } from '../../src/stores/phenotypeStore';
import { useRedirectStore } from '../../src/stores/redirectStore';
import { simulateSituation, generateIntervention } from '../../src/engine/InterventionEngine';
import { getGreeting, getTimeBucket } from '../../src/utils/helpers';
import { analyticsService, AnalyticsEvents, appUsageService } from '../../src/services';
import { colors, spacing, borderRadius, typography, shadows } from '../../src/constants/theme';

// ============================================
// Dashboard / Home Screen
// Main hub for the app
// ============================================

interface PermissionState {
  usageAccess: boolean;
  checked: boolean;
}

interface AppUsageStat {
  packageName: string;
  totalTimeMs: number;
  label?: string;
}

export default function DashboardScreen() {
  const { user, updatePreferences } = useUserStore();
  const { showIntervention, totalInterventions, acceptedCount } = useInterventionStore();
  const { getTodayPortfolio } = usePortfolioStore();
  const { getWellbeingScore, todaySnapshot, refreshTodaySnapshot } = usePhenotypeStore();
  const { getStats: getRedirectStats } = useRedirectStore();
  const [refreshing, setRefreshing] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>({ usageAccess: false, checked: false });
  const [todayUsage, setTodayUsage] = useState<AppUsageStat[]>([]);

  const portfolio = getTodayPortfolio();
  const completedCategories = portfolio.categories.filter((c) => c.completed).length;
  const totalCategories = portfolio.categories.length;
  const portfolioProgress = totalCategories > 0 ? completedCategories / totalCategories : 0;

  const acceptanceRate = totalInterventions > 0 ? acceptedCount / totalInterventions : 0;
  const wellbeingScore = getWellbeingScore();
  const redirectStats = getRedirectStats();

  const timeBucket = getTimeBucket();
  const greeting = getGreeting();

  // Check permissions and load usage data
  const checkSetupStatus = useCallback(async () => {
    if (Platform.OS !== 'android') return;

    const status = await appUsageService.checkPermissionsStatus();
    setPermissions({ usageAccess: status.usageAccess, checked: true });

    // Load today's app usage if we have permission
    if (status.usageAccess) {
      const stats = await appUsageService.getAppUsageStats(1);
      // Map package names to friendly labels
      const trackedApps = user?.preferences.trackedApps || [];
      const mapped = stats.slice(0, 5).map(s => {
        const tracked = trackedApps.find(a => a.packageName === s.packageName);
        return {
          ...s,
          label: tracked?.label || s.packageName.split('.').pop() || s.packageName,
        };
      });
      setTodayUsage(mapped);
    }
  }, [user?.preferences.trackedApps]);

  // Re-check when app comes to foreground (user may have granted permissions)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkSetupStatus();
      }
    });

    checkSetupStatus();
    return () => subscription.remove();
  }, [checkSetupStatus]);

  // Track screen view
  useEffect(() => {
    analyticsService.screen('Dashboard');
    analyticsService.track(AnalyticsEvents.APP_OPENED, {
      timeBucket,
      hasCompletedOnboarding: user?.onboardingCompleted ?? false,
    });
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTodaySnapshot();
    } catch (e) {
      // ignore
    }
    setRefreshing(false);
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

        {/* Setup Banner - shown when core features need enabling */}
        {Platform.OS === 'android' && permissions.checked && (
          !user?.preferences.appMonitoringEnabled ||
          !user?.preferences.redirectionEnabled ||
          !permissions.usageAccess
        ) && (
          <Card style={styles.setupCard}>
            <View style={styles.setupHeader}>
              <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
              <Text style={styles.setupTitle}>Complete Setup</Text>
            </View>
            <Text style={styles.setupDescription}>
              Enable app detection so DopaMenu can catch you before you scroll
            </Text>
            <View style={styles.setupItems}>
              {/* Step 1: Usage Access Permission */}
              {!permissions.usageAccess && (
                <TouchableOpacity
                  style={styles.setupItem}
                  onPress={async () => {
                    await appUsageService.requestPermission();
                  }}
                >
                  <View style={[styles.setupStepBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.setupStepNumber}>1</Text>
                  </View>
                  <View style={styles.setupItemText}>
                    <Text style={styles.setupItemTitle}>Grant Usage Access</Text>
                    <Text style={styles.setupItemDesc}>
                      Opens Android settings - find DopaMenu and enable access, then come back
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}

              {/* Step 2: Enable features (shown after permission granted) */}
              {permissions.usageAccess && (!user?.preferences.appMonitoringEnabled || !user?.preferences.redirectionEnabled) && (
                <TouchableOpacity
                  style={styles.setupItem}
                  onPress={async () => {
                    updatePreferences({
                      appMonitoringEnabled: true,
                      redirectionEnabled: true,
                    });
                    const enabledApps = user?.preferences.trackedApps.filter(a => a.enabled) || [];
                    await appUsageService.startMonitoring(enabledApps);
                    checkSetupStatus();
                  }}
                >
                  <View style={[styles.setupStepBadge, { backgroundColor: colors.success }]}>
                    <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                  </View>
                  <View style={styles.setupItemText}>
                    <Text style={styles.setupItemTitle}>Activate App Detection</Text>
                    <Text style={styles.setupItemDesc}>
                      Permission granted! Tap to start monitoring and enable redirects
                    </Text>
                  </View>
                  <Ionicons name="power" size={20} color={colors.success} />
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )}

        {/* Main Urge Button */}
        <Card style={styles.urgeCard}>
          <UrgeButton
            onPress={handleUrgePress}
            label="Feeling the urge?"
          />
        </Card>

        {/* Wellbeing Score */}
        {user?.preferences.phenotypeCollectionEnabled && (
          <Card style={styles.wellbeingCard}>
            <View style={styles.wellbeingRow}>
              <WellbeingScore score={wellbeingScore} size="small" />
              <View style={styles.wellbeingInfo}>
                <Text style={styles.sectionTitle}>Wellbeing</Text>
                <Text style={styles.progressSubtext}>
                  {wellbeingScore >= 70 ? 'Looking good today' : wellbeingScore >= 40 ? 'Room for improvement' : 'Take care of yourself'}
                </Text>
                <TouchableOpacity onPress={() => router.push('/insights')}>
                  <Text style={styles.seeAllLink}>View insights</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}

        {/* Redirect Stats */}
        {redirectStats.totalRedirects > 0 && (
          <Card style={styles.redirectStatsCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.sectionTitle}>Redirects</Text>
              <Text style={styles.seeAllLink}>{Math.round(redirectStats.successRate * 100)}% success</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{redirectStats.todayRedirects}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{redirectStats.totalRedirects}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{redirectStats.estimatedSavedMinutes}m</Text>
                <Text style={styles.statLabel}>Saved</Text>
              </View>
            </View>
          </Card>
        )}

        {/* App Usage Today */}
        {todayUsage.length > 0 && (
          <Card style={styles.usageCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.sectionTitle}>Today's App Usage</Text>
              <TouchableOpacity onPress={() => router.push('/insights')}>
                <Text style={styles.seeAllLink}>Details</Text>
              </TouchableOpacity>
            </View>
            {todayUsage.map((app, i) => (
              <View key={i} style={styles.usageRow}>
                <Text style={styles.usageAppName} numberOfLines={1}>{app.label}</Text>
                <View style={styles.usageBarContainer}>
                  <View
                    style={[
                      styles.usageBar,
                      {
                        width: `${Math.min(100, (app.totalTimeMs / (todayUsage[0]?.totalTimeMs || 1)) * 100)}%`,
                        backgroundColor: user?.preferences.trackedApps.some(t => t.packageName === app.packageName)
                          ? colors.warning
                          : colors.primaryLight,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.usageTime}>
                  {app.totalTimeMs >= 3600000
                    ? `${Math.floor(app.totalTimeMs / 3600000)}h ${Math.floor((app.totalTimeMs % 3600000) / 60000)}m`
                    : `${Math.floor(app.totalTimeMs / 60000)}m`}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Sleep Quality (from phenotype) */}
        {todaySnapshot?.sleepInference && todaySnapshot.sleepInference.estimatedDurationMinutes != null && todaySnapshot.sleepInference.estimatedDurationMinutes > 0 && (
          <Card style={styles.sleepCard}>
            <View style={styles.stateHeader}>
              <Ionicons name="moon" size={20} color="#7C4DFF" />
              <Text style={styles.stateTitle}>Last Night's Sleep</Text>
            </View>
            <View style={styles.stateContent}>
              <View style={styles.stateItem}>
                <Text style={styles.stateLabel}>Duration</Text>
                <Text style={styles.stateValue}>
                  {(todaySnapshot.sleepInference.estimatedDurationMinutes / 60).toFixed(1)}h
                </Text>
              </View>
              <View style={styles.stateDivider} />
              <View style={styles.stateItem}>
                <Text style={styles.stateLabel}>Regularity</Text>
                <Text style={styles.stateValue}>
                  {todaySnapshot.sleepInference.regularity}%
                </Text>
              </View>
            </View>
          </Card>
        )}

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
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) + spacing.sm : spacing.md,
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
  wellbeingCard: {
    marginBottom: spacing.md,
  },
  wellbeingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  wellbeingInfo: {
    flex: 1,
  },
  redirectStatsCard: {
    marginBottom: spacing.md,
  },
  sleepCard: {
    marginBottom: spacing.md,
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
  setupCard: {
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  setupTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  setupDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  setupItems: {
    gap: spacing.sm,
  },
  setupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setupStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupStepNumber: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textInverse,
  },
  setupItemText: {
    flex: 1,
  },
  setupItemTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  setupItemDesc: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  usageCard: {
    marginBottom: spacing.md,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  usageAppName: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    width: 80,
    fontWeight: typography.weights.medium,
  },
  usageBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  usageBar: {
    height: 8,
    borderRadius: 4,
  },
  usageTime: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    width: 50,
    textAlign: 'right',
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
