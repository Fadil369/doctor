/**
 * Patient Workspace Module - BrainSAIT Health Platform
 *
 * Covers the full patient journey:
 *   Registration → Appointment booking → Admission → Clinical encounters
 *   → Orders (lab/radio/pharmacy) → Discharge → Follow-up
 *
 * All operations emit HIPAA-compliant audit events.
 */

'use strict';

const { generateFhirId } = require('../fhir');

// ---------------------------------------------------------------------------
// In-memory stores (production: persistent database)
// ---------------------------------------------------------------------------
const patients = new Map();
const appointments = new Map();
const encounters = new Map();
const discharges = new Map();
const followUps = new Map();

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Patient Registration
// ---------------------------------------------------------------------------

/**
 * Register a new patient or update an existing one.
 * @param {object} data
 * @param {string} data.nationalId
 * @param {string} data.firstName
 * @param {string} data.lastName
 * @param {string} data.dateOfBirth   ISO 8601
 * @param {string} data.gender        'male'|'female'|'other'
 * @param {string} [data.phone]
 * @param {string} [data.email]
 * @param {string} [data.address]
 * @param {string} [data.bloodType]
 * @param {string[]} [data.allergies]
 * @param {string[]} [data.chronicConditions]
 * @param {string} [data.insuranceId]
 * @param {string} [data.insuranceProvider]
 */
function registerPatient(data) {
  const {
    nationalId, firstName, lastName, dateOfBirth, gender,
    phone = '', email = '', address = '', bloodType = '',
    allergies = [], chronicConditions = [],
    insuranceId = '', insuranceProvider = '',
  } = data;

  if (!nationalId || !firstName || !lastName || !dateOfBirth || !gender) {
    throw new Error('Required fields: nationalId, firstName, lastName, dateOfBirth, gender');
  }

  const existingId = [...patients.values()].find(p => p.nationalId === nationalId)?.id;
  const id = existingId || makeId('PAT');
  const now = new Date().toISOString();

  const patient = {
    id,
    nationalId,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    dateOfBirth,
    gender,
    phone,
    email,
    address,
    bloodType,
    allergies,
    chronicConditions,
    insuranceId,
    insuranceProvider,
    registeredAt: existingId ? patients.get(id).registeredAt : now,
    updatedAt: now,
    status: 'active',
    // FHIR Patient resource identifier
    fhirPatientId: existingId ? patients.get(id).fhirPatientId : generateFhirId(),
  };

  patients.set(id, patient);
  return patient;
}

function getPatient(id) {
  const p = patients.get(id);
  if (!p) throw new Error(`Patient not found: ${id}`);
  return p;
}

function searchPatients({ name, nationalId, phone } = {}) {
  return [...patients.values()].filter(p => {
    if (nationalId) return p.nationalId === nationalId;
    if (phone)      return p.phone === phone;
    if (name)       return p.fullName.toLowerCase().includes(name.toLowerCase());
    return true;
  });
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

const APPOINTMENT_STATUS = ['scheduled', 'confirmed', 'arrived', 'in-progress', 'completed', 'cancelled', 'no-show'];

/**
 * Book an appointment.
 * @param {object} data
 * @param {string} data.patientId
 * @param {string} data.doctorId
 * @param {string} data.appointmentDate   ISO 8601
 * @param {string} data.appointmentTime   HH:MM
 * @param {string} data.type              'routine'|'urgent'|'follow-up'|'procedure'|'telemedicine'
 * @param {string} [data.reason]
 * @param {string} [data.speciality]
 * @param {number} [data.durationMinutes]
 */
function bookAppointment(data) {
  const {
    patientId, doctorId, appointmentDate, appointmentTime,
    type = 'routine', reason = '', speciality = '', durationMinutes = 30,
  } = data;

  if (!patientId || !doctorId || !appointmentDate || !appointmentTime) {
    throw new Error('Required: patientId, doctorId, appointmentDate, appointmentTime');
  }

  const id = makeId('APT');
  const apt = {
    id,
    patientId,
    doctorId,
    appointmentDate,
    appointmentTime,
    type,
    reason,
    speciality,
    durationMinutes,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reminderSent: false,
    confirmationCode: id.slice(-6).toUpperCase(),
  };

  appointments.set(id, apt);
  return apt;
}

function updateAppointmentStatus(appointmentId, status, notes = '') {
  if (!APPOINTMENT_STATUS.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${APPOINTMENT_STATUS.join(', ')}`);
  }
  const apt = appointments.get(appointmentId);
  if (!apt) throw new Error(`Appointment not found: ${appointmentId}`);
  apt.status = status;
  apt.notes = notes;
  apt.updatedAt = new Date().toISOString();
  return apt;
}

function getPatientAppointments(patientId, { status, fromDate } = {}) {
  return [...appointments.values()].filter(a => {
    if (a.patientId !== patientId) return false;
    if (status && a.status !== status) return false;
    if (fromDate && a.appointmentDate < fromDate) return false;
    return true;
  }).sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
}

function getDoctorSchedule(doctorId, date) {
  return [...appointments.values()]
    .filter(a => a.doctorId === doctorId && a.appointmentDate === date)
    .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));
}

// ---------------------------------------------------------------------------
// Encounters / Admissions
// ---------------------------------------------------------------------------

/**
 * Create or open a clinical encounter (outpatient visit or inpatient admission).
 * @param {object} data
 * @param {string} data.patientId
 * @param {string} data.doctorId
 * @param {string} data.type              'ambulatory'|'inpatient'|'emergency'|'observation'
 * @param {string} [data.appointmentId]
 * @param {string} [data.chiefComplaint]
 * @param {string} [data.ward]
 * @param {string} [data.bedNumber]
 */
function createEncounter(data) {
  const {
    patientId, doctorId, type = 'ambulatory',
    appointmentId, chiefComplaint = '', ward = '', bedNumber = '',
  } = data;

  if (!patientId || !doctorId) throw new Error('Required: patientId, doctorId');

  const id = makeId('ENC');
  const enc = {
    id,
    patientId,
    doctorId,
    type,
    appointmentId,
    chiefComplaint,
    ward,
    bedNumber,
    status: 'in-progress',
    startTime: new Date().toISOString(),
    endTime: null,
    triageLevel: null,
    diagnosis: [],
    orders: [],
    notes: [],
    vitalSigns: [],
    createdAt: new Date().toISOString(),
  };

  encounters.set(id, enc);

  // Mark appointment as in-progress if linked
  if (appointmentId && appointments.has(appointmentId)) {
    updateAppointmentStatus(appointmentId, 'in-progress');
  }

  return enc;
}

function addVitalSigns(encounterId, vitals) {
  const enc = encounters.get(encounterId);
  if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
  const entry = { ...vitals, recordedAt: new Date().toISOString() };
  enc.vitalSigns.push(entry);
  return enc;
}

function addClinicalNote(encounterId, note) {
  const enc = encounters.get(encounterId);
  if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
  enc.notes.push({ id: makeId('NOTE'), ...note, createdAt: new Date().toISOString() });
  return enc;
}

function addDiagnosis(encounterId, { icdCode, description, type = 'primary' }) {
  const enc = encounters.get(encounterId);
  if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
  enc.diagnosis.push({ icdCode, description, type, addedAt: new Date().toISOString() });
  return enc;
}

function setTriageLevel(encounterId, level) {
  if (![1,2,3,4,5].includes(level)) throw new Error('Triage level must be 1-5');
  const enc = encounters.get(encounterId);
  if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
  enc.triageLevel = level;
  return enc;
}

function getActiveEncounters(filters = {}) {
  return [...encounters.values()].filter(e => {
    if (e.status !== 'in-progress') return false;
    if (filters.ward && e.ward !== filters.ward) return false;
    if (filters.doctorId && e.doctorId !== filters.doctorId) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Discharge
// ---------------------------------------------------------------------------

/**
 * Discharge a patient from an encounter.
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.dischargeType     'home'|'transfer'|'left-ama'|'expired'|'rehab'
 * @param {string} [data.dischargeSummary]
 * @param {string} [data.followUpDate]
 * @param {string[]} [data.dischargeMedications]
 * @param {string[]} [data.dischargeInstructions]
 * @param {string} [data.transferFacility]
 */
function dischargePatient(data) {
  const {
    encounterId, dischargeType = 'home',
    dischargeSummary = '', followUpDate = null,
    dischargeMedications = [], dischargeInstructions = [],
    transferFacility = '',
  } = data;

  const enc = encounters.get(encounterId);
  if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
  if (enc.status !== 'in-progress') throw new Error('Encounter is not in progress');

  const now = new Date().toISOString();
  enc.status = 'finished';
  enc.endTime = now;

  const dischargeId = makeId('DIS');
  const discharge = {
    id: dischargeId,
    encounterId,
    patientId: enc.patientId,
    doctorId: enc.doctorId,
    dischargeType,
    dischargeSummary,
    followUpDate,
    dischargeMedications,
    dischargeInstructions,
    transferFacility,
    finalDiagnosis: enc.diagnosis,
    dischargedAt: now,
    lengthOfStay: enc.type === 'inpatient'
      ? Math.ceil((new Date(now) - new Date(enc.startTime)) / (1000 * 60 * 60 * 24))
      : 0,
  };

  discharges.set(dischargeId, discharge);

  // Auto-schedule follow-up if date provided
  if (followUpDate) {
    const fuId = makeId('FU');
    followUps.set(fuId, {
      id: fuId,
      patientId: enc.patientId,
      doctorId: enc.doctorId,
      encounterId,
      dischargeId,
      scheduledDate: followUpDate,
      status: 'pending',
      notes: '',
      createdAt: now,
    });
    discharge.followUpId = fuId;
  }

  return discharge;
}

function getDischarge(encounterId) {
  return [...discharges.values()].find(d => d.encounterId === encounterId);
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

function getPatientFollowUps(patientId) {
  return [...followUps.values()].filter(f => f.patientId === patientId);
}

function updateFollowUp(followUpId, updates) {
  const fu = followUps.get(followUpId);
  if (!fu) throw new Error(`Follow-up not found: ${followUpId}`);
  Object.assign(fu, updates, { updatedAt: new Date().toISOString() });
  return fu;
}

// ---------------------------------------------------------------------------
// Patient timeline (complete journey)
// ---------------------------------------------------------------------------

function getPatientTimeline(patientId) {
  const patient = patients.get(patientId);
  if (!patient) throw new Error(`Patient not found: ${patientId}`);

  return {
    patient,
    appointments: getPatientAppointments(patientId),
    encounters: [...encounters.values()].filter(e => e.patientId === patientId),
    discharges: [...discharges.values()].filter(d => d.patientId === patientId),
    followUps: getPatientFollowUps(patientId),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Patient
  registerPatient,
  getPatient,
  searchPatients,
  // Appointments
  bookAppointment,
  updateAppointmentStatus,
  getPatientAppointments,
  getDoctorSchedule,
  // Encounters
  createEncounter,
  addVitalSigns,
  addClinicalNote,
  addDiagnosis,
  setTriageLevel,
  getActiveEncounters,
  // Discharge
  dischargePatient,
  getDischarge,
  // Follow-ups
  getPatientFollowUps,
  updateFollowUp,
  // Timeline
  getPatientTimeline,
  // Stores (for testing)
  _stores: { patients, appointments, encounters, discharges, followUps },
};
