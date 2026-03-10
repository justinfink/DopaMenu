import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ProgressRing, WellbeingScore } from '../src/components';
import { InsightCard, InsightRow, InsightBadge, TrendIndicator } from '../src/components/InsightCard';
import { usePhenotype } from '../src/hooks/usePhenotype';
import { useRedirectStore } from '../src/stores/redirectStore';
import { analyticsService } from '../src/services';
import { colors, spacing, typography, borderRadius } from '../src/constants/theme';

// ============================================
// Insights Screen
// Shows phenotype data and behavioral patterns
// ============================================

export default function InsightsScreen() {
  const {
    todaySnapshot,
    profile,
    wellbeingScore,
    trends,
    anomalies,
    patterns,
  } = usePhenotype();

  const redirectStats = useRedirectStore(s => s.getStats());

  useEffect(() => {
    analyticsService.screen('Insights');
  }, []);

  const snap = todaySnapshot;
  const wellbeingTrend = profile?.wellbeingTrend || 'stable';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Insights</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Wellbeing Score */}
        <Card style={styles.wellbeingCard}>
          <WellbeingScore
            score={wellbeingScore}
            trend={wellbeingTrend}
            size="large"
          />
        </Card>

        {/* Sleep */}
        <InsightCard
          title="Sleep"
          icon="moon"
          iconColor="#5C6BC0"
          empty={!snap?.sleepInference.estimatedBedtime}
        >
          {snap?.sleepInference && (
            <>
              <InsightRow label="Bedtime" value={snap.sleepInference.estimatedBedtime || '--'} />
              <InsightRow label="Wake time" value={snap.sleepInference.estimatedWakeTime || '--'} />
              <InsightRow
                label="Duration"
                value={snap.sleepInference.estimatedDurationMinutes
                  ? `${Math.floor(snap.sleepInference.estimatedDurationMinutes / 60)}h ${snap.sleepInference.estimatedDurationMinutes % 60}m`
                  : '--'}
              />
              <InsightRow label="Quality" value={snap.sleepInference.qualityScore} unit="/100" />
              <InsightRow label="Regularity" value={snap.sleepInference.regularity} unit="/100" />
            </>
          )}
        </InsightCard>

        {/* Activity */}
        <InsightCard
          title="Activity"
          icon="fitness"
          iconColor="#43A047"
          empty={!snap || snap.activityLevel.stepCount === 0}
        >
          {snap && (
            <>
              <InsightRow label="Steps today" value={snap.activityLevel.stepCount.toLocaleString()} />
              <InsightRow label="Movement" value={snap.activityLevel.movementMinutes} unit="min" />
              <InsightRow label="Sedentary" value={snap.activityLevel.sedentaryMinutes} unit="min" />
              <View style={styles.badgeRow}>
                <InsightBadge
                  label={snap.activityLevel.activityClassification}
                  color={snap.activityLevel.activityClassification === 'active' ? colors.success : colors.textSecondary}
                />
              </View>
            </>
          )}
        </InsightCard>

        {/* Screen Time */}
        <InsightCard
          title="Screen Time"
          icon="phone-portrait"
          iconColor="#F4511E"
          empty={!snap || snap.screenTime.totalMinutes === 0}
        >
          {snap && (
            <>
              <InsightRow
                label="Total today"
                value={`${Math.floor(snap.screenTime.totalMinutes / 60)}h ${snap.screenTime.totalMinutes % 60}m`}
              />
              <InsightRow label="Sessions" value={snap.screenTime.sessionCount} />
            </>
          )}
        </InsightCard>

        {/* Mood Proxy */}
        <InsightCard
          title="Mood Proxy"
          icon="heart"
          iconColor="#E91E63"
          empty={!snap}
        >
          {snap && (
            <>
              <InsightRow label="Score" value={snap.moodProxy.score} unit="/100" />
              {snap.moodProxy.contributors.map((c, i) => (
                <InsightRow
                  key={i}
                  label={c.factor}
                  value={c.influence > 0 ? `+${(c.influence * 100).toFixed(0)}%` : `${(c.influence * 100).toFixed(0)}%`}
                />
              ))}
            </>
          )}
        </InsightCard>

        {/* Cognitive Load */}
        <InsightCard
          title="Cognitive Load"
          icon="brain"
          iconColor="#7B1FA2"
          empty={!snap}
        >
          {snap && (
            <>
              <InsightRow label="Calendar events" value={snap.cognitiveLoad.calendarEventCount} />
              <InsightRow label="App switches/hr" value={snap.cognitiveLoad.appSwitchesPerHour} />
              <InsightRow label="Multitasking" value={snap.cognitiveLoad.multitaskingScore} unit="/100" />
            </>
          )}
        </InsightCard>

        {/* Social Engagement */}
        <InsightCard
          title="Social Engagement"
          icon="people"
          iconColor="#0097A7"
          empty={!snap}
        >
          {snap && (
            <>
              <InsightRow label="Messaging sessions" value={snap.socialEngagement.messagingSessionCount} />
              <InsightRow label="Communication" value={snap.socialEngagement.communicationAppMinutes} unit="min" />
              <InsightRow label="Social media" value={snap.socialEngagement.socialMediaMinutes} unit="min" />
            </>
          )}
        </InsightCard>

        {/* Redirection Stats */}
        <InsightCard
          title="Redirection"
          icon="swap-horizontal"
          iconColor={colors.primary}
          empty={redirectStats.totalRedirects === 0}
          emptyMessage="No redirections yet. Configure timewaster apps to get started."
        >
          <InsightRow label="Today's redirects" value={redirectStats.todayRedirects} />
          <InsightRow label="Today's success" value={redirectStats.todaySuccessCount} />
          <InsightRow label="All-time success rate" value={`${Math.round(redirectStats.successRate * 100)}%`} />
          <InsightRow label="Estimated time saved" value={redirectStats.estimatedSavedMinutes} unit="min" />
          {redirectStats.topTimewasters.length > 0 && (
            <View style={styles.topTimewasters}>
              <Text style={styles.subLabel}>Top timewasters:</Text>
              {redirectStats.topTimewasters.slice(0, 3).map((tw, i) => (
                <Text key={i} style={styles.timewasterItem}>
                  {tw.app} ({tw.count}x)
                </Text>
              ))}
            </View>
          )}
        </InsightCard>

        {/* Patterns */}
        {patterns.length > 0 && (
          <InsightCard title="Detected Patterns" icon="analytics" iconColor="#FF6F00">
            {patterns.map((pattern) => (
              <View key={pattern.id} style={styles.patternItem}>
                <Text style={styles.patternLabel}>{pattern.label}</Text>
                <Text style={styles.patternDesc}>{pattern.description}</Text>
                <InsightBadge
                  label={`${Math.round(pattern.confidence * 100)}% confidence`}
                  color={colors.textSecondary}
                />
              </View>
            ))}
          </InsightCard>
        )}

        {/* Anomalies */}
        {anomalies.length > 0 && (
          <InsightCard title="Anomalies" icon="alert-circle" iconColor={colors.warning}>
            {anomalies.map((anomaly, i) => (
              <View key={i} style={styles.anomalyItem}>
                <Text style={styles.anomalyText}>{anomaly.message}</Text>
              </View>
            ))}
          </InsightCard>
        )}

        {/* Trends */}
        {trends.length > 0 && (
          <InsightCard title="7-Day Trends" icon="trending-up" iconColor={colors.primary}>
            {trends.map((trend, i) => (
              <View key={i} style={styles.trendItem}>
                <Text style={styles.trendLabel}>{trend.dimension}</Text>
                <TrendIndicator direction={trend.direction} />
              </View>
            ))}
          </InsightCard>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold as any,
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  wellbeingCard: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.xl,
  },
  badgeRow: {
    marginTop: spacing.sm,
  },
  topTimewasters: {
    marginTop: spacing.sm,
  },
  subLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  timewasterItem: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    paddingVertical: 2,
  },
  patternItem: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  patternLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold as any,
    color: colors.textPrimary,
  },
  patternDesc: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  anomalyItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  anomalyText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  trendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  trendLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
});
