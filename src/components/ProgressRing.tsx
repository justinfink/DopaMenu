import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../constants/theme';

// ============================================
// ProgressRing Component
// Circular progress indicator
// ============================================

interface ProgressRingProps {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  showPercentage?: boolean;
  label?: string;
  color?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 100,
  strokeWidth = 8,
  showPercentage = true,
  label,
  color = colors.primary,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.labelContainer}>
        {showPercentage && (
          <Text style={styles.percentage}>{Math.round(progress * 100)}%</Text>
        )}
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default ProgressRing;
