/**
 * Internal Facility Workspace Module - BrainSAIT Health Platform
 *
 * Covers internal facility operations:
 *   - Staff communication (announcements, messaging, alerts)
 *   - Training & education (courses, assignments, completions, certificates)
 *   - Administration tools (shift management, department setup, reporting)
 *   - Incident reporting
 *   - Quality metrics
 */

'use strict';

// ---------------------------------------------------------------------------
// In-memory stores (production: persistent database)
// ---------------------------------------------------------------------------
const messages = new Map();
const announcements = new Map();
const trainingCourses = new Map();
const courseEnrollments = new Map();
const courseCompletions = new Map();
const shiftSchedules = new Map();
const departments = new Map();
const incidents = new Map();
const staffProfiles = new Map();

// ---------------------------------------------------------------------------
// ID helper
// ---------------------------------------------------------------------------
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Staff Profiles
// ---------------------------------------------------------------------------

const STAFF_ROLES = ['physician', 'nurse', 'pharmacist', 'radiologist', 'lab-technician',
  'admin', 'receptionist', 'social-worker', 'dietitian', 'physiotherapist', 'manager'];

function createStaffProfile(data) {
  const {
    userId, firstName, lastName, role, department,
    email = '', phone = '', speciality = '',
    license = '', employeeId = '',
  } = data;

  if (!userId || !firstName || !lastName || !role || !department) {
    throw new Error('Required: userId, firstName, lastName, role, department');
  }
  if (!STAFF_ROLES.includes(role)) throw new Error(`role must be one of: ${STAFF_ROLES.join(', ')}`);

  const staff = {
    id: userId,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    role,
    department,
    email,
    phone,
    speciality,
    license,
    employeeId,
    isActive: true,
    createdAt: new Date().toISOString(),
    trainingCompliance: 100,
    lastLogin: null,
  };

  staffProfiles.set(userId, staff);
  return staff;
}

function getStaffProfile(userId) {
  const staff = staffProfiles.get(userId);
  if (!staff) throw new Error(`Staff profile not found: ${userId}`);
  return staff;
}

function getDepartmentStaff(department) {
  return [...staffProfiles.values()].filter(s => s.department === department && s.isActive);
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

function createDepartment(data) {
  const { id, name, headUserId, location = '', phone = '', type = 'clinical' } = data;
  if (!id || !name) throw new Error('Required: id, name');

  const dept = { id, name, headUserId, location, phone, type, createdAt: new Date().toISOString(), isActive: true };
  departments.set(id, dept);
  return dept;
}

function getDepartments() {
  return [...departments.values()].filter(d => d.isActive);
}

// ---------------------------------------------------------------------------
// Staff Communication - Direct Messages
// ---------------------------------------------------------------------------

/**
 * Send an internal message between staff members.
 */
function sendMessage(data) {
  const {
    fromUserId, toUserIds,
    subject, body,
    priority = 'normal',
    attachments = [],
    relatedPatientId = null,
  } = data;

  if (!fromUserId || !toUserIds?.length || !body) {
    throw new Error('Required: fromUserId, toUserIds (array), body');
  }

  const id = makeId('MSG');
  const message = {
    id,
    fromUserId,
    toUserIds,
    subject: subject || '(no subject)',
    body,
    priority,
    attachments,
    relatedPatientId,
    readBy: [],
    createdAt: new Date().toISOString(),
    isDeleted: false,
  };

  messages.set(id, message);
  return message;
}

function markMessageRead(messageId, userId) {
  const msg = messages.get(messageId);
  if (!msg) throw new Error(`Message not found: ${messageId}`);
  if (!msg.readBy.includes(userId)) msg.readBy.push(userId);
  return msg;
}

function getInboxMessages(userId) {
  return [...messages.values()].filter(m =>
    m.toUserIds.includes(userId) && !m.isDeleted
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getSentMessages(userId) {
  return [...messages.values()].filter(m => m.fromUserId === userId && !m.isDeleted);
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_TYPES = ['general', 'urgent', 'policy', 'training', 'maintenance', 'clinical'];
const ANNOUNCEMENT_AUDIENCES = ['all-staff', 'physicians', 'nurses', 'admin', 'department'];

/**
 * Publish a facility-wide announcement.
 */
function publishAnnouncement(data) {
  const {
    authorId, title, content, type = 'general',
    audience = 'all-staff', department = null,
    expiresAt = null, isPinned = false,
    attachments = [],
  } = data;

  if (!authorId || !title || !content) {
    throw new Error('Required: authorId, title, content');
  }
  if (!ANNOUNCEMENT_TYPES.includes(type)) throw new Error(`type must be one of: ${ANNOUNCEMENT_TYPES.join(', ')}`);

  const id = makeId('ANN');
  const announcement = {
    id,
    authorId,
    title,
    content,
    type,
    audience,
    department,
    expiresAt,
    isPinned,
    attachments,
    acknowledgedBy: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
  };

  announcements.set(id, announcement);
  return announcement;
}

function acknowledgeAnnouncement(announcementId, userId) {
  const ann = announcements.get(announcementId);
  if (!ann) throw new Error(`Announcement not found: ${announcementId}`);
  if (!ann.acknowledgedBy.includes(userId)) ann.acknowledgedBy.push(userId);
  return ann;
}

function getActiveAnnouncements(audience = null, department = null) {
  const now = new Date().toISOString();
  return [...announcements.values()].filter(a => {
    if (!a.isActive) return false;
    if (a.expiresAt && a.expiresAt < now) return false;
    if (audience && a.audience !== 'all-staff' && a.audience !== audience) return false;
    if (department && a.department && a.department !== department) return false;
    return true;
  }).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ---------------------------------------------------------------------------
// Training & Education
// ---------------------------------------------------------------------------

const COURSE_CATEGORIES = ['clinical', 'compliance', 'safety', 'technology', 'leadership', 'soft-skills'];
const COURSE_STATUSES = ['draft', 'published', 'archived'];
const COMPLETION_STATUSES = ['not-started', 'in-progress', 'completed', 'failed', 'expired'];

/**
 * Create a training course.
 */
function createCourse(data) {
  const {
    title, description, category, durationMinutes,
    passingScore = 80, isMandatory = false,
    targetRoles = [], modules = [],
    validityPeriodDays = 365,
    createdBy,
  } = data;

  if (!title || !category || !durationMinutes || !createdBy) {
    throw new Error('Required: title, category, durationMinutes, createdBy');
  }
  if (!COURSE_CATEGORIES.includes(category)) throw new Error(`category must be one of: ${COURSE_CATEGORIES.join(', ')}`);

  const id = makeId('CRS');
  const course = {
    id,
    title,
    description: description || '',
    category,
    durationMinutes,
    passingScore,
    isMandatory,
    targetRoles,
    modules,
    validityPeriodDays,
    status: 'published',
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enrolledCount: 0,
    completedCount: 0,
  };

  trainingCourses.set(id, course);
  return course;
}

function enrollStaff(courseId, userId) {
  const course = trainingCourses.get(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);

  const enrollKey = `${courseId}:${userId}`;
  if (courseEnrollments.has(enrollKey)) return courseEnrollments.get(enrollKey);

  const enrollment = {
    id: makeId('ENR'),
    courseId,
    userId,
    status: 'not-started',
    progress: 0,
    enrolledAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    score: null,
    attempts: 0,
  };

  courseEnrollments.set(enrollKey, enrollment);
  course.enrolledCount += 1;
  return enrollment;
}

function updateCourseProgress(courseId, userId, { progress, status }) {
  const enrollKey = `${courseId}:${userId}`;
  const enrollment = courseEnrollments.get(enrollKey);
  if (!enrollment) throw new Error(`Enrollment not found for course ${courseId} / user ${userId}`);

  enrollment.progress = Math.min(100, Math.max(0, progress));

  if (status === 'in-progress' && !enrollment.startedAt) {
    enrollment.startedAt = new Date().toISOString();
  }
  enrollment.status = status;

  return enrollment;
}

function submitCourseAssessment(courseId, userId, score) {
  const course = trainingCourses.get(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);

  const enrollKey = `${courseId}:${userId}`;
  const enrollment = courseEnrollments.get(enrollKey);
  if (!enrollment) throw new Error(`Not enrolled in course ${courseId}`);

  enrollment.score = score;
  enrollment.attempts += 1;
  const passed = score >= course.passingScore;
  enrollment.status = passed ? 'completed' : 'failed';

  if (passed) {
    const now = new Date();
    enrollment.completedAt = now.toISOString();
    enrollment.expiresAt = new Date(now.getTime() + course.validityPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    enrollment.progress = 100;
    course.completedCount += 1;

    // Issue certificate
    const cert = {
      id: makeId('CERT'),
      courseId,
      courseTitle: course.title,
      userId,
      score,
      issuedAt: now.toISOString(),
      expiresAt: enrollment.expiresAt,
      certificateNumber: `CERT-${Date.now().toString().slice(-8)}`,
    };
    courseCompletions.set(`${courseId}:${userId}`, cert);
    return { enrollment, certificate: cert };
  }

  return { enrollment, certificate: null };
}

function getStaffTrainingStatus(userId) {
  const completions = [...courseCompletions.values()].filter(c => c.userId === userId);
  const enrollments = [...courseEnrollments.values()].filter(e => e.userId === userId);
  const mandatoryCourses = [...trainingCourses.values()].filter(c => c.status === 'published' && c.isMandatory);

  const compliantCount = mandatoryCourses.filter(c => {
    const cert = courseCompletions.get(`${c.id}:${userId}`);
    if (!cert) return false;
    return !cert.expiresAt || cert.expiresAt > new Date().toISOString();
  }).length;

  return {
    userId,
    totalEnrollments: enrollments.length,
    completedCourses: completions.length,
    mandatoryTotal: mandatoryCourses.length,
    mandatoryCompliant: compliantCount,
    complianceRate: mandatoryCourses.length > 0
      ? Math.round((compliantCount / mandatoryCourses.length) * 100)
      : 100,
    certificates: completions,
    enrollments,
  };
}

function getCourses(category = null, mandatory = null) {
  return [...trainingCourses.values()].filter(c => {
    if (c.status !== 'published') return false;
    if (category && c.category !== category) return false;
    if (mandatory !== null && c.isMandatory !== mandatory) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Shift Management
// ---------------------------------------------------------------------------

const SHIFT_TYPES = ['morning', 'afternoon', 'night', 'on-call', 'weekend'];

function createShift(data) {
  const {
    userId, department, date, shiftType,
    startTime, endTime, role, notes = '',
  } = data;

  if (!userId || !department || !date || !shiftType || !startTime || !endTime) {
    throw new Error('Required: userId, department, date, shiftType, startTime, endTime');
  }
  if (!SHIFT_TYPES.includes(shiftType)) throw new Error(`shiftType must be one of: ${SHIFT_TYPES.join(', ')}`);

  const id = makeId('SHF');
  const shift = {
    id, userId, department, date, shiftType,
    startTime, endTime, role, notes,
    status: 'scheduled',
    checkedIn: null,
    checkedOut: null,
    createdAt: new Date().toISOString(),
  };

  shiftSchedules.set(id, shift);
  return shift;
}

function getStaffSchedule(userId, fromDate, toDate) {
  return [...shiftSchedules.values()].filter(s =>
    s.userId === userId && s.date >= fromDate && s.date <= toDate
  ).sort((a, b) => a.date.localeCompare(b.date));
}

function getDepartmentSchedule(department, date) {
  return [...shiftSchedules.values()].filter(s =>
    s.department === department && s.date === date
  );
}

// ---------------------------------------------------------------------------
// Incident Reporting
// ---------------------------------------------------------------------------

const INCIDENT_TYPES = ['patient-safety', 'medication-error', 'fall', 'equipment-failure',
  'infection-control', 'privacy-breach', 'near-miss', 'adverse-event'];
const INCIDENT_SEVERITIES = ['minor', 'moderate', 'major', 'catastrophic'];

function reportIncident(data) {
  const {
    reportedBy, type, severity, description,
    involvedPatientId = null, location = '',
    immediateActions = '', witnesses = [],
    incidentDate, incidentTime,
  } = data;

  if (!reportedBy || !type || !severity || !description || !incidentDate) {
    throw new Error('Required: reportedBy, type, severity, description, incidentDate');
  }
  if (!INCIDENT_TYPES.includes(type)) throw new Error(`type must be one of: ${INCIDENT_TYPES.join(', ')}`);
  if (!INCIDENT_SEVERITIES.includes(severity)) throw new Error(`severity must be one of: ${INCIDENT_SEVERITIES.join(', ')}`);

  const id = makeId('INC');
  const incident = {
    id,
    reportedBy,
    type,
    severity,
    description,
    involvedPatientId,
    location,
    immediateActions,
    witnesses,
    incidentDate,
    incidentTime: incidentTime || '',
    status: 'open',
    assignedTo: null,
    rootCause: null,
    correctiveActions: [],
    closedAt: null,
    reportedAt: new Date().toISOString(),
    isAnonymous: false,
  };

  incidents.set(id, incident);

  if (['major', 'catastrophic'].includes(severity)) {
    console.warn(`[INCIDENT ALERT] Severity: ${severity} | Type: ${type} | ID: ${id}`);
  }

  return incident;
}

function updateIncident(incidentId, updates) {
  const incident = incidents.get(incidentId);
  if (!incident) throw new Error(`Incident not found: ${incidentId}`);
  Object.assign(incident, updates, { updatedAt: new Date().toISOString() });
  return incident;
}

function getIncidents(filters = {}) {
  return [...incidents.values()].filter(i => {
    if (filters.status && i.status !== filters.status) return false;
    if (filters.type && i.type !== filters.type) return false;
    if (filters.severity && i.severity !== filters.severity) return false;
    if (filters.fromDate && i.incidentDate < filters.fromDate) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Quality Metrics / Dashboard
// ---------------------------------------------------------------------------

function getFacilityMetrics() {
  const totalStaff = staffProfiles.size;
  const activeAnnouncements = getActiveAnnouncements().length;
  const unreadIncidents = [...incidents.values()].filter(i => i.status === 'open').length;
  const totalCourses = [...trainingCourses.values()].filter(c => c.status === 'published').length;
  const pendingShifts = [...shiftSchedules.values()].filter(s => s.status === 'scheduled').length;

  return {
    workforce: {
      totalStaff,
      activeToday: [...shiftSchedules.values()].filter(s => s.date === new Date().toISOString().slice(0, 10)).length,
    },
    communication: {
      activeAnnouncements,
      unreadMessages: [...messages.values()].filter(m => !m.isDeleted && m.readBy.length < m.toUserIds.length).length,
    },
    training: {
      totalCourses,
      mandatoryCourses: [...trainingCourses.values()].filter(c => c.isMandatory && c.status === 'published').length,
    },
    incidents: {
      openIncidents: unreadIncidents,
      criticalOpen: [...incidents.values()].filter(i => i.status === 'open' && ['major', 'catastrophic'].includes(i.severity)).length,
    },
    scheduling: { pendingShifts },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Staff profiles
  createStaffProfile,
  getStaffProfile,
  getDepartmentStaff,
  // Departments
  createDepartment,
  getDepartments,
  // Messaging
  sendMessage,
  markMessageRead,
  getInboxMessages,
  getSentMessages,
  // Announcements
  publishAnnouncement,
  acknowledgeAnnouncement,
  getActiveAnnouncements,
  // Training
  createCourse,
  enrollStaff,
  updateCourseProgress,
  submitCourseAssessment,
  getStaffTrainingStatus,
  getCourses,
  // Shifts
  createShift,
  getStaffSchedule,
  getDepartmentSchedule,
  // Incidents
  reportIncident,
  updateIncident,
  getIncidents,
  // Metrics
  getFacilityMetrics,
  // Constants
  STAFF_ROLES,
  COURSE_CATEGORIES,
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  SHIFT_TYPES,
  ANNOUNCEMENT_TYPES,
  // Stores (for testing)
  _stores: { messages, announcements, trainingCourses, courseEnrollments, courseCompletions, shiftSchedules, departments, incidents, staffProfiles },
};
