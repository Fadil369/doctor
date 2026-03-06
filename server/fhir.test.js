/**
 * FHIR R4 Normalization Tests
 * Validates the server/fhir.js module:
 * - LOINC code mapping
 * - Observation resource structure
 * - Bundle creation
 * - Payload normalization
 * - Audit event creation
 * - Input validation
 */

'use strict';

const {
  LOINC_CODES,
  buildObservation,
  buildBundle,
  normalizeHealthPayload,
  createAuditEvent,
  generateFhirId,
} = require('../server/fhir');

// ---------------------------------------------------------------------------
// generateFhirId
// ---------------------------------------------------------------------------
describe('generateFhirId', () => {
  test('returns a non-empty string', () => {
    const id = generateFhirId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  test('returns unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateFhirId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// LOINC_CODES
// ---------------------------------------------------------------------------
describe('LOINC_CODES', () => {
  const expectedKeys = [
    'steps', 'heartRate', 'glucose', 'systolic', 'diastolic',
    'oxygenSat', 'bodyWeight', 'bodyTemp', 'sleepDuration', 'hrv',
  ];

  test.each(expectedKeys)('has entry for %s', (key) => {
    expect(LOINC_CODES[key]).toBeDefined();
    expect(LOINC_CODES[key].code).toMatch(/^\d{4,8}-\d$/);
    expect(typeof LOINC_CODES[key].display).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// buildObservation
// ---------------------------------------------------------------------------
describe('buildObservation', () => {
  const base = {
    patientId: 'patient-001',
    metricType: 'steps',
    value: 8540,
    effectiveDateTime: '2024-01-15T08:00:00Z',
    deviceSource: 'HealthConnect',
  };

  test('returns a valid FHIR R4 Observation resource', () => {
    const obs = buildObservation(base);
    expect(obs.resourceType).toBe('Observation');
    expect(obs.status).toBe('final');
    expect(obs.id).toBeTruthy();
  });

  test('sets the correct LOINC code for steps', () => {
    const obs = buildObservation(base);
    expect(obs.code.coding[0].system).toBe('http://loinc.org');
    expect(obs.code.coding[0].code).toBe(LOINC_CODES.steps.code);
  });

  test('references the correct patient', () => {
    const obs = buildObservation(base);
    expect(obs.subject.reference).toBe('Patient/patient-001');
  });

  test('sets valueQuantity correctly', () => {
    const obs = buildObservation(base);
    expect(obs.valueQuantity.value).toBe(8540);
    expect(obs.valueQuantity.system).toBe('http://unitsofmeasure.org');
  });

  test('includes device source when provided', () => {
    const obs = buildObservation(base);
    expect(obs.device.display).toBe('HealthConnect');
  });

  test('device is undefined when deviceSource omitted', () => {
    const obs = buildObservation({ ...base, deviceSource: undefined });
    expect(obs.device).toBeUndefined();
  });

  test('includes vital-signs category', () => {
    const obs = buildObservation(base);
    expect(obs.category[0].coding[0].code).toBe('vital-signs');
  });

  test('includes restricted security label', () => {
    const obs = buildObservation(base);
    expect(obs.meta.security[0].code).toBe('R');
  });

  test('throws for unknown metric type', () => {
    expect(() => buildObservation({ ...base, metricType: 'unknown' })).toThrow();
  });

  test.each(['heartRate', 'glucose', 'systolic', 'diastolic', 'oxygenSat', 'bodyWeight', 'bodyTemp', 'sleepDuration', 'hrv'])(
    'accepts metricType=%s without throwing',
    (mt) => {
      expect(() => buildObservation({ ...base, metricType: mt })).not.toThrow();
    }
  );
});

// ---------------------------------------------------------------------------
// buildBundle
// ---------------------------------------------------------------------------
describe('buildBundle', () => {
  const obs1 = buildObservation({ patientId: 'p1', metricType: 'steps', value: 1000 });
  const obs2 = buildObservation({ patientId: 'p1', metricType: 'heartRate', value: 72 });

  test('returns a FHIR R4 Bundle resource', () => {
    const bundle = buildBundle([obs1, obs2]);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('transaction');
  });

  test('entry count matches observations count', () => {
    const bundle = buildBundle([obs1, obs2]);
    expect(bundle.entry.length).toBe(2);
  });

  test('each entry has fullUrl and request method POST', () => {
    const bundle = buildBundle([obs1]);
    expect(bundle.entry[0].fullUrl).toMatch(/^urn:uuid:/);
    expect(bundle.entry[0].request.method).toBe('POST');
    expect(bundle.entry[0].request.url).toBe('Observation');
  });
});

// ---------------------------------------------------------------------------
// normalizeHealthPayload
// ---------------------------------------------------------------------------
describe('normalizeHealthPayload', () => {
  const payload = {
    patientId: 'patient-123',
    deviceSource: 'HealthConnect',
    date: '2024-01-15T08:00:00Z',
    steps: 8540,
    heartRate: 72,
    glucose: 95,
    oxygenSaturation: 98,
  };

  test('throws when patientId is missing', () => {
    const { patientId: _p, ...rest } = payload;
    expect(() => normalizeHealthPayload(rest)).toThrow('patientId is required');
  });

  test('throws when no valid metrics are present', () => {
    expect(() => normalizeHealthPayload({ patientId: 'p1' })).toThrow('No valid health metrics');
  });

  test('returns a FHIR Bundle with correct observation count', () => {
    const bundle = normalizeHealthPayload(payload);
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry.length).toBe(4); // steps, heartRate, glucose, oxygenSaturation
  });

  test('maps steps to LOINC 41950-7', () => {
    const bundle = normalizeHealthPayload({ patientId: 'p1', steps: 100 });
    const obs = bundle.entry[0].resource;
    expect(obs.code.coding[0].code).toBe('41950-7');
  });

  test('maps heartRate to LOINC 8867-4', () => {
    const bundle = normalizeHealthPayload({ patientId: 'p1', heartRate: 72 });
    const obs = bundle.entry[0].resource;
    expect(obs.code.coding[0].code).toBe('8867-4');
  });

  test('skips null/undefined metric values', () => {
    const bundle = normalizeHealthPayload({ patientId: 'p1', steps: 100, heartRate: null, glucose: undefined });
    expect(bundle.entry.length).toBe(1); // only steps
  });

  test('includes all 10 metric types when all provided', () => {
    const full = {
      patientId: 'p1',
      steps: 1, heartRate: 1, glucose: 1, systolic: 1,
      diastolic: 1, oxygenSaturation: 1, bodyWeight: 1,
      bodyTemperature: 1, sleepDuration: 1, hrv: 1,
    };
    const bundle = normalizeHealthPayload(full);
    expect(bundle.entry.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// createAuditEvent
// ---------------------------------------------------------------------------
describe('createAuditEvent', () => {
  test('returns a FHIR AuditEvent resource', () => {
    const event = createAuditEvent('health-sync', 'patient-1', 'user-1', 'Observation');
    expect(event.resourceType).toBe('AuditEvent');
  });

  test('sets outcome correctly for success', () => {
    const event = createAuditEvent('health-sync', 'patient-1', 'user-1', 'Observation', 'success');
    expect(event.outcome).toBe('0');
    expect(event.outcomeDesc).toBe('success');
  });

  test('sets outcome correctly for failure', () => {
    const event = createAuditEvent('health-sync', 'patient-1', 'user-1', 'Observation', 'denied');
    expect(event.outcome).toBe('8');
    expect(event.outcomeDesc).toBe('denied');
  });

  test('records patient reference in entity', () => {
    const event = createAuditEvent('read', 'patient-42', 'user-1', 'Observation');
    expect(event.entity[0].what.reference).toBe('Observation/patient-42');
  });

  test('records user id in agent', () => {
    const event = createAuditEvent('read', 'p1', 'my-user', 'Observation');
    expect(event.agent[0].who.identifier.value).toBe('my-user');
  });

  test('recorded timestamp is valid ISO 8601', () => {
    const event = createAuditEvent('read', 'p1', 'u1', 'Observation');
    expect(() => new Date(event.recorded)).not.toThrow();
    expect(new Date(event.recorded).toISOString()).toBe(event.recorded);
  });
});
