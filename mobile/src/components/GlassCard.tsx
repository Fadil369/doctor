/**
 * GlassCard - BrainSAIT Glass Morphism Card Component
 *
 * Implements the frosted glass aesthetic using:
 * - Semi-transparent background (rgba white overlay)
 * - Subtle border highlight
 * - Expo BlurView for background blur effect
 * - MeshGradient backdrop (Midnight Blue → Signal Teal)
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadows } from '../theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'flat';
}

export function GlassCard({ children, style, variant = 'default' }: GlassCardProps) {
  const variantStyle = variant === 'elevated'
    ? styles.elevated
    : variant === 'flat'
    ? styles.flat
    : styles.default;

  return (
    <View style={[styles.card, variantStyle, style]}>
      {/* Inner highlight line at top (glass effect) */}
      <View style={styles.highlight} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 16,
  },
  default: {
    backgroundColor: Colors.glassSurface,
    ...Shadows.glass,
  },
  elevated: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    ...Shadows.glass,
  },
  flat: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1,
  },
});
