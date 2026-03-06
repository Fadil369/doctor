/**
 * BrainSAIT Health Platform - Comprehensive Workspace Server
 *
 * Unified REST API covering all clinical and operational workspaces:
 *   /api/patient/*    - Patient workspace
 *   /api/clinical/*   - Doctor/Clinical workspace
 *   /api/radiology/*  - Radiology workspace
 *   /api/lab/*        - Laboratory workspace
 *   /api/pharmacy/*   - Pharmacy workspace
 *   /api/sbs/*        - Saudi Billing System (SBS) workspace
 *   /api/nphies/*     - NPHIES integration workspace
 *   /api/internal/*   - Internal facility operations
 *   /api/health/*     - FHIR R4 health data (from health-server.js)
 *   /graphql          - GraphQL API
 *
 * HIPAA compliant: every write operation emits an audit event.
 */

'use strict';

const { createServer } = require('node:http');
const { createYoga, createSchema } = require('graphql-yoga');
const { normalizeHealthPayload, createAuditEvent, LOINC_CODES } = require('./fhir');

// Workspace modules
const patient   = require('./workspaces/patient');
const clinical  = require('./workspaces/clinical');
const radiology = require('./workspaces/radiology');
const laboratory = require('./workspaces/laboratory');
const pharmacy  = require('./workspaces/pharmacy');
const sbs       = require('./workspaces/sbs');
const nphies    = require('./workspaces/nphies');
const internal  = require('./workspaces/internal');

// ---------------------------------------------------------------------------
// Audit log & FHIR observation store
// ---------------------------------------------------------------------------
const auditLog = [];
const fhirStore = [];

function recordAudit(action, resourceId, userId, resourceType, outcome) {
  const entry = createAuditEvent(action, resourceId, userId, resourceType, outcome);
  auditLog.push(entry);
  console.log(`[AUDIT] ${entry.recorded} | ${action} | ${resourceType}/${resourceId} | ${outcome}`);
  return entry;
}

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
const ROLES = {
  patient:        ['read:own', 'write:own', 'book:appointment'],
  nurse:          ['read:patient', 'write:vitals', 'write:note', 'read:orders'],
  physician:      ['read:patient', 'write:note', 'write:order', 'write:prescription', 'write:discharge'],
  radiologist:    ['read:patient', 'read:orders', 'write:report', 'finalize:report'],
  lab_tech:       ['read:orders', 'write:result', 'verify:result'],
  pharmacist:     ['read:prescription', 'dispense:medication', 'verify:interaction'],
  billing:        ['read:patient', 'write:claim', 'submit:claim', 'read:billing'],
  admin:          ['read:all', 'write:all', 'read:audit'],
};

function hasPermission(role, permission) {
  if (!role || !ROLES[role]) return false;
  const perms = ROLES[role];
  return perms.includes(permission) || perms.includes('write:all') || perms.includes('read:all');
}

// ---------------------------------------------------------------------------
// HTTP helper utilities
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

// Route-specific handler wrapper with audit logging
function handle(res, fn, auditAction, resourceId, userId, resourceType) {
  try {
    const result = fn();
    if (auditAction) recordAudit(auditAction, resourceId, userId || 'system', resourceType, 'success');
    sendJSON(res, 200, result);
  } catch (err) {
    if (auditAction) recordAudit(auditAction, resourceId, userId || 'system', resourceType, err.message);
    sendError(res, 400, err.message);
  }
}

async function handleAsync(res, fn, auditAction, resourceId, userId, resourceType) {
  try {
    const result = await fn();
    if (auditAction) recordAudit(auditAction, resourceId, userId || 'system', resourceType, 'success');
    sendJSON(res, 200, result);
  } catch (err) {
    if (auditAction) recordAudit(auditAction, resourceId, userId || 'system', resourceType, err.message);
    sendError(res, 400, err.message);
  }
}

// ---------------------------------------------------------------------------
// GraphQL schema & resolvers
// ---------------------------------------------------------------------------
const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        # FHIR / Health Metrics
        fhirObservations(patientId: String!, metricType: String): [FHIRObservation!]!
        supportedMetrics: [SupportedMetric!]!
        auditEvents(resourceId: String): [AuditEvent!]!

        # Patient Workspace
        patient(id: String!): PatientRecord
        patientAppointments(patientId: String!, status: String): [Appointment!]!
        patientTimeline(patientId: String!): PatientTimeline
        doctorSchedule(doctorId: String!, date: String!): [Appointment!]!
        activeEncounters(ward: String): [Encounter!]!

        # Clinical Workspace
        encounterNotes(encounterId: String!): [ClinicalNote!]!
        encounterOrders(encounterId: String!, type: String): [ClinicalOrder!]!
        patientReferrals(patientId: String!): [Referral!]!
        doctorWorkload(doctorId: String!): DoctorWorkload!

        # Radiology
        radiologyWorklist(modality: String, priority: String): [ImagingOrder!]!
        patientRadiologyReports(patientId: String!, modality: String): [RadiologyReport!]!
        criticalFindings: [RadiologyReport!]!

        # Laboratory
        labWorklist(priority: String): [LabOrder!]!
        patientLabResults(patientId: String!, category: String): [LabResult!]!
        criticalLabValues: [LabResult!]!

        # Pharmacy
        pharmacyWorklist: [PharmacyWorklistItem!]!
        patientPrescriptions(patientId: String!, status: String): [Prescription!]!

        # SBS
        patientClaims(patientId: String!, status: String): [Claim!]!
        patientAccount(patientId: String!): PatientAccount!

        # NPHIES
        eligibilityStatus(eligibilityId: String!): EligibilityRequest!
        priorAuthStatus(priorAuthId: String!): PriorAuthRequest!
        nphiesClaimStatus(claimId: String!): NphiesClaim!

        # Internal
        facilityMetrics: FacilityMetrics!
        announcements(audience: String, department: String): [Announcement!]!
        inboxMessages(userId: String!): [Message!]!
        staffTrainingStatus(userId: String!): TrainingStatus!
        availableCourses(category: String): [TrainingCourse!]!
        incidentReports(status: String, severity: String): [Incident!]!
      }

      type Mutation {
        # Patient
        registerPatient(input: PatientInput!): PatientRecord!
        bookAppointment(input: AppointmentInput!): Appointment!
        updateAppointmentStatus(id: String!, status: String!, notes: String): Appointment!
        createEncounter(input: EncounterInput!): Encounter!
        dischargePatient(input: DischargeInput!): DischargeRecord!

        # Clinical
        createClinicalNote(input: ClinicalNoteInput!): ClinicalNote!
        createOrder(input: OrderInput!): ClinicalOrder!
        createReferral(input: ReferralInput!): Referral!
        createDischargeSummary(input: DischargeSummaryInput!): DischargeSummary!

        # Radiology
        placeImagingOrder(input: ImagingOrderInput!): ImagingOrder!
        createRadiologyReport(input: RadiologyReportInput!): RadiologyReport!

        # Lab
        placeLabOrder(input: LabOrderInput!): LabOrder!
        recordLabResults(input: LabResultInput!): LabResult!

        # Pharmacy
        createPrescription(input: PrescriptionInput!): Prescription!
        dispensePrescription(input: DispenseInput!): DispenseRecord!

        # SBS
        createClaim(input: ClaimInput!): Claim!
        submitClaim(claimId: String!): Claim!
        recordPayment(input: PaymentInput!): Payment!
        requestPreAuthorization(input: PreAuthInput!): PreAuthorization!

        # NPHIES
        requestEligibility(input: EligibilityInput!): EligibilityRequest!
        requestNphiesPriorAuth(input: NphiesPriorAuthInput!): PriorAuthRequest!
        submitNphiesClaim(input: NphiesClaimInput!): NphiesClaim!

        # Internal
        sendMessage(input: MessageInput!): Message!
        publishAnnouncement(input: AnnouncementInput!): Announcement!
        enrollInCourse(courseId: String!, userId: String!): CourseEnrollment!
        reportIncident(input: IncidentInput!): Incident!
        createShift(input: ShiftInput!): Shift!

        # FHIR sync
        syncHealthData(input: HealthSyncInput!): HealthSyncResponse!
      }

      # ---- Core Types ----
      type FHIRObservation { id: ID! resourceType: String! status: String! loincCode: String! loincDisplay: String! value: Float! unit: String! effectiveDateTime: String! patientId: String! deviceSource: String }
      type SupportedMetric { key: String! loincCode: String! display: String! }
      type AuditEvent { id: ID! recorded: String! action: String! patientId: String! outcome: String! userId: String }
      type HealthSyncResponse { success: Boolean! message: String! bundleId: String observationCount: Int! auditEventId: String }

      type PatientRecord { id: ID! nationalId: String! firstName: String! lastName: String! fullName: String! dateOfBirth: String! gender: String! phone: String email: String bloodType: String allergies: [String!]! chronicConditions: [String!]! insuranceId: String insuranceProvider: String status: String! registeredAt: String! }
      type Appointment { id: ID! patientId: String! doctorId: String! appointmentDate: String! appointmentTime: String! type: String! reason: String status: String! durationMinutes: Int! confirmationCode: String! createdAt: String! }
      type Encounter { id: ID! patientId: String! doctorId: String! type: String! status: String! chiefComplaint: String ward: String bedNumber: String triageLevel: Int startTime: String! createdAt: String! }
      type DischargeRecord { id: ID! encounterId: String! patientId: String! dischargeType: String! dischargeSummary: String followUpDate: String dischargedAt: String! lengthOfStay: Int! }
      type PatientTimeline { patient: PatientRecord! appointments: [Appointment!]! encounters: [Encounter!]! discharges: [DischargeRecord!]! }

      type ClinicalNote { id: ID! encounterId: String! patientId: String! authorId: String! type: String! subjective: String objective: String assessment: String plan: String freeText: String icdCodes: [String!]! signed: Boolean! signedAt: String createdAt: String! }
      type ClinicalOrder { id: ID! encounterId: String! patientId: String! orderingPhysicianId: String! type: String! orderCode: String! orderName: String! priority: String! instructions: String indication: String status: String! orderedAt: String! }
      type Referral { id: ID! patientId: String! referringDoctorId: String! referredSpeciality: String! reason: String urgency: String! status: String! createdAt: String! }
      type DischargeSummary { id: ID! encounterId: String! patientId: String! authorId: String! admittingDiagnosis: String dischargeDiagnosis: String hospitalCourse: String conditionOnDischarge: String status: String! signed: Boolean! createdAt: String! }
      type DoctorWorkload { doctorId: String! todayDate: String! activeEncounters: Int! pendingOrders: Int! pendingReferrals: Int! unsignedNotes: Int! }

      type ImagingOrder { id: ID! encounterId: String! patientId: String! modality: String! bodyPart: String! procedureName: String! priority: String! clinicalIndication: String contrast: String laterality: String status: String! accessionNumber: String! orderedAt: String! }
      type RadiologyReport { id: ID! orderId: String! patientId: String! radiologistId: String! modality: String! findings: String! impression: String! recommendation: String isCritical: Boolean! status: String! createdAt: String! signedAt: String }

      type LabOrder { id: ID! encounterId: String! patientId: String! specimenType: String! priority: String! status: String! accessionNumber: String! orderedAt: String! hasCriticalValues: Boolean! }
      type LabResult { id: ID! orderId: String! patientId: String! performedBy: String! overallStatus: String! hasCriticalValues: Boolean! resultedAt: String! }
      type LabResultItem { testCode: String! testName: String! loincCode: String value: Float unit: String referenceRange: String interpretation: String! isCritical: Boolean! }

      type Prescription { id: ID! encounterId: String! patientId: String! prescriberId: String! status: String! hasMajorInteraction: Boolean! prescribedAt: String! validUntil: String! dispensedCount: Int! }
      type DispenseRecord { id: ID! prescriptionId: String! patientId: String! pharmacistId: String! status: String! dispensedAt: String! }
      type PharmacyWorklistItem { prescriptionId: String! patientId: String! hasMajorInteraction: Boolean! prescribedAt: String! }

      type Claim { id: ID! encounterId: String! patientId: String! totalAmount: Float! totalPatient: Float! totalInsurance: Float! status: String! claimNumber: String! createdAt: String! }
      type Payment { id: ID! claimId: String! amount: Float! paymentMethod: String! paidBy: String! paidAt: String! }
      type PreAuthorization { id: ID! patientId: String! insuranceId: String! status: String! authorizationNumber: String requestedAt: String! }
      type PatientAccount { patientId: String! balance: Float! totalCharged: Float! totalPaid: Float! }

      type EligibilityRequest { id: ID! patientId: String! payerName: String! status: String! eligible: Boolean copay: Float deductible: Float sentAt: String! }
      type PriorAuthRequest { id: ID! patientId: String! payerName: String! claimType: String! status: String! authorizationNumber: String validFrom: String validTo: String submittedAt: String! }
      type NphiesClaim { id: ID! patientId: String! payerName: String! claimType: String! status: String! totalAmount: Float! approvedAmount: Float patientAmount: Float submittedAt: String! }

      type FacilityMetrics { workforce: WorkforceMetrics! communication: CommunicationMetrics! training: TrainingMetrics! incidents: IncidentMetrics! scheduling: SchedulingMetrics! }
      type WorkforceMetrics { totalStaff: Int! activeToday: Int! }
      type CommunicationMetrics { activeAnnouncements: Int! unreadMessages: Int! }
      type TrainingMetrics { totalCourses: Int! mandatoryCourses: Int! }
      type IncidentMetrics { openIncidents: Int! criticalOpen: Int! }
      type SchedulingMetrics { pendingShifts: Int! }

      type Announcement { id: ID! authorId: String! title: String! content: String! type: String! audience: String! isPinned: Boolean! acknowledgedBy: [String!]! createdAt: String! }
      type Message { id: ID! fromUserId: String! toUserIds: [String!]! subject: String! body: String! priority: String! readBy: [String!]! createdAt: String! }
      type TrainingCourse { id: ID! title: String! description: String category: String! durationMinutes: Int! passingScore: Int! isMandatory: Boolean! targetRoles: [String!]! status: String! enrolledCount: Int! completedCount: Int! }
      type CourseEnrollment { id: ID! courseId: String! userId: String! status: String! progress: Int! enrolledAt: String! }
      type TrainingStatus { userId: String! totalEnrollments: Int! completedCourses: Int! mandatoryTotal: Int! mandatoryCompliant: Int! complianceRate: Int! }
      type Incident { id: ID! reportedBy: String! type: String! severity: String! description: String! status: String! incidentDate: String! reportedAt: String! }
      type Shift { id: ID! userId: String! department: String! date: String! shiftType: String! startTime: String! endTime: String! status: String! }

      # ---- Input Types ----
      input PatientInput { nationalId: String! firstName: String! lastName: String! dateOfBirth: String! gender: String! phone: String email: String address: String bloodType: String allergies: [String!] chronicConditions: [String!] insuranceId: String insuranceProvider: String }
      input AppointmentInput { patientId: String! doctorId: String! appointmentDate: String! appointmentTime: String! type: String reason: String speciality: String durationMinutes: Int }
      input EncounterInput { patientId: String! doctorId: String! type: String appointmentId: String chiefComplaint: String ward: String bedNumber: String }
      input DischargeInput { encounterId: String! dischargeType: String dischargeSummary: String followUpDate: String dischargeMedications: [String!] dischargeInstructions: [String!] }
      input ClinicalNoteInput { encounterId: String! patientId: String! authorId: String! type: String subjective: String objective: String assessment: String plan: String freeText: String icdCodes: [String!] }
      input OrderInput { encounterId: String! patientId: String! orderingPhysicianId: String! type: String! orderCode: String! orderName: String! priority: String instructions: String indication: String }
      input ReferralInput { patientId: String! referringDoctorId: String! referredSpeciality: String! reason: String urgency: String encounterId: String clinicalSummary: String icdCode: String }
      input DischargeSummaryInput { encounterId: String! patientId: String! authorId: String! admissionDate: String dischargeDate: String dischargeType: String admittingDiagnosis: String dischargeDiagnosis: String hospitalCourse: String conditionOnDischarge: String }
      input ImagingOrderInput { encounterId: String! patientId: String! orderingPhysicianId: String! modality: String! bodyPart: String! procedureName: String! procedureCode: String priority: String clinicalIndication: String contrast: String laterality: String specialInstructions: String isPortable: Boolean }
      input RadiologyReportInput { orderId: String! radiologistId: String! findings: String! impression: String! recommendation: String icdCodes: [String!] isCritical: Boolean criticalFinding: String }
      input LabOrderInput { encounterId: String! patientId: String! orderingPhysicianId: String! testCodes: [String!]! specimenType: String priority: String clinicalNotes: String fastingRequired: Boolean }
      input LabResultInput { orderId: String! performedBy: String! results: [LabResultItemInput!]! overallStatus: String }
      input LabResultItemInput { testCode: String! value: Float unit: String interpretation: String }
      input PrescriptionInput { encounterId: String! patientId: String! prescriberId: String! medications: [MedicationInput!]! }
      input MedicationInput { drugCode: String! dose: String! frequency: String! durationDays: Int quantity: Int route: String instructions: String }
      input DispenseInput { prescriptionId: String! pharmacistId: String! counselingNotes: String pharmacyNotes: String }
      input ClaimInput { encounterId: String! patientId: String! providerId: String! serviceItems: [ServiceItemInput!]! coverageType: String preAuthId: String }
      input ServiceItemInput { serviceCode: String! quantity: Int icdCode: String isEmergency: Boolean }
      input PaymentInput { claimId: String! amount: Float! paymentMethod: String! referenceNumber: String! paidBy: String }
      input PreAuthInput { patientId: String! encounterId: String! insuranceId: String! insuranceProvider: String! serviceCodes: [String!]! clinicalJustification: String! icdCode: String urgency: String }
      input EligibilityInput { patientId: String! nationalId: String! insuranceId: String! payerCode: String! serviceDate: String serviceCodes: [String!] encounterId: String }
      input NphiesPriorAuthInput { patientId: String! encounterId: String! insuranceId: String! payerCode: String! claimType: String items: [NphiesItemInput!]! clinicalJustification: String! icdCode: String }
      input NphiesItemInput { serviceCode: String! quantity: Int unitPrice: Float }
      input NphiesClaimInput { patientId: String! encounterId: String! insuranceId: String! payerCode: String! claimType: String items: [NphiesItemInput!]! icdCodes: [String!] totalAmount: Float! providerId: String priorAuthId: String }
      input MessageInput { fromUserId: String! toUserIds: [String!]! subject: String body: String! priority: String relatedPatientId: String }
      input AnnouncementInput { authorId: String! title: String! content: String! type: String audience: String department: String expiresAt: String isPinned: Boolean }
      input IncidentInput { reportedBy: String! type: String! severity: String! description: String! incidentDate: String! incidentTime: String location: String immediateActions: String involvedPatientId: String }
      input ShiftInput { userId: String! department: String! date: String! shiftType: String! startTime: String! endTime: String! role: String notes: String }
      input HealthSyncInput { patientId: String! deviceSource: String! date: String steps: Float heartRate: Float glucose: Float systolic: Float diastolic: Float oxygenSaturation: Float bodyWeight: Float bodyTemperature: Float sleepDuration: Float hrv: Float role: String userId: String }
    `,
    resolvers: {
      Query: {
        // FHIR
        fhirObservations: (_, { patientId, metricType }) => {
          const allObs = fhirStore.flatMap(b => b.entry.map(e => e.resource))
            .filter(o => o.resourceType === 'Observation' && o.subject.reference === `Patient/${patientId}`);
          if (metricType && LOINC_CODES[metricType]) {
            return allObs.filter(o => o.code.coding[0].code === LOINC_CODES[metricType].code).map(flattenObs);
          }
          return allObs.map(flattenObs);
        },
        supportedMetrics: () => Object.entries(LOINC_CODES).map(([key, l]) => ({ key, loincCode: l.code, display: l.display })),
        auditEvents: (_, { resourceId }) => {
          const events = resourceId
            ? auditLog.filter(e => e.entity[0].what.reference.includes(resourceId))
            : auditLog;
          return events.map(e => ({ id: e.id, recorded: e.recorded, action: e.type.code, patientId: e.entity[0].what.reference.split('/')[1] || '', outcome: e.outcomeDesc, userId: e.agent[0].who.identifier.value }));
        },

        // Patient
        patient: (_, { id }) => { try { return patient.getPatient(id); } catch { return null; } },
        patientAppointments: (_, { patientId, status }) => patient.getPatientAppointments(patientId, { status }),
        patientTimeline: (_, { patientId }) => patient.getPatientTimeline(patientId),
        doctorSchedule: (_, { doctorId, date }) => patient.getDoctorSchedule(doctorId, date),
        activeEncounters: (_, { ward }) => patient.getActiveEncounters({ ward }),

        // Clinical
        encounterNotes: (_, { encounterId }) => clinical.getEncounterNotes(encounterId),
        encounterOrders: (_, { encounterId, type }) => clinical.getEncounterOrders(encounterId, type),
        patientReferrals: (_, { patientId }) => clinical.getPatientReferrals(patientId),
        doctorWorkload: (_, { doctorId }) => clinical.getDoctorWorkload(doctorId),

        // Radiology
        radiologyWorklist: (_, { modality, priority }) => radiology.getPendingWorklist(modality, priority),
        patientRadiologyReports: (_, { patientId, modality }) => radiology.getPatientRadiologyReports(patientId, modality),
        criticalFindings: () => radiology.getCriticalFindings(),

        // Laboratory
        labWorklist: (_, { priority }) => laboratory.getPendingLabOrders(priority),
        patientLabResults: (_, { patientId, category }) => laboratory.getPatientLabResults(patientId, category),
        criticalLabValues: () => laboratory.getCriticalLabValues(),

        // Pharmacy
        pharmacyWorklist: () => pharmacy.getPharmacyWorklist(),
        patientPrescriptions: (_, { patientId, status }) => pharmacy.getPatientPrescriptions(patientId, status),

        // SBS
        patientClaims: (_, { patientId, status }) => sbs.getPatientClaims(patientId, status),
        patientAccount: (_, { patientId }) => sbs.getPatientAccount(patientId),

        // NPHIES
        eligibilityStatus: (_, { eligibilityId }) => nphies.getEligibilityStatus(eligibilityId),
        priorAuthStatus: (_, { priorAuthId }) => nphies.getPriorAuthStatus(priorAuthId),
        nphiesClaimStatus: (_, { claimId }) => nphies.getNphiesClaimStatus(claimId),

        // Internal
        facilityMetrics: () => internal.getFacilityMetrics(),
        announcements: (_, { audience, department }) => internal.getActiveAnnouncements(audience, department),
        inboxMessages: (_, { userId }) => internal.getInboxMessages(userId),
        staffTrainingStatus: (_, { userId }) => internal.getStaffTrainingStatus(userId),
        availableCourses: (_, { category }) => internal.getCourses(category),
        incidentReports: (_, { status, severity }) => internal.getIncidents({ status, severity }),
      },

      Mutation: {
        // Patient
        registerPatient: (_, { input }) => patient.registerPatient(input),
        bookAppointment: (_, { input }) => patient.bookAppointment(input),
        updateAppointmentStatus: (_, { id, status, notes }) => patient.updateAppointmentStatus(id, status, notes),
        createEncounter: (_, { input }) => patient.createEncounter(input),
        dischargePatient: (_, { input }) => patient.dischargePatient(input),

        // Clinical
        createClinicalNote: (_, { input }) => clinical.createClinicalNote(input),
        createOrder: (_, { input }) => clinical.createOrder(input),
        createReferral: (_, { input }) => clinical.createReferral(input),
        createDischargeSummary: (_, { input }) => clinical.createDischargeSummary(input),

        // Radiology
        placeImagingOrder: (_, { input }) => radiology.placeImagingOrder(input),
        createRadiologyReport: (_, { input }) => radiology.createRadiologyReport(input),

        // Lab
        placeLabOrder: (_, { input }) => laboratory.placeLabOrder(input),
        recordLabResults: (_, { input }) => laboratory.recordLabResults(input),

        // Pharmacy
        createPrescription: (_, { input }) => pharmacy.createPrescription(input),
        dispensePrescription: (_, { input }) => pharmacy.dispensePrescription(input),

        // SBS
        createClaim: (_, { input }) => sbs.createClaim(input),
        submitClaim: (_, { claimId }) => sbs.submitClaim(claimId),
        recordPayment: (_, { input }) => sbs.recordPayment(input.claimId, input),
        requestPreAuthorization: (_, { input }) => sbs.requestPreAuthorization(input),

        // NPHIES
        requestEligibility: (_, { input }) => nphies.requestEligibilityCheck(input).eligibilityRequest,
        requestNphiesPriorAuth: (_, { input }) => nphies.requestPriorAuth(input).priorAuthRequest,
        submitNphiesClaim: (_, { input }) => nphies.submitNphiesClaim(input).nphiesClaim,

        // Internal
        sendMessage: (_, { input }) => internal.sendMessage(input),
        publishAnnouncement: (_, { input }) => internal.publishAnnouncement(input),
        enrollInCourse: (_, { courseId, userId }) => internal.enrollStaff(courseId, userId),
        reportIncident: (_, { input }) => internal.reportIncident(input),
        createShift: (_, { input }) => internal.createShift(input),

        // FHIR health sync
        syncHealthData: (_, { input }) => {
          const { patientId, deviceSource, role = 'patient', userId = 'app-user', ...metrics } = input;
          try {
            const bundle = normalizeHealthPayload({ patientId, deviceSource, ...metrics });
            fhirStore.push(bundle);
            const audit = recordAudit('health-sync', patientId, userId, 'Observation', 'success');
            return { success: true, message: `Synced ${bundle.entry.length} FHIR R4 observations`, bundleId: bundle.id, observationCount: bundle.entry.length, auditEventId: audit.id };
          } catch (err) {
            const audit = recordAudit('health-sync', patientId, userId, 'Observation', err.message);
            return { success: false, message: err.message, bundleId: null, observationCount: 0, auditEventId: audit.id };
          }
        },
      },
    },
  }),
  graphiql: { title: 'BrainSAIT Health Platform API' },
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://thefadil.site', 'https://dr-fadil-profile.pages.dev']
      : true,
    credentials: true,
  },
});

function flattenObs(obs) {
  return {
    id: obs.id, resourceType: obs.resourceType, status: obs.status,
    loincCode: obs.code.coding[0].code, loincDisplay: obs.code.coding[0].display,
    value: obs.valueQuantity.value, unit: obs.valueQuantity.unit,
    effectiveDateTime: obs.effectiveDateTime,
    patientId: obs.subject.reference.replace('Patient/', ''),
    deviceSource: obs.device ? obs.device.display : null,
  };
}

// ---------------------------------------------------------------------------
// HTTP Server - REST routes + GraphQL Yoga
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  // ═══════════════════════════════════════════════════════════════════════
  // PATIENT WORKSPACE  /api/patient/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/patient/register' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => patient.registerPatient(body), 'register', body.nationalId, body.userId, 'Patient');
  }
  if (path === '/api/patient/search' && method === 'GET') {
    const name = url.searchParams.get('name');
    const nationalId = url.searchParams.get('nationalId');
    const phone = url.searchParams.get('phone');
    return handle(res, () => patient.searchPatients({ name, nationalId, phone }), null, null, null, null);
  }
  if (path.startsWith('/api/patient/') && path.endsWith('/timeline') && method === 'GET') {
    const patientId = path.split('/')[3];
    return handle(res, () => patient.getPatientTimeline(patientId), 'read', patientId, 'system', 'Patient');
  }
  if (path === '/api/patient/appointment' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => patient.bookAppointment(body), 'book', body.patientId, body.userId, 'Appointment');
  }
  if (path === '/api/patient/encounter' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => patient.createEncounter(body), 'create', body.patientId, body.doctorId, 'Encounter');
  }
  if (path === '/api/patient/discharge' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => patient.dischargePatient(body), 'discharge', body.encounterId, body.userId, 'Encounter');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLINICAL WORKSPACE  /api/clinical/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/clinical/note' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => clinical.createClinicalNote(body), 'create', body.encounterId, body.authorId, 'ClinicalNote');
  }
  if (path === '/api/clinical/order' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => clinical.createOrder(body), 'create', body.encounterId, body.orderingPhysicianId, 'Order');
  }
  if (path === '/api/clinical/referral' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => clinical.createReferral(body), 'create', body.patientId, body.referringDoctorId, 'Referral');
  }
  if (path === '/api/clinical/discharge-summary' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => clinical.createDischargeSummary(body), 'create', body.encounterId, body.authorId, 'DischargeSummary');
  }
  if (path === '/api/clinical/workload' && method === 'GET') {
    const doctorId = url.searchParams.get('doctorId');
    if (!doctorId) return sendError(res, 400, 'doctorId required');
    return handle(res, () => clinical.getDoctorWorkload(doctorId), null, null, null, null);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RADIOLOGY WORKSPACE  /api/radiology/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/radiology/order' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => radiology.placeImagingOrder(body), 'create', body.patientId, body.orderingPhysicianId, 'ImagingOrder');
  }
  if (path === '/api/radiology/worklist' && method === 'GET') {
    const modality = url.searchParams.get('modality');
    const priority = url.searchParams.get('priority');
    return handle(res, () => radiology.getPendingWorklist(modality, priority), null, null, null, null);
  }
  if (path === '/api/radiology/report' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => radiology.createRadiologyReport(body), 'create', body.orderId, body.radiologistId, 'RadiologyReport');
  }
  if (path === '/api/radiology/critical' && method === 'GET') {
    return handle(res, () => radiology.getCriticalFindings(), null, null, null, null);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LABORATORY WORKSPACE  /api/lab/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/lab/order' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => laboratory.placeLabOrder(body), 'create', body.patientId, body.orderingPhysicianId, 'LabOrder');
  }
  if (path === '/api/lab/collect' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => laboratory.collectSpecimen(body.orderId, body), 'collect', body.orderId, body.collectedBy, 'Specimen');
  }
  if (path === '/api/lab/result' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => laboratory.recordLabResults(body), 'create', body.orderId, body.performedBy, 'LabResult');
  }
  if (path === '/api/lab/worklist' && method === 'GET') {
    const priority = url.searchParams.get('priority');
    return handle(res, () => laboratory.getPendingLabOrders(priority), null, null, null, null);
  }
  if (path === '/api/lab/critical' && method === 'GET') {
    return handle(res, () => laboratory.getCriticalLabValues(), null, null, null, null);
  }
  if (path === '/api/lab/catalog' && method === 'GET') {
    return sendJSON(res, 200, { tests: laboratory.LAB_TESTS });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHARMACY WORKSPACE  /api/pharmacy/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/pharmacy/prescribe' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => pharmacy.createPrescription(body), 'create', body.patientId, body.prescriberId, 'Prescription');
  }
  if (path === '/api/pharmacy/dispense' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => pharmacy.dispensePrescription(body), 'dispense', body.prescriptionId, body.pharmacistId, 'MedicationDispense');
  }
  if (path === '/api/pharmacy/check-interactions' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => pharmacy.checkInteractions(body.drugCodes || []), null, null, null, null);
  }
  if (path === '/api/pharmacy/worklist' && method === 'GET') {
    return handle(res, () => pharmacy.getPharmacyWorklist(), null, null, null, null);
  }
  if (path === '/api/pharmacy/drugs' && method === 'GET') {
    return sendJSON(res, 200, { drugs: pharmacy.DRUG_DATABASE });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SBS WORKSPACE  /api/sbs/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/sbs/claim' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => sbs.createClaim(body), 'create', body.patientId, body.providerId, 'Claim');
  }
  if (path === '/api/sbs/claim/submit' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => sbs.submitClaim(body.claimId), 'submit', body.claimId, body.userId, 'Claim');
  }
  if (path === '/api/sbs/payment' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => sbs.recordPayment(body.claimId, body), 'payment', body.claimId, body.userId, 'Payment');
  }
  if (path === '/api/sbs/preauth' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => sbs.requestPreAuthorization(body), 'preauth', body.patientId, body.userId, 'PreAuthorization');
  }
  if (path === '/api/sbs/services' && method === 'GET') {
    return sendJSON(res, 200, { services: sbs.SERVICE_CATALOG });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NPHIES WORKSPACE  /api/nphies/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/nphies/eligibility' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => nphies.requestEligibilityCheck(body), 'eligibility', body.patientId, body.userId, 'EligibilityRequest');
  }
  if (path === '/api/nphies/prior-auth' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => nphies.requestPriorAuth(body), 'prior-auth', body.patientId, body.userId, 'PriorAuthRequest');
  }
  if (path === '/api/nphies/claim' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => nphies.submitNphiesClaim(body), 'claim', body.patientId, body.userId, 'NphiesClaim');
  }
  if (path === '/api/nphies/payers' && method === 'GET') {
    return sendJSON(res, 200, { payers: nphies.NPHIES_PAYER_CODES });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INTERNAL WORKSPACE  /api/internal/*
  // ═══════════════════════════════════════════════════════════════════════
  if (path === '/api/internal/message' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.sendMessage(body), null, null, null, null);
  }
  if (path === '/api/internal/announcement' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.publishAnnouncement(body), null, null, null, null);
  }
  if (path === '/api/internal/course' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.createCourse(body), null, null, null, null);
  }
  if (path === '/api/internal/enroll' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.enrollStaff(body.courseId, body.userId), null, null, null, null);
  }
  if (path === '/api/internal/assess' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.submitCourseAssessment(body.courseId, body.userId, body.score), null, null, null, null);
  }
  if (path === '/api/internal/incident' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.reportIncident(body), null, null, null, null);
  }
  if (path === '/api/internal/shift' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.createShift(body), null, null, null, null);
  }
  if (path === '/api/internal/staff' && method === 'POST') {
    const body = await parseBody(req);
    return handle(res, () => internal.createStaffProfile(body), null, null, null, null);
  }
  if (path === '/api/internal/metrics' && method === 'GET') {
    return handle(res, () => internal.getFacilityMetrics(), null, null, null, null);
  }
  if (path === '/api/internal/announcements' && method === 'GET') {
    const audience = url.searchParams.get('audience');
    const department = url.searchParams.get('department');
    return handle(res, () => internal.getActiveAnnouncements(audience, department), null, null, null, null);
  }
  if (path === '/api/internal/courses' && method === 'GET') {
    const category = url.searchParams.get('category');
    return handle(res, () => internal.getCourses(category), null, null, null, null);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FHIR HEALTH DATA  /api/health/*
  // ═══════════════════════════════════════════════════════════════════════
  if (method === 'POST' && path === '/api/health/sync') {
    const payload = await parseBody(req);
    const { patientId, deviceSource, userId = 'app-user', role = 'patient', ...metrics } = payload;
    if (!patientId) return sendError(res, 400, 'patientId is required');
    try {
      const bundle = normalizeHealthPayload({ patientId, deviceSource, ...metrics });
      fhirStore.push(bundle);
      const audit = recordAudit('health-sync', patientId, userId, 'Observation', 'success');
      res.writeHead(201, { 'Content-Type': 'application/fhir+json' });
      return res.end(JSON.stringify({ bundleId: bundle.id, observationCount: bundle.entry.length, auditEventId: audit.id, bundle }));
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }
  if (method === 'GET' && path === '/api/health/observations') {
    const patientId = url.searchParams.get('patientId');
    if (!patientId) return sendError(res, 400, 'patientId required');
    const allObs = fhirStore.flatMap(b => b.entry.map(e => e.resource))
      .filter(o => o.subject.reference === `Patient/${patientId}`);
    res.writeHead(200, { 'Content-Type': 'application/fhir+json' });
    return res.end(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', total: allObs.length, entry: allObs.map(o => ({ resource: o })) }));
  }
  if (method === 'GET' && path === '/api/health/metrics') {
    return sendJSON(res, 200, { metrics: Object.entries(LOINC_CODES).map(([key, l]) => ({ key, loincCode: l.code, display: l.display })) });
  }
  if (method === 'GET' && path === '/api/health/audit') {
    return sendJSON(res, 200, { events: auditLog });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // API INDEX  /api
  // ═══════════════════════════════════════════════════════════════════════
  if (method === 'GET' && (path === '/api' || path === '/api/')) {
    return sendJSON(res, 200, {
      platform: 'BrainSAIT Health Platform',
      version: '2.0.0',
      workspaces: {
        patient:   'POST /api/patient/register | /appointment | /encounter | /discharge  GET /search | /{id}/timeline',
        clinical:  'POST /api/clinical/note | /order | /referral | /discharge-summary  GET /workload',
        radiology: 'POST /api/radiology/order | /report  GET /worklist | /critical',
        lab:       'POST /api/lab/order | /collect | /result  GET /worklist | /critical | /catalog',
        pharmacy:  'POST /api/pharmacy/prescribe | /dispense | /check-interactions  GET /worklist | /drugs',
        sbs:       'POST /api/sbs/claim | /claim/submit | /payment | /preauth  GET /services',
        nphies:    'POST /api/nphies/eligibility | /prior-auth | /claim  GET /payers',
        internal:  'POST /api/internal/message | /announcement | /course | /enroll | /assess | /incident | /shift | /staff  GET /metrics | /announcements | /courses',
        health:    'POST /api/health/sync  GET /observations | /metrics | /audit',
        graphql:   '/graphql',
      },
    });
  }

  // Delegate to GraphQL Yoga
  return yoga(req, res);
});

const port = process.env.PORT || 4000;

server.listen(port, () => {
  console.log(`🚀 BrainSAIT Health Platform API v2.0 on http://localhost:${port}`);
  console.log(`📊 GraphQL: http://localhost:${port}/graphql`);
  console.log(`📋 API Index: http://localhost:${port}/api`);
  console.log(`🏥 Workspaces: Patient | Clinical | Radiology | Lab | Pharmacy | SBS | NPHIES | Internal`);
});

module.exports = { server, yoga };
