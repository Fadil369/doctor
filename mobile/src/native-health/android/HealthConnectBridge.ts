/**
 * Native Health Bridge - Android (Google Health Connect)
 *
 * Abstraction layer for reading health data from Google Health Connect.
 * Wraps the Health Connect API via React Native bridging / Expo modules.
 *
 * Reference implementations:
 *   - android/android-health-connect-codelab
 *   - omkar231098/HealthConnect
 *   - vitoksmile/HealthKMP (KMP abstraction pattern)
 *
 * Permissions requested follow the principle of least privilege.
 * All data is encrypted on-device using Android Keystore before storage.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface HealthRecord {
  type: string;
  value: number;
  unit: string;
  startTime: string;
  endTime: string;
  deviceModel?: string;
}

export interface HealthPermission {
  recordType: string;
  accessType: 'READ' | 'WRITE';
}

export interface HealthConnectResult {
  granted: boolean;
  deniedPermissions: string[];
  records?: HealthRecord[];
}

// ---------------------------------------------------------------------------
// Health Connect record types (mirrors Health Connect API constants)
// ---------------------------------------------------------------------------
export const HealthConnectRecordTypes = {
  STEPS:              'Steps',
  HEART_RATE:         'HeartRate',
  BLOOD_GLUCOSE:      'BloodGlucose',
  BLOOD_PRESSURE:     'BloodPressure',
  OXYGEN_SATURATION:  'OxygenSaturation',
  BODY_WEIGHT:        'Weight',
  BODY_TEMPERATURE:   'BodyTemperature',
  SLEEP_SESSION:      'SleepSession',
  HEART_RATE_VARIABILITY: 'HeartRateVariabilityRmssd',
} as const;

// Required permissions for the BrainSAIT Health app
export const REQUIRED_PERMISSIONS: HealthPermission[] = [
  { recordType: HealthConnectRecordTypes.STEPS,              accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.HEART_RATE,         accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.BLOOD_GLUCOSE,      accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.BLOOD_PRESSURE,     accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.OXYGEN_SATURATION,  accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.BODY_WEIGHT,        accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.BODY_TEMPERATURE,   accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.SLEEP_SESSION,      accessType: 'READ' },
  { recordType: HealthConnectRecordTypes.HEART_RATE_VARIABILITY, accessType: 'READ' },
];

// ---------------------------------------------------------------------------
// Android Health Connect Bridge
// ---------------------------------------------------------------------------

/**
 * Check if Health Connect is available on this device.
 * Requires Android 14+ or Health Connect app installed on Android 9-13.
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    // In a real Expo native module, this would call:
    //   HealthConnect.getSdkStatus()
    // and check for SdkAvailabilityStatus.SDK_AVAILABLE
    //
    // For the scaffold, we detect availability by platform version.
    const apiLevel = parseInt(Platform.Version as string, 10);
    return apiLevel >= 26; // Android 8.0+ minimum for Health Connect
  } catch {
    return false;
  }
}

/**
 * Request permissions for all required health data types.
 * On Android, this triggers the Health Connect permission dialog.
 */
export async function requestHealthConnectPermissions(): Promise<HealthConnectResult> {
  if (Platform.OS !== 'android') {
    return { granted: false, deniedPermissions: ['android-only'] };
  }

  try {
    // Native module call (replace with actual expo-health-connect bindings):
    //   const result = await HealthConnect.requestPermission(REQUIRED_PERMISSIONS);
    //
    // The real implementation from the Google Codelab (android-health-connect-codelab)
    // uses registerForActivityResult with PermissionController.createRequestPermissionResultContract()
    //
    // This scaffold returns a mock successful grant for development.
    console.log('[HealthConnect] Requesting permissions:', REQUIRED_PERMISSIONS.map(p => p.recordType));
    return {
      granted: true,
      deniedPermissions: [],
    };
  } catch (error) {
    console.error('[HealthConnect] Permission request failed:', error);
    return { granted: false, deniedPermissions: REQUIRED_PERMISSIONS.map(p => p.recordType) };
  }
}

/**
 * Read health data for a specific date range.
 * Returns records aggregated per metric type.
 *
 * @param startTime - ISO 8601 start of range
 * @param endTime   - ISO 8601 end of range (defaults to now)
 */
export async function readHealthConnectData(
  startTime: string,
  endTime: string = new Date().toISOString()
): Promise<Record<string, number | undefined>> {
  if (Platform.OS !== 'android') {
    throw new Error('Health Connect is only available on Android');
  }

  try {
    // In a real implementation this would call the native module:
    //   const stepsRecords = await HealthConnect.readRecords('Steps', { timeRangeFilter: ... });
    //   const hrRecords   = await HealthConnect.readRecords('HeartRate', { ... });
    //   ...and aggregate the values.
    //
    // Reference: omkar231098/HealthConnect MainActivity.kt - readStepsData(), readHeartRateData()
    //
    // The scaffold returns plausible mock values for development.
    console.log(`[HealthConnect] Reading data from ${startTime} to ${endTime}`);

    return {
      steps:             8540,
      heartRate:         72,
      glucose:           95,
      systolic:          120,
      diastolic:         80,
      oxygenSaturation:  98,
      bodyWeight:        75.5,
      bodyTemperature:   36.6,
      sleepDuration:     7.5,
      hrv:               45,
    };
  } catch (error) {
    console.error('[HealthConnect] Read failed:', error);
    throw error;
  }
}

/**
 * Encrypt health data on-device before transmission or storage.
 * Uses Android Keystore via expo-crypto (AES-256-GCM).
 *
 * In production, the key is stored in the hardware-backed Android Keystore.
 * This mirrors the CryptoKit approach used on iOS.
 */
export async function encryptHealthData(data: object): Promise<string> {
  try {
    // Production implementation (replace this stub before shipping):
    //
    //   import * as Crypto from 'expo-crypto';
    //   const key = await Crypto.getRandomBytesAsync(32);   // AES-256 key
    //   const iv  = await Crypto.getRandomBytesAsync(12);   // GCM nonce
    //   // Perform AES-GCM-256 encryption via Android Keystore-backed key
    //   // and return base64(iv + ciphertext + authTag).
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
    console.warn('[HealthConnect] ⚠ STUB encryption active – replace with AES-GCM-256 before production');
    return encoded;
  } catch (error) {
    console.error('[HealthConnect] Encryption failed:', error);
    throw error;
  }
}
