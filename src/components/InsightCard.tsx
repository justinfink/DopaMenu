import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

interface InsightCardProps {
  title: string;
  icon: string;
  iconColor?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyMessage?: string;
}

export function InsightCard({
  title,
  icon,
  iconColor = colors.primary,
  children,
  empty = false,
  emptyMessage = 'No data yet',
}: InsightCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {empty ? (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </Card>
  );
}

// Helper sub-components for common insight patterns
export function InsightRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>
        {value}
        {unit && <Text style={styles.rowUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

export function InsightBadge({
  label,
  color = colors.primary,
}: {
  label: string;
  color?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function TrendIndicator({
  direction,
  label,
}: {
  direction: 'improving' | 'declining' | 'stable';
  label?: string;
}) {
  const config = {
    improving: { icon: 'trending-up', color: colors.success, text: label || 'Improving' },
    declining: { icon: 'trending-down', color: colors.error, text: label || 'Declining' },
    stable: { icon: 'remove', color: colors.textSecondary, text: label || 'Stable' },
  }[direction];

  return (
    <View style={styles.trendContainer}>
      <Ionicons name={config.icon as any} size={16} color={config.color} />
      <Text style={[styles.trendText, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold as any,
    color: colors.textPrimary,
  },
  content: {},
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold as any,
    color: colors.textPrimary,
  },
  rowUnit: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    fontWeight: typography.weights.regular as any,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium as any,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium as any,
  },
});

export default InsightCard;
