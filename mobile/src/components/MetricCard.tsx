/**
 * MetricCard - Health Metric Display Card
 *
 * Displays a single health metric (steps, heart rate, glucose, etc.)
 * with icon, value, unit, and trend indicator.
 *
 * Uses the BrainSAIT glass morphism design system.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { GlassCard } from './GlassCard';
import { Colors, Typography, Spacing } from '../theme';

export interface MetricCardProps {
  label: string;
  value: number | string | undefined;
  unit: string;
  icon: string;              // Emoji or icon name
  color?: string;            // Accent color for the metric
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  style?: ViewStyle;
  isLoading?: boolean;
}

export function MetricCard({
  label,
  value,
  unit,
  icon,
  color = Colors.accentTeal,
  trend,
  trendValue,
  style,
  isLoading = false,
}: MetricCardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? Colors.success
                   : trend === 'down' ? Colors.error
                   : Colors.textMuted;

  return (
    <GlassCard style={[styles.card, style]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}22` }]}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        {trend && trendValue && (
          <View style={[styles.trendBadge, { backgroundColor: `${trendColor}22` }]}>
            <Text style={[styles.trendText, { color: trendColor }]}>
              {trendIcon} {trendValue}
            </Text>
          </View>
        )}
      </View>

      {/* Value */}
      <View style={styles.valueRow}>
        {isLoading ? (
          <Text style={styles.loadingText}>—</Text>
        ) : (
          <>
            <Text style={[styles.value, { color }]}>
              {value !== undefined && value !== null ? String(value) : '—'}
            </Text>
            <Text style={styles.unit}>{unit}</Text>
          </>
        )}
      </View>

      {/* Label */}
      <Text style={styles.label}>{label}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 150,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  value: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    lineHeight: 28,
  },
  unit: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  loadingText: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textMuted,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
