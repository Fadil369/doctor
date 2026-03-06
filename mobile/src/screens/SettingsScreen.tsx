/**
 * Settings Screen - BrainSAIT Health App
 *
 * Allows switching between English (LTR) and Arabic (RTL),
 * viewing compliance info, and app metadata.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { ComplianceBadges } from '../components/ComplianceBadges';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const isRTL = isArabic;

  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={[styles.title, isRTL && styles.rtlText]}>
          {t('settings.title')}
        </Text>

        {/* Language Toggle */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionLabel, isRTL && styles.rtlText]}>
            {t('settings.language')}
          </Text>
          <View style={[styles.row, isRTL && styles.rtlRow]}>
            <View style={styles.langInfo}>
              <Text style={styles.langCurrent}>
                {isArabic ? '🇸🇦 العربية' : '🇬🇧 English'}
              </Text>
              <Text style={styles.langHint}>
                {isArabic ? 'Arabic (RTL)' : 'English (LTR)'}
              </Text>
            </View>
            <Switch
              value={isArabic}
              onValueChange={toggleLanguage}
              trackColor={{ false: Colors.glassBorder, true: Colors.accentTeal }}
              thumbColor={Colors.white}
            />
          </View>

          <View style={styles.langButtons}>
            <TouchableOpacity
              style={[styles.langButton, !isArabic && styles.langButtonActive]}
              onPress={() => i18n.changeLanguage('en')}
            >
              <Text style={[styles.langButtonText, !isArabic && styles.langButtonTextActive]}>
                English
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langButton, isArabic && styles.langButtonActive]}
              onPress={() => i18n.changeLanguage('ar')}
            >
              <Text style={[styles.langButtonText, isArabic && styles.langButtonTextActive]}>
                العربية
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Privacy & Compliance */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionLabel, isRTL && styles.rtlText]}>
            {t('settings.privacy')}
          </Text>
          <ComplianceBadges />
          <Text style={[styles.complianceText, isRTL && styles.rtlText]}>
            {t('compliance.hipaa')} · {t('compliance.nphies')}
          </Text>
          <Text style={[styles.complianceDetail, isRTL && styles.rtlText]}>
            All health data is encrypted on-device using AES-256-GCM before
            transmission. Audit logs are maintained for every data access event
            per HIPAA §164.312(b) requirements.
          </Text>
        </GlassCard>

        {/* FHIR Info */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionLabel, isRTL && styles.rtlText]}>
            FHIR R4 Integration
          </Text>
          <Text style={[styles.complianceDetail, isRTL && styles.rtlText]}>
            Health data is normalized to FHIR R4 Observation resources with
            standard LOINC codes. Compatible with NPHIES (National Platform for
            Health Information Exchange in Saudi Arabia).
          </Text>
          <View style={styles.loincList}>
            {[
              ['Steps', '41950-7'],
              ['Heart Rate', '8867-4'],
              ['Blood Glucose', '2339-0'],
              ['SpO₂', '59408-5'],
              ['Body Weight', '29463-7'],
              ['Sleep', '93832-4'],
              ['HRV', '80404-7'],
            ].map(([label, code]) => (
              <View key={code} style={styles.loincRow}>
                <Text style={styles.loincLabel}>{label}</Text>
                <Text style={styles.loincCode}>{code}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        {/* About */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionLabel, isRTL && styles.rtlText]}>
            {t('settings.about')}
          </Text>
          <Text style={styles.aboutText}>BrainSAIT Health Platform</Text>
          <Text style={styles.aboutMeta}>{t('settings.version')}: 1.0.0</Text>
          <Text style={styles.aboutMeta}>© 2024 BrainSAIT · Dr. Mohamed El Fadil</Text>
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 80,
  },
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  card: {
    gap: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
  },
  langInfo: {
    gap: 2,
  },
  langCurrent: {
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.medium,
  },
  langHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  langButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  langButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.glassSurface,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
  },
  langButtonActive: {
    backgroundColor: Colors.accentTeal,
    borderColor: Colors.accentTeal,
  },
  langButtonText: {
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    fontSize: Typography.fontSize.sm,
  },
  langButtonTextActive: {
    color: Colors.white,
  },
  complianceText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.accentTeal,
    fontWeight: Typography.fontWeight.medium,
  },
  complianceDetail: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  loincList: {
    gap: Spacing.xs,
  },
  loincRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  loincLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  loincCode: {
    fontSize: Typography.fontSize.sm,
    color: Colors.accentTeal,
    fontFamily: 'monospace',
  },
  aboutText: {
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.semibold,
  },
  aboutMeta: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
});
