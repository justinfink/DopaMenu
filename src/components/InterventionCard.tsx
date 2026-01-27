import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';
import { InterventionCandidate } from '../models';

// ============================================
// InterventionCard Component
// Displays a single intervention suggestion
// ============================================

interface InterventionCardProps {
  intervention: InterventionCandidate;
  isPrimary?: boolean;
  showEffort?: boolean;
}

const effortLabels: Record<string, string> = {
  very_low: 'Quick',
  low: 'Easy',
  medium: 'Moderate',
  high: 'Committed',
};

const surfaceLabels: Record<string, string> = {
  on_phone: 'On phone',
  off_phone: 'Away from phone',
};

export const InterventionCard: React.FC<InterventionCardProps> = ({
  intervention,
  isPrimary = false,
  showEffort = true,
}) => {
  return (
    <View style={[styles.container, isPrimary && styles.primaryContainer]}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={(intervention.icon as any) || 'sparkles'}
          size={isPrimary ? 32 : 24}
          color={isPrimary ? colors.primary : colors.primaryDark}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.label, isPrimary && styles.primaryLabel]}>
          {intervention.label}
        </Text>

        {intervention.description && (
          <Text style={styles.description}>{intervention.description}</Text>
        )}

        {showEffort && (
          <View style={styles.tags}>
            <View style={styles.tag}>
              <Ionicons name="flash" size={12} color={colors.textTertiary} />
              <Text style={styles.tagText}>
                {effortLabels[intervention.requiredEffort]}
              </Text>
            </View>
            <View style={styles.tag}>
              <Ionicons
                name={intervention.surface === 'on_phone' ? 'phone-portrait' : 'walk'}
                size={12}
                color={colors.textTertiary}
              />
              <Text style={styles.tagText}>
                {surfaceLabels[intervention.surface]}
              </Text>
            </View>
          </View>
        )}
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textTertiary}
        style={styles.chevron}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  primaryContainer: {
    backgroundColor: colors.primaryFaded,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    ...shadows.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  primaryLabel: {
    fontSize: typography.sizes.lg,
  },
  description: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tags: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagText: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
});

export default InterventionCard;
