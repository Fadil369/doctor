/**
 * Unified Health Bridge - Platform-agnostic facade
 *
 * This module provides a single API for reading health data regardless
 * of the underlying platform (iOS HealthKit / Android Health Connect).
 *
 * Architecture inspired by vitoksmile/HealthKMP's Kotlin Multiplatform
 * abstraction pattern, adapted for React Native / Expo.
 */

import { Platform } from 'react-native';
import {
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
  readHealthConnectData,
  encryptHealthData as encryptAndroid,
} from './android/HealthConnectBridge';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  readHealthKitData,
  encryptHealthData as encryptIOS,
} from './ios/HealthKitBridge';

// ---------------------------------------------------------------------------
// Unified result type
// ---------------------------------------------------------------------------

export interface UnifiedHealthData {
  deviceSource: 'HealthConnect' | 'HealthKit' | 'Unknown';
  steps?: number;
  heartRate?: number;
  glucose?: number;
  systolic?: number;
  diastolic?: number;
  oxygenSaturation?: number;
  bodyWeight?: number;
  bodyTemperature?: number;
  sleepDuration?: number;
  hrv?: number;
  readAt: string;
}

// ---------------------------------------------------------------------------
// Platform detection helpers
// ---------------------------------------------------------------------------

export async function isHealthDataAvailable(): Promise<boolean> {
  if (Platform.OS === 'android') return isHealthConnectAvailable();
  if (Platform.OS === 'ios')     return isHealthKitAvailable();
  return false;
}

export async function requestHealthPermissions(): Promise<{ granted: boolean; deniedPermissions: string[] }> {
  if (Platform.OS === 'android') return requestHealthConnectPermissions();
  if (Platform.OS === 'ios')     return requestHealthKitPermissions();
  return { granted: false, deniedPermissions: ['unsupported-platform'] };
}

// ---------------------------------------------------------------------------
// Unified read
// ---------------------------------------------------------------------------

/**
 * Read health data for a given date range on the current platform.
 *
 * @param startDate - ISO 8601 start
 * @param endDate   - ISO 8601 end (defaults to now)
 */
export async function readHealthData(
  startDate: string,
  endDate?: string
): Promise<UnifiedHealthData> {
  const source = Platform.OS === 'android' ? 'HealthConnect'
               : Platform.OS === 'ios'     ? 'HealthKit'
               : 'Unknown';

  let rawData: Record<string, number | undefined> = {};

  if (Platform.OS === 'android') {
    rawData = await readHealthConnectData(startDate, endDate);
  } else if (Platform.OS === 'ios') {
    rawData = await readHealthKitData(startDate, endDate);
  } else {
    throw new Error('Health data reading is not supported on this platform');
  }

  return {
    deviceSource: source,
    ...rawData,
    readAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Unified encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt health data on-device using the platform's secure enclave.
 * iOS → CryptoKit / Keychain
 * Android → Android Keystore
 */
export async function encryptHealthData(data: object): Promise<string> {
  if (Platform.OS === 'android') return encryptAndroid(data);
  if (Platform.OS === 'ios')     return encryptIOS(data);
  throw new Error('Encryption is not supported on this platform');
}
