/**
 * Dashboard Screen - BrainSAIT Health App
 *
 * Main health overview screen with:
 * - Glass morphism background (MeshGradient: Midnight Blue → Signal Teal)
 * - Health metric cards grid
 * - Quick sync button
 * - Bilingual support (English/Arabic)
 * - FHIR R4 / HIPAA compliance badges
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  I18nManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { MetricCard } from '../components/MetricCard';
import { SyncButton } from '../components/SyncButton';
import { ComplianceBadges } from '../components/ComplianceBadges';
import { useHealthSync } from '../hooks/useHealthSync';
import type { UnifiedHealthData } from '../native-health';

// Demo patient ID – in production, resolved from auth token / FHIR Patient resource
const PATIENT_ID = 'patient-demo-001';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const { status, result, error, lastSyncAt, sync } = useHealthSync({
    patientId: PATIENT_ID,
    role: 'patient',
  });

  // Local snapshot of the most recent health readings
  const [metrics, setMetrics] = useState<Partial<UnifiedHealthData>>({});

  useEffect(() => {
    if (result?.success) {
      // In a real app, we'd re-fetch observations from server after sync
      // For the scaffold we use the last read data from the hook
    }
  }, [result]);

  const handleSync = async () => {
    const today = new Date();
    await sync({
      start: new Date(today.setHours(0, 0, 0, 0)).toISOString(),
      end: new Date().toISOString(),
    });
  };

  const greeting = `${t('dashboard.greeting')}, Dr. Fadil 👋`;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Background gradient simulation (use expo-linear-gradient in production) */}
      <View style={styles.background}>
        <View style={styles.gradientOverlay} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isRTL && styles.rtl]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, isRTL && styles.rtlRow]}>
          <View>
            <Text style={[styles.greeting, isRTL && styles.rtlText]}>{greeting}</Text>
            <Text style={[styles.subtitle, isRTL && styles.rtlText]}>
              {t('dashboard.todaySummary')}
            </Text>
          </View>
          <View style={styles.brandMark}>
            <Text style={styles.brandText}>BS</Text>
          </View>
        </View>

        {/* Compliance badges */}
        <View style={[styles.section, isRTL && styles.rtlRow]}>
          <ComplianceBadges />
        </View>

        {/* Sync status card */}
        {(status === 'success' || status === 'error') && (
          <GlassCard style={[
            styles.statusCard,
            status === 'success' ? styles.successCard : styles.errorCard
          ]}>
            <Text style={[styles.statusText, isRTL && styles.rtlText]}>
              {status === 'success' ? `✓ ${t('sync.success')}` : `⚠ ${error}`}
            </Text>
            {result?.bundleId && (
              <Text style={[styles.statusMeta, isRTL && styles.rtlText]}>
                {t('fhir.bundle')}: {result.bundleId}
              </Text>
            )}
            {result?.observationCount !== undefined && (
              <Text style={[styles.statusMeta, isRTL && styles.rtlText]}>
                {result.observationCount} {t('fhir.observation')}s
              </Text>
            )}
          </GlassCard>
        )}

        {/* Health Metrics Grid */}
        <Text style={[styles.sectionTitle, isRTL && styles.rtlText]}>
          {t('nav.metrics')}
        </Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            label={t('metrics.steps')}
            value={metrics.steps}
            unit={t('metrics.units.steps')}
            icon="👣"
            color={Colors.steps}
            style={styles.metricCard}
          />
          <MetricCard
            label={t('metrics.heartRate')}
            value={metrics.heartRate}
            unit={t('metrics.units.heartRate')}
            icon="❤️"
            color={Colors.heartRate}
            style={styles.metricCard}
          />
          <MetricCard
            label={t('metrics.oxygenSaturation')}
            value={metrics.oxygenSaturation}
            unit={t('metrics.units.oxygenSaturation')}
            icon="🫁"
            color={Colors.oxygen}
            style={styles.metricCard}
          />
          <MetricCard
            label={t('metrics.glucose')}
            value={metrics.glucose}
            unit={t('metrics.units.glucose')}
            icon="🩸"
            color={Colors.glucose}
            style={styles.metricCard}
          />
          <MetricCard
            label={t('metrics.bodyWeight')}
            value={metrics.bodyWeight}
            unit={t('metrics.units.bodyWeight')}
            icon="⚖️"
            color={Colors.weight}
            style={styles.metricCard}
          />
          <MetricCard
            label={t('metrics.sleepDuration')}
            value={metrics.sleepDuration}
            unit={t('metrics.units.sleepDuration')}
            icon="😴"
            color={Colors.sleep}
            style={styles.metricCard}
          />
        </View>

        {/* Sync Control */}
        <GlassCard style={styles.syncCard}>
          <Text style={[styles.syncTitle, isRTL && styles.rtlText]}>
            {t('sync.title')}
          </Text>
          <Text style={[styles.syncSubtitle, isRTL && styles.rtlText]}>
            {t('sync.subtitle')}
          </Text>
          {lastSyncAt && (
            <Text style={[styles.lastSync, isRTL && styles.rtlText]}>
              {t('dashboard.lastSync')}: {new Date(lastSyncAt).toLocaleTimeString()}
            </Text>
          )}
          <SyncButton status={status} onPress={handleSync} />
        </GlassCard>

        {/* FHIR Pipeline info */}
        <GlassCard style={styles.pipelineCard}>
          <Text style={[styles.pipelineTitle, isRTL && styles.rtlText]}>
            🔗 FHIR R4 Pipeline
          </Text>
          <Text style={[styles.pipelineStep, isRTL && styles.rtlText]}>
            📱 Device → 🔐 Encrypted → 🌐 Landing API → 🏥 FHIR Bundle → 🇸🇦 NPHIES
          </Text>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.gradientStart,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.gradientStart,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    // In production: replace with expo-linear-gradient
    // LinearGradient colors: [Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  rtl: {
    direction: 'rtl',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  greeting: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.md,
  },
  section: {
    flexDirection: 'row',
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
  },
  statusCard: {
    gap: Spacing.xs,
  },
  successCard: {
    borderColor: `${Colors.success}44`,
    backgroundColor: `${Colors.success}11`,
  },
  errorCard: {
    borderColor: `${Colors.error}44`,
    backgroundColor: `${Colors.error}11`,
  },
  statusText: {
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.md,
  },
  statusMeta: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
  },
  syncCard: {
    gap: Spacing.md,
  },
  syncTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  syncSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  lastSync: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  pipelineCard: {
    gap: Spacing.sm,
  },
  pipelineTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  pipelineStep: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  rtlText: {
    textAlign: 'right',
  },
});
