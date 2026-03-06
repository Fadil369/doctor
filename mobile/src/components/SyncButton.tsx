/**
 * SyncButton - Health Data Sync Control
 *
 * Animated button that triggers the health data sync workflow.
 * Shows real-time sync status with visual feedback.
 */

import React from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../theme';
import type { SyncStatus } from '../hooks/useHealthSync';

interface SyncButtonProps {
  status: SyncStatus;
  onPress: () => void;
  label?: string;
  syncingLabel?: string;
  disabled?: boolean;
}

const STATUS_LABELS: Record<SyncStatus, string> = {
  idle: 'Sync Health Data',
  checking: 'Checking…',
  'requesting-permissions': 'Requesting Permissions…',
  reading: 'Reading Health Data…',
  syncing: 'Syncing to FHIR Server…',
  success: '✓ Synced Successfully',
  error: 'Retry Sync',
};

const STATUS_COLORS: Record<SyncStatus, string> = {
  idle: Colors.accentTeal,
  checking: Colors.accentTealDark,
  'requesting-permissions': Colors.accentTealDark,
  reading: Colors.accentTealDark,
  syncing: Colors.accentTealDark,
  success: Colors.success,
  error: Colors.error,
};

export function SyncButton({ status, onPress, disabled = false }: SyncButtonProps) {
  const isActive = ['checking', 'requesting-permissions', 'reading', 'syncing'].includes(status);
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: color }, (isActive || disabled) && styles.disabled]}
      onPress={onPress}
      disabled={isActive || disabled}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        {isActive && (
          <ActivityIndicator size="small" color={Colors.white} style={styles.spinner} />
        )}
        <Text style={styles.label}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: {
    opacity: 0.75,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  spinner: {
    marginRight: 4,
  },
  label: {
    color: Colors.white,
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
