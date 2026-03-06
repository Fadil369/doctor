/**
 * ComplianceBadges - HIPAA / NPHIES / Security compliance indicators
 *
 * Displays compliance status badges in the BrainSAIT glass morphism style.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../theme';

interface BadgeProps {
  icon: string;
  label: string;
  color?: string;
}

function Badge({ icon, label, color = Colors.success }: BadgeProps) {
  return (
    <View style={[styles.badge, { borderColor: `${color}44`, backgroundColor: `${color}11` }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

export function ComplianceBadges() {
  return (
    <View style={styles.container}>
      <Badge icon="🔒" label="HIPAA" color={Colors.success} />
      <Badge icon="🏥" label="NPHIES" color={Colors.accentTeal} />
      <Badge icon="🔐" label="Encrypted" color={Colors.info} />
      <Badge icon="📋" label="Audited" color={Colors.warning} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 4,
  },
  icon: {
    fontSize: 12,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
});
