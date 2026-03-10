import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InstalledApp, UserAppConfig, AppDesignation } from '../models';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

interface AppListItemProps {
  app: InstalledApp;
  config?: UserAppConfig | null;
  identityLabels?: string[];
  onPress: () => void;
}

const DESIGNATION_COLORS: Record<AppDesignation, { bg: string; text: string; label: string }> = {
  aligned: { bg: '#E8F5E9', text: '#2E7D32', label: 'Aligned' },
  neutral: { bg: '#F5F5F5', text: '#757575', label: 'Neutral' },
  timewaster: { bg: '#FFEBEE', text: '#C62828', label: 'Timewaster' },
};

const PRIORITY_STARS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export function AppListItem({ app, config, identityLabels = [], onPress }: AppListItemProps) {
  const designation = config?.designation || 'neutral';
  const designationStyle = DESIGNATION_COLORS[designation];
  const priorityStars = PRIORITY_STARS[config?.priority || 'none'];

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={(app.icon as any) || 'apps'}
          size={28}
          color={designation === 'timewaster' ? colors.error : colors.primary}
        />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {app.displayName}
          </Text>
          {priorityStars > 0 && (
            <View style={styles.stars}>
              {Array.from({ length: priorityStars }).map((_, i) => (
                <Ionicons key={i} name="star" size={12} color="#FFB300" />
              ))}
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.category}>
            {app.category.replace('_', ' ')}
          </Text>
          <View style={[styles.designationBadge, { backgroundColor: designationStyle.bg }]}>
            <Text style={[styles.designationText, { color: designationStyle.text }]}>
              {designationStyle.label}
            </Text>
          </View>
        </View>

        {identityLabels.length > 0 && (
          <View style={styles.tagsRow}>
            {identityLabels.slice(0, 3).map((label) => (
              <View key={label} style={styles.identityTag}>
                <Text style={styles.identityTagText}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium as any,
    color: colors.textPrimary,
    flex: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  category: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  designationBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  designationText: {
    fontSize: 10,
    fontWeight: typography.weights.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  identityTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryFaded,
  },
  identityTagText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.medium as any,
  },
});

export default AppListItem;
