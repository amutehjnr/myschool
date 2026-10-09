'use strict';

const academicRepo = require('../repositories/academic.repository');
const teacherRepo = require('../repositories/teacher.repository');
const auditRepo = require('../repositories/audit.repository');
const { query } = require('../config/database');

async function resolveTeacherId(userId) {
  const t = await teacherRepo.findByUserId(userId);
  return t ? t.id : null;
}

/**
 * Ensure teacher may manage this class+subject (or is admin).
 */
async function assertTeacherScope(userId, role, classId, subjectId) {
  if (String(role).toLowerCase() === 'administrator') return true;
  const teacherId = await resolveTeacherId(userId);
  if (!teacherId) return false;
  if (classId && !(await academicRepo.teacherOwnsClass(teacherId, classId))) return false;
  if (subjectId && !(await academicRepo.teacherOwnsSubject(teacherId, subjectId))) return false;
  return true;
}

// ---------- Assignments ----------

async function listAssignments(userId, role, filters = {}) {
  let teacherId = null;
  if (String(role).toLowerCase() === 'teacher') {
    teacherId = await resolveTeacherId(userId);
    if (!teacherId) return { rows: [], total: 0, page: 1, limit: 20 };
  }
  return academicRepo.listAssignments({ ...filters, teacherId });
}

async function createAssignment(userId, role, data, meta = {}) {
  const teacherId =
    String(role).toLowerCase() === 'administrator' && data.teacherId
      ? data.teacherId
      : await resolveTeacherId(userId);

  if (!teacherId) return { error: 'Teacher profile required.' };
  if (!data.title || !data.classId || !data.subjectId) {
    return { error: 'Title, class and subject are required.' };
  }

  if (String(role).toLowerCase() !== 'administrator') {
    const ok = await assertTeacherScope(userId, role, data.classId, data.subjectId);
    if (!ok) return { error: 'You are not assigned to this class or subject.' };
  }

  const id = await academicRepo.createAssignment({
    ...data,
    teacherId
  });

  await auditRepo.create({
    userId,
    action: 'RESULT_ENTERED',
    module: 'academics',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { type: 'assignment', title: data.title }
  });

  return { success: true, id };
}

async function getAssignment(id) {
  return academicRepo.findAssignmentById(id);
}

// ---------- Assessments ----------

async function listAssessments(userId, role, filters = {}) {
  let teacherId = null;
  if (String(role).toLowerCase() === 'teacher') {
    teacherId = await resolveTeacherId(userId);
    if (!teacherId) return { rows: [], total: 0, page: 1, limit: 20 };
  }
  return academicRepo.listAssessments({ ...filters, teacherId });
}

async function createAssessment(userId, role, data, meta = {}) {
  const teacherId = await resolveTeacherId(userId);
  if (!teacherId && String(role).toLowerCase() !== 'administrator') {
    return { error: 'Teacher profile required.' };
  }
  if (!data.name || !data.assessmentType || !data.classId || !data.subjectId) {
    return { error: 'Name, type, class and subject are required.' };
  }

  if (String(role).toLowerCase() !== 'administrator') {
    const ok = await assertTeacherScope(userId, role, data.classId, data.subjectId);
    if (!ok) return { error: 'You are not assigned to this class or subject.' };
  }

  const id = await academicRepo.createAssessment({
    ...data,
    teacherId: teacherId || data.teacherId || null
  });

  await auditRepo.create({
    userId,
    action: 'RESULT_ENTERED',
    module: 'academics',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { type: 'assessment', name: data.name }
  });

  return { success: true, id };
}

async function getAssessment(id) {
  return academicRepo.findAssessmentById(id);
}

async function getScoreSheet(assessmentId, userId, role) {
  const assessment = await academicRepo.findAssessmentById(assessmentId);
  if (!assessment) return { error: 'Assessment not found.' };

  if (String(role).toLowerCase() !== 'administrator') {
    const ok = await assertTeacherScope(
      userId,
      role,
      assessment.class_id,
      assessment.subject_id
    );
    if (!ok) return { error: 'You cannot access scores for this assessment.' };
  }

  const [students, scores] = await Promise.all([
    academicRepo.getStudentsInClass(assessment.class_id),
    academicRepo.getScoresForAssessment(assessmentId)
  ]);

  const scoreMap = {};
  for (const s of scores) {
    scoreMap[s.student_id] = s;
  }

  const rows = students.map((st) => ({
    studentId: st.id,
    studentCode: st.student_id,
    firstName: st.first_name,
    lastName: st.last_name,
    score: scoreMap[st.id] ? scoreMap[st.id].score : null,
    comment: scoreMap[st.id] ? scoreMap[st.id].teacher_comment : null
  }));

  return { assessment, rows };
}

async function saveScores(assessmentId, scores, userId, role, meta = {}) {
  const assessment = await academicRepo.findAssessmentById(assessmentId);
  if (!assessment) return { error: 'Assessment not found.' };

  if (String(role).toLowerCase() !== 'administrator') {
    const ok = await assertTeacherScope(
      userId,
      role,
      assessment.class_id,
      assessment.subject_id
    );
    if (!ok) return { error: 'You cannot enter scores for this assessment.' };
  }

  if (assessment.is_published) {
    return { error: 'Scores are locked because this assessment is published.' };
  }

  for (const row of scores) {
    if (!row.studentId) continue;
    const max = Number(assessment.max_score) || 100;
    let score = row.score;
    if (score !== null && score !== undefined && score !== '') {
      score = Number(score);
      if (Number.isNaN(score) || score < 0 || score > max) {
        return { error: `Score for student ${row.studentId} must be between 0 and ${max}.` };
      }
    } else {
      score = null;
    }
    await academicRepo.upsertScore({
      assessmentId,
      studentId: row.studentId,
      score,
      teacherComment: row.comment || null,
      enteredBy: userId
    });
  }

  await auditRepo.create({
    userId,
    action: 'RESULT_ENTERED',
    module: 'academics',
    recordId: assessmentId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { type: 'scores', count: scores.length }
  });

  return { success: true };
}

async function getTeacherOptions(userId) {
  const teacher = await teacherRepo.findByUserId(userId);
  if (!teacher) return { classes: [], subjects: [], terms: [] };
  const [classes, subjects, terms] = await Promise.all([
    teacherRepo.getClasses(teacher.id),
    teacherRepo.getSubjects(teacher.id),
    academicRepo.listTerms()
  ]);
  return { teacher, classes, subjects, terms };
}

async function listAllClasses() {
  return query(`SELECT id, name, level FROM classes WHERE is_active = 1 ORDER BY name`);
}

async function listAllSubjects() {
  return query(`SELECT id, name, code FROM subjects WHERE is_active = 1 ORDER BY name`);
}

module.exports = {
  listAssignments,
  createAssignment,
  getAssignment,
  listAssessments,
  createAssessment,
  getAssessment,
  getScoreSheet,
  saveScores,
  getTeacherOptions,
  listAllClasses,
  listAllSubjects
};
