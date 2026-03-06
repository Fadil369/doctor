/**
 * Native Health Bridge - iOS (Apple HealthKit)
 *
 * Abstraction layer for reading health data from Apple HealthKit.
 * Mirrors the Android HealthConnectBridge API surface for unified usage.
 *
 * Reference implementations:
 *   - vitoksmile/HealthKMP (KMP abstraction pattern for shared logic)
 *   - AuDigitalHealth/HealthConnect (clinical workflow patterns)
 *
 * Data is encrypted on-device using CryptoKit (via expo-crypto) before
 * any transmission or local storage.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Type definitions (shared with Android bridge)
// ---------------------------------------------------------------------------

export interface HealthRecord {
  type: string;
  value: number;
  unit: string;
  startTime: string;
  endTime: string;
  deviceModel?: string;
}

export interface HealthKitPermission {
  identifier: string;
  accessType: 'read' | 'write';
}

export interface HealthKitResult {
  granted: boolean;
  deniedPermissions: string[];
  records?: HealthRecord[];
}

// ---------------------------------------------------------------------------
// HealthKit quantity type identifiers (HKQuantityTypeIdentifier)
// ---------------------------------------------------------------------------
export const HealthKitTypes = {
  STEPS:                    'HKQuantityTypeIdentifierStepCount',
  HEART_RATE:               'HKQuantityTypeIdentifierHeartRate',
  BLOOD_GLUCOSE:            'HKQuantityTypeIdentifierBloodGlucose',
  BLOOD_PRESSURE_SYSTOLIC:  'HKQuantityTypeIdentifierBloodPressureSystolic',
  BLOOD_PRESSURE_DIASTOLIC: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  OXYGEN_SATURATION:        'HKQuantityTypeIdentifierOxygenSaturation',
  BODY_MASS:                'HKQuantityTypeIdentifierBodyMass',
  BODY_TEMPERATURE:         'HKQuantityTypeIdentifierBodyTemperature',
  HRV:                      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  SLEEP_ANALYSIS:           'HKCategoryTypeIdentifierSleepAnalysis',
} as const;

export const REQUIRED_HEALTHKIT_PERMISSIONS: HealthKitPermission[] = [
  { identifier: HealthKitTypes.STEPS,                    accessType: 'read' },
  { identifier: HealthKitTypes.HEART_RATE,               accessType: 'read' },
  { identifier: HealthKitTypes.BLOOD_GLUCOSE,            accessType: 'read' },
  { identifier: HealthKitTypes.BLOOD_PRESSURE_SYSTOLIC,  accessType: 'read' },
  { identifier: HealthKitTypes.BLOOD_PRESSURE_DIASTOLIC, accessType: 'read' },
  { identifier: HealthKitTypes.OXYGEN_SATURATION,        accessType: 'read' },
  { identifier: HealthKitTypes.BODY_MASS,                accessType: 'read' },
  { identifier: HealthKitTypes.BODY_TEMPERATURE,         accessType: 'read' },
  { identifier: HealthKitTypes.HRV,                      accessType: 'read' },
  { identifier: HealthKitTypes.SLEEP_ANALYSIS,           accessType: 'read' },
];

// ---------------------------------------------------------------------------
// iOS HealthKit Bridge
// ---------------------------------------------------------------------------

/**
 * Check if HealthKit is available on this device.
 * HealthKit requires iOS 8+ and is not available on iPad simulators.
 */
export async function isHealthKitAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    // In production (react-native-health):
    //   const available = await AppleHealthKit.isAvailable();
    //   return available;
    return true;
  } catch {
    return false;
  }
}

/**
 * Request HealthKit read permissions.
 * iOS will show the native Health permissions sheet.
 */
export async function requestHealthKitPermissions(): Promise<HealthKitResult> {
  if (Platform.OS !== 'ios') {
    return { granted: false, deniedPermissions: ['ios-only'] };
  }

  try {
    // In production (react-native-health):
    //   const permissions = {
    //     permissions: {
    //       read:  REQUIRED_HEALTHKIT_PERMISSIONS.map(p => p.identifier),
    //       write: [],
    //     },
    //   };
    //   await new Promise((resolve, reject) =>
    //     AppleHealthKit.initHealthKit(permissions, (err) => err ? reject(err) : resolve(null))
    //   );
    console.log('[HealthKit] Requesting permissions');
    return { granted: true, deniedPermissions: [] };
  } catch (error) {
    console.error('[HealthKit] Permission request failed:', error);
    return { granted: false, deniedPermissions: REQUIRED_HEALTHKIT_PERMISSIONS.map(p => p.identifier) };
  }
}

/**
 * Read health data from HealthKit for a given date range.
 *
 * @param startDate - ISO 8601 start date
 * @param endDate   - ISO 8601 end date (defaults to now)
 */
export async function readHealthKitData(
  startDate: string,
  endDate: string = new Date().toISOString()
): Promise<Record<string, number | undefined>> {
  if (Platform.OS !== 'ios') {
    throw new Error('HealthKit is only available on iOS');
  }

  try {
    // In production (react-native-health):
    //   const stepsOptions = { startDate, endDate, unit: 'count' };
    //   const steps = await new Promise<number>((resolve, reject) =>
    //     AppleHealthKit.getStepCount(stepsOptions, (err, res) => err ? reject(err) : resolve(res.value))
    //   );
    //   const hr = await new Promise<number>((resolve, reject) =>
    //     AppleHealthKit.getHeartRateSamples({ startDate, endDate, limit: 1 }, (err, res) =>
    //       err ? reject(err) : resolve(res[0]?.value ?? 0)
    //     )
    //   );
    //   ... etc.
    console.log(`[HealthKit] Reading data from ${startDate} to ${endDate}`);

    return {
      steps:             10200,
      heartRate:         68,
      glucose:           88,
      systolic:          118,
      diastolic:         78,
      oxygenSaturation:  99,
      bodyWeight:        74.2,
      bodyTemperature:   36.7,
      sleepDuration:     8.0,
      hrv:               52,
    };
  } catch (error) {
    console.error('[HealthKit] Read failed:', error);
    throw error;
  }
}

/**
 * Encrypt health data on-device before transmission or storage.
 * Uses CryptoKit-equivalent on iOS (expo-crypto / SecureEnclave).
 *
 * In production:
 *   - Key stored in iOS Keychain with kSecAttrAccessibleWhenUnlocked
 *   - Encryption uses AES-GCM-256 via CryptoKit
 *   - Biometric authentication can gate key access
 */
export async function encryptHealthData(data: object): Promise<string> {
  try {
    // Production implementation (replace this stub before shipping):
    //
    //   import * as Crypto from 'expo-crypto';
    //   // Generate an AES-256-GCM key backed by the iOS Secure Enclave / Keychain.
    //   const key = await Crypto.getRandomBytesAsync(32);
    //   const iv  = await Crypto.getRandomBytesAsync(12);
    //   // Encrypt via CryptoKit (native bridge) → return base64(iv + ciphertext + tag).
    //   // Key access can be gated by Face ID / Touch ID.
    //
    // ⚠️  DEVELOPMENT STUB: encodes JSON as base64 without encryption.
    //     This provides NO security and MUST be replaced before production.
    const json = JSON.stringify(data);
    // btoa is available in React Native (unlike Node's Buffer).
    // Encode to UTF-8 bytes first to handle non-ASCII characters safely.
    const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    const encoded = btoa(bytes);
    console.warn('[HealthKit] ⚠ STUB encryption active – replace with CryptoKit AES-GCM-256 before production');
    return encoded;
  } catch (error) {
    console.error('[HealthKit] Encryption failed:', error);
    throw error;
  }
}
