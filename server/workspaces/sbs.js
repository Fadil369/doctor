/**
 * SBS (Saudi Billing System) Workspace Module - BrainSAIT Health Platform
 *
 * Covers healthcare billing & claims management:
 *   Encounter costing → Pre-authorization → Claim creation
 *   → Financial rules engine → Claim submission → Adjudication → Payment
 *
 * Complies with MOH Saudi Arabia billing standards.
 * FHIR R4 aligned (Claim, ClaimResponse, Coverage, ExplanationOfBenefit)
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: billing system integration)
// ---------------------------------------------------------------------------
const claims = new Map();
const claimItems = new Map();
const payments = new Map();
const preAuthorizations = new Map();
const patientAccounts = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Charge codes / service catalog (simplified)
// ---------------------------------------------------------------------------
const SERVICE_CATALOG = {
  'CONSULT_GP':    { description: 'General Practitioner Consultation', basePrice: 150, cptCode: '99213' },
  'CONSULT_SPEC':  { description: 'Specialist Consultation', basePrice: 300, cptCode: '99214' },
  'CONSULT_EMER':  { description: 'Emergency Consultation', basePrice: 500, cptCode: '99285' },
  'LAB_CBC':       { description: 'Complete Blood Count', basePrice: 80, cptCode: '85025' },
  'LAB_BMP':       { description: 'Basic Metabolic Panel', basePrice: 120, cptCode: '80048' },
  'RAD_XRAY':      { description: 'X-Ray 1 view', basePrice: 200, cptCode: '71046' },
  'RAD_CT_HEAD':   { description: 'CT Head without contrast', basePrice: 1200, cptCode: '70450' },
  'RAD_MRI_BRAIN': { description: 'MRI Brain without contrast', basePrice: 2500, cptCode: '70553' },
  'RAD_US_ABD':    { description: 'Abdominal Ultrasound', basePrice: 600, cptCode: '76700' },
  'ROOM_GENERAL':  { description: 'General ward room per day', basePrice: 500, cptCode: '99234' },
  'ROOM_ICU':      { description: 'ICU room per day', basePrice: 3000, cptCode: '99291' },
  'PROC_IV_LINE':  { description: 'IV line insertion', basePrice: 150, cptCode: '36000' },
  'DRUG_GEN':      { description: 'Generic medication', basePrice: 50, cptCode: 'DRUG' },
  'DRUG_BRANDED':  { description: 'Branded medication', basePrice: 200, cptCode: 'DRUG' },
  'NURSING_BASIC': { description: 'Basic nursing care', basePrice: 100, cptCode: '99504' },
};

// Payer coverage tiers
const COVERAGE_TYPES = ['insurance', 'cash', 'government', 'corporate', 'military'];
const CLAIM_STATUSES = ['draft', 'submitted', 'pending', 'adjudicated', 'paid', 'denied', 'appealing'];

// ---------------------------------------------------------------------------
// Financial Rules Engine
// ---------------------------------------------------------------------------

const FINANCIAL_RULES = [
  {
    id: 'FIN-001',
    name: 'Insurance copay 20%',
    condition: (item, coverage) => coverage.type === 'insurance' && !item.isEmergency,
    apply: (item) => ({ ...item, patientPortion: Math.round(item.amount * 0.20), insurancePortion: Math.round(item.amount * 0.80) }),
  },
  {
    id: 'FIN-002',
    name: 'Emergency services 100% covered',
    condition: (item, coverage) => coverage.type === 'insurance' && item.isEmergency,
    apply: (item) => ({ ...item, patientPortion: 0, insurancePortion: item.amount }),
  },
  {
    id: 'FIN-003',
    name: 'Government coverage 100%',
    condition: (_, coverage) => coverage.type === 'government',
    apply: (item) => ({ ...item, patientPortion: 0, insurancePortion: item.amount }),
  },
  {
    id: 'FIN-004',
    name: 'Cash patient - full amount',
    condition: (_, coverage) => coverage.type === 'cash',
    apply: (item) => ({ ...item, patientPortion: item.amount, insurancePortion: 0 }),
  },
];

function applyFinancialRules(item, coverage) {
  const rule = FINANCIAL_RULES.find(r => r.condition(item, coverage));
  if (rule) return { ...rule.apply(item), appliedRule: rule.id };
  return { ...item, patientPortion: item.amount, insurancePortion: 0, appliedRule: 'default' };
}

// ---------------------------------------------------------------------------
// Patient Accounts
// ---------------------------------------------------------------------------

function getOrCreateAccount(patientId, coverage = { type: 'cash' }) {
  if (!patientAccounts.has(patientId)) {
    patientAccounts.set(patientId, {
      patientId,
      coverage,
      balance: 0,
      totalCharged: 0,
      totalPaid: 0,
      transactions: [],
      createdAt: new Date().toISOString(),
    });
  }
  return patientAccounts.get(patientId);
}

// ---------------------------------------------------------------------------
// Pre-Authorization
// ---------------------------------------------------------------------------

/**
 * Request pre-authorization from insurer.
 * @param {object} data
 * @param {string} data.patientId
 * @param {string} data.encounterId
 * @param {string} data.insuranceId
 * @param {string} data.insuranceProvider
 * @param {string[]} data.serviceCodes     Service codes requiring auth
 * @param {string} data.clinicalJustification
 * @param {string} [data.icdCode]
 * @param {string} [data.urgency]           'elective'|'urgent'|'emergency'
 */
function requestPreAuthorization(data) {
  const {
    patientId, encounterId, insuranceId, insuranceProvider,
    serviceCodes, clinicalJustification,
    icdCode = '', urgency = 'elective',
  } = data;

  if (!patientId || !insuranceId || !serviceCodes?.length || !clinicalJustification) {
    throw new Error('Required: patientId, insuranceId, serviceCodes, clinicalJustification');
  }

  const id = makeId('PA');
  const preAuth = {
    id,
    patientId,
    encounterId,
    insuranceId,
    insuranceProvider,
    serviceCodes,
    clinicalJustification,
    icdCode,
    urgency,
    status: 'pending',
    authorizationNumber: null,
    approvedServices: [],
    deniedServices: [],
    validFrom: null,
    validTo: null,
    requestedAt: new Date().toISOString(),
    respondedAt: null,
    notes: '',
  };

  preAuthorizations.set(id, preAuth);
  return preAuth;
}

function processPreAuthorization(preAuthId, { approved, authNumber, approvedServices, notes = '', validDays = 30 }) {
  const pa = preAuthorizations.get(preAuthId);
  if (!pa) throw new Error(`Pre-authorization not found: ${preAuthId}`);

  const now = new Date();
  pa.status = approved ? 'approved' : 'denied';
  pa.authorizationNumber = authNumber;
  pa.approvedServices = approvedServices || [];
  pa.deniedServices = pa.serviceCodes.filter(s => !(approvedServices || []).includes(s));
  pa.validFrom = now.toISOString().slice(0, 10);
  pa.validTo = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  pa.respondedAt = now.toISOString();
  pa.notes = notes;

  return pa;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/**
 * Create a billing claim for an encounter.
 * @param {object} data
 * @param {string} data.encounterId
 * @param {string} data.patientId
 * @param {string} data.providerId
 * @param {object[]} data.serviceItems      Array of billed items
 * @param {string} data.serviceItems[].serviceCode
 * @param {number} data.serviceItems[].quantity
 * @param {boolean} [data.serviceItems[].isEmergency]
 * @param {string} [data.serviceItems[].icdCode]
 * @param {string} [data.coverageType]      Defaults to account coverage
 * @param {string} [data.preAuthId]         Pre-authorization ID if required
 */
function createClaim(data) {
  const {
    encounterId, patientId, providerId,
    serviceItems, coverageType, preAuthId = null,
  } = data;

  if (!encounterId || !patientId || !providerId || !serviceItems?.length) {
    throw new Error('Required: encounterId, patientId, providerId, serviceItems (array)');
  }

  const account = getOrCreateAccount(patientId);
  const coverage = { type: coverageType || account.coverage.type };

  // Price each service item
  const pricedItems = serviceItems.map(item => {
    const svc = SERVICE_CATALOG[item.serviceCode];
    if (!svc) throw new Error(`Unknown service code: ${item.serviceCode}`);
    const amount = svc.basePrice * (item.quantity || 1);
    const lined = applyFinancialRules({ ...item, amount, isEmergency: item.isEmergency || false }, coverage);
    return {
      id: makeId('LI'),
      serviceCode: item.serviceCode,
      description: svc.description,
      cptCode: svc.cptCode,
      icdCode: item.icdCode || '',
      quantity: item.quantity || 1,
      unitPrice: svc.basePrice,
      amount,
      patientPortion: lined.patientPortion,
      insurancePortion: lined.insurancePortion,
      appliedRule: lined.appliedRule,
      isEmergency: item.isEmergency || false,
    };
  });

  const totalAmount = pricedItems.reduce((sum, i) => sum + i.amount, 0);
  const totalPatient = pricedItems.reduce((sum, i) => sum + i.patientPortion, 0);
  const totalInsurance = pricedItems.reduce((sum, i) => sum + i.insurancePortion, 0);

  const id = makeId('CLM');
  const claim = {
    id,
    encounterId,
    patientId,
    providerId,
    coverage,
    preAuthId,
    serviceItems: pricedItems,
    totalAmount,
    totalPatient,
    totalInsurance,
    status: 'draft',
    claimNumber: `CLM${Date.now().toString().slice(-8)}`,
    createdAt: new Date().toISOString(),
    submittedAt: null,
    adjudicatedAt: null,
    paidAt: null,
    denialReason: null,
    notes: '',
  };

  claims.set(id, claim);

  // Update patient account
  account.totalCharged += totalAmount;
  account.balance += totalPatient;
  account.transactions.push({
    type: 'charge',
    amount: totalAmount,
    claimId: id,
    date: claim.createdAt,
  });

  return claim;
}

function submitClaim(claimId) {
  const claim = claims.get(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);
  if (claim.status !== 'draft') throw new Error('Only draft claims can be submitted');
  claim.status = 'submitted';
  claim.submittedAt = new Date().toISOString();
  return claim;
}

function adjudicateClaim(claimId, { approved, adjustedAmount = null, denialReason = '', notes = '' }) {
  const claim = claims.get(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);
  claim.status = approved ? 'adjudicated' : 'denied';
  claim.adjudicatedAt = new Date().toISOString();
  if (!approved) claim.denialReason = denialReason;
  if (adjustedAmount !== null) claim.approvedAmount = adjustedAmount;
  else claim.approvedAmount = approved ? claim.totalInsurance : 0;
  claim.notes = notes;
  return claim;
}

function recordPayment(claimId, { amount, paymentMethod, referenceNumber, paidBy = 'insurance' }) {
  const claim = claims.get(claimId);
  if (!claim) throw new Error(`Claim not found: ${claimId}`);

  const payId = makeId('PAY');
  const payment = {
    id: payId,
    claimId,
    patientId: claim.patientId,
    amount,
    paymentMethod,
    referenceNumber,
    paidBy,
    paidAt: new Date().toISOString(),
  };
  payments.set(payId, payment);

  claim.status = 'paid';
  claim.paidAt = payment.paidAt;

  const account = patientAccounts.get(claim.patientId);
  if (account) {
    account.totalPaid += amount;
    account.balance = Math.max(0, account.balance - (paidBy === 'patient' ? amount : 0));
    account.transactions.push({ type: 'payment', amount, paymentId: payId, date: payment.paidAt });
  }

  return payment;
}

function getPatientClaims(patientId, status = null) {
  return [...claims.values()].filter(c => {
    if (c.patientId !== patientId) return false;
    if (status && c.status !== status) return false;
    return true;
  });
}

function getPatientAccount(patientId) {
  return getOrCreateAccount(patientId);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Pre-authorization
  requestPreAuthorization,
  processPreAuthorization,
  // Claims
  createClaim,
  submitClaim,
  adjudicateClaim,
  recordPayment,
  getPatientClaims,
  // Account
  getPatientAccount,
  getOrCreateAccount,
  // Catalog
  SERVICE_CATALOG,
  COVERAGE_TYPES,
  CLAIM_STATUSES,
  FINANCIAL_RULES,
  // Utilities
  applyFinancialRules,
  // Stores (for testing)
  _stores: { claims, claimItems, payments, preAuthorizations, patientAccounts },
};
