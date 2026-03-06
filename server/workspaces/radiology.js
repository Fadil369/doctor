/**
 * Radiology Workspace Module - BrainSAIT Health Platform
 *
 * Covers the full radiology workflow:
 *   Order → Scheduling → Acquisition → Reporting → Result delivery
 *
 * FHIR R4 aligned (ImagingStudy, DiagnosticReport, ServiceRequest)
 * Integrates with DICOM worklist and PACS systems.
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: RIS/PACS integration)
// ---------------------------------------------------------------------------
const imagingOrders = new Map();
const imagingStudies = new Map();
const radiologyReports = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Radiology Modalities & Procedures
// ---------------------------------------------------------------------------

const MODALITIES = ['CR', 'CT', 'MR', 'US', 'PET', 'NM', 'XA', 'DX', 'MG', 'RF', 'PT'];
const BODY_PARTS = [
  'head', 'neck', 'chest', 'abdomen', 'pelvis', 'spine', 'shoulder',
  'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'foot', 'whole-body',
];
const REPORT_STATUSES = ['registered', 'partial', 'preliminary', 'final', 'amended', 'corrected', 'cancelled'];

// ---------------------------------------------------------------------------
// Imaging Orders
// ---------------------------------------------------------------------------

/**
 * Place a radiology imaging order.
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.orderingPhysicianId
 * @param {string} data.modality              One of MODALITIES
 * @param {string} data.bodyPart              One of BODY_PARTS
 * @param {string} data.procedureName         Descriptive name
 * @param {string} [data.procedureCode]       CPT / SNOMED / local code
 * @param {string} [data.priority]            'routine'|'urgent'|'stat'
 * @param {string} [data.clinicalIndication]  Reason / ICD code
 * @param {string} [data.contrast]            'none'|'with'|'without-with'
 * @param {string} [data.laterality]          'left'|'right'|'bilateral'|'na'
 * @param {string} [data.specialInstructions]
 * @param {boolean} [data.isPortable]
 */
function placeImagingOrder(data) {
  const {
    encounterId, patientId, orderingPhysicianId,
    modality, bodyPart, procedureName,
    procedureCode = '', priority = 'routine',
    clinicalIndication = '', contrast = 'none',
    laterality = 'na', specialInstructions = '',
    isPortable = false,
  } = data;

  if (!encounterId || !patientId || !orderingPhysicianId || !modality || !bodyPart || !procedureName) {
    throw new Error('Required: encounterId, patientId, orderingPhysicianId, modality, bodyPart, procedureName');
  }
  if (!MODALITIES.includes(modality)) throw new Error(`modality must be one of: ${MODALITIES.join(', ')}`);

  const id = makeId('RAD');
  const order = {
    id,
    encounterId,
    patientId,
    orderingPhysicianId,
    modality,
    bodyPart,
    procedureName,
    procedureCode,
    priority,
    clinicalIndication,
    contrast,
    laterality,
    specialInstructions,
    isPortable,
    status: 'registered',
    accessionNumber: `ACC${Date.now().toString().slice(-8)}`,
    orderedAt: new Date().toISOString(),
    scheduledAt: null,
    acquiredAt: null,
    assignedTechnician: null,
    assignedRadiologist: null,
  };

  imagingOrders.set(id, order);
  return order;
}

function scheduleImagingOrder(orderId, { scheduledAt, assignedTechnician }) {
  const order = imagingOrders.get(orderId);
  if (!order) throw new Error(`Imaging order not found: ${orderId}`);
  order.status = 'scheduled';
  order.scheduledAt = scheduledAt || new Date().toISOString();
  order.assignedTechnician = assignedTechnician;
  return order;
}

function markAcquired(orderId, { assignedRadiologist } = {}) {
  const order = imagingOrders.get(orderId);
  if (!order) throw new Error(`Imaging order not found: ${orderId}`);
  order.status = 'acquired';
  order.acquiredAt = new Date().toISOString();
  if (assignedRadiologist) order.assignedRadiologist = assignedRadiologist;
  return order;
}

function getImagingOrdersByPatient(patientId, modality = null) {
  return [...imagingOrders.values()].filter(o => {
    if (o.patientId !== patientId) return false;
    if (modality && o.modality !== modality) return false;
    return true;
  });
}

function getPendingWorklist(modality = null, priority = null) {
  return [...imagingOrders.values()].filter(o => {
    if (!['registered', 'scheduled'].includes(o.status)) return false;
    if (modality && o.modality !== modality) return false;
    if (priority && o.priority !== priority) return false;
    return true;
  }).sort((a, b) => {
    const p = { stat: 1, urgent: 2, routine: 3 };
    return (p[a.priority] ?? 3) - (p[b.priority] ?? 3);
  });
}

// ---------------------------------------------------------------------------
// Imaging Studies (DICOM metadata)
// ---------------------------------------------------------------------------

/**
 * Register an imaging study (DICOM acquisition result).
 * @param {object} data
 * @param {string} data.orderId
 * @param {string} data.studyInstanceUID    DICOM Study Instance UID
 * @param {number} data.numberOfSeries
 * @param {number} data.numberOfInstances
 * @param {string} [data.pacsUrl]           WADO-RS URL
 * @param {object[]} [data.series]          Series metadata
 */
function registerImagingStudy(data) {
  const {
    orderId, studyInstanceUID, numberOfSeries = 1,
    numberOfInstances = 1, pacsUrl = '', series = [],
  } = data;

  const order = imagingOrders.get(orderId);
  if (!order) throw new Error(`Imaging order not found: ${orderId}`);

  const id = makeId('STU');
  const study = {
    id,
    orderId,
    patientId: order.patientId,
    modality: order.modality,
    bodyPart: order.bodyPart,
    studyInstanceUID,
    accessionNumber: order.accessionNumber,
    numberOfSeries,
    numberOfInstances,
    pacsUrl,
    series,
    studyDate: new Date().toISOString(),
    availability: 'online',
  };

  imagingStudies.set(id, study);
  order.studyId = id;
  markAcquired(orderId, {});

  return study;
}

// ---------------------------------------------------------------------------
// Radiology Reports
// ---------------------------------------------------------------------------

/**
 * Create a radiology report.
 * @param {object} data
 * @param {string} data.orderId
 * @param {string} data.radiologistId
 * @param {string} data.findings           Imaging findings text
 * @param {string} data.impression         Radiologist's impression / conclusion
 * @param {string} [data.recommendation]
 * @param {string[]} [data.icdCodes]
 * @param {boolean} [data.isCritical]
 * @param {string} [data.criticalFinding]
 */
function createRadiologyReport(data) {
  const {
    orderId, radiologistId,
    findings, impression,
    recommendation = '', icdCodes = [],
    isCritical = false, criticalFinding = '',
  } = data;

  if (!orderId || !radiologistId || !findings || !impression) {
    throw new Error('Required: orderId, radiologistId, findings, impression');
  }

  const order = imagingOrders.get(orderId);
  if (!order) throw new Error(`Imaging order not found: ${orderId}`);

  const id = makeId('RR');
  const report = {
    id,
    orderId,
    patientId: order.patientId,
    encounterId: order.encounterId,
    radiologistId,
    modality: order.modality,
    bodyPart: order.bodyPart,
    procedureName: order.procedureName,
    findings,
    impression,
    recommendation,
    icdCodes,
    isCritical,
    criticalFinding,
    status: 'preliminary',
    createdAt: new Date().toISOString(),
    signedAt: null,
    amendedAt: null,
    amendmentReason: null,
    studyId: order.studyId || null,
  };

  radiologyReports.set(id, report);
  order.reportId = id;
  order.status = 'reported';

  // If critical, flag for immediate notification
  if (isCritical) {
    console.log(`[CRITICAL FINDING] Report ${id} for patient ${order.patientId}: ${criticalFinding}`);
  }

  return report;
}

function finalizeReport(reportId, radiologistId) {
  const report = radiologyReports.get(reportId);
  if (!report) throw new Error(`Report not found: ${reportId}`);
  if (report.radiologistId !== radiologistId) throw new Error('Only the reporting radiologist can finalize');
  report.status = 'final';
  report.signedAt = new Date().toISOString();
  return report;
}

function amendReport(reportId, { radiologistId, findings, impression, amendmentReason }) {
  const report = radiologyReports.get(reportId);
  if (!report) throw new Error(`Report not found: ${reportId}`);
  if (report.status !== 'final') throw new Error('Only finalized reports can be amended');
  report.findings = findings || report.findings;
  report.impression = impression || report.impression;
  report.amendmentReason = amendmentReason;
  report.status = 'amended';
  report.amendedAt = new Date().toISOString();
  return report;
}

function getPatientRadiologyReports(patientId, modality = null) {
  return [...radiologyReports.values()].filter(r => {
    if (r.patientId !== patientId) return false;
    if (modality && r.modality !== modality) return false;
    return true;
  });
}

function getCriticalFindings(fromDate = null) {
  return [...radiologyReports.values()].filter(r => {
    if (!r.isCritical) return false;
    if (fromDate && r.createdAt < fromDate) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Imaging orders
  placeImagingOrder,
  scheduleImagingOrder,
  markAcquired,
  getImagingOrdersByPatient,
  getPendingWorklist,
  // Studies
  registerImagingStudy,
  // Reports
  createRadiologyReport,
  finalizeReport,
  amendReport,
  getPatientRadiologyReports,
  getCriticalFindings,
  // Constants
  MODALITIES,
  BODY_PARTS,
  REPORT_STATUSES,
  // Stores (for testing)
  _stores: { imagingOrders, imagingStudies, radiologyReports },
};
