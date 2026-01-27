import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { PortfolioCategory as PortfolioCategoryType } from '../models';

// ============================================
// PortfolioCategory Component
// Checkable category item for daily reflection
// ============================================

interface PortfolioCategoryProps {
  category: PortfolioCategoryType;
  onToggle: () => void;
  disabled?: boolean;
}

export const PortfolioCategory: React.FC<PortfolioCategoryProps> = ({
  category,
  onToggle,
  disabled = false,
}) => {
  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        category.completed && styles.completedContainer,
        disabled && styles.disabledContainer,
      ]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, category.completed && styles.completedIcon]}>
        <Ionicons
          name={(category.icon as any) || 'ellipse'}
          size={24}
          color={category.completed ? colors.textInverse : colors.primary}
        />
      </View>

      <Text style={[styles.label, category.completed && styles.completedLabel]}>
        {category.label}
      </Text>

      <View style={[styles.checkbox, category.completed && styles.checkedBox]}>
        {category.completed && (
          <Ionicons name="checkmark" size={16} color={colors.textInverse} />
        )}
      </View>

      {category.inferred && (
        <View style={styles.inferredBadge}>
          <Text style={styles.inferredText}>Auto</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  completedContainer: {
    backgroundColor: colors.primaryFaded,
    borderColor: colors.primary,
  },
  disabledContainer: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  completedIcon: {
    backgroundColor: colors.primary,
  },
  label: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  completedLabel: {
    color: colors.primaryDark,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  inferredBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  inferredText: {
    fontSize: typography.sizes.xs,
    color: colors.textInverse,
    fontWeight: typography.weights.medium,
  },
});

export default PortfolioCategory;
