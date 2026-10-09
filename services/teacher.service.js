'use strict';

const teacherRepo = require('../repositories/teacher.repository');
const userRepo = require('../repositories/user.repository');
const roleRepo = require('../repositories/role.repository');
const auditRepo = require('../repositories/audit.repository');
const { hashPassword, generateSecureToken } = require('../utils/crypto');
const { query } = require('../config/database');

async function listTeachers(filters) {
  return teacherRepo.list(filters);
}

async function getTeacher(id) {
  const teacher = await teacherRepo.findById(id);
  if (!teacher) return null;
  const [subjects, classes, attendance, leaveRecords] = await Promise.all([
    teacherRepo.getSubjects(id),
    teacherRepo.getClasses(id),
    teacherRepo.getAttendance(id, { limit: 30 }),
    teacherRepo.getLeaveRecords(id)
  ]);
  return { ...teacher, subjects, classes, attendance, leaveRecords };
}

async function getTeacherByUserId(userId) {
  return teacherRepo.findByUserId(userId);
}

/**
 * Create teacher: creates user (role=teacher) + teacher profile + subject/class links.
 */
async function createTeacher(data, adminUserId, meta = {}) {
  const {
    email,
    staffId,
    firstName,
    lastName,
    middleName,
    departmentId,
    qualification,
    phone,
    employmentDate,
    employmentType,
    subjectIds = [],
    classIds = [],
    password
  } = data;

  if (!email || !staffId || !firstName || !lastName) {
    return { error: 'Email, staff ID, first name and last name are required.' };
  }

  if (await userRepo.emailExists(email)) {
    return { error: 'An account with this email already exists.' };
  }
  if (await teacherRepo.staffIdExists(staffId)) {
    return { error: 'Staff ID is already in use.' };
  }

  const teacherRole = await roleRepo.findByName('teacher');
  if (!teacherRole) return { error: 'Teacher role not found in system.' };

  const plainPassword = password && password.length >= 8 ? password : generateSecureToken(6) + 'Aa1!';
  const passwordHash = await hashPassword(plainPassword);

  const userId = await userRepo.create({
    email,
    passwordHash,
    roleId: teacherRole.id,
    mustChangePassword: true
  });

  const teacherId = await teacherRepo.create({
    userId,
    staffId,
    firstName,
    lastName,
    middleName: middleName || null,
    departmentId: departmentId || null,
    qualification: qualification || null,
    phone: phone || null,
    employmentDate: employmentDate || null,
    employmentType: employmentType || null
  });

  const sids = Array.isArray(subjectIds) ? subjectIds.map(Number).filter(Boolean) : [];
  const cids = Array.isArray(classIds) ? classIds.map(Number).filter(Boolean) : [];
  if (sids.length) await teacherRepo.setSubjects(teacherId, sids);
  if (cids.length) await teacherRepo.setClasses(teacherId, cids);

  await auditRepo.create({
    userId: adminUserId,
    action: 'CREATE_TEACHER',
    module: 'teachers',
    recordId: teacherId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { staffId, email }
  });

  return {
    success: true,
    teacherId,
    temporaryPassword: password ? null : plainPassword
  };
}

async function updateTeacher(id, data, adminUserId, meta = {}) {
  const existing = await teacherRepo.findById(id);
  if (!existing) return { error: 'Teacher not found.' };

  if (data.staffId && (await teacherRepo.staffIdExists(data.staffId, id))) {
    return { error: 'Staff ID is already in use.' };
  }

  if (data.email && data.email !== existing.email) {
    if (await userRepo.emailExists(data.email, existing.user_id)) {
      return { error: 'An account with this email already exists.' };
    }
    await userRepo.update(existing.user_id, { email: data.email });
  }

  await teacherRepo.update(id, {
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    departmentId: data.departmentId || null,
    qualification: data.qualification,
    phone: data.phone,
    employmentDate: data.employmentDate || null,
    employmentType: data.employmentType,
    staffId: data.staffId
  });

  if (data.subjectIds !== undefined) {
    const sids = Array.isArray(data.subjectIds) ? data.subjectIds.map(Number).filter(Boolean) : [];
    await teacherRepo.setSubjects(id, sids);
  }
  if (data.classIds !== undefined) {
    const cids = Array.isArray(data.classIds) ? data.classIds.map(Number).filter(Boolean) : [];
    await teacherRepo.setClasses(id, cids);
  }

  await auditRepo.create({
    userId: adminUserId,
    action: 'UPDATE_TEACHER',
    module: 'teachers',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function activateTeacher(id, adminUserId, meta = {}) {
  const existing = await teacherRepo.findById(id);
  if (!existing) return { error: 'Teacher not found.' };

  await teacherRepo.setActive(id, true);
  await userRepo.setActive(existing.user_id, true);

  await auditRepo.create({
    userId: adminUserId,
    action: 'ACTIVATE_TEACHER',
    module: 'teachers',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function deactivateTeacher(id, adminUserId, meta = {}) {
  const existing = await teacherRepo.findById(id);
  if (!existing) return { error: 'Teacher not found.' };

  await teacherRepo.setActive(id, false);
  await userRepo.setActive(existing.user_id, false);

  await auditRepo.create({
    userId: adminUserId,
    action: 'DEACTIVATE_TEACHER',
    module: 'teachers',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function getTeacherPortalData(userId) {
  const teacher = await teacherRepo.findByUserId(userId);
  if (!teacher) return null;

  const [subjects, classes, attendance, timetable] = await Promise.all([
    teacherRepo.getSubjects(teacher.id),
    teacherRepo.getClasses(teacher.id),
    teacherRepo.getAttendance(teacher.id, { limit: 14 }),
    teacherRepo.getTimetable(teacher.id)
  ]);

  // Today's day of week (1=Mon .. 7=Sun); MySQL DAYOFWEEK is 1=Sun, so adjust
  const jsDay = new Date().getDay(); // 0=Sun
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  const todayTimetable = timetable.filter((t) => Number(t.day_of_week) === dayOfWeek);

  return {
    teacher,
    subjects,
    classes,
    attendance,
    timetable,
    todayTimetable
  };
}

async function listDepartments() {
  return query(`SELECT id, name, code FROM departments WHERE is_active = 1 ORDER BY name`);
}

async function listSubjects() {
  return query(`SELECT id, name, code FROM subjects WHERE is_active = 1 ORDER BY name`);
}

async function listClasses() {
  return query(`SELECT id, name, level FROM classes WHERE is_active = 1 ORDER BY name`);
}

module.exports = {
  listTeachers,
  getTeacher,
  getTeacherByUserId,
  createTeacher,
  updateTeacher,
  activateTeacher,
  deactivateTeacher,
  getTeacherPortalData,
  listDepartments,
  listSubjects,
  listClasses
};
