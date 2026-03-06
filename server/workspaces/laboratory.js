/**
 * Laboratory Workspace Module - BrainSAIT Health Platform
 *
 * Covers the full laboratory workflow:
 *   Order → Specimen collection → Analysis → Results → Critical value alerts
 *
 * FHIR R4 aligned (ServiceRequest, Specimen, Observation, DiagnosticReport)
 * Supports LOINC-coded tests with reference ranges.
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: LIS integration)
// ---------------------------------------------------------------------------
const labOrders = new Map();
const specimens = new Map();
const labResults = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Lab test catalog (LOINC-coded subset)
// ---------------------------------------------------------------------------
const LAB_TESTS = {
  'CBC':        { code: '58410-2', name: 'CBC panel', category: 'hematology', unit: 'panel' },
  'BMP':        { code: '51990-0', name: 'Basic metabolic panel', category: 'chemistry', unit: 'panel' },
  'LFT':        { code: '24325-3', name: 'Liver function tests', category: 'chemistry', unit: 'panel' },
  'RFT':        { code: '24362-6', name: 'Renal function tests', category: 'chemistry', unit: 'panel' },
  'LIPID':      { code: '57698-3', name: 'Lipid panel', category: 'chemistry', unit: 'panel' },
  'TSH':        { code: '11580-8', name: 'Thyroid stimulating hormone', category: 'endocrine', unit: 'mIU/L' },
  'HBA1C':      { code: '4548-4',  name: 'Hemoglobin A1c', category: 'endocrine', unit: '%' },
  'GLUCOSE':    { code: '2339-0',  name: 'Glucose', category: 'chemistry', unit: 'mg/dL' },
  'CRP':        { code: '1988-5',  name: 'C-reactive protein', category: 'immunology', unit: 'mg/L' },
  'PT_INR':     { code: '5902-2',  name: 'Prothrombin time', category: 'coagulation', unit: 's' },
  'TROPONIN':   { code: '42757-5', name: 'Troponin I', category: 'cardiac', unit: 'ng/mL' },
  'URINE_CS':   { code: '630-4',   name: 'Urine culture and sensitivity', category: 'microbiology', unit: '' },
  'BLOOD_CS':   { code: '600-7',   name: 'Blood culture', category: 'microbiology', unit: '' },
  'COVID_PCR':  { code: '94500-6', name: 'SARS-CoV-2 PCR', category: 'microbiology', unit: '' },
  'PREG':       { code: '2106-3',  name: 'hCG - pregnancy test', category: 'immunology', unit: 'mIU/mL' },
  'FERRITIN':   { code: '2276-4',  name: 'Ferritin', category: 'chemistry', unit: 'ng/mL' },
  'VITD':       { code: '1989-3',  name: 'Vitamin D 25-hydroxy', category: 'chemistry', unit: 'ng/mL' },
};

// Reference ranges (adult normal values)
const REFERENCE_RANGES = {
  'GLUCOSE':   { low: 70, high: 99, critLow: 40, critHigh: 500, unit: 'mg/dL' },
  'TSH':       { low: 0.4, high: 4.0, critLow: 0.1, critHigh: 10, unit: 'mIU/L' },
  'HBA1C':     { low: 4.0, high: 5.6, critLow: null, critHigh: 9.0, unit: '%' },
  'CRP':       { low: 0, high: 5, critLow: null, critHigh: 100, unit: 'mg/L' },
  'TROPONIN':  { low: 0, high: 0.04, critLow: null, critHigh: 2.0, unit: 'ng/mL' },
  'FERRITIN':  { low: 12, high: 300, critLow: 5, critHigh: 1000, unit: 'ng/mL' },
  'VITD':      { low: 30, high: 100, critLow: 10, critHigh: 150, unit: 'ng/mL' },
};

// ---------------------------------------------------------------------------
// Lab Orders
// ---------------------------------------------------------------------------

const SPECIMEN_TYPES = ['blood', 'urine', 'stool', 'sputum', 'swab', 'csf', 'tissue', 'other'];
const ORDER_PRIORITIES = ['routine', 'urgent', 'stat'];

/**
 * Place a laboratory test order.
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.orderingPhysicianId
 * @param {string[]} data.testCodes           Keys from LAB_TESTS
 * @param {string} data.specimenType          One of SPECIMEN_TYPES
 * @param {string} [data.priority]
 * @param {string} [data.clinicalNotes]
 * @param {boolean} [data.fastingRequired]
 */
function placeLabOrder(data) {
  const {
    encounterId, patientId, orderingPhysicianId,
    testCodes, specimenType = 'blood',
    priority = 'routine', clinicalNotes = '',
    fastingRequired = false,
  } = data;

  if (!encounterId || !patientId || !orderingPhysicianId || !testCodes?.length) {
    throw new Error('Required: encounterId, patientId, orderingPhysicianId, testCodes (array)');
  }
  if (!SPECIMEN_TYPES.includes(specimenType)) {
    throw new Error(`specimenType must be one of: ${SPECIMEN_TYPES.join(', ')}`);
  }

  // Resolve test codes to catalog entries
  const tests = testCodes.map(code => {
    const test = LAB_TESTS[code];
    if (!test) throw new Error(`Unknown test code: ${code}`);
    return { code, ...test };
  });

  const id = makeId('LAB');
  const order = {
    id,
    encounterId,
    patientId,
    orderingPhysicianId,
    tests,
    specimenType,
    priority,
    clinicalNotes,
    fastingRequired,
    status: 'ordered',
    accessionNumber: `LAB${Date.now().toString().slice(-8)}`,
    orderedAt: new Date().toISOString(),
    specimenCollectedAt: null,
    specimenId: null,
    resultedAt: null,
    hasCriticalValues: false,
  };

  labOrders.set(id, order);
  return order;
}

// ---------------------------------------------------------------------------
// Specimen Collection
// ---------------------------------------------------------------------------

function collectSpecimen(orderId, { collectedBy, collectionSite = '', notes = '' } = {}) {
  const order = labOrders.get(orderId);
  if (!order) throw new Error(`Lab order not found: ${orderId}`);

  const specimenId = makeId('SPC');
  const specimen = {
    id: specimenId,
    orderId,
    patientId: order.patientId,
    specimenType: order.specimenType,
    collectedBy: collectedBy || 'system',
    collectionSite,
    notes,
    collectedAt: new Date().toISOString(),
    status: 'available',
    receivedAt: null,
    processedAt: null,
  };

  specimens.set(specimenId, specimen);
  order.specimenId = specimenId;
  order.specimenCollectedAt = specimen.collectedAt;
  order.status = 'specimen-collected';

  return specimen;
}

function receiveSpecimen(specimenId) {
  const spc = specimens.get(specimenId);
  if (!spc) throw new Error(`Specimen not found: ${specimenId}`);
  spc.receivedAt = new Date().toISOString();
  spc.status = 'received';
  const order = labOrders.get(spc.orderId);
  if (order) order.status = 'in-process';
  return spc;
}

// ---------------------------------------------------------------------------
// Lab Results
// ---------------------------------------------------------------------------

/**
 * Record laboratory test results.
 * @param {object} data
 * @param {string} data.orderId
 * @param {string} data.performedBy       Lab technologist ID
 * @param {object[]} data.results         Array of { testCode, value, unit, interpretation }
 * @param {string} [data.overallStatus]   'partial'|'final'
 */
function recordLabResults(data) {
  const {
    orderId, performedBy,
    results, overallStatus = 'final',
  } = data;

  if (!orderId || !performedBy || !results?.length) {
    throw new Error('Required: orderId, performedBy, results (array)');
  }

  const order = labOrders.get(orderId);
  if (!order) throw new Error(`Lab order not found: ${orderId}`);

  // Evaluate each result against reference ranges
  const evaluatedResults = results.map(r => {
    const ref = REFERENCE_RANGES[r.testCode];
    let interpretation = r.interpretation || 'N';
    let isCritical = false;

    if (ref && typeof r.value === 'number') {
      if (ref.critLow !== null && r.value <= ref.critLow) { interpretation = 'LL'; isCritical = true; }
      else if (ref.critHigh !== null && r.value >= ref.critHigh) { interpretation = 'HH'; isCritical = true; }
      else if (r.value < ref.low) interpretation = 'L';
      else if (r.value > ref.high) interpretation = 'H';
      else interpretation = 'N';
    }

    if (isCritical) {
      console.log(`[CRITICAL LAB] Order ${orderId} | Test ${r.testCode} | Value ${r.value} ${r.unit || ref?.unit || ''}`);
    }

    return {
      testCode: r.testCode,
      testName: LAB_TESTS[r.testCode]?.name || r.testCode,
      loincCode: LAB_TESTS[r.testCode]?.code || '',
      value: r.value,
      unit: r.unit || (REFERENCE_RANGES[r.testCode]?.unit || ''),
      referenceRange: ref ? `${ref.low}-${ref.high} ${ref.unit}` : null,
      interpretation,
      isCritical,
    };
  });

  const hasCritical = evaluatedResults.some(r => r.isCritical);

  const resultId = makeId('RES');
  const labResult = {
    id: resultId,
    orderId,
    patientId: order.patientId,
    encounterId: order.encounterId,
    performedBy,
    results: evaluatedResults,
    overallStatus,
    hasCriticalValues: hasCritical,
    resultedAt: new Date().toISOString(),
    verifiedBy: null,
    verifiedAt: null,
  };

  labResults.set(resultId, labResult);
  order.resultId = resultId;
  order.resultedAt = labResult.resultedAt;
  order.hasCriticalValues = hasCritical;
  order.status = overallStatus === 'final' ? 'resulted' : 'partial';

  return labResult;
}

function verifyLabResult(resultId, verifiedBy) {
  const result = labResults.get(resultId);
  if (!result) throw new Error(`Lab result not found: ${resultId}`);
  result.verifiedBy = verifiedBy;
  result.verifiedAt = new Date().toISOString();
  result.overallStatus = 'verified';
  return result;
}

function getPatientLabResults(patientId, category = null) {
  return [...labResults.values()].filter(r => {
    if (r.patientId !== patientId) return false;
    if (category) {
      const hasCategory = r.results.some(res => {
        const test = LAB_TESTS[res.testCode];
        return test && test.category === category;
      });
      return hasCategory;
    }
    return true;
  });
}

function getCriticalLabValues(fromDate = null) {
  return [...labResults.values()].filter(r => {
    if (!r.hasCriticalValues) return false;
    if (fromDate && r.resultedAt < fromDate) return false;
    return true;
  });
}

function getPendingLabOrders(priority = null) {
  return [...labOrders.values()].filter(o => {
    if (!['ordered', 'specimen-collected', 'in-process'].includes(o.status)) return false;
    if (priority && o.priority !== priority) return false;
    return true;
  }).sort((a, b) => {
    const p = { stat: 1, urgent: 2, routine: 3 };
    return (p[a.priority] ?? 3) - (p[b.priority] ?? 3);
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Lab orders
  placeLabOrder,
  // Specimens
  collectSpecimen,
  receiveSpecimen,
  // Results
  recordLabResults,
  verifyLabResult,
  getPatientLabResults,
  getCriticalLabValues,
  getPendingLabOrders,
  // Catalog
  LAB_TESTS,
  REFERENCE_RANGES,
  SPECIMEN_TYPES,
  ORDER_PRIORITIES,
  // Stores (for testing)
  _stores: { labOrders, specimens, labResults },
};
