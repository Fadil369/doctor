/**
 * Pharmacy Workspace Module - BrainSAIT Health Platform
 *
 * Covers the full pharmacy workflow:
 *   Prescription → Clinical review → Dispensing → Patient counseling
 *   → Medication administration → Reconciliation
 *
 * FHIR R4 aligned (MedicationRequest, MedicationDispense, MedicationAdministration)
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: pharmacy system integration)
// ---------------------------------------------------------------------------
const prescriptions = new Map();
const dispenseRecords = new Map();
const medicationInventory = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Medication catalog (simplified subset)
// ---------------------------------------------------------------------------
const DRUG_DATABASE = {
  'MET500': { name: 'Metformin 500mg', form: 'tablet', category: 'antidiabetic', rxNormCode: '860975' },
  'AMO500': { name: 'Amoxicillin 500mg', form: 'capsule', category: 'antibiotic', rxNormCode: '723' },
  'OMS20':  { name: 'Omeprazole 20mg', form: 'capsule', category: 'PPI', rxNormCode: '40790' },
  'ATO40':  { name: 'Atorvastatin 40mg', form: 'tablet', category: 'statin', rxNormCode: '617311' },
  'ASA100': { name: 'Aspirin 100mg', form: 'tablet', category: 'antiplatelet', rxNormCode: '1191' },
  'PAR500': { name: 'Paracetamol 500mg', form: 'tablet', category: 'analgesic', rxNormCode: '161' },
  'IBU400': { name: 'Ibuprofen 400mg', form: 'tablet', category: 'NSAID', rxNormCode: '5640' },
  'AML5':   { name: 'Amlodipine 5mg', form: 'tablet', category: 'CCB', rxNormCode: '17767' },
  'LOS50':  { name: 'Losartan 50mg', form: 'tablet', category: 'ARB', rxNormCode: '203644' },
  'INS_R':  { name: 'Regular Insulin', form: 'injection', category: 'insulin', rxNormCode: '51428' },
  'WAR2':   { name: 'Warfarin 2mg', form: 'tablet', category: 'anticoagulant', rxNormCode: '202421' },
};

// Drug-drug interaction pairs (simplified)
const DRUG_INTERACTIONS = [
  { drug1: 'WAR2', drug2: 'ASA100', severity: 'major', effect: 'Increased bleeding risk' },
  { drug1: 'WAR2', drug2: 'IBU400', severity: 'major', effect: 'Increased bleeding risk and reduced anticoagulant effect' },
  { drug1: 'MET500', drug2: 'INS_R', severity: 'moderate', effect: 'Additive hypoglycemic effect - monitor glucose' },
];

const PRESCRIPTION_STATUSES = ['active', 'on-hold', 'cancelled', 'completed', 'draft', 'entered-in-error', 'stopped'];
const DISPENSE_STATUSES = ['preparation', 'in-progress', 'completed', 'declined', 'entered-in-error'];

// ---------------------------------------------------------------------------
// Drug interaction checker
// ---------------------------------------------------------------------------

function checkInteractions(drugCodes) {
  const interactions = [];
  for (let i = 0; i < drugCodes.length; i++) {
    for (let j = i + 1; j < drugCodes.length; j++) {
      const pair = DRUG_INTERACTIONS.find(
        d => (d.drug1 === drugCodes[i] && d.drug2 === drugCodes[j]) ||
             (d.drug1 === drugCodes[j] && d.drug2 === drugCodes[i])
      );
      if (pair) interactions.push(pair);
    }
  }
  return interactions;
}

// ---------------------------------------------------------------------------
// Prescriptions (MedicationRequest)
// ---------------------------------------------------------------------------

/**
 * Create a prescription (medication request).
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.prescriberId        Physician ID
 * @param {object[]} data.medications       Array of medication items
 * @param {string} data.medications[].drugCode
 * @param {string} data.medications[].dose
 * @param {string} data.medications[].frequency       e.g. 'BID', 'TID', 'QD', 'PRN'
 * @param {number} data.medications[].durationDays
 * @param {number} [data.medications[].quantity]
 * @param {string} [data.medications[].route]         e.g. 'oral', 'IV', 'IM', 'topical'
 * @param {string} [data.medications[].instructions]
 * @param {boolean} [data.checkInteractions]
 */
function createPrescription(data) {
  const {
    encounterId, patientId, prescriberId,
    medications, checkInteractions: doCheck = true,
  } = data;

  if (!encounterId || !patientId || !prescriberId || !medications?.length) {
    throw new Error('Required: encounterId, patientId, prescriberId, medications (array)');
  }

  // Validate & enrich medications
  const enrichedMeds = medications.map(med => {
    const drug = DRUG_DATABASE[med.drugCode];
    if (!drug) throw new Error(`Unknown drug code: ${med.drugCode}`);
    return {
      drugCode: med.drugCode,
      drugName: drug.name,
      form: drug.form,
      category: drug.category,
      rxNormCode: drug.rxNormCode,
      dose: med.dose,
      frequency: med.frequency,
      durationDays: med.durationDays || 7,
      quantity: med.quantity || Math.ceil((med.durationDays || 7) * getFrequencyPerDay(med.frequency)),
      route: med.route || 'oral',
      instructions: med.instructions || '',
      refills: med.refills || 0,
    };
  });

  // Drug interaction check
  const drugCodes = enrichedMeds.map(m => m.drugCode);
  const interactions = doCheck ? checkInteractions(drugCodes) : [];
  const hasMajorInteraction = interactions.some(i => i.severity === 'major');

  if (hasMajorInteraction) {
    console.warn(`[PHARMACY] Major drug interaction detected for patient ${patientId}`);
  }

  const id = makeId('RX');
  const prescription = {
    id,
    encounterId,
    patientId,
    prescriberId,
    medications: enrichedMeds,
    interactions,
    hasMajorInteraction,
    status: 'active',
    isNarcotic: false,
    prescribedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dispensedCount: 0,
    notes: '',
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };

  prescriptions.set(id, prescription);
  return prescription;
}

function getFrequencyPerDay(freq) {
  const map = { QD: 1, BID: 2, TID: 3, QID: 4, Q6H: 4, Q8H: 3, Q12H: 2, PRN: 1, QHS: 1, ONCE: 1 };
  return map[freq?.toUpperCase()] || 1;
}

function updatePrescriptionStatus(rxId, status, notes = '') {
  if (!PRESCRIPTION_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${PRESCRIPTION_STATUSES.join(', ')}`);
  }
  const rx = prescriptions.get(rxId);
  if (!rx) throw new Error(`Prescription not found: ${rxId}`);
  rx.status = status;
  rx.notes = notes;
  rx.updatedAt = new Date().toISOString();
  return rx;
}

function getPatientPrescriptions(patientId, status = null) {
  return [...prescriptions.values()].filter(rx => {
    if (rx.patientId !== patientId) return false;
    if (status && rx.status !== status) return false;
    return true;
  });
}

function getActivePrescriptionsByEncounter(encounterId) {
  return [...prescriptions.values()].filter(rx =>
    rx.encounterId === encounterId && rx.status === 'active'
  );
}

// ---------------------------------------------------------------------------
// Dispensing (MedicationDispense)
// ---------------------------------------------------------------------------

/**
 * Dispense a prescription.
 * @param {object} data
 * @param {string} data.prescriptionId
 * @param {string} data.pharmacistId
 * @param {object[]} [data.dispensedItems]  Override for partial dispensing
 * @param {string} [data.counselingNotes]
 * @param {string} [data.pharmacyNotes]
 */
function dispensePrescription(data) {
  const {
    prescriptionId, pharmacistId,
    dispensedItems = null, counselingNotes = '', pharmacyNotes = '',
  } = data;

  const rx = prescriptions.get(prescriptionId);
  if (!rx) throw new Error(`Prescription not found: ${prescriptionId}`);
  if (rx.status !== 'active') throw new Error('Can only dispense active prescriptions');

  const items = dispensedItems || rx.medications.map(m => ({
    drugCode: m.drugCode,
    drugName: m.drugName,
    quantity: m.quantity,
    lotNumber: `LOT${Math.random().toString(36).slice(2,8).toUpperCase()}`,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }));

  const id = makeId('DIS');
  const dispense = {
    id,
    prescriptionId,
    patientId: rx.patientId,
    pharmacistId,
    dispensedItems: items,
    counselingNotes,
    pharmacyNotes,
    status: 'completed',
    dispensedAt: new Date().toISOString(),
    whenHandedOver: new Date().toISOString(),
  };

  dispenseRecords.set(id, dispense);
  rx.dispensedCount += 1;

  // Mark as completed if no refills remaining
  if (rx.dispensedCount > rx.medications[0]?.refills) {
    rx.status = 'completed';
  }

  return dispense;
}

function getPatientDispenseHistory(patientId) {
  return [...dispenseRecords.values()].filter(d => d.patientId === patientId);
}

// ---------------------------------------------------------------------------
// Medication reconciliation
// ---------------------------------------------------------------------------

function reconcileMedications(patientId, currentMedications, reconciledBy) {
  return {
    patientId,
    reconciledBy,
    reconciledAt: new Date().toISOString(),
    activePrescriptions: getPatientPrescriptions(patientId, 'active'),
    currentMedications,
    discrepancies: [], // In production: compare and flag differences
    status: 'complete',
  };
}

// ---------------------------------------------------------------------------
// Pharmacy worklist
// ---------------------------------------------------------------------------

function getPharmacyWorklist() {
  return [...prescriptions.values()]
    .filter(rx => rx.status === 'active' && rx.dispensedCount === 0)
    .map(rx => ({
      prescriptionId: rx.id,
      patientId: rx.patientId,
      medications: rx.medications.map(m => m.drugName),
      hasMajorInteraction: rx.hasMajorInteraction,
      prescribedAt: rx.prescribedAt,
    }));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Prescriptions
  createPrescription,
  updatePrescriptionStatus,
  getPatientPrescriptions,
  getActivePrescriptionsByEncounter,
  // Dispensing
  dispensePrescription,
  getPatientDispenseHistory,
  // Reconciliation
  reconcileMedications,
  // Worklist
  getPharmacyWorklist,
  // Drug utilities
  checkInteractions,
  DRUG_DATABASE,
  DRUG_INTERACTIONS,
  PRESCRIPTION_STATUSES,
  DISPENSE_STATUSES,
  // Stores (for testing)
  _stores: { prescriptions, dispenseRecords, medicationInventory },
};
