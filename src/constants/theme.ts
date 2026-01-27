export const colors = {
  // Primary purple palette (from logo)
  primary: '#9B7BB8',
  primaryLight: '#B8A4C9',
  primaryDark: '#7B5B9B',
  primaryFaded: '#E8E0F0',

  // Background colors
  background: '#F8F6FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Text colors
  textPrimary: '#2D2D3A',
  textSecondary: '#6B6B7B',
  textTertiary: '#9B9BAB',
  textInverse: '#FFFFFF',

  // Semantic colors
  success: '#6BBF8A',
  warning: '#E5A84B',
  error: '#D66B6B',

  // Borders and dividers
  border: '#E8E5EB',
  divider: '#F0EDF3',

  // Overlay
  overlay: 'rgba(45, 45, 58, 0.5)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  // Font sizes
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 34,
  },
  // Font weights
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export default {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
};
