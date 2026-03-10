import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressRing } from './ProgressRing';
import { TrendDirection } from '../models';
import { colors, spacing, typography } from '../constants/theme';

interface WellbeingScoreProps {
  score: number; // 0-100
  trend?: TrendDirection;
  size?: 'small' | 'large';
  onPress?: () => void;
}

export function WellbeingScore({
  score,
  trend = 'stable',
  size = 'large',
  onPress,
}: WellbeingScoreProps) {
  const ringSize = size === 'large' ? 120 : 60;
  const strokeWidth = size === 'large' ? 10 : 6;

  const scoreColor =
    score >= 70 ? colors.success :
    score >= 40 ? '#FF9800' :
    colors.error;

  const trendConfig = {
    improving: { icon: 'trending-up' as const, color: colors.success, label: 'Improving' },
    declining: { icon: 'trending-down' as const, color: colors.error, label: 'Declining' },
    stable: { icon: 'remove' as const, color: colors.textSecondary, label: 'Stable' },
  }[trend];

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <ProgressRing
        progress={score / 100}
        size={ringSize}
        strokeWidth={strokeWidth}
        color={scoreColor}
      />
      {size === 'large' && (
        <View style={styles.details}>
          <Text style={styles.scoreLabel}>Wellbeing Score</Text>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}</Text>
          <View style={styles.trendRow}>
            <Ionicons name={trendConfig.icon} size={14} color={trendConfig.color} />
            <Text style={[styles.trendText, { color: trendConfig.color }]}>
              {trendConfig.label}
            </Text>
          </View>
          {onPress && (
            <Text style={styles.viewLink}>View insights</Text>
          )}
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  details: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold as any,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  trendText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
  },
  viewLink: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.medium as any,
    marginTop: spacing.sm,
  },
});

export default WellbeingScore;
