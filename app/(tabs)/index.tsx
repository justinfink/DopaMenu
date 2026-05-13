import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ProgressRing, NotificationsDeniedBanner } from '../../src/components';
import { LiveMenu, ChoresList, QuickEditPanel } from '../../src/components/home';
import { useUserStore } from '../../src/stores/userStore';
import { usePortfolioStore } from '../../src/stores/portfolioStore';
import { getGreeting, getTimeBucket } from '../../src/utils/helpers';
import { analyticsService, AnalyticsEvents } from '../../src/services';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';

// ============================================
// Dashboard / Home Screen
// Live menu hero → today's chores → quick-edit (quiet hours, triggers,
// activities) → today's portfolio progress → identity anchors. The old urge
// button + demo card are gone; users now interact with the calibrated menu
// directly.
// ============================================

type SectionKey = 'quiet' | 'triggers' | 'activities';

export default function DashboardScreen() {
  const { user } = useUserStore();
  const { getTodayPortfolio } = usePortfolioStore();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEditor, setExpandedEditor] = useState<SectionKey | null>(null);
  const editorRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  const portfolio = getTodayPortfolio();
  const completedCategories = portfolio.categories.filter((c) => c.completed).length;
  const totalCategories = portfolio.categories.length;
  const portfolioProgress = totalCategories > 0 ? completedCategories / totalCategories : 0;

  const timeBucket = getTimeBucket();
  const greeting = getGreeting();

  useEffect(() => {
    analyticsService.screen('Dashboard');
    analyticsService.track(AnalyticsEvents.APP_OPENED, {
      timeBucket,
      hasCompletedOnboarding: user?.onboardingCompleted ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  // Used by LiveMenu's "Edit quiet hours" link from the quiet-hours empty state.
  const handleEditQuietHours = () => {
    setExpandedEditor('quiet');
    requestAnimationFrame(() => {
      editorRef.current?.measure((_x, _y, _w, _h, _px, py) => {
        scrollRef.current?.scrollTo({ y: Math.max(py - 80, 0), animated: true });
      });
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <NotificationsDeniedBanner />
      <ScrollView
        ref={scrollRef}
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
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/(tabs)/settings')}
            accessibilityLabel="Settings"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.identityAnchors[0]?.label.charAt(0) || 'D'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hero — calibrated live menu */}
        <LiveMenu onEditQuietHours={handleEditQuietHours} />

        {/* Today's chores (off-phone tasks) */}
        <ChoresList />

        {/* Inline editors for quiet hours, triggers, activities */}
        <View ref={editorRef}>
          <QuickEditPanel
            expandedSection={expandedEditor}
            onSectionChange={setExpandedEditor}
          />
        </View>

        {/* Today's portfolio progress */}
        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionTitle}>Today's balance</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/portfolio')}>
              <Text style={styles.seeAllLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.progressContent}>
            <ProgressRing
              progress={portfolioProgress}
              size={72}
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

        {/* Identity anchors */}
        {user && user.identityAnchors.length > 0 && (
          <View style={styles.anchorsSection}>
            <Text style={styles.sectionTitle}>Your identities</Text>
            <View style={styles.anchorsList}>
              {user.identityAnchors.map((anchor) => (
                <View key={anchor.id} style={styles.anchorChip}>
                  <Ionicons
                    name={(anchor.icon as React.ComponentProps<typeof Ionicons>['name']) || 'star'}
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
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
