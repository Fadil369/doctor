/**
 * FHIR R4 Integration Module - BrainSAIT Health Platform
 * Transforms raw device health data into FHIR R4 Observation resources
 * NPHIES/HIPAA compliant with LOINC/SNOMED CT coding
 */

'use strict';

const crypto = require('crypto');

// LOINC codes for health metrics
const LOINC_CODES = {
  steps:        { code: '41950-7', display: 'Number of steps in 24 hour Measured' },
  heartRate:    { code: '8867-4',  display: 'Heart rate' },
  glucose:      { code: '2339-0',  display: 'Glucose [Mass/volume] in Blood' },
  systolic:     { code: '8480-6',  display: 'Systolic blood pressure' },
  diastolic:    { code: '8462-4',  display: 'Diastolic blood pressure' },
  oxygenSat:    { code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' },
  bodyWeight:   { code: '29463-7', display: 'Body weight' },
  bodyTemp:     { code: '8310-5',  display: 'Body temperature' },
  sleepDuration:{ code: '93832-4', display: 'Sleep duration' },
  hrv:          { code: '80404-7', display: 'R-R interval.standard deviation (Heart rate variability)' },
};

// UCUM units for health metrics
const UCUM_UNITS = {
  steps:         { value: '/d',    display: '/d' },
  heartRate:     { value: '/min',  display: '/min' },
  glucose:       { value: 'mg/dL', display: 'mg/dL' },
  bloodPressure: { value: 'mm[Hg]', display: 'mmHg' },
  oxygenSat:     { value: '%',     display: '%' },
  bodyWeight:    { value: 'kg',    display: 'kg' },
  bodyTemp:      { value: 'Cel',   display: '°C' },
  sleepDuration: { value: 'h',     display: 'h' },
  hrv:           { value: 'ms',    display: 'ms' },
};

/**
 * Generate a FHIR-compliant UUID-like identifier
 */
function generateFhirId() {
  const randomSuffix = crypto.randomBytes(5).toString('hex'); // 10 hex chars ≈ previous 7 base36 chars
  return 'obs-' + Date.now().toString(36) + '-' + randomSuffix;
}

/**
 * Build a FHIR R4 Observation resource for a single vital
 * @param {object} opts
 * @param {string} opts.patientId
 * @param {string} opts.metricType  - key in LOINC_CODES
 * @param {number} opts.value
 * @param {string} [opts.effectiveDateTime] - ISO 8601
 * @param {string} [opts.deviceSource]      - 'HealthKit' | 'HealthConnect'
 * @param {string} [opts.status]            - defaults to 'final'
 */
function buildObservation({ patientId, metricType, value, effectiveDateTime, deviceSource, status = 'final' }) {
  const loinc = LOINC_CODES[metricType];
  const unit  = UCUM_UNITS[metricType] || {};

  if (!loinc) {
    throw new Error(`Unknown metric type: ${metricType}`);
  }

  return {
    resourceType: 'Observation',
    id: generateFhirId(),
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
      security: [
        { system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', code: 'R', display: 'Restricted' }
      ]
    },
    status,
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: loinc.code,
          display: loinc.display
        }
      ],
      text: loinc.display
    },
    subject: {
      reference: `Patient/${patientId}`
    },
    effectiveDateTime: effectiveDateTime || new Date().toISOString(),
    valueQuantity: {
      value,
      unit: unit.display || '',
      system: 'http://unitsofmeasure.org',
      code: unit.value || ''
    },
    device: deviceSource
      ? { display: deviceSource }
      : undefined
  };
}

/**
 * Build a FHIR R4 Bundle (type: transaction) from multiple observations
 * @param {Array} observations - Array of FHIR Observation resources
 */
function buildBundle(observations) {
  return {
    resourceType: 'Bundle',
    id: generateFhirId(),
    meta: {
      lastUpdated: new Date().toISOString()
    },
    type: 'transaction',
    timestamp: new Date().toISOString(),
    entry: observations.map(obs => ({
      fullUrl: `urn:uuid:${obs.id}`,
      resource: obs,
      request: {
        method: 'POST',
        url: 'Observation'
      }
    }))
  };
}

/**
 * Normalize raw device health payload into a FHIR R4 Bundle
 * Accepts the JSON format produced by HealthKit / Health Connect bridges
 *
 * @param {object} payload
 * @param {string} payload.patientId
 * @param {string} [payload.deviceSource]  - 'HealthKit' | 'HealthConnect'
 * @param {string} [payload.date]          - ISO 8601 date
 * @param {number} [payload.steps]
 * @param {number} [payload.heartRate]
 * @param {number} [payload.glucose]
 * @param {number} [payload.systolic]
 * @param {number} [payload.diastolic]
 * @param {number} [payload.oxygenSaturation]
 * @param {number} [payload.bodyWeight]
 * @param {number} [payload.bodyTemperature]
 * @param {number} [payload.sleepDuration]
 * @param {number} [payload.hrv]
 */
function normalizeHealthPayload(payload) {
  const { patientId, deviceSource, date } = payload;

  if (!patientId) {
    throw new Error('patientId is required');
  }

  const observations = [];
  const metricMap = {
    steps:            'steps',
    heartRate:        'heartRate',
    glucose:          'glucose',
    systolic:         'systolic',
    diastolic:        'diastolic',
    oxygenSaturation: 'oxygenSat',
    bodyWeight:       'bodyWeight',
    bodyTemperature:  'bodyTemp',
    sleepDuration:    'sleepDuration',
    hrv:              'hrv',
  };

  for (const [payloadKey, metricType] of Object.entries(metricMap)) {
    if (payload[payloadKey] !== undefined && payload[payloadKey] !== null) {
      observations.push(
        buildObservation({
          patientId,
          metricType,
          value: payload[payloadKey],
          effectiveDateTime: date,
          deviceSource,
        })
      );
    }
  }

  if (observations.length === 0) {
    throw new Error('No valid health metrics found in payload');
  }

  return buildBundle(observations);
}

/**
 * Audit log entry creator (HIPAA-compliant)
 * In production, this would write to a secure, immutable audit store
 */
function createAuditEvent(action, patientId, userId, resourceType, outcome = 'success') {
  return {
    resourceType: 'AuditEvent',
    id: generateFhirId(),
    recorded: new Date().toISOString(),
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: action
    },
    outcome: outcome === 'success' ? '0' : '8',
    outcomeDesc: outcome,
    agent: [
      {
        who: { identifier: { value: userId || 'system' } },
        requestor: true,
        network: { type: '1' }
      }
    ],
    source: {
      observer: { display: 'BrainSAIT-Health-Platform' }
    },
    entity: [
      {
        what: { reference: `${resourceType}/${patientId}` },
        type: { code: '1' }
      }
    ]
  };
}

module.exports = {
  LOINC_CODES,
  UCUM_UNITS,
  buildObservation,
  buildBundle,
  normalizeHealthPayload,
  createAuditEvent,
  generateFhirId,
};
