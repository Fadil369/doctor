/**
 * Clinical (Doctor) Workspace Module - BrainSAIT Health Platform
 *
 * Covers the full clinical workflow for physicians:
 *   Clinical assessment → SOAP notes → Clinical orders
 *   → Progress notes → Referrals → Discharge summaries
 *
 * FHIR R4 aligned (ClinicalImpression, Condition, ServiceRequest, DocumentReference)
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: persistent database + FHIR server)
// ---------------------------------------------------------------------------
const clinicalNotes = new Map();
const orders = new Map();
const referrals = new Map();
const dischargeSummaries = new Map();
const prescriptions = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Clinical Notes (SOAP)
// ---------------------------------------------------------------------------

const NOTE_TYPES = ['admission', 'progress', 'procedure', 'consult', 'discharge', 'nursing', 'soap'];

/**
 * Create a clinical note (SOAP or structured).
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.authorId       Doctor/nurse user ID
 * @param {string} data.type           One of NOTE_TYPES
 * @param {string} [data.subjective]
 * @param {string} [data.objective]
 * @param {string} [data.assessment]
 * @param {string} [data.plan]
 * @param {string} [data.freeText]     Unstructured note text
 * @param {string[]} [data.icdCodes]   ICD-10 codes linked to this note
 */
function createClinicalNote(data) {
  const {
    encounterId, patientId, authorId, type = 'soap',
    subjective = '', objective = '', assessment = '', plan = '',
    freeText = '', icdCodes = [],
  } = data;

  if (!encounterId || !patientId || !authorId) {
    throw new Error('Required: encounterId, patientId, authorId');
  }
  if (!NOTE_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${NOTE_TYPES.join(', ')}`);
  }

  const id = makeId('NOTE');
  const note = {
    id,
    encounterId,
    patientId,
    authorId,
    type,
    subjective,
    objective,
    assessment,
    plan,
    freeText,
    icdCodes,
    status: 'active',
    signed: false,
    signedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  clinicalNotes.set(id, note);
  return note;
}

function signNote(noteId, authorId) {
  const note = clinicalNotes.get(noteId);
  if (!note) throw new Error(`Note not found: ${noteId}`);
  if (note.authorId !== authorId) throw new Error('Only the note author can sign');
  note.signed = true;
  note.signedAt = new Date().toISOString();
  note.status = 'signed';
  return note;
}

function getEncounterNotes(encounterId) {
  return [...clinicalNotes.values()].filter(n => n.encounterId === encounterId);
}

function getPatientNotes(patientId, type = null) {
  return [...clinicalNotes.values()].filter(n => {
    if (n.patientId !== patientId) return false;
    if (type && n.type !== type) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Clinical Orders (lab, radiology, pharmacy, consult)
// ---------------------------------------------------------------------------

const ORDER_TYPES = ['laboratory', 'radiology', 'medication', 'consult', 'procedure', 'nursing', 'diet'];
const ORDER_PRIORITIES = ['routine', 'urgent', 'stat', 'asap'];
const ORDER_STATUSES = ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error'];

/**
 * Create a clinical order.
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.orderingPhysicianId
 * @param {string} data.type              One of ORDER_TYPES
 * @param {string} data.orderCode         LOINC / SNOMED / local code
 * @param {string} data.orderName         Human-readable name
 * @param {string} [data.priority]        One of ORDER_PRIORITIES
 * @param {string} [data.instructions]
 * @param {string} [data.indication]      Clinical indication / ICD code
 * @param {object} [data.details]         Type-specific details
 */
function createOrder(data) {
  const {
    encounterId, patientId, orderingPhysicianId,
    type, orderCode, orderName,
    priority = 'routine',
    instructions = '', indication = '',
    details = {},
  } = data;

  if (!encounterId || !patientId || !orderingPhysicianId || !type || !orderCode || !orderName) {
    throw new Error('Required: encounterId, patientId, orderingPhysicianId, type, orderCode, orderName');
  }
  if (!ORDER_TYPES.includes(type)) throw new Error(`type must be one of: ${ORDER_TYPES.join(', ')}`);
  if (!ORDER_PRIORITIES.includes(priority)) throw new Error(`priority must be one of: ${ORDER_PRIORITIES.join(', ')}`);

  const id = makeId('ORD');
  const order = {
    id,
    encounterId,
    patientId,
    orderingPhysicianId,
    type,
    orderCode,
    orderName,
    priority,
    instructions,
    indication,
    details,
    status: 'active',
    orderedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fulfilledAt: null,
    resultSummary: null,
  };

  orders.set(id, order);
  return order;
}

function updateOrderStatus(orderId, status, resultSummary = null) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order not found: ${orderId}`);
  order.status = status;
  order.updatedAt = new Date().toISOString();
  if (status === 'completed') {
    order.fulfilledAt = new Date().toISOString();
    order.resultSummary = resultSummary;
  }
  return order;
}

function getEncounterOrders(encounterId, type = null) {
  return [...orders.values()].filter(o => {
    if (o.encounterId !== encounterId) return false;
    if (type && o.type !== type) return false;
    return true;
  });
}

function getPatientOrders(patientId, type = null) {
  return [...orders.values()].filter(o => {
    if (o.patientId !== patientId) return false;
    if (type && o.type !== type) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

/**
 * Create a specialty referral.
 */
function createReferral(data) {
  const {
    patientId, referringDoctorId, referredSpeciality,
    referredDoctorId = null, reason = '',
    urgency = 'routine', encounterId = null,
    clinicalSummary = '', icdCode = '',
  } = data;

  if (!patientId || !referringDoctorId || !referredSpeciality) {
    throw new Error('Required: patientId, referringDoctorId, referredSpeciality');
  }

  const id = makeId('REF');
  const referral = {
    id,
    patientId,
    referringDoctorId,
    referredSpeciality,
    referredDoctorId,
    reason,
    urgency,
    encounterId,
    clinicalSummary,
    icdCode,
    status: 'pending',
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    appointmentId: null,
  };

  referrals.set(id, referral);
  return referral;
}

function updateReferralStatus(referralId, status, appointmentId = null) {
  const ref = referrals.get(referralId);
  if (!ref) throw new Error(`Referral not found: ${referralId}`);
  ref.status = status;
  if (status === 'accepted') ref.acceptedAt = new Date().toISOString();
  if (appointmentId) ref.appointmentId = appointmentId;
  return ref;
}

function getPatientReferrals(patientId) {
  return [...referrals.values()].filter(r => r.patientId === patientId);
}

// ---------------------------------------------------------------------------
// Discharge Summary
// ---------------------------------------------------------------------------

/**
 * Create a structured discharge summary document.
 */
function createDischargeSummary(data) {
  const {
    encounterId, patientId, authorId,
    admissionDate, dischargeDate, dischargeType,
    admittingDiagnosis, dischargeDiagnosis,
    proceduresPerformed = [], labHighlights = [], imagingHighlights = [],
    hospitalCourse = '', conditionOnDischarge = '',
    dischargeMedications = [], followUpInstructions = [],
    followUpDate = null, pendingResults = [],
  } = data;

  if (!encounterId || !patientId || !authorId) {
    throw new Error('Required: encounterId, patientId, authorId');
  }

  const id = makeId('DS');
  const summary = {
    id,
    encounterId,
    patientId,
    authorId,
    admissionDate,
    dischargeDate,
    dischargeType,
    admittingDiagnosis,
    dischargeDiagnosis,
    proceduresPerformed,
    labHighlights,
    imagingHighlights,
    hospitalCourse,
    conditionOnDischarge,
    dischargeMedications,
    followUpInstructions,
    followUpDate,
    pendingResults,
    status: 'draft',
    signed: false,
    signedAt: null,
    createdAt: new Date().toISOString(),
  };

  dischargeSummaries.set(id, summary);
  return summary;
}

function signDischargeSummary(summaryId, authorId) {
  const ds = dischargeSummaries.get(summaryId);
  if (!ds) throw new Error(`Discharge summary not found: ${summaryId}`);
  if (ds.authorId !== authorId) throw new Error('Only the author can sign this document');
  ds.signed = true;
  ds.signedAt = new Date().toISOString();
  ds.status = 'final';
  return ds;
}

function getEncounterDischargeSummary(encounterId) {
  return [...dischargeSummaries.values()].find(ds => ds.encounterId === encounterId);
}

// ---------------------------------------------------------------------------
// Doctor workload / schedule view
// ---------------------------------------------------------------------------

function getDoctorWorkload(doctorId) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    doctorId,
    todayDate: today,
    activeEncounters: [...orders.values()]
      .filter(o => o.orderingPhysicianId === doctorId && o.status === 'active').length,
    pendingOrders: [...orders.values()]
      .filter(o => o.orderingPhysicianId === doctorId && o.status === 'active').length,
    pendingReferrals: [...referrals.values()]
      .filter(r => r.referringDoctorId === doctorId && r.status === 'pending').length,
    unsignedNotes: [...clinicalNotes.values()]
      .filter(n => n.authorId === doctorId && !n.signed).length,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Clinical notes
  createClinicalNote,
  signNote,
  getEncounterNotes,
  getPatientNotes,
  // Orders
  createOrder,
  updateOrderStatus,
  getEncounterOrders,
  getPatientOrders,
  // Referrals
  createReferral,
  updateReferralStatus,
  getPatientReferrals,
  // Discharge summary
  createDischargeSummary,
  signDischargeSummary,
  getEncounterDischargeSummary,
  // Workload
  getDoctorWorkload,
  // Constants
  NOTE_TYPES,
  ORDER_TYPES,
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  // Stores (for testing)
  _stores: { clinicalNotes, orders, referrals, dischargeSummaries, prescriptions },
};
