'use strict';

const studentRepo = require('../repositories/student.repository');
const parentRepo = require('../repositories/parent.repository');
const userRepo = require('../repositories/user.repository');
const roleRepo = require('../repositories/role.repository');
const auditRepo = require('../repositories/audit.repository');
const { hashPassword, generateSecureToken } = require('../utils/crypto');
const { query } = require('../config/database');

async function listStudents(filters) {
  return studentRepo.list(filters);
}

async function getStudent(id) {
  const student = await studentRepo.findById(id);
  if (!student) return null;
  const [parents, attendance] = await Promise.all([
    studentRepo.getParents(id),
    studentRepo.getAttendance(id, { limit: 30 })
  ]);
  return { ...student, parents, attendance };
}

async function getStudentByUserId(userId) {
  return studentRepo.findByUserId(userId);
}

async function createStudent(data, adminUserId, meta = {}) {
  const {
    email,
    studentId,
    firstName,
    lastName,
    middleName,
    dateOfBirth,
    gender,
    classId,
    houseId,
    academicSessionId,
    admissionDate,
    password,
    createLogin
  } = data;

  if (!studentId || !firstName || !lastName) {
    return { error: 'Student ID, first name and last name are required.' };
  }
  if (await studentRepo.studentIdExists(studentId)) {
    return { error: 'Student ID is already in use.' };
  }

  let userId = null;
  let temporaryPassword = null;

  if (createLogin && email) {
    if (await userRepo.emailExists(email)) {
      return { error: 'An account with this email already exists.' };
    }
    const studentRole = await roleRepo.findByName('student');
    if (!studentRole) return { error: 'Student role not found.' };

    const plain = password && password.length >= 8 ? password : generateSecureToken(6) + 'Aa1!';
    const passwordHash = await hashPassword(plain);
    userId = await userRepo.create({
      email,
      passwordHash,
      roleId: studentRole.id,
      mustChangePassword: true
    });
    temporaryPassword = password ? null : plain;
  }

  // Default session if not provided
  let sessionId = academicSessionId || null;
  if (!sessionId) {
    const [sess] = await query(`SELECT id FROM academic_sessions WHERE is_current = 1 LIMIT 1`);
    sessionId = sess ? sess.id : null;
  }

  const id = await studentRepo.create({
    userId,
    studentId,
    firstName,
    lastName,
    middleName: middleName || null,
    dateOfBirth: dateOfBirth || null,
    gender: gender || null,
    photoPath: data.photoPath || null,
    photoPublicId: data.photoPublicId || null,
    classId: classId || null,
    houseId: houseId || null,
    academicSessionId: sessionId,
    admissionDate: admissionDate || null,
    status: 'active'
  });

  await auditRepo.create({
    userId: adminUserId,
    action: 'CREATE_STUDENT',
    module: 'students',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { studentId, email }
  });

  return { success: true, studentId: id, temporaryPassword };
}

async function updateStudent(id, data, adminUserId, meta = {}) {
  const existing = await studentRepo.findById(id);
  if (!existing) return { error: 'Student not found.' };

  if (data.studentId && (await studentRepo.studentIdExists(data.studentId, id))) {
    return { error: 'Student ID is already in use.' };
  }

  if (data.email && existing.user_id && data.email !== existing.email) {
    if (await userRepo.emailExists(data.email, existing.user_id)) {
      return { error: 'An account with this email already exists.' };
    }
    await userRepo.update(existing.user_id, { email: data.email });
  }

  await studentRepo.update(id, {
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    dateOfBirth: data.dateOfBirth || null,
    gender: data.gender || null,
    classId: data.classId || null,
    houseId: data.houseId || null,
    academicSessionId: data.academicSessionId || null,
    admissionDate: data.admissionDate || null,
    status: data.status,
    studentId: data.studentId
  });

  await auditRepo.create({
    userId: adminUserId,
    action: 'UPDATE_STUDENT',
    module: 'students',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function archiveStudent(id, adminUserId, meta = {}) {
  const existing = await studentRepo.findById(id);
  if (!existing) return { error: 'Student not found.' };

  await studentRepo.setStatus(id, 'withdrawn');
  if (existing.user_id) {
    await userRepo.setActive(existing.user_id, false);
  }

  await auditRepo.create({
    userId: adminUserId,
    action: 'UPDATE_STUDENT',
    module: 'students',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { status: 'withdrawn' }
  });

  return { success: true };
}

async function getStudentPortalData(userId) {
  const student = await studentRepo.findByUserId(userId);
  if (!student) return null;
  const attendance = await studentRepo.getAttendance(student.id, { limit: 14 });
  return { student, attendance };
}

async function listClasses() {
  return query(`SELECT id, name, level FROM classes WHERE is_active = 1 ORDER BY name`);
}

async function listHouses() {
  return query(`SELECT id, name FROM houses ORDER BY name`);
}

async function listSessions() {
  return query(`SELECT id, name, is_current FROM academic_sessions ORDER BY start_date DESC`);
}


async function linkParentToStudent(studentId, parentId, isPrimary, adminUserId, meta = {}) {
  const student = await studentRepo.findById(studentId);
  if (!student) return { error: 'Student not found.' };
  const parent = await parentRepo.findById(parentId);
  if (!parent) return { error: 'Parent not found.' };

  await parentRepo.linkStudent(parentId, studentId, Boolean(isPrimary));
  await auditRepo.create({
    userId: adminUserId,
    action: 'PARENT_LINKED',
    module: 'students',
    recordId: studentId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { parentId, studentId }
  });
  return { success: true };
}

async function unlinkParentFromStudent(studentId, parentId, adminUserId, meta = {}) {
  await parentRepo.unlinkStudent(parentId, studentId);
  await auditRepo.create({
    userId: adminUserId,
    action: 'PARENT_UNLINKED',
    module: 'students',
    recordId: studentId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { parentId, studentId }
  });
  return { success: true };
}

async function listParentsForSelect(search = null) {
  return parentRepo.listAll({ search, limit: 200 });
}

/**
 * Parent self-service: link to a child using student ID + date of birth.
 */
async function parentSelfLink(parentUserId, { studentCode, dateOfBirth }, meta = {}) {
  const parent = await parentRepo.findByUserId(parentUserId);
  if (!parent) return { error: 'Parent profile not found.' };

  const code = String(studentCode || '').trim();
  if (!code || !dateOfBirth) {
    return { error: 'Student ID and date of birth are required.' };
  }

  const student = await studentRepo.findByStudentId(code);
  if (!student) {
    return { error: 'No student found with that ID. Check the ID and try again.' };
  }

  // Verify DOB (compare date part only)
  const dob = student.date_of_birth ? String(student.date_of_birth).slice(0, 10) : null;
  const provided = String(dateOfBirth).slice(0, 10);
  if (!dob || dob !== provided) {
    return { error: 'Student ID and date of birth do not match our records.' };
  }

  if (await parentRepo.isLinked(parent.id, student.id)) {
    return { error: 'This student is already linked to your account.' };
  }

  await parentRepo.linkStudent(parent.id, student.id, false);

  await auditRepo.create({
    userId: parentUserId,
    action: 'PARENT_SELF_LINKED',
    module: 'parents',
    recordId: student.id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { studentCode: code, parentId: parent.id }
  });

  return { success: true, student };
}

module.exports = {
  linkParentToStudent,
  unlinkParentFromStudent,
  listParentsForSelect,
  parentSelfLink,
  listStudents,
  getStudent,
  getStudentByUserId,
  createStudent,
  updateStudent,
  archiveStudent,
  getStudentPortalData,
  listClasses,
  listHouses,
  listSessions
};
