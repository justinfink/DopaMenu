import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

// ============================================
// Button Component
// Primary UI component for actions
// ============================================

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  haptic?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  haptic = true,
  style,
  textStyle,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;

    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    onPress();
  };

  const buttonStyles = [
    styles.base,
    styles[variant],
    styles[`${size}Size`],
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },

  // Variants
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primaryFaded,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },

  // Sizes
  smallSize: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mediumSize: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  largeSize: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },

  // States
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },

  // Text base
  text: {
    fontWeight: typography.weights.semibold,
  },

  // Text variants
  primaryText: {
    color: colors.textInverse,
  },
  secondaryText: {
    color: colors.primary,
  },
  ghostText: {
    color: colors.primary,
  },
  outlineText: {
    color: colors.primary,
  },

  // Text sizes
  smallText: {
    fontSize: typography.sizes.sm,
  },
  mediumText: {
    fontSize: typography.sizes.md,
  },
  largeText: {
    fontSize: typography.sizes.lg,
  },

  disabledText: {
    opacity: 0.7,
  },
});

export default Button;
