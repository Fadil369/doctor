/**
 * Workspace Integration Tests - BrainSAIT Health Platform
 *
 * Tests all eight workspace modules:
 *   patient, clinical, radiology, laboratory, pharmacy, sbs, nphies, internal
 */

'use strict';

const patient    = require('./workspaces/patient');
const clinical   = require('./workspaces/clinical');
const radiology  = require('./workspaces/radiology');
const laboratory = require('./workspaces/laboratory');
const pharmacy   = require('./workspaces/pharmacy');
const sbs        = require('./workspaces/sbs');
const nphies     = require('./workspaces/nphies');
const internal   = require('./workspaces/internal');

// ============================================================================
// PATIENT WORKSPACE
// ============================================================================
describe('Patient Workspace', () => {
  let patientId;
  let appointmentId;
  let encounterId;

  test('registerPatient: creates patient with required fields', () => {
    const p = patient.registerPatient({
      nationalId: '1234567890', firstName: 'Ahmed', lastName: 'Al-Rashidi',
      dateOfBirth: '1985-03-15', gender: 'male',
      phone: '+966501234567', email: 'ahmed@example.com',
      bloodType: 'O+', allergies: ['Penicillin'],
      chronicConditions: ['Hypertension', 'Diabetes'],
      insuranceId: 'INS-001', insuranceProvider: 'Bupa Arabia',
    });
    expect(p.id).toBeTruthy();
    expect(p.fullName).toBe('Ahmed Al-Rashidi');
    expect(p.nationalId).toBe('1234567890');
    expect(p.allergies).toContain('Penicillin');
    patientId = p.id;
  });

  test('registerPatient: throws when required fields missing', () => {
    expect(() => patient.registerPatient({ firstName: 'Test' })).toThrow();
  });

  test('registerPatient: idempotent on same nationalId', () => {
    const p2 = patient.registerPatient({
      nationalId: '1234567890', firstName: 'Ahmed', lastName: 'Al-Rashidi',
      dateOfBirth: '1985-03-15', gender: 'male',
    });
    expect(p2.id).toBe(patientId);
  });

  test('getPatient: retrieves registered patient', () => {
    const p = patient.getPatient(patientId);
    expect(p.nationalId).toBe('1234567890');
  });

  test('getPatient: throws for unknown id', () => {
    expect(() => patient.getPatient('UNKNOWN')).toThrow();
  });

  test('searchPatients: finds by name', () => {
    const results = patient.searchPatients({ name: 'Ahmed' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].firstName).toBe('Ahmed');
  });

  test('searchPatients: finds by nationalId', () => {
    const results = patient.searchPatients({ nationalId: '1234567890' });
    expect(results.length).toBe(1);
  });

  test('bookAppointment: creates appointment', () => {
    const apt = patient.bookAppointment({
      patientId, doctorId: 'DR-001',
      appointmentDate: '2024-06-15', appointmentTime: '10:00',
      type: 'routine', reason: 'Routine checkup',
      speciality: 'Family Medicine',
    });
    expect(apt.id).toBeTruthy();
    expect(apt.status).toBe('scheduled');
    expect(apt.confirmationCode).toBeTruthy();
    appointmentId = apt.id;
  });

  test('bookAppointment: throws when required fields missing', () => {
    expect(() => patient.bookAppointment({ patientId })).toThrow();
  });

  test('updateAppointmentStatus: confirms appointment', () => {
    const updated = patient.updateAppointmentStatus(appointmentId, 'confirmed');
    expect(updated.status).toBe('confirmed');
  });

  test('updateAppointmentStatus: rejects invalid status', () => {
    expect(() => patient.updateAppointmentStatus(appointmentId, 'invalid-status')).toThrow();
  });

  test('getPatientAppointments: returns appointments for patient', () => {
    const apts = patient.getPatientAppointments(patientId);
    expect(apts.length).toBeGreaterThan(0);
  });

  test('getDoctorSchedule: returns appointments for doctor on date', () => {
    const schedule = patient.getDoctorSchedule('DR-001', '2024-06-15');
    expect(schedule.length).toBeGreaterThan(0);
  });

  test('createEncounter: opens a clinical encounter', () => {
    const enc = patient.createEncounter({
      patientId, doctorId: 'DR-001',
      type: 'ambulatory', appointmentId,
      chiefComplaint: 'Headache and dizziness',
    });
    expect(enc.id).toBeTruthy();
    expect(enc.status).toBe('in-progress');
    encounterId = enc.id;
  });

  test('addVitalSigns: records vitals in encounter', () => {
    const enc = patient.addVitalSigns(encounterId, {
      systolic: 140, diastolic: 90, pulse: 88, temperature: 37.2, oxygenSat: 97,
    });
    expect(enc.vitalSigns.length).toBe(1);
    expect(enc.vitalSigns[0].systolic).toBe(140);
  });

  test('addDiagnosis: adds ICD code to encounter', () => {
    const enc = patient.addDiagnosis(encounterId, {
      icdCode: 'I10', description: 'Essential hypertension', type: 'primary',
    });
    expect(enc.diagnosis.length).toBe(1);
    expect(enc.diagnosis[0].icdCode).toBe('I10');
  });

  test('setTriageLevel: sets valid triage level', () => {
    const enc = patient.setTriageLevel(encounterId, 3);
    expect(enc.triageLevel).toBe(3);
  });

  test('setTriageLevel: rejects invalid triage level', () => {
    expect(() => patient.setTriageLevel(encounterId, 6)).toThrow();
  });

  test('getActiveEncounters: returns in-progress encounters', () => {
    const active = patient.getActiveEncounters();
    expect(active.some(e => e.id === encounterId)).toBe(true);
  });

  test('dischargePatient: discharges from encounter', () => {
    const disc = patient.dischargePatient({
      encounterId, dischargeType: 'home',
      dischargeSummary: 'Hypertension managed. Follow up in 2 weeks.',
      followUpDate: '2024-06-29',
      dischargeInstructions: ['Low sodium diet', 'Take medications as prescribed'],
    });
    expect(disc.id).toBeTruthy();
    expect(disc.dischargeType).toBe('home');
    expect(disc.followUpId).toBeTruthy();
  });

  test('dischargePatient: throws for unknown encounter', () => {
    expect(() => patient.dischargePatient({ encounterId: 'NONE', dischargeType: 'home' })).toThrow();
  });

  test('dischargePatient: throws if encounter already finished', () => {
    expect(() => patient.dischargePatient({ encounterId, dischargeType: 'home' })).toThrow('not in progress');
  });

  test('getPatientTimeline: returns complete patient journey', () => {
    const timeline = patient.getPatientTimeline(patientId);
    expect(timeline.patient.id).toBe(patientId);
    expect(timeline.appointments.length).toBeGreaterThan(0);
    expect(timeline.encounters.length).toBeGreaterThan(0);
    expect(timeline.discharges.length).toBeGreaterThan(0);
    expect(timeline.followUps.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// CLINICAL WORKSPACE
// ============================================================================
describe('Clinical Workspace', () => {
  const encounterId = 'enc-test-01';
  const patientId   = 'pat-test-01';
  const authorId    = 'dr-test-01';

  test('createClinicalNote: creates SOAP note', () => {
    const note = clinical.createClinicalNote({
      encounterId, patientId, authorId, type: 'soap',
      subjective: 'Patient reports headache for 3 days',
      objective: 'BP 150/95, pulse 88',
      assessment: 'Hypertensive urgency',
      plan: 'Start Amlodipine 5mg, follow up in 1 week',
    });
    expect(note.id).toBeTruthy();
    expect(note.type).toBe('soap');
    expect(note.signed).toBe(false);
  });

  test('createClinicalNote: rejects unknown type', () => {
    expect(() => clinical.createClinicalNote({ encounterId, patientId, authorId, type: 'invalid' })).toThrow();
  });

  test('createClinicalNote: throws when required fields missing', () => {
    expect(() => clinical.createClinicalNote({ encounterId })).toThrow();
  });

  test('getEncounterNotes: returns notes for encounter', () => {
    const notes = clinical.getEncounterNotes(encounterId);
    expect(notes.length).toBeGreaterThan(0);
  });

  test('createOrder: creates a lab order', () => {
    const order = clinical.createOrder({
      encounterId, patientId, orderingPhysicianId: authorId,
      type: 'laboratory', orderCode: 'CBC', orderName: 'Complete Blood Count',
      priority: 'urgent', indication: 'Anemia workup',
    });
    expect(order.id).toBeTruthy();
    expect(order.type).toBe('laboratory');
    expect(order.status).toBe('active');
  });

  test('createOrder: rejects invalid type', () => {
    expect(() => clinical.createOrder({ encounterId, patientId, orderingPhysicianId: authorId, type: 'invalid', orderCode: 'X', orderName: 'X' })).toThrow();
  });

  test('createOrder: rejects invalid priority', () => {
    expect(() => clinical.createOrder({ encounterId, patientId, orderingPhysicianId: authorId, type: 'laboratory', orderCode: 'CBC', orderName: 'CBC', priority: 'super-urgent' })).toThrow();
  });

  test('getEncounterOrders: returns orders filtered by type', () => {
    const labOrders = clinical.getEncounterOrders(encounterId, 'laboratory');
    expect(labOrders.every(o => o.type === 'laboratory')).toBe(true);
  });

  test('createReferral: creates specialty referral', () => {
    const ref = clinical.createReferral({
      patientId, referringDoctorId: authorId, referredSpeciality: 'Cardiology',
      reason: 'Hypertension management', urgency: 'urgent',
      icdCode: 'I10',
    });
    expect(ref.id).toBeTruthy();
    expect(ref.status).toBe('pending');
  });

  test('createDischargeSummary: creates summary document', () => {
    const ds = clinical.createDischargeSummary({
      encounterId, patientId, authorId,
      admissionDate: '2024-06-14', dischargeDate: '2024-06-15',
      dischargeType: 'home',
      admittingDiagnosis: 'Hypertensive urgency',
      dischargeDiagnosis: 'Essential hypertension, controlled',
      hospitalCourse: 'Patient treated with IV labetalol. BP normalized to 130/85.',
      conditionOnDischarge: 'Stable',
    });
    expect(ds.id).toBeTruthy();
    expect(ds.signed).toBe(false);
    expect(ds.status).toBe('draft');
  });

  test('getDoctorWorkload: returns workload summary', () => {
    const workload = clinical.getDoctorWorkload(authorId);
    expect(workload.doctorId).toBe(authorId);
    expect(typeof workload.pendingOrders).toBe('number');
    expect(typeof workload.unsignedNotes).toBe('number');
  });

  test('ORDER_TYPES: covers all required order types', () => {
    expect(clinical.ORDER_TYPES).toContain('laboratory');
    expect(clinical.ORDER_TYPES).toContain('radiology');
    expect(clinical.ORDER_TYPES).toContain('medication');
    expect(clinical.ORDER_TYPES).toContain('consult');
  });
});

// ============================================================================
// RADIOLOGY WORKSPACE
// ============================================================================
describe('Radiology Workspace', () => {
  let orderId;
  let reportId;

  const baseOrder = {
    encounterId: 'enc-rad-01', patientId: 'pat-rad-01',
    orderingPhysicianId: 'dr-rad-01', modality: 'CT',
    bodyPart: 'head', procedureName: 'CT Head without contrast',
    priority: 'urgent', clinicalIndication: 'Severe headache, rule out bleed',
  };

  test('placeImagingOrder: creates imaging order', () => {
    const order = radiology.placeImagingOrder(baseOrder);
    expect(order.id).toBeTruthy();
    expect(order.modality).toBe('CT');
    expect(order.status).toBe('registered');
    expect(order.accessionNumber).toMatch(/^ACC/);
    orderId = order.id;
  });

  test('placeImagingOrder: rejects unknown modality', () => {
    expect(() => radiology.placeImagingOrder({ ...baseOrder, modality: 'XRAY' })).toThrow();
  });

  test('placeImagingOrder: throws when required fields missing', () => {
    expect(() => radiology.placeImagingOrder({ encounterId: 'E1' })).toThrow();
  });

  test('scheduleImagingOrder: transitions order to scheduled', () => {
    const order = radiology.scheduleImagingOrder(orderId, {
      scheduledAt: '2024-06-15T11:00:00Z', assignedTechnician: 'tech-01',
    });
    expect(order.status).toBe('scheduled');
    expect(order.assignedTechnician).toBe('tech-01');
  });

  test('getPendingWorklist: returns pending orders sorted by priority', () => {
    // Add a stat order
    const statOrder = radiology.placeImagingOrder({ ...baseOrder, priority: 'stat' });
    const worklist = radiology.getPendingWorklist();
    // Stat should appear before urgent
    const priorities = worklist.map(o => o.priority);
    const statIdx = priorities.indexOf('stat');
    const urgentIdx = priorities.findIndex(p => p === 'urgent');
    if (statIdx !== -1 && urgentIdx !== -1) {
      expect(statIdx).toBeLessThanOrEqual(urgentIdx);
    }
  });

  test('createRadiologyReport: creates report with findings', () => {
    const report = radiology.createRadiologyReport({
      orderId, radiologistId: 'rad-dr-01',
      findings: 'No acute intracranial abnormality. No hemorrhage or mass effect.',
      impression: 'Normal CT head.',
      isCritical: false,
    });
    expect(report.id).toBeTruthy();
    expect(report.status).toBe('preliminary');
    expect(report.isCritical).toBe(false);
    reportId = report.id;
  });

  test('createRadiologyReport: flags critical findings', () => {
    const statOrder = radiology.placeImagingOrder({ ...baseOrder, priority: 'stat' });
    const report = radiology.createRadiologyReport({
      orderId: statOrder.id, radiologistId: 'rad-dr-01',
      findings: 'Large hyperdense lesion in left parietal region consistent with hemorrhage.',
      impression: 'Intracranial hemorrhage. STAT neurosurgery consultation.',
      isCritical: true, criticalFinding: 'Intracranial hemorrhage',
    });
    expect(report.isCritical).toBe(true);
    const criticals = radiology.getCriticalFindings();
    expect(criticals.some(r => r.id === report.id)).toBe(true);
  });

  test('finalizeReport: transitions to final', () => {
    const finalized = radiology.finalizeReport(reportId, 'rad-dr-01');
    expect(finalized.status).toBe('final');
    expect(finalized.signedAt).toBeTruthy();
  });

  test('finalizeReport: throws when signed by different radiologist', () => {
    expect(() => radiology.finalizeReport(reportId, 'wrong-rad')).toThrow();
  });

  test('getPatientRadiologyReports: returns patient reports', () => {
    const reports = radiology.getPatientRadiologyReports('pat-rad-01');
    expect(reports.length).toBeGreaterThan(0);
  });

  test('MODALITIES: contains standard imaging modalities', () => {
    expect(radiology.MODALITIES).toContain('CT');
    expect(radiology.MODALITIES).toContain('MR');
    expect(radiology.MODALITIES).toContain('US');
    expect(radiology.MODALITIES).toContain('CR');
  });
});

// ============================================================================
// LABORATORY WORKSPACE
// ============================================================================
describe('Laboratory Workspace', () => {
  let orderId;
  let specimenId;
  let resultId;

  test('placeLabOrder: creates lab order with test codes', () => {
    const order = laboratory.placeLabOrder({
      encounterId: 'enc-lab-01', patientId: 'pat-lab-01',
      orderingPhysicianId: 'dr-lab-01',
      testCodes: ['CBC', 'BMP', 'HBA1C'],
      specimenType: 'blood', priority: 'urgent',
      fastingRequired: true,
    });
    expect(order.id).toBeTruthy();
    expect(order.tests.length).toBe(3);
    expect(order.status).toBe('ordered');
    expect(order.accessionNumber).toMatch(/^LAB/);
    orderId = order.id;
  });

  test('placeLabOrder: throws for unknown test code', () => {
    expect(() => laboratory.placeLabOrder({
      encounterId: 'E1', patientId: 'P1', orderingPhysicianId: 'D1',
      testCodes: ['UNKNOWN_TEST'],
    })).toThrow('Unknown test code');
  });

  test('placeLabOrder: throws for invalid specimen type', () => {
    expect(() => laboratory.placeLabOrder({
      encounterId: 'E1', patientId: 'P1', orderingPhysicianId: 'D1',
      testCodes: ['CBC'], specimenType: 'plasma',
    })).toThrow();
  });

  test('collectSpecimen: creates specimen and updates order', () => {
    const spc = laboratory.collectSpecimen(orderId, { collectedBy: 'nurse-01' });
    expect(spc.id).toBeTruthy();
    expect(spc.specimenType).toBe('blood');
    specimenId = spc.id;
    const order = laboratory._stores.labOrders.get(orderId);
    expect(order.status).toBe('specimen-collected');
  });

  test('receiveSpecimen: marks specimen as received', () => {
    const spc = laboratory.receiveSpecimen(specimenId);
    expect(spc.status).toBe('received');
    const order = laboratory._stores.labOrders.get(orderId);
    expect(order.status).toBe('in-process');
  });

  test('recordLabResults: creates results with reference range evaluation', () => {
    const result = laboratory.recordLabResults({
      orderId, performedBy: 'tech-lab-01',
      results: [
        { testCode: 'HBA1C', value: 9.5 },   // Critical high (≥9.0)
        { testCode: 'GLUCOSE', value: 35 },   // Critical low (≤40)
      ],
      overallStatus: 'final',
    });
    expect(result.id).toBeTruthy();
    expect(result.hasCriticalValues).toBe(true);
    const glucoseResult = result.results.find(r => r.testCode === 'GLUCOSE');
    expect(glucoseResult.isCritical).toBe(true);
    expect(glucoseResult.interpretation).toBe('LL');
    const hba1cResult = result.results.find(r => r.testCode === 'HBA1C');
    expect(hba1cResult.interpretation).toBe('HH');
    resultId = result.id;
  });

  test('recordLabResults: normal values get N interpretation', () => {
    const order2 = laboratory.placeLabOrder({
      encounterId: 'enc-lab-02', patientId: 'pat-lab-02',
      orderingPhysicianId: 'dr-lab-01', testCodes: ['GLUCOSE'],
    });
    const result = laboratory.recordLabResults({
      orderId: order2.id, performedBy: 'tech-01',
      results: [{ testCode: 'GLUCOSE', value: 85 }],
    });
    expect(result.results[0].interpretation).toBe('N');
    expect(result.hasCriticalValues).toBe(false);
  });

  test('verifyLabResult: marks result as verified', () => {
    const verified = laboratory.verifyLabResult(resultId, 'supervisor-01');
    expect(verified.verifiedBy).toBe('supervisor-01');
    expect(verified.overallStatus).toBe('verified');
  });

  test('getCriticalLabValues: returns results with critical values', () => {
    const criticals = laboratory.getCriticalLabValues();
    expect(criticals.some(r => r.id === resultId)).toBe(true);
  });

  test('getPendingLabOrders: returns unresulted orders by priority', () => {
    const pending = laboratory.getPendingLabOrders();
    expect(Array.isArray(pending)).toBe(true);
  });

  test('LAB_TESTS: contains LOINC-coded tests', () => {
    expect(laboratory.LAB_TESTS['CBC'].code).toBe('58410-2');
    expect(laboratory.LAB_TESTS['HBA1C'].code).toBe('4548-4');
    expect(laboratory.LAB_TESTS['GLUCOSE'].code).toBe('2339-0');
  });
});

// ============================================================================
// PHARMACY WORKSPACE
// ============================================================================
describe('Pharmacy Workspace', () => {
  let rxId;
  let dispenseId;

  test('createPrescription: creates prescription with enriched drug data', () => {
    const rx = pharmacy.createPrescription({
      encounterId: 'enc-pharm-01', patientId: 'pat-pharm-01',
      prescriberId: 'dr-pharm-01',
      medications: [
        { drugCode: 'MET500', dose: '500mg', frequency: 'BID', durationDays: 30 },
        { drugCode: 'AML5',   dose: '5mg',   frequency: 'QD',  durationDays: 30 },
      ],
    });
    expect(rx.id).toBeTruthy();
    expect(rx.medications.length).toBe(2);
    expect(rx.medications[0].drugName).toBe('Metformin 500mg');
    expect(rx.status).toBe('active');
    rxId = rx.id;
  });

  test('createPrescription: throws for unknown drug code', () => {
    expect(() => pharmacy.createPrescription({
      encounterId: 'E1', patientId: 'P1', prescriberId: 'D1',
      medications: [{ drugCode: 'UNKNOWN', dose: '10mg', frequency: 'QD', durationDays: 7 }],
    })).toThrow('Unknown drug code');
  });

  test('checkInteractions: detects major drug-drug interaction', () => {
    const interactions = pharmacy.checkInteractions(['WAR2', 'ASA100']);
    expect(interactions.length).toBeGreaterThan(0);
    expect(interactions[0].severity).toBe('major');
  });

  test('checkInteractions: returns empty for no interactions', () => {
    const interactions = pharmacy.checkInteractions(['MET500', 'AML5']);
    expect(interactions.length).toBe(0);
  });

  test('createPrescription: flags major interaction', () => {
    const rx = pharmacy.createPrescription({
      encounterId: 'enc-pharm-02', patientId: 'pat-pharm-02',
      prescriberId: 'dr-pharm-01',
      medications: [
        { drugCode: 'WAR2', dose: '2mg', frequency: 'QD', durationDays: 30 },
        { drugCode: 'ASA100', dose: '100mg', frequency: 'QD', durationDays: 30 },
      ],
    });
    expect(rx.hasMajorInteraction).toBe(true);
    expect(rx.interactions.length).toBeGreaterThan(0);
  });

  test('dispensePrescription: dispenses active prescription', () => {
    const dispense = pharmacy.dispensePrescription({
      prescriptionId: rxId, pharmacistId: 'ph-01',
      counselingNotes: 'Take Metformin with food. Amlodipine can cause ankle swelling.',
    });
    expect(dispense.id).toBeTruthy();
    expect(dispense.status).toBe('completed');
    expect(dispense.dispensedItems.length).toBe(2);
    dispenseId = dispense.id;
  });

  test('dispensePrescription: throws for inactive prescription', () => {
    // Mark prescription as cancelled first
    pharmacy.updatePrescriptionStatus(rxId, 'cancelled');
    expect(() => pharmacy.dispensePrescription({ prescriptionId: rxId, pharmacistId: 'ph-01' }))
      .toThrow('active');
  });

  test('getPatientPrescriptions: returns prescriptions for patient', () => {
    const rxList = pharmacy.getPatientPrescriptions('pat-pharm-01');
    expect(rxList.length).toBeGreaterThan(0);
  });

  test('getPharmacyWorklist: returns undispensed active prescriptions', () => {
    // Create a new one for worklist test
    pharmacy.createPrescription({
      encounterId: 'enc-pharm-99', patientId: 'pat-pharm-99',
      prescriberId: 'dr-01',
      medications: [{ drugCode: 'PAR500', dose: '500mg', frequency: 'TID', durationDays: 5 }],
    });
    const worklist = pharmacy.getPharmacyWorklist();
    expect(worklist.some(w => w.patientId === 'pat-pharm-99')).toBe(true);
  });

  test('DRUG_DATABASE: contains rxNorm coded drugs', () => {
    expect(pharmacy.DRUG_DATABASE['MET500'].rxNormCode).toBeTruthy();
    expect(pharmacy.DRUG_DATABASE['WAR2'].category).toBe('anticoagulant');
  });
});

// ============================================================================
// SBS WORKSPACE
// ============================================================================
describe('SBS Workspace', () => {
  let claimId;
  let preAuthId;

  test('createClaim: creates billable claim with financial rules', () => {
    const claim = sbs.createClaim({
      encounterId: 'enc-sbs-01', patientId: 'pat-sbs-01',
      providerId: 'HOSP-001',
      serviceItems: [
        { serviceCode: 'CONSULT_GP', quantity: 1 },
        { serviceCode: 'LAB_CBC', quantity: 2 },
      ],
      coverageType: 'insurance',
    });
    expect(claim.id).toBeTruthy();
    expect(claim.status).toBe('draft');
    expect(claim.totalAmount).toBe(150 + 80 * 2);  // 310 SAR
    expect(claim.totalInsurance).toBeGreaterThan(0);
    expect(claim.totalPatient).toBeGreaterThan(0);
    claimId = claim.id;
  });

  test('createClaim: government coverage – patient pays 0', () => {
    const claim = sbs.createClaim({
      encounterId: 'enc-sbs-02', patientId: 'pat-sbs-02',
      providerId: 'HOSP-001',
      serviceItems: [{ serviceCode: 'CONSULT_GP', quantity: 1 }],
      coverageType: 'government',
    });
    expect(claim.totalPatient).toBe(0);
    expect(claim.totalInsurance).toBe(150);
  });

  test('createClaim: cash patient pays full amount', () => {
    const claim = sbs.createClaim({
      encounterId: 'enc-sbs-03', patientId: 'pat-sbs-03',
      providerId: 'HOSP-001',
      serviceItems: [{ serviceCode: 'CONSULT_GP', quantity: 1 }],
      coverageType: 'cash',
    });
    expect(claim.totalPatient).toBe(150);
    expect(claim.totalInsurance).toBe(0);
  });

  test('createClaim: throws for unknown service code', () => {
    expect(() => sbs.createClaim({
      encounterId: 'E1', patientId: 'P1', providerId: 'H1',
      serviceItems: [{ serviceCode: 'UNKNOWN_SVC', quantity: 1 }],
    })).toThrow('Unknown service code');
  });

  test('submitClaim: transitions draft to submitted', () => {
    const submitted = sbs.submitClaim(claimId);
    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).toBeTruthy();
  });

  test('submitClaim: throws if claim not in draft', () => {
    expect(() => sbs.submitClaim(claimId)).toThrow('draft');
  });

  test('adjudicateClaim: approves claim with insurance portion', () => {
    const adjudicated = sbs.adjudicateClaim(claimId, { approved: true });
    expect(adjudicated.status).toBe('adjudicated');
    expect(adjudicated.approvedAmount).toBeGreaterThan(0);
  });

  test('recordPayment: records insurance payment', () => {
    const payment = sbs.recordPayment(claimId, {
      amount: 248, paymentMethod: 'bank-transfer',
      referenceNumber: 'TXN-001', paidBy: 'insurance',
    });
    expect(payment.id).toBeTruthy();
    expect(payment.amount).toBe(248);
  });

  test('getPatientClaims: returns claims for patient', () => {
    const claims = sbs.getPatientClaims('pat-sbs-01');
    expect(claims.length).toBeGreaterThan(0);
  });

  test('requestPreAuthorization: creates pre-auth request', () => {
    const pa = sbs.requestPreAuthorization({
      patientId: 'pat-sbs-04', encounterId: 'enc-sbs-04',
      insuranceId: 'INS-001', insuranceProvider: 'Bupa',
      serviceCodes: ['RAD_CT_HEAD', 'RAD_MRI_BRAIN'],
      clinicalJustification: 'Progressive headaches, neurological assessment required',
      icdCode: 'G43.9',
    });
    expect(pa.id).toBeTruthy();
    expect(pa.status).toBe('pending');
    preAuthId = pa.id;
  });

  test('SERVICE_CATALOG: contains CPT-coded services', () => {
    expect(sbs.SERVICE_CATALOG['CONSULT_GP'].cptCode).toBe('99213');
    expect(sbs.SERVICE_CATALOG['RAD_CT_HEAD'].basePrice).toBe(1200);
  });

  test('applyFinancialRules: insurance 20% copay applied', () => {
    const result = sbs.applyFinancialRules(
      { serviceCode: 'CONSULT_GP', amount: 150, isEmergency: false },
      { type: 'insurance' }
    );
    expect(result.patientPortion).toBe(30);   // 20% of 150
    expect(result.insurancePortion).toBe(120); // 80% of 150
  });

  test('applyFinancialRules: emergency services 100% covered by insurance', () => {
    const result = sbs.applyFinancialRules(
      { serviceCode: 'CONSULT_EMER', amount: 500, isEmergency: true },
      { type: 'insurance' }
    );
    expect(result.patientPortion).toBe(0);
    expect(result.insurancePortion).toBe(500);
  });
});

// ============================================================================
// NPHIES WORKSPACE
// ============================================================================
describe('NPHIES Workspace', () => {
  test('requestEligibilityCheck: creates eligibility request with NPHIES bundle', () => {
    const { eligibilityRequest, nphiesBundle } = nphies.requestEligibilityCheck({
      patientId: 'pat-nphies-01', nationalId: '1234567890',
      insuranceId: 'MBR-001', payerCode: 'BUPA',
      serviceDate: '2024-06-15',
    });
    expect(eligibilityRequest.id).toBeTruthy();
    expect(eligibilityRequest.payerName).toBe('Bupa Arabia');
    expect(nphiesBundle.resourceType).toBe('Bundle');
    expect(nphiesBundle.type).toBe('message');
    expect(nphiesBundle.entry.length).toBeGreaterThan(0);
  });

  test('requestEligibilityCheck: simulates eligibility response', () => {
    const { eligibilityRequest } = nphies.requestEligibilityCheck({
      patientId: 'pat-nphies-02', nationalId: '9876543210',
      insuranceId: 'MBR-002', payerCode: 'TAWUNIYA',
    });
    // Simulate always finishes synchronously in test
    expect(['eligible', 'not-eligible', 'pending']).toContain(eligibilityRequest.status);
  });

  test('requestEligibilityCheck: throws for unknown payer', () => {
    expect(() => nphies.requestEligibilityCheck({
      patientId: 'P1', nationalId: '123', insuranceId: 'M1', payerCode: 'UNKNOWN_PAYER',
    })).toThrow();
  });

  test('getEligibilityStatus: retrieves eligibility request', () => {
    const { eligibilityRequest } = nphies.requestEligibilityCheck({
      patientId: 'pat-nphies-03', nationalId: '1111111111',
      insuranceId: 'MBR-003', payerCode: 'MALATH',
    });
    const status = nphies.getEligibilityStatus(eligibilityRequest.id);
    expect(status.id).toBe(eligibilityRequest.id);
  });

  test('requestPriorAuth: creates prior auth with NPHIES bundle', () => {
    const { priorAuthRequest, nphiesBundle } = nphies.requestPriorAuth({
      patientId: 'pat-nphies-04', encounterId: 'enc-n-01',
      insuranceId: 'MBR-004', payerCode: 'BUPA',
      claimType: 'institutional',
      items: [
        { serviceCode: 'RAD_MRI_BRAIN', quantity: 1, unitPrice: 2500 },
      ],
      clinicalJustification: 'Rule out intracranial neoplasm',
      icdCode: 'G93.9',
    });
    expect(priorAuthRequest.id).toBeTruthy();
    expect(nphiesBundle.type).toBe('message');
    expect(priorAuthRequest.payerName).toBe('Bupa Arabia');
  });

  test('requestPriorAuth: throws for invalid claimType', () => {
    expect(() => nphies.requestPriorAuth({
      patientId: 'P1', encounterId: 'E1', insuranceId: 'I1', payerCode: 'BUPA',
      claimType: 'invalid', items: [{ serviceCode: 'X' }], clinicalJustification: 'X',
    })).toThrow();
  });

  test('submitNphiesClaim: submits claim with FHIR bundle', () => {
    const { nphiesClaim, nphiesBundle } = nphies.submitNphiesClaim({
      patientId: 'pat-nphies-05', encounterId: 'enc-n-02',
      insuranceId: 'MBR-005', payerCode: 'AXA',
      claimType: 'professional',
      items: [
        { serviceCode: 'CONSULT_SPEC', quantity: 1, unitPrice: 300, amount: 300 },
      ],
      icdCodes: ['I10'],
      totalAmount: 300,
    });
    expect(nphiesClaim.id).toBeTruthy();
    expect(nphiesClaim.status).toBe('submitted');
    expect(nphiesBundle.entry.some(e => e.resource.resourceType === 'Claim')).toBe(true);
  });

  test('buildNphiesMessageBundle: constructs valid FHIR message bundle', () => {
    const bundle = nphies.buildNphiesMessageBundle('eligibility-request', {
      payerCode: 'N-I-00000001',
      focusReferences: [{ reference: 'CoverageEligibilityRequest/test-01' }],
      resources: [{ resourceType: 'CoverageEligibilityRequest', id: 'test-01', status: 'active' }],
    });
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('message');
    const header = bundle.entry.find(e => e.resource.resourceType === 'MessageHeader');
    expect(header).toBeTruthy();
    expect(header.resource.eventCoding.code).toBe('eligibility-request');
  });

  test('NPHIES_PAYER_CODES: contains required Saudi payers', () => {
    expect(nphies.NPHIES_PAYER_CODES['BUPA']).toBeTruthy();
    expect(nphies.NPHIES_PAYER_CODES['TAWUNIYA']).toBeTruthy();
    expect(nphies.NPHIES_PAYER_CODES['MALATH']).toBeTruthy();
  });
});

// ============================================================================
// INTERNAL FACILITY WORKSPACE
// ============================================================================
describe('Internal Facility Workspace', () => {
  let courseId;
  let announcementId;

  test('createStaffProfile: registers staff member', () => {
    const staff = internal.createStaffProfile({
      userId: 'user-int-01', firstName: 'Sarah', lastName: 'Al-Otaibi',
      role: 'nurse', department: 'cardiology',
      email: 'sarah@hospital.sa', license: 'RN-001',
    });
    expect(staff.id).toBe('user-int-01');
    expect(staff.role).toBe('nurse');
  });

  test('createStaffProfile: throws for invalid role', () => {
    expect(() => internal.createStaffProfile({
      userId: 'u2', firstName: 'Test', lastName: 'User',
      role: 'super-hero', department: 'cardiology',
    })).toThrow();
  });

  test('sendMessage: sends internal message', () => {
    const msg = internal.sendMessage({
      fromUserId: 'user-int-01', toUserIds: ['user-int-02', 'user-int-03'],
      subject: 'Patient handover',
      body: 'Patient in bed 5 needs follow-up vitals at 14:00.',
      priority: 'high', relatedPatientId: 'pat-001',
    });
    expect(msg.id).toBeTruthy();
    expect(msg.toUserIds).toContain('user-int-02');
    expect(msg.readBy.length).toBe(0);
  });

  test('markMessageRead: marks message as read by user', () => {
    const msg = internal.sendMessage({
      fromUserId: 'user-int-01', toUserIds: ['user-int-02'],
      body: 'Test message for read receipt',
    });
    internal.markMessageRead(msg.id, 'user-int-02');
    expect(msg.readBy).toContain('user-int-02');
  });

  test('getInboxMessages: returns messages for recipient', () => {
    const inbox = internal.getInboxMessages('user-int-02');
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox[0].toUserIds).toContain('user-int-02');
  });

  test('publishAnnouncement: creates facility announcement', () => {
    const ann = internal.publishAnnouncement({
      authorId: 'admin-01',
      title: 'New COVID-19 Protocol',
      content: 'Please review the updated infection control protocol in the shared drive.',
      type: 'policy', audience: 'all-staff',
      isPinned: true,
    });
    expect(ann.id).toBeTruthy();
    expect(ann.isPinned).toBe(true);
    expect(ann.isActive).toBe(true);
    announcementId = ann.id;
  });

  test('acknowledgeAnnouncement: records acknowledgement', () => {
    internal.acknowledgeAnnouncement(announcementId, 'user-int-01');
    const ann = internal._stores.announcements.get(announcementId);
    expect(ann.acknowledgedBy).toContain('user-int-01');
  });

  test('getActiveAnnouncements: returns active announcements sorted pinned first', () => {
    const anns = internal.getActiveAnnouncements();
    if (anns.length > 1) {
      const firstPinned = anns.findIndex(a => a.isPinned);
      const firstNotPinned = anns.findIndex(a => !a.isPinned);
      if (firstPinned !== -1 && firstNotPinned !== -1) {
        expect(firstPinned).toBeLessThan(firstNotPinned);
      }
    }
  });

  test('createCourse: creates training course', () => {
    const course = internal.createCourse({
      title: 'BLS Refresher',
      description: 'Basic Life Support certification renewal',
      category: 'clinical', durationMinutes: 90,
      passingScore: 80, isMandatory: true,
      targetRoles: ['physician', 'nurse'],
      createdBy: 'admin-01',
    });
    expect(course.id).toBeTruthy();
    expect(course.isMandatory).toBe(true);
    expect(course.status).toBe('published');
    courseId = course.id;
  });

  test('enrollStaff: enrolls a staff member in course', () => {
    const enrollment = internal.enrollStaff(courseId, 'user-int-01');
    expect(enrollment.id).toBeTruthy();
    expect(enrollment.status).toBe('not-started');
    expect(enrollment.progress).toBe(0);
  });

  test('enrollStaff: returns existing enrollment on re-enroll', () => {
    const existing = internal.enrollStaff(courseId, 'user-int-01');
    expect(existing.userId).toBe('user-int-01');
  });

  test('submitCourseAssessment: passes with sufficient score', () => {
    internal.updateCourseProgress(courseId, 'user-int-01', { progress: 100, status: 'in-progress' });
    const { enrollment, certificate } = internal.submitCourseAssessment(courseId, 'user-int-01', 85);
    expect(enrollment.status).toBe('completed');
    expect(certificate).toBeTruthy();
    expect(certificate.certificateNumber).toMatch(/^CERT-/);
  });

  test('submitCourseAssessment: fails with insufficient score', () => {
    // Enroll new user
    internal.enrollStaff(courseId, 'user-fail-01');
    const { enrollment, certificate } = internal.submitCourseAssessment(courseId, 'user-fail-01', 60);
    expect(enrollment.status).toBe('failed');
    expect(certificate).toBeNull();
  });

  test('getStaffTrainingStatus: returns compliance status', () => {
    const status = internal.getStaffTrainingStatus('user-int-01');
    expect(status.userId).toBe('user-int-01');
    expect(status.completedCourses).toBeGreaterThan(0);
    expect(typeof status.complianceRate).toBe('number');
  });

  test('reportIncident: creates incident report', () => {
    const incident = internal.reportIncident({
      reportedBy: 'user-int-01', type: 'medication-error',
      severity: 'moderate',
      description: 'Wrong medication dispensed to patient in room 12.',
      incidentDate: '2024-06-15',
      immediateActions: 'Medication withheld, physician notified, patient observed.',
    });
    expect(incident.id).toBeTruthy();
    expect(incident.status).toBe('open');
    expect(incident.severity).toBe('moderate');
  });

  test('reportIncident: throws for invalid severity', () => {
    expect(() => internal.reportIncident({
      reportedBy: 'u1', type: 'fall', severity: 'critical',
      description: 'Test', incidentDate: '2024-06-15',
    })).toThrow();
  });

  test('createShift: schedules a work shift', () => {
    const shift = internal.createShift({
      userId: 'user-int-01', department: 'cardiology',
      date: '2024-06-16', shiftType: 'morning',
      startTime: '07:00', endTime: '15:00',
      role: 'nurse',
    });
    expect(shift.id).toBeTruthy();
    expect(shift.status).toBe('scheduled');
  });

  test('getIncidents: filters by status', () => {
    const openIncidents = internal.getIncidents({ status: 'open' });
    expect(openIncidents.every(i => i.status === 'open')).toBe(true);
  });

  test('getFacilityMetrics: returns aggregate metrics', () => {
    const metrics = internal.getFacilityMetrics();
    expect(metrics.workforce).toBeTruthy();
    expect(metrics.training).toBeTruthy();
    expect(metrics.incidents).toBeTruthy();
    expect(metrics.communication).toBeTruthy();
    expect(metrics.scheduling).toBeTruthy();
    expect(typeof metrics.training.totalCourses).toBe('number');
  });

  test('STAFF_ROLES: contains all clinical roles', () => {
    expect(internal.STAFF_ROLES).toContain('physician');
    expect(internal.STAFF_ROLES).toContain('nurse');
    expect(internal.STAFF_ROLES).toContain('pharmacist');
    expect(internal.STAFF_ROLES).toContain('radiologist');
  });

  test('INCIDENT_TYPES: covers patient safety types', () => {
    expect(internal.INCIDENT_TYPES).toContain('patient-safety');
    expect(internal.INCIDENT_TYPES).toContain('medication-error');
    expect(internal.INCIDENT_TYPES).toContain('fall');
  });
});
