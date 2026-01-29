import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../constants/theme';

// ============================================
// Card Component
// Elevated container with optional press action
// ============================================

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'filled';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  onPress,
  style,
  padding = 'medium',
}) => {
  const cardStyles = [
    styles.base,
    styles[variant],
    styles[`${padding}Padding`],
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity style={cardStyles} onPress={onPress} activeOpacity={0.8}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyles}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },

  // Variants
  elevated: {
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filled: {
    backgroundColor: colors.primaryFaded,
  },

  // Padding
  nonePadding: {
    padding: 0,
  },
  smallPadding: {
    padding: spacing.sm,
  },
  mediumPadding: {
    padding: spacing.md,
  },
  largePadding: {
    padding: spacing.lg,
  },
});

export default Card;
