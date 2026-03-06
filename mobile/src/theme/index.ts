/**
 * BrainSAIT Design System - Theme Constants
 * Glass morphism UI with Midnight Blue + Signal Teal palette
 */

export const Colors = {
  // Primary brand colors
  midnightBlue: '#1a365d',
  signalTeal: '#0ea5e9',

  // Background gradients
  gradientStart: '#1a365d',
  gradientMid: '#0f2847',
  gradientEnd: '#0c1f35',

  // Accent colors
  accentTeal: '#0ea5e9',
  accentTealLight: '#38bdf8',
  accentTealDark: '#0284c7',

  // Glass morphism surfaces
  glassSurface: 'rgba(255, 255, 255, 0.08)',
  glassBorder: 'rgba(255, 255, 255, 0.15)',
  glassHighlight: 'rgba(255, 255, 255, 0.12)',

  // Text
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.75)',
  textMuted: 'rgba(255, 255, 255, 0.50)',
  textAccent: '#38bdf8',

  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Health metric colors
  heartRate: '#ef4444',
  steps: '#22c55e',
  sleep: '#8b5cf6',
  oxygen: '#3b82f6',
  glucose: '#f59e0b',
  bloodPressure: '#ec4899',
  weight: '#14b8a6',
  temperature: '#f97316',

  // Neutral
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

export const Typography = {
  fontFamily: {
    en: 'System',
    ar: 'System', // IBM Plex Sans Arabic (loaded via expo-font)
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
};

// Glass morphism style preset
export const GlassStyle = {
  backgroundColor: Colors.glassSurface,
  borderWidth: 1,
  borderColor: Colors.glassBorder,
  borderRadius: BorderRadius.lg,
  ...Shadows.glass,
};
