/**
 * NPHIES Workspace Module - BrainSAIT Health Platform
 *
 * National Platform for Health Information Exchange (NPHIES) integration.
 * Covers:
 *   - Insurance eligibility verification
 *   - Pre-authorization (prior auth) requests
 *   - FHIR-based claim submission and tracking
 *   - Claim status inquiry
 *   - Communication requests
 *   - NPHIES Bundle construction
 *
 * FHIR R4 / NPHIES profile compliant
 * Ref: https://simplifier.net/Nphies
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: NPHIES gateway integration)
// ---------------------------------------------------------------------------
const eligibilityRequests = new Map();
const priorAuthRequests = new Map();
const nphiesClaims = new Map();
const communicationRequests = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// NPHIES constants
// ---------------------------------------------------------------------------
const NPHIES_ENDPOINT = process.env.NPHIES_ENDPOINT || 'https://hsb.nphies.sa/$process-message';
const NPHIES_PROVIDER_ID = process.env.NPHIES_PROVIDER_ID || 'N-F-00000000';
const NPHIES_PAYER_CODES = {
  'BUPA':    { code: 'N-I-00000001', name: 'Bupa Arabia' },
  'MEDGULF': { code: 'N-I-00000002', name: 'MedGulf Insurance' },
  'MALATH':  { code: 'N-I-00000003', name: 'Malath Insurance' },
  'TAWUNIYA':{ code: 'N-I-00000004', name: 'Tawuniya Insurance' },
  'AXA':     { code: 'N-I-00000005', name: 'AXA Cooperative' },
};

const NPHIES_CLAIM_TYPES = ['institutional', 'oral', 'pharmacy', 'professional', 'vision'];
const NPHIES_CARE_TEAM_ROLES = ['primary', 'assist', 'supervisor', 'other'];

// ---------------------------------------------------------------------------
// NPHIES Bundle Builder (FHIR MessageBundle)
// ---------------------------------------------------------------------------

function buildNphiesMessageBundle(messageEventCode, payload) {
  const bundleId = makeId('NB');
  const now = new Date().toISOString();

  return {
    resourceType: 'Bundle',
    id: bundleId,
    meta: {
      profile: ['http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle|1.0.0'],
    },
    type: 'message',
    timestamp: now,
    entry: [
      // MessageHeader
      {
        fullUrl: `urn:uuid:${makeId('MH')}`,
        resource: {
          resourceType: 'MessageHeader',
          id: makeId('MH'),
          meta: {
            profile: ['http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/message-header|1.0.0'],
          },
          eventCoding: {
            system: 'http://nphies.sa/terminology/CodeSystem/ksa-message-events',
            code: messageEventCode,
          },
          destination: [{
            endpoint: NPHIES_ENDPOINT,
            receiver: { identifier: { value: payload.payerCode || NPHIES_PAYER_CODES['BUPA'].code } },
          }],
          sender: {
            identifier: { value: NPHIES_PROVIDER_ID },
            display: 'BrainSAIT Health Facility',
          },
          source: {
            endpoint: `https://brainsait.io/fhir`,
          },
          focus: payload.focusReferences || [],
        },
      },
      // Payload resources
      ...(payload.resources || []).map(res => ({
        fullUrl: `urn:uuid:${res.id}`,
        resource: res,
      })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Eligibility Verification (coverage-eligibility-request)
// ---------------------------------------------------------------------------

/**
 * Verify patient insurance eligibility with NPHIES.
 * @param {object} data
 * @param {string} data.patientId
 * @param {string} data.nationalId         Patient national ID
 * @param {string} data.insuranceId        Member ID / policy number
 * @param {string} data.payerCode          Key from NPHIES_PAYER_CODES
 * @param {string} [data.serviceDate]      Date of service (ISO 8601 date)
 * @param {string[]} [data.serviceCodes]   Service codes to check coverage for
 * @param {string} [data.encounterId]
 */
function requestEligibilityCheck(data) {
  const {
    patientId, nationalId, insuranceId, payerCode,
    serviceDate = new Date().toISOString().slice(0, 10),
    serviceCodes = [], encounterId = null,
  } = data;

  if (!patientId || !nationalId || !insuranceId || !payerCode) {
    throw new Error('Required: patientId, nationalId, insuranceId, payerCode');
  }

  const payer = NPHIES_PAYER_CODES[payerCode];
  if (!payer) throw new Error(`Unknown payer code: ${payerCode}. Available: ${Object.keys(NPHIES_PAYER_CODES).join(', ')}`);

  const id = makeId('ELG');
  const eligibilityReq = {
    id,
    patientId,
    nationalId,
    insuranceId,
    payerCode,
    payerName: payer.name,
    payerNphiesCode: payer.code,
    serviceDate,
    serviceCodes,
    encounterId,
    status: 'pending',
    nphiesBundleId: null,
    sentAt: new Date().toISOString(),
    responseReceivedAt: null,
    eligible: null,
    coverageDetails: null,
    copay: null,
    deductible: null,
    maxCoverage: null,
    errors: [],
  };

  // Build NPHIES bundle (would be transmitted to NPHIES gateway in production)
  const bundle = buildNphiesMessageBundle('eligibility-request', {
    payerCode: payer.code,
    focusReferences: [{ reference: `CoverageEligibilityRequest/${id}` }],
    resources: [
      {
        resourceType: 'CoverageEligibilityRequest',
        id,
        status: 'active',
        purpose: ['validation', 'benefits'],
        patient: { identifier: { value: nationalId } },
        created: eligibilityReq.sentAt,
        insurer: { identifier: { value: payer.code } },
        insurance: [{
          coverage: { identifier: { value: insuranceId } },
          benefitPeriod: { start: serviceDate },
        }],
      },
    ],
  });

  eligibilityReq.nphiesBundleId = bundle.id;
  eligibilityRequests.set(id, eligibilityReq);

  // Simulate NPHIES response (production: async webhook)
  simulateEligibilityResponse(id);

  return { eligibilityRequest: eligibilityReq, nphiesBundle: bundle };
}

function simulateEligibilityResponse(eligibilityId) {
  const req = eligibilityRequests.get(eligibilityId);
  if (!req) return;

  // Simulated 95% eligibility success rate
  const eligible = Math.random() > 0.05;
  req.eligible = eligible;
  req.status = eligible ? 'eligible' : 'not-eligible';
  req.responseReceivedAt = new Date().toISOString();

  if (eligible) {
    req.coverageDetails = {
      plan: 'Comprehensive Medical Plan',
      network: 'in-network',
      effectiveFrom: '2024-01-01',
      effectiveTo: '2024-12-31',
    };
    req.copay = 20;          // percentage
    req.deductible = 1000;   // SAR annual deductible
    req.maxCoverage = 500000; // SAR annual max
  }
}

function getEligibilityStatus(eligibilityId) {
  const req = eligibilityRequests.get(eligibilityId);
  if (!req) throw new Error(`Eligibility request not found: ${eligibilityId}`);
  return req;
}

// ---------------------------------------------------------------------------
// Prior Authorization (prior-auth-request)
// ---------------------------------------------------------------------------

/**
 * Submit a prior authorization request to NPHIES.
 * @param {object} data
 * @param {string} data.patientId
 * @param {string} data.encounterId
 * @param {string} data.insuranceId
 * @param {string} data.payerCode
 * @param {string} data.claimType          One of NPHIES_CLAIM_TYPES
 * @param {object[]} data.items            Services / items requiring authorization
 * @param {string} data.clinicalJustification
 * @param {string} [data.icdCode]          Primary diagnosis ICD-10 code
 * @param {object[]} [data.supportingInfo] Clinical evidence attachments
 */
function requestPriorAuth(data) {
  const {
    patientId, encounterId, insuranceId, payerCode,
    claimType = 'professional', items, clinicalJustification,
    icdCode = '', supportingInfo = [],
  } = data;

  if (!patientId || !encounterId || !insuranceId || !payerCode || !items?.length) {
    throw new Error('Required: patientId, encounterId, insuranceId, payerCode, items');
  }
  if (!NPHIES_CLAIM_TYPES.includes(claimType)) {
    throw new Error(`claimType must be one of: ${NPHIES_CLAIM_TYPES.join(', ')}`);
  }

  const payer = NPHIES_PAYER_CODES[payerCode];
  if (!payer) throw new Error(`Unknown payer code: ${payerCode}`);

  const id = makeId('PAR');
  const priorAuth = {
    id,
    patientId,
    encounterId,
    insuranceId,
    payerCode,
    payerName: payer.name,
    claimType,
    items,
    clinicalJustification,
    icdCode,
    supportingInfo,
    status: 'pending',
    authorizationNumber: null,
    approvedItems: [],
    deniedItems: [],
    validFrom: null,
    validTo: null,
    nphiesBundleId: null,
    submittedAt: new Date().toISOString(),
    respondedAt: null,
    notes: '',
  };

  const bundle = buildNphiesMessageBundle('priorauth-request', {
    payerCode: payer.code,
    focusReferences: [{ reference: `Claim/${id}` }],
    resources: [
      {
        resourceType: 'Claim',
        id,
        meta: { profile: ['http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/prior-auth-request|1.0.0'] },
        status: 'active',
        type: { coding: [{ code: claimType }] },
        use: 'preauthorization',
        patient: { identifier: { value: patientId } },
        created: priorAuth.submittedAt,
        insurer: { identifier: { value: payer.code } },
        insurance: [{ sequence: 1, focal: true, coverage: { identifier: { value: insuranceId } } }],
        diagnosis: icdCode ? [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: icdCode }] } }] : [],
        item: items.map((item, i) => ({
          sequence: i + 1,
          productOrService: { coding: [{ code: item.serviceCode }] },
          quantity: { value: item.quantity || 1 },
          unitPrice: { value: item.unitPrice || 0, currency: 'SAR' },
        })),
      },
    ],
  });

  priorAuth.nphiesBundleId = bundle.id;
  priorAuthRequests.set(id, priorAuth);

  // Simulate NPHIES response
  simulatePriorAuthResponse(id);

  return { priorAuthRequest: priorAuth, nphiesBundle: bundle };
}

function simulatePriorAuthResponse(priorAuthId) {
  const pa = priorAuthRequests.get(priorAuthId);
  if (!pa) return;

  const approved = Math.random() > 0.15;
  pa.status = approved ? 'approved' : 'denied';
  pa.respondedAt = new Date().toISOString();

  if (approved) {
    pa.authorizationNumber = `AUTH-${Date.now().toString().slice(-8)}`;
    pa.approvedItems = pa.items.map(i => i.serviceCode);
    const now = new Date();
    pa.validFrom = now.toISOString().slice(0, 10);
    pa.validTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  } else {
    pa.deniedItems = pa.items.map(i => i.serviceCode);
    pa.notes = 'Not medically necessary based on submitted clinical information';
  }
}

function getPriorAuthStatus(priorAuthId) {
  const pa = priorAuthRequests.get(priorAuthId);
  if (!pa) throw new Error(`Prior auth request not found: ${priorAuthId}`);
  return pa;
}

// ---------------------------------------------------------------------------
// NPHIES Claim Submission
// ---------------------------------------------------------------------------

/**
 * Submit a finalized claim to NPHIES.
 * @param {object} data - mirrors SBS claim data
 */
function submitNphiesClaim(data) {
  const {
    patientId, encounterId, insuranceId, payerCode,
    claimType = 'professional', items,
    icdCodes = [], priorAuthId = null,
    totalAmount, providerId,
  } = data;

  if (!patientId || !insuranceId || !payerCode || !items?.length) {
    throw new Error('Required: patientId, insuranceId, payerCode, items');
  }

  const payer = NPHIES_PAYER_CODES[payerCode];
  if (!payer) throw new Error(`Unknown payer code: ${payerCode}`);

  const id = makeId('NC');
  const nphiesClaim = {
    id,
    patientId,
    encounterId,
    insuranceId,
    payerCode,
    payerName: payer.name,
    claimType,
    items,
    icdCodes,
    priorAuthId,
    totalAmount,
    providerId,
    status: 'submitted',
    nphiesClaimId: null,
    nphiesBundleId: null,
    submittedAt: new Date().toISOString(),
    adjudicatedAt: null,
    approvedAmount: null,
    patientAmount: null,
    denialReason: null,
  };

  const bundle = buildNphiesMessageBundle('claim-request', {
    payerCode: payer.code,
    focusReferences: [{ reference: `Claim/${id}` }],
    resources: [
      {
        resourceType: 'Claim',
        id,
        meta: { profile: ['http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/institutional-claim|1.0.0'] },
        status: 'active',
        type: { coding: [{ code: claimType }] },
        use: 'claim',
        patient: { identifier: { value: patientId } },
        created: nphiesClaim.submittedAt,
        insurer: { identifier: { value: payer.code } },
        provider: { identifier: { value: providerId || NPHIES_PROVIDER_ID } },
        insurance: [{
          sequence: 1, focal: true,
          coverage: { identifier: { value: insuranceId } },
          preAuthRef: priorAuthId ? [priorAuthId] : [],
        }],
        diagnosis: icdCodes.map((code, i) => ({
          sequence: i + 1,
          diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code }] },
          type: [{ coding: [{ code: i === 0 ? 'principal' : 'secondary' }] }],
        })),
        item: items.map((item, i) => ({
          sequence: i + 1,
          productOrService: { coding: [{ code: item.serviceCode }] },
          quantity: { value: item.quantity || 1 },
          unitPrice: { value: item.unitPrice || 0, currency: 'SAR' },
          net: { value: item.amount || 0, currency: 'SAR' },
        })),
        total: { value: totalAmount, currency: 'SAR' },
      },
    ],
  });

  nphiesClaim.nphiesBundleId = bundle.id;
  nphiesClaims.set(id, nphiesClaim);

  // Simulate adjudication
  simulateNphiesAdjudication(id);

  return { nphiesClaim, nphiesBundle: bundle };
}

function simulateNphiesAdjudication(claimId) {
  const claim = nphiesClaims.get(claimId);
  if (!claim) return;

  setTimeout(() => {
    const approved = Math.random() > 0.10;
    claim.status = approved ? 'adjudicated' : 'denied';
    claim.adjudicatedAt = new Date().toISOString();
    if (approved) {
      claim.approvedAmount = claim.totalAmount * 0.95; // 5% deduction example
      claim.patientAmount = claim.totalAmount * 0.05;
    } else {
      claim.denialReason = 'Documentation insufficient';
    }
    claim.nphiesClaimId = `NPHIES-${Date.now().toString().slice(-10)}`;
  }, 100);
}

function getNphiesClaimStatus(claimId) {
  const claim = nphiesClaims.get(claimId);
  if (!claim) throw new Error(`NPHIES claim not found: ${claimId}`);
  return claim;
}

// ---------------------------------------------------------------------------
// Communication Requests (appeal / additional info)
// ---------------------------------------------------------------------------

function sendCommunicationRequest(data) {
  const { claimId, patientId, payerCode, subject, message, attachments = [] } = data;
  const payer = NPHIES_PAYER_CODES[payerCode];
  if (!payer) throw new Error(`Unknown payer code: ${payerCode}`);

  const id = makeId('COM');
  const commReq = {
    id,
    claimId,
    patientId,
    payerCode,
    payerName: payer.name,
    subject,
    message,
    attachments,
    status: 'sent',
    sentAt: new Date().toISOString(),
    responseReceivedAt: null,
    response: null,
  };

  communicationRequests.set(id, commReq);
  return commReq;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Eligibility
  requestEligibilityCheck,
  getEligibilityStatus,
  // Prior auth
  requestPriorAuth,
  getPriorAuthStatus,
  // Claims
  submitNphiesClaim,
  getNphiesClaimStatus,
  // Communication
  sendCommunicationRequest,
  // Bundle builder
  buildNphiesMessageBundle,
  // Constants
  NPHIES_PAYER_CODES,
  NPHIES_CLAIM_TYPES,
  NPHIES_ENDPOINT,
  // Stores (for testing)
  _stores: { eligibilityRequests, priorAuthRequests, nphiesClaims, communicationRequests },
};
