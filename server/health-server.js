/**
 * BrainSAIT Health Platform - Extended GraphQL + FHIR REST API Server
 * Integrates FHIR R4, health device data, HIPAA audit logging, and RBAC
 *
 * Architecture:
 *   Mobile App → /api/health/sync (POST, JSON) → FHIR Normalizer → FHIR Bundle
 *   Mobile App → GraphQL /graphql → healthcare data queries
 */

'use strict';

const { createServer } = require('node:http');
const { createYoga, createSchema } = require('graphql-yoga');
const { normalizeHealthPayload, createAuditEvent, LOINC_CODES } = require('./fhir');

// ---------------------------------------------------------------------------
// In-memory audit log (production: replace with append-only database)
// ---------------------------------------------------------------------------
const auditLog = [];

function recordAudit(action, patientId, userId, resourceType, outcome) {
  const entry = createAuditEvent(action, patientId, userId, resourceType, outcome);
  auditLog.push(entry);
  console.log(`[AUDIT] ${entry.recorded} | action=${action} patient=${patientId} outcome=${outcome}`);
  return entry;
}

// ---------------------------------------------------------------------------
// Simple in-memory FHIR Bundle store (production: replace with FHIR server)
// ---------------------------------------------------------------------------
const fhirStore = [];

// ---------------------------------------------------------------------------
// RBAC helper – roles: 'patient' | 'clinician' | 'admin'
// ---------------------------------------------------------------------------
const ROLES = {
  patient: ['read:own', 'write:own'],
  clinician: ['read:own', 'read:patient', 'write:observation'],
  admin: ['read:own', 'read:patient', 'write:observation', 'read:audit'],
};

function hasPermission(role, permission) {
  return (ROLES[role] || []).includes(permission);
}

// ---------------------------------------------------------------------------
// GraphQL schema & resolvers
// ---------------------------------------------------------------------------
const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        # Professional Information
        profile: DoctorProfile!
        services: [MedicalService!]!
        specializations: [Specialization!]!

        # Contact and Appointment
        contactInfo: ContactInfo!
        availableSlots(date: String!): [TimeSlot!]!

        # Health and Innovation
        innovations: [Innovation!]!
        publications: [Publication!]!

        # General Health Query
        healthTip: String!

        # FHIR / Health Data
        fhirObservations(patientId: String!, metricType: String): [FHIRObservation!]!
        auditEvents(patientId: String): [AuditEvent!]!
        supportedMetrics: [SupportedMetric!]!
      }

      type Mutation {
        # Contact and Appointment
        submitContactForm(input: ContactFormInput!): ContactFormResponse!
        requestAppointment(input: AppointmentInput!): AppointmentResponse!

        # Newsletter and Updates
        subscribeNewsletter(email: String!): SubscriptionResponse!

        # Health Data Sync
        syncHealthData(input: HealthSyncInput!): HealthSyncResponse!
      }

      # -----------------------------------------------------------------------
      # Core Types
      # -----------------------------------------------------------------------
      type DoctorProfile {
        name: String!
        title: String!
        specializations: [String!]!
        bio: String!
        experience: Int!
        education: [Education!]!
        certifications: [String!]!
        languages: [String!]!
      }

      type MedicalService {
        id: ID!
        name: String!
        description: String!
        duration: Int!
        category: ServiceCategory!
        isAvailable: Boolean!
      }

      type Specialization {
        id: ID!
        name: String!
        description: String!
        experience: Int!
      }

      type ContactInfo {
        email: String!
        phone: String!
        address: String!
        clinicHours: [ClinicHours!]!
        emergencyContact: String!
      }

      type TimeSlot {
        time: String!
        available: Boolean!
        duration: Int!
      }

      type Innovation {
        id: ID!
        title: String!
        description: String!
        category: String!
        date: String!
        link: String
      }

      type Publication {
        id: ID!
        title: String!
        journal: String!
        date: String!
        authors: [String!]!
        abstract: String!
        link: String
      }

      type Education {
        degree: String!
        institution: String!
        year: Int!
        location: String!
      }

      type ClinicHours {
        day: String!
        openTime: String!
        closeTime: String!
        isOpen: Boolean!
      }

      # -----------------------------------------------------------------------
      # FHIR / Health Data Types
      # -----------------------------------------------------------------------
      type FHIRObservation {
        id: ID!
        resourceType: String!
        status: String!
        loincCode: String!
        loincDisplay: String!
        value: Float!
        unit: String!
        effectiveDateTime: String!
        patientId: String!
        deviceSource: String
      }

      type AuditEvent {
        id: ID!
        recorded: String!
        action: String!
        patientId: String!
        outcome: String!
        userId: String
      }

      type SupportedMetric {
        key: String!
        loincCode: String!
        display: String!
      }

      # -----------------------------------------------------------------------
      # Input Types
      # -----------------------------------------------------------------------
      input ContactFormInput {
        name: String!
        email: String!
        subject: String!
        message: String!
        isUrgent: Boolean = false
      }

      input AppointmentInput {
        name: String!
        email: String!
        phone: String!
        preferredDate: String!
        preferredTime: String!
        serviceType: String!
        reason: String!
      }

      input HealthSyncInput {
        patientId: String!
        deviceSource: String!
        date: String
        steps: Float
        heartRate: Float
        glucose: Float
        systolic: Float
        diastolic: Float
        oxygenSaturation: Float
        bodyWeight: Float
        bodyTemperature: Float
        sleepDuration: Float
        hrv: Float
        role: String
        userId: String
      }

      # -----------------------------------------------------------------------
      # Response Types
      # -----------------------------------------------------------------------
      type ContactFormResponse {
        success: Boolean!
        message: String!
        referenceId: String
      }

      type AppointmentResponse {
        success: Boolean!
        message: String!
        appointmentId: String
        confirmationSent: Boolean!
      }

      type SubscriptionResponse {
        success: Boolean!
        message: String!
      }

      type HealthSyncResponse {
        success: Boolean!
        message: String!
        bundleId: String
        observationCount: Int!
        auditEventId: String
      }

      # -----------------------------------------------------------------------
      # Enums
      # -----------------------------------------------------------------------
      enum ServiceCategory {
        CONSULTATION
        DIAGNOSTIC
        TREATMENT
        INNOVATION
        RESEARCH
      }
    `,
    resolvers: {
      Query: {
        profile: () => ({
          name: "Dr. Mohamed El Fadil",
          title: "Physician & Healthcare Technology Innovator",
          specializations: ["Family Medicine", "Healthcare AI", "Medical Innovation", "Digital Health"],
          bio: "Leading healthcare technology innovator dedicated to transforming medical practice through AI and digital solutions. Founder of BrainSAIT platform, specializing in intelligent healthcare systems.",
          experience: 15,
          education: [
            { degree: "Doctor of Medicine (MD)", institution: "University of Medical Sciences", year: 2008, location: "Sudan" },
            { degree: "Master in Healthcare Technology", institution: "International Institute of Technology", year: 2015, location: "Online" }
          ],
          certifications: [
            "Board Certified Family Physician",
            "Healthcare AI Specialist",
            "Digital Health Innovation Certificate",
            "Medical Device Development"
          ],
          languages: ["Arabic", "English", "French"]
        }),

        services: () => [
          { id: "1", name: "General Consultation", description: "Comprehensive medical consultation and health assessment", duration: 45, category: "CONSULTATION", isAvailable: true },
          { id: "2", name: "AI-Powered Diagnostic", description: "Advanced diagnostic using artificial intelligence tools", duration: 60, category: "DIAGNOSTIC", isAvailable: true },
          { id: "3", name: "Healthcare Innovation Consulting", description: "Consulting for healthcare technology development", duration: 90, category: "INNOVATION", isAvailable: true },
          { id: "4", name: "Telemedicine Consultation", description: "Remote medical consultation via secure video call", duration: 30, category: "CONSULTATION", isAvailable: true }
        ],

        specializations: () => [
          { id: "1", name: "Family Medicine", description: "Comprehensive primary care for patients of all ages", experience: 15 },
          { id: "2", name: "Healthcare AI", description: "Artificial intelligence applications in medical practice", experience: 8 },
          { id: "3", name: "Digital Health", description: "Digital transformation of healthcare delivery", experience: 10 }
        ],

        contactInfo: () => ({
          email: "contact@brainsait.io",
          phone: "+1-555-MEDICAL",
          address: "BrainSAIT Healthcare Innovation Center",
          clinicHours: [
            { day: "Monday",    openTime: "09:00", closeTime: "17:00", isOpen: true },
            { day: "Tuesday",   openTime: "09:00", closeTime: "17:00", isOpen: true },
            { day: "Wednesday", openTime: "09:00", closeTime: "17:00", isOpen: true },
            { day: "Thursday",  openTime: "09:00", closeTime: "17:00", isOpen: true },
            { day: "Friday",    openTime: "09:00", closeTime: "15:00", isOpen: true },
            { day: "Saturday",  openTime: "10:00", closeTime: "14:00", isOpen: true },
            { day: "Sunday",    openTime: "00:00", closeTime: "00:00", isOpen: false }
          ],
          emergencyContact: "Emergency: +1-555-URGENT"
        }),

        availableSlots: (_, { date }) => {
          const slots = [];
          for (let hour = 9; hour <= 16; hour++) {
            slots.push({
              time: `${hour.toString().padStart(2, '0')}:00`,
              available: Math.random() > 0.3,
              duration: 45
            });
          }
          return slots;
        },

        innovations: () => [
          { id: "1", title: "BrainSAIT AI Diagnostic Platform", description: "Revolutionary AI-powered diagnostic system for early disease detection", category: "Artificial Intelligence", date: "2024-01-15", link: "https://brainsait.io/innovations/ai-diagnostic" },
          { id: "2", title: "Telemedicine Integration System", description: "Seamless telemedicine platform for remote patient care", category: "Digital Health", date: "2023-11-20", link: "https://brainsait.io/innovations/telemedicine" },
          { id: "3", title: "Medical IoT Monitoring", description: "Internet of Things solutions for continuous patient monitoring", category: "IoT Healthcare", date: "2023-08-10", link: "https://brainsait.io/innovations/iot-monitoring" }
        ],

        publications: () => [
          { id: "1", title: "AI in Primary Care: Transforming Healthcare Delivery", journal: "Journal of Medical Innovation", date: "2024-03-15", authors: ["Dr. Mohamed El Fadil", "Dr. Sarah Johnson"], abstract: "Comprehensive study on the integration of artificial intelligence in primary healthcare settings...", link: "https://journals.medical-innovation.org/ai-primary-care" },
          { id: "2", title: "Digital Health Transformation in Developing Countries", journal: "Global Health Technology Review", date: "2023-12-05", authors: ["Dr. Mohamed El Fadil"], abstract: "Analysis of digital health implementation challenges and solutions in resource-limited settings...", link: "https://global-health-tech.org/digital-transformation" }
        ],

        healthTip: () => {
          const tips = [
            "Stay hydrated - drink at least 8 glasses of water daily for optimal health.",
            "Regular exercise for 30 minutes daily can reduce risk of chronic diseases by 50%.",
            "Adequate sleep (7-8 hours) is crucial for immune system function and mental health.",
            "Include colorful fruits and vegetables in your diet for essential vitamins and antioxidants.",
            "Practice stress management techniques like meditation or deep breathing exercises.",
            "Schedule regular health checkups - prevention is better than cure.",
            "Maintain good hygiene habits to prevent infections and stay healthy."
          ];
          return tips[Math.floor(Math.random() * tips.length)];
        },

        // FHIR Observations query – filter by patientId and optional metricType
        fhirObservations: (_, { patientId, metricType }) => {
          const allObs = fhirStore.flatMap(bundle =>
            bundle.entry.map(e => e.resource)
          ).filter(obs =>
            obs.resourceType === 'Observation' &&
            obs.subject.reference === `Patient/${patientId}`
          );

          if (metricType) {
            const loinc = LOINC_CODES[metricType];
            if (!loinc) return [];
            return allObs
              .filter(obs => obs.code.coding[0].code === loinc.code)
              .map(flattenObservation);
          }
          return allObs.map(flattenObservation);
        },

        auditEvents: (_, { patientId }) => {
          const events = patientId
            ? auditLog.filter(e => e.entity[0].what.reference.includes(patientId))
            : auditLog;
          return events.map(e => ({
            id: e.id,
            recorded: e.recorded,
            action: e.type.code,
            patientId: e.entity[0].what.reference.split('/')[1] || '',
            outcome: e.outcomeDesc,
            userId: e.agent[0].who.identifier.value
          }));
        },

        supportedMetrics: () =>
          Object.entries(LOINC_CODES).map(([key, loinc]) => ({
            key,
            loincCode: loinc.code,
            display: loinc.display
          }))
      },

      Mutation: {
        submitContactForm: (_, { input }) => {
          console.log('Contact form submitted:', input);
          return { success: true, message: "Thank you for your message. Dr. Fadil will respond within 24 hours.", referenceId: `REF-${Date.now()}` };
        },

        requestAppointment: (_, { input }) => {
          console.log('Appointment requested:', input);
          return { success: true, message: "Appointment request received. You will receive confirmation within 2 hours.", appointmentId: `APT-${Date.now()}`, confirmationSent: true };
        },

        subscribeNewsletter: (_, { email }) => {
          console.log('Newsletter subscription:', email);
          return { success: true, message: "Successfully subscribed to Dr. Fadil's healthcare innovation newsletter." };
        },

        // Health data sync mutation – used by the mobile app
        syncHealthData: (_, { input }) => {
          const { patientId, deviceSource, role = 'patient', userId = 'app-user', ...metrics } = input;

          // RBAC check
          if (!hasPermission(role, 'write:own') && !hasPermission(role, 'write:observation')) {
            recordAudit('health-sync', patientId, userId, 'Observation', 'denied');
            return { success: false, message: 'Permission denied', bundleId: null, observationCount: 0, auditEventId: null };
          }

          try {
            const bundle = normalizeHealthPayload({ patientId, deviceSource, ...metrics });
            fhirStore.push(bundle);
            const audit = recordAudit('health-sync', patientId, userId, 'Observation', 'success');
            return {
              success: true,
              message: `Synced ${bundle.entry.length} health observations as FHIR R4 Bundle`,
              bundleId: bundle.id,
              observationCount: bundle.entry.length,
              auditEventId: audit.id
            };
          } catch (err) {
            const audit = recordAudit('health-sync', patientId, userId, 'Observation', err.message);
            return { success: false, message: err.message, bundleId: null, observationCount: 0, auditEventId: audit.id };
          }
        }
      }
    }
  }),
  graphiql: {
    title: 'BrainSAIT Healthcare API',
    defaultQuery: /* GraphQL */ `
      # BrainSAIT Healthcare API - FHIR R4 enabled
      # Try these example queries:

      query GetDoctorProfile {
        profile {
          name
          title
          specializations
          bio
          experience
        }
      }

      query GetSupportedMetrics {
        supportedMetrics {
          key
          loincCode
          display
        }
      }

      mutation SyncHealthData {
        syncHealthData(input: {
          patientId: "patient-123"
          deviceSource: "HealthConnect"
          date: "2024-01-15T08:00:00Z"
          steps: 8540
          heartRate: 72
          oxygenSaturation: 98
        }) {
          success
          message
          bundleId
          observationCount
        }
      }

      query GetObservations {
        fhirObservations(patientId: "patient-123") {
          id
          loincCode
          loincDisplay
          value
          unit
          effectiveDateTime
          deviceSource
        }
      }
    `
  },
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://thefadil.site', 'https://dr-fadil-profile.pages.dev']
      : true,
    credentials: true
  }
});

// ---------------------------------------------------------------------------
// Helper: flatten FHIR Observation resource to GraphQL shape
// ---------------------------------------------------------------------------
function flattenObservation(obs) {
  return {
    id: obs.id,
    resourceType: obs.resourceType,
    status: obs.status,
    loincCode: obs.code.coding[0].code,
    loincDisplay: obs.code.coding[0].display,
    value: obs.valueQuantity.value,
    unit: obs.valueQuantity.unit,
    effectiveDateTime: obs.effectiveDateTime,
    patientId: obs.subject.reference.replace('Patient/', ''),
    deviceSource: obs.device ? obs.device.display : null
  };
}

// ---------------------------------------------------------------------------
// HTTP server – mounts both GraphQL Yoga and FHIR REST endpoints
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  // ---- FHIR REST: POST /api/health/sync ----
  if (req.method === 'POST' && path === '/api/health/sync') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { patientId, deviceSource, userId = 'app-user', role = 'patient', ...metrics } = payload;

        if (!patientId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'patientId is required' }));
        }

        if (!hasPermission(role, 'write:own') && !hasPermission(role, 'write:observation')) {
          recordAudit('health-sync', patientId, userId, 'Observation', 'denied');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Permission denied' }));
        }

        const bundle = normalizeHealthPayload({ patientId, deviceSource, ...metrics });
        fhirStore.push(bundle);
        const audit = recordAudit('health-sync', patientId, userId, 'Observation', 'success');

        res.writeHead(201, { 'Content-Type': 'application/fhir+json' });
        res.end(JSON.stringify({
          bundleId: bundle.id,
          observationCount: bundle.entry.length,
          auditEventId: audit.id,
          bundle
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ---- FHIR REST: GET /api/health/observations?patientId=&metricType= ----
  if (req.method === 'GET' && path === '/api/health/observations') {
    const patientId = url.searchParams.get('patientId');
    const metricType = url.searchParams.get('metricType');

    if (!patientId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'patientId query param is required' }));
    }

    const allObs = fhirStore.flatMap(b => b.entry.map(e => e.resource))
      .filter(obs => obs.subject.reference === `Patient/${patientId}`);

    const filtered = metricType && LOINC_CODES[metricType]
      ? allObs.filter(obs => obs.code.coding[0].code === LOINC_CODES[metricType].code)
      : allObs;

    recordAudit('read', patientId, 'api-client', 'Observation', 'success');

    res.writeHead(200, { 'Content-Type': 'application/fhir+json' });
    res.end(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', total: filtered.length, entry: filtered.map(obs => ({ resource: obs })) }));
    return;
  }

  // ---- FHIR REST: GET /api/health/audit ----
  if (req.method === 'GET' && path === '/api/health/audit') {
    const patientId = url.searchParams.get('patientId');
    const events = patientId
      ? auditLog.filter(e => e.entity[0].what.reference.includes(patientId))
      : auditLog;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ events }));
    return;
  }

  // ---- FHIR REST: GET /api/health/metrics ----
  if (req.method === 'GET' && path === '/api/health/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      metrics: Object.entries(LOINC_CODES).map(([key, loinc]) => ({ key, loincCode: loinc.code, display: loinc.display }))
    }));
    return;
  }

  // ---- Delegate everything else to GraphQL Yoga ----
  yoga(req, res);
});

const port = process.env.PORT || 4000;

server.listen(port, () => {
  console.log(`🚀 BrainSAIT Healthcare API running on http://localhost:${port}${yoga.graphqlEndpoint}`);
  console.log(`📊 GraphiQL interface available at http://localhost:${port}${yoga.graphqlEndpoint}`);
  console.log(`🏥 FHIR R4 sync endpoint: POST http://localhost:${port}/api/health/sync`);
  console.log(`📋 Observations endpoint:  GET  http://localhost:${port}/api/health/observations?patientId=`);
  console.log(`🔍 Audit log endpoint:     GET  http://localhost:${port}/api/health/audit`);
  console.log(`📐 Supported metrics:      GET  http://localhost:${port}/api/health/metrics`);
});

module.exports = { yoga, server };
