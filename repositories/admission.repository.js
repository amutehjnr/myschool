'use strict';

const { query } = require('../config/database');

function generateReference() {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PSHA-ADM-${year}-${rand}`;
}

async function create(data) {
  let reference = generateReference();
  // Ensure uniqueness (rare collision)
  for (let i = 0; i < 5; i++) {
    const existing = await query(
      `SELECT id FROM admissions WHERE reference_number = :ref LIMIT 1`,
      { ref: reference }
    );
    if (!existing.length) break;
    reference = generateReference();
  }

  const result = await query(
    `INSERT INTO admissions
       (reference_number, status, applicant_first_name, applicant_last_name, applicant_middle_name,
        date_of_birth, gender, applying_for_class, academic_session_id,
        parent_first_name, parent_last_name, parent_email, parent_phone, parent_relationship,
        address, previous_school, notes)
     VALUES
       (:reference, 'draft', :firstName, :lastName, :middleName,
        :dob, :gender, :className, :sessionId,
        :pFirst, :pLast, :pEmail, :pPhone, :pRel,
        :address, :prevSchool, :notes)`,
    {
      reference,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName || null,
      dob: data.dateOfBirth || null,
      gender: data.gender || null,
      className: data.applyingForClass || null,
      sessionId: data.academicSessionId || null,
      pFirst: data.parentFirstName || null,
      pLast: data.parentLastName || null,
      pEmail: data.parentEmail || null,
      pPhone: data.parentPhone || null,
      pRel: data.parentRelationship || null,
      address: data.address || null,
      prevSchool: data.previousSchool || null,
      notes: data.notes || null
    }
  );

  return { id: result.insertId, referenceNumber: reference };
}

async function findById(id) {
  const rows = await query(
    `SELECT a.*, s.name AS session_name, u.email AS reviewer_email
     FROM admissions a
     LEFT JOIN academic_sessions s ON s.id = a.academic_session_id
     LEFT JOIN users u ON u.id = a.reviewed_by
     WHERE a.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByReference(referenceNumber) {
  const rows = await query(
    `SELECT a.*, s.name AS session_name
     FROM admissions a
     LEFT JOIN academic_sessions s ON s.id = a.academic_session_id
     WHERE a.reference_number = :ref
     LIMIT 1`,
    { ref: referenceNumber }
  );
  return rows[0] || null;
}

async function update(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    applicant_first_name: 'firstName',
    applicant_last_name: 'lastName',
    applicant_middle_name: 'middleName',
    date_of_birth: 'dateOfBirth',
    gender: 'gender',
    applying_for_class: 'applyingForClass',
    academic_session_id: 'academicSessionId',
    parent_first_name: 'parentFirstName',
    parent_last_name: 'parentLastName',
    parent_email: 'parentEmail',
    parent_phone: 'parentPhone',
    parent_relationship: 'parentRelationship',
    address: 'address',
    previous_school: 'previousSchool',
    notes: 'notes',
    admin_notes: 'adminNotes'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = data[key];
    }
  }
  if (!fields.length) return;
  await query(`UPDATE admissions SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function setStatus(id, status, { reviewedBy = null, adminNotes = null } = {}) {
  await query(
    `UPDATE admissions
     SET status = :status,
         reviewed_by = COALESCE(:reviewedBy, reviewed_by),
         reviewed_at = CASE WHEN :status IN ('approved','rejected','under_review','additional_info_required') THEN NOW() ELSE reviewed_at END,
         admin_notes = COALESCE(:adminNotes, admin_notes),
         submitted_at = CASE WHEN :status = 'submitted' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END
     WHERE id = :id`,
    { id, status, reviewedBy, adminNotes }
  );
}

async function list({ page = 1, limit = 20, status = null, search = null } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (status) {
    where += ' AND a.status = :status';
    params.status = status;
  }
  if (search) {
    where += ` AND (a.reference_number LIKE :search OR a.applicant_first_name LIKE :search
               OR a.applicant_last_name LIKE :search OR a.parent_email LIKE :search)`;
    params.search = `%${search}%`;
  }

  const rows = await query(
    `SELECT a.id, a.reference_number, a.status, a.applicant_first_name, a.applicant_last_name,
            a.applying_for_class, a.parent_email, a.parent_phone, a.submitted_at, a.created_at
     FROM admissions a
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM admissions a WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function countByStatus(status) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM admissions WHERE status = :status`,
    { status }
  );
  return rows[0]?.total || 0;
}

async function addDocument({
  admissionId,
  documentType,
  originalFilename,
  storedFilename,
  mimeType,
  fileSize,
  storagePath
}) {
  const result = await query(
    `INSERT INTO admission_documents
       (admission_id, document_type, original_filename, stored_filename, mime_type, file_size, storage_path)
     VALUES
       (:admissionId, :documentType, :originalFilename, :storedFilename, :mimeType, :fileSize, :storagePath)`,
    {
      admissionId,
      documentType,
      originalFilename,
      storedFilename,
      mimeType,
      fileSize,
      storagePath
    }
  );
  return result.insertId;
}

async function getDocuments(admissionId) {
  return query(
    `SELECT id, document_type, original_filename, stored_filename, mime_type, file_size, uploaded_at
     FROM admission_documents
     WHERE admission_id = :admissionId
     ORDER BY uploaded_at`,
    { admissionId }
  );
}

async function getDocument(id) {
  const rows = await query(
    `SELECT * FROM admission_documents WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

module.exports = {
  create,
  findById,
  findByReference,
  update,
  setStatus,
  list,
  countByStatus,
  addDocument,
  getDocuments,
  getDocument
};
