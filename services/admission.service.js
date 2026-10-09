'use strict';

const path = require('path');
const admissionRepo = require('../repositories/admission.repository');
const auditRepo = require('../repositories/audit.repository');
const { query } = require('../config/database');
const { ADMISSION_DIR } = require('../middleware/upload');

const VALID_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['under_review', 'additional_info_required', 'approved', 'rejected'],
  under_review: ['additional_info_required', 'approved', 'rejected'],
  additional_info_required: ['submitted', 'under_review', 'approved', 'rejected'],
  approved: [],
  rejected: []
};

async function startApplication(data) {
  if (!data.firstName || !data.lastName) {
    return { error: 'Applicant first and last name are required.' };
  }
  const result = await admissionRepo.create(data);
  return { success: true, ...result };
}

async function updateApplication(id, data, { allowDraftOnly = true } = {}) {
  const existing = await admissionRepo.findById(id);
  if (!existing) return { error: 'Application not found.' };
  if (allowDraftOnly && !['draft', 'additional_info_required'].includes(existing.status)) {
    return { error: 'This application can no longer be edited.' };
  }
  await admissionRepo.update(id, data);
  return { success: true };
}

async function submitApplication(id, meta = {}) {
  const existing = await admissionRepo.findById(id);
  if (!existing) return { error: 'Application not found.' };
  if (!['draft', 'additional_info_required'].includes(existing.status)) {
    return { error: 'Application is already submitted.' };
  }
  if (!existing.applicant_first_name || !existing.applicant_last_name) {
    return { error: 'Applicant name is required before submitting.' };
  }
  if (!existing.parent_email && !existing.parent_phone) {
    return { error: 'Parent email or phone is required before submitting.' };
  }

  await admissionRepo.setStatus(id, 'submitted');

  await auditRepo.create({
    action: 'ADMISSION_SUBMITTED',
    module: 'admissions',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { reference: existing.reference_number }
  });

  return { success: true, referenceNumber: existing.reference_number };
}

async function addDocument(admissionId, file, documentType, meta = {}) {
  const existing = await admissionRepo.findById(admissionId);
  if (!existing) return { error: 'Application not found.' };
  if (!['draft', 'additional_info_required', 'submitted', 'under_review'].includes(existing.status)) {
    return { error: 'Documents cannot be uploaded for this application status.' };
  }
  if (!file) return { error: 'No file uploaded.' };

  const storagePath = path.join('admissions', file.filename);

  await admissionRepo.addDocument({
    admissionId,
    documentType: documentType || 'supporting',
    originalFilename: file.originalname,
    storedFilename: file.filename,
    mimeType: file.mimetype,
    fileSize: file.size,
    storagePath
  });

  return { success: true };
}

async function getApplication(id) {
  const app = await admissionRepo.findById(id);
  if (!app) return null;
  const documents = await admissionRepo.getDocuments(id);
  return { ...app, documents };
}

async function getByReference(referenceNumber) {
  const app = await admissionRepo.findByReference(referenceNumber);
  if (!app) return null;
  const documents = await admissionRepo.getDocuments(app.id);
  return { ...app, documents };
}

async function listApplications(filters) {
  return admissionRepo.list(filters);
}

async function changeStatus(id, newStatus, adminUserId, { adminNotes = null } = {}, meta = {}) {
  const existing = await admissionRepo.findById(id);
  if (!existing) return { error: 'Application not found.' };

  const allowed = VALID_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot change status from "${existing.status}" to "${newStatus}".` };
  }

  await admissionRepo.setStatus(id, newStatus, {
    reviewedBy: adminUserId,
    adminNotes
  });

  const actionMap = {
    approved: 'ADMISSION_APPROVED',
    rejected: 'ADMISSION_REJECTED',
    under_review: 'ADMISSION_SUBMITTED',
    additional_info_required: 'ADMISSION_SUBMITTED'
  };

  await auditRepo.create({
    userId: adminUserId,
    action: actionMap[newStatus] || 'ADMISSION_SUBMITTED',
    module: 'admissions',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { from: existing.status, to: newStatus, reference: existing.reference_number }
  });

  return { success: true };
}

async function listSessions() {
  return query(`SELECT id, name, is_current FROM academic_sessions ORDER BY start_date DESC`);
}

async function listClasses() {
  return query(`SELECT id, name, level FROM classes WHERE is_active = 1 ORDER BY name`);
}

function documentAbsolutePath(storedFilename) {
  return path.join(ADMISSION_DIR, storedFilename);
}

module.exports = {
  startApplication,
  updateApplication,
  submitApplication,
  addDocument,
  getApplication,
  getByReference,
  listApplications,
  changeStatus,
  listSessions,
  listClasses,
  documentAbsolutePath,
  VALID_TRANSITIONS
};
