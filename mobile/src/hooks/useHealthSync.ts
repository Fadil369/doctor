/**
 * useHealthSync - React hook for health data sync workflow
 *
 * Orchestrates:
 *   1. Check platform health API availability
 *   2. Request permissions
 *   3. Read health data for today
 *   4. Encrypt on-device
 *   5. Sync to FHIR server
 *   6. Return sync result
 */

import { useState, useCallback } from 'react';
import { isHealthDataAvailable, requestHealthPermissions, readHealthData } from '../native-health';
import { syncHealthData, type SyncResponse } from '../services/fhirService';

export type SyncStatus = 'idle' | 'checking' | 'requesting-permissions' | 'reading' | 'syncing' | 'success' | 'error';

export interface HealthSyncState {
  status: SyncStatus;
  result: SyncResponse | null;
  error: string | null;
  lastSyncAt: string | null;
}

export interface UseHealthSyncOptions {
  patientId: string;
  userId?: string;
  role?: 'patient' | 'clinician' | 'admin';
}

export function useHealthSync({ patientId, userId, role }: UseHealthSyncOptions) {
  const [state, setState] = useState<HealthSyncState>({
    status: 'idle',
    result: null,
    error: null,
    lastSyncAt: null,
  });

  const sync = useCallback(async (dateRange?: { start: string; end: string }) => {
    setState(s => ({ ...s, status: 'checking', error: null, result: null }));

    try {
      // 1. Check availability
      const available = await isHealthDataAvailable();
      if (!available) {
        setState(s => ({ ...s, status: 'error', error: 'Health API is not available on this device.' }));
        return;
      }

      // 2. Request permissions
      setState(s => ({ ...s, status: 'requesting-permissions' }));
      const { granted, deniedPermissions } = await requestHealthPermissions();
      if (!granted) {
        setState(s => ({
          ...s,
          status: 'error',
          error: `Permissions denied: ${deniedPermissions.join(', ')}`,
        }));
        return;
      }

      // 3. Read health data
      setState(s => ({ ...s, status: 'reading' }));
      const today = new Date();
      const startDate = dateRange?.start ?? new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endDate   = dateRange?.end   ?? new Date().toISOString();
      const healthData = await readHealthData(startDate, endDate);

      // 4 + 5. Encrypt and sync to FHIR server
      setState(s => ({ ...s, status: 'syncing' }));
      const result = await syncHealthData({ patientId, userId, role, healthData });

      if (result.success) {
        setState({
          status: 'success',
          result,
          error: null,
          lastSyncAt: new Date().toISOString(),
        });
      } else {
        setState(s => ({ ...s, status: 'error', error: result.message, result }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(s => ({ ...s, status: 'error', error: message }));
    }
  }, [patientId, userId, role]);

  const reset = useCallback(() => {
    setState({ status: 'idle', result: null, error: null, lastSyncAt: null });
  }, []);

  return { ...state, sync, reset };
}
