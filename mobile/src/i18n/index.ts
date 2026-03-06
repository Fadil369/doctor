/**
 * Internationalization setup - BrainSAIT Health App
 * Bilingual: English (LTR) + Arabic (RTL)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  translation: {
    app: {
      name: 'BrainSAIT Health',
      tagline: 'Your intelligent health companion',
    },
    nav: {
      dashboard: 'Dashboard',
      metrics: 'Health Metrics',
      sync: 'Sync Data',
      profile: 'Profile',
      settings: 'Settings',
    },
    dashboard: {
      title: 'Health Dashboard',
      greeting: 'Good morning',
      lastSync: 'Last synced',
      syncNow: 'Sync Now',
      viewAll: 'View All',
      todaySummary: "Today's Summary",
    },
    metrics: {
      steps: 'Steps',
      heartRate: 'Heart Rate',
      glucose: 'Blood Glucose',
      systolic: 'Systolic BP',
      diastolic: 'Diastolic BP',
      oxygenSaturation: 'SpO₂',
      bodyWeight: 'Body Weight',
      bodyTemperature: 'Temperature',
      sleepDuration: 'Sleep',
      hrv: 'HRV',
      units: {
        steps: 'steps',
        heartRate: 'bpm',
        glucose: 'mg/dL',
        bloodPressure: 'mmHg',
        oxygenSaturation: '%',
        bodyWeight: 'kg',
        bodyTemperature: '°C',
        sleepDuration: 'hrs',
        hrv: 'ms',
      },
    },
    sync: {
      title: 'Sync Health Data',
      subtitle: 'Securely sync your health data with the BrainSAIT platform',
      selectSource: 'Select Data Source',
      healthConnect: 'Google Health Connect',
      healthKit: 'Apple HealthKit',
      syncButton: 'Sync to FHIR Server',
      syncing: 'Syncing…',
      success: 'Data synced successfully',
      error: 'Sync failed. Please try again.',
      permissions: 'Grant Permissions',
      permissionsRequired: 'Health data permissions are required to sync your data.',
    },
    fhir: {
      title: 'FHIR R4 Data',
      bundle: 'FHIR Bundle',
      observation: 'Observation',
      loincCode: 'LOINC Code',
      patientId: 'Patient ID',
      status: 'Status',
      effectiveDate: 'Effective Date',
      deviceSource: 'Device Source',
    },
    compliance: {
      hipaa: 'HIPAA Compliant',
      nphies: 'NPHIES Ready',
      encrypted: 'Data Encrypted',
      auditLogged: 'Audit Logged',
    },
    errors: {
      generic: 'Something went wrong. Please try again.',
      network: 'Network error. Check your connection.',
      permission: 'Permission denied.',
      invalidData: 'Invalid health data received.',
    },
    settings: {
      title: 'Settings',
      language: 'Language',
      english: 'English',
      arabic: 'العربية',
      privacy: 'Privacy & Security',
      about: 'About',
      version: 'Version',
      logout: 'Sign Out',
    },
  },
};

const ar = {
  translation: {
    app: {
      name: 'BrainSAIT Health',
      tagline: 'رفيقك الذكي للصحة',
    },
    nav: {
      dashboard: 'لوحة المعلومات',
      metrics: 'المقاييس الصحية',
      sync: 'مزامنة البيانات',
      profile: 'الملف الشخصي',
      settings: 'الإعدادات',
    },
    dashboard: {
      title: 'لوحة الصحة',
      greeting: 'صباح الخير',
      lastSync: 'آخر مزامنة',
      syncNow: 'مزامنة الآن',
      viewAll: 'عرض الكل',
      todaySummary: 'ملخص اليوم',
    },
    metrics: {
      steps: 'خطوات',
      heartRate: 'معدل ضربات القلب',
      glucose: 'سكر الدم',
      systolic: 'الضغط الانقباضي',
      diastolic: 'الضغط الانبساطي',
      oxygenSaturation: 'تشبع الأكسجين',
      bodyWeight: 'وزن الجسم',
      bodyTemperature: 'درجة الحرارة',
      sleepDuration: 'النوم',
      hrv: 'تقلب معدل ضربات القلب',
      units: {
        steps: 'خطوة',
        heartRate: 'نبضة/دقيقة',
        glucose: 'ملغ/دل',
        bloodPressure: 'ملم زئبق',
        oxygenSaturation: '٪',
        bodyWeight: 'كغ',
        bodyTemperature: '°م',
        sleepDuration: 'ساعة',
        hrv: 'ملث',
      },
    },
    sync: {
      title: 'مزامنة البيانات الصحية',
      subtitle: 'مزامنة بياناتك الصحية بأمان مع منصة BrainSAIT',
      selectSource: 'اختر مصدر البيانات',
      healthConnect: 'Google Health Connect',
      healthKit: 'Apple HealthKit',
      syncButton: 'مزامنة مع خادم FHIR',
      syncing: '…جارٍ المزامنة',
      success: 'تمت مزامنة البيانات بنجاح',
      error: 'فشلت المزامنة. يرجى المحاولة مرة أخرى.',
      permissions: 'منح الأذونات',
      permissionsRequired: 'يلزم الحصول على أذونات بيانات الصحة لمزامنة بياناتك.',
    },
    fhir: {
      title: 'بيانات FHIR R4',
      bundle: 'حزمة FHIR',
      observation: 'ملاحظة',
      loincCode: 'رمز LOINC',
      patientId: 'معرّف المريض',
      status: 'الحالة',
      effectiveDate: 'تاريخ السريان',
      deviceSource: 'مصدر الجهاز',
    },
    compliance: {
      hipaa: 'متوافق مع HIPAA',
      nphies: 'جاهز لـ NPHIES',
      encrypted: 'البيانات مشفرة',
      auditLogged: 'سجل المراجعة نشط',
    },
    errors: {
      generic: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
      network: 'خطأ في الشبكة. تحقق من اتصالك.',
      permission: 'تم رفض الإذن.',
      invalidData: 'تم تلقي بيانات صحية غير صالحة.',
    },
    settings: {
      title: 'الإعدادات',
      language: 'اللغة',
      english: 'English',
      arabic: 'العربية',
      privacy: 'الخصوصية والأمان',
      about: 'حول',
      version: 'الإصدار',
      logout: 'تسجيل الخروج',
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources: { en, ar },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
  });

export default i18n;

/** Returns the writing direction for a given language */
export function getTextDirection(lng: string): 'ltr' | 'rtl' {
  return lng === 'ar' ? 'rtl' : 'ltr';
}
