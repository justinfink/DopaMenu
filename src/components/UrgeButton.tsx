import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';

// ============================================
// Urge Button Component
// Main trigger for interventions (cross-platform)
// ============================================

interface UrgeButtonProps {
  onPress: () => void;
  size?: 'normal' | 'large';
  label?: string;
}

export function UrgeButton({
  onPress,
  size = 'large',
  label = "I'm reaching for my phone..."
}: UrgeButtonProps) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const buttonSize = size === 'large' ? 120 : 80;
  const iconSize = size === 'large' ? 48 : 32;

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[
            styles.button,
            { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
          ]}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
        >
          <Ionicons name="hand-left" size={iconSize} color={colors.textInverse} />
        </TouchableOpacity>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>Tap when you feel the urge</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  label: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default UrgeButton;
