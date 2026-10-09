'use strict';

const { query } = require('../config/database');

// ---------- Assignments ----------

async function createAssignment(data) {
  const result = await query(
    `INSERT INTO assignments
       (title, description, class_id, subject_id, teacher_id, due_date, max_score,
        academic_session_id, term_id, is_published)
     VALUES
       (:title, :description, :classId, :subjectId, :teacherId, :dueDate, :maxScore,
        :sessionId, :termId, :isPublished)`,
    {
      title: data.title,
      description: data.description || null,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      dueDate: data.dueDate || null,
      maxScore: data.maxScore != null ? data.maxScore : 100,
      sessionId: data.sessionId || null,
      termId: data.termId || null,
      isPublished: data.isPublished !== false ? 1 : 0
    }
  );
  return result.insertId;
}

async function updateAssignment(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    title: 'title',
    description: 'description',
    due_date: 'dueDate',
    max_score: 'maxScore',
    is_published: 'isPublished'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = data[key];
    }
  }
  if (!fields.length) return;
  await query(`UPDATE assignments SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function findAssignmentById(id) {
  const rows = await query(
    `SELECT a.*, c.name AS class_name, s.name AS subject_name,
            t.first_name AS teacher_first, t.last_name AS teacher_last
     FROM assignments a
     JOIN classes c ON c.id = a.class_id
     JOIN subjects s ON s.id = a.subject_id
     JOIN teachers t ON t.id = a.teacher_id
     WHERE a.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function listAssignments({ teacherId = null, classId = null, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (teacherId) {
    where += ' AND a.teacher_id = :teacherId';
    params.teacherId = teacherId;
  }
  if (classId) {
    where += ' AND a.class_id = :classId';
    params.classId = classId;
  }
  const rows = await query(
    `SELECT a.id, a.title, a.due_date, a.max_score, a.is_published, a.created_at,
            c.name AS class_name, s.name AS subject_name
     FROM assignments a
     JOIN classes c ON c.id = a.class_id
     JOIN subjects s ON s.id = a.subject_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM assignments a WHERE ${where}`,
    params
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

// ---------- Assessments ----------

async function createAssessment(data) {
  const result = await query(
    `INSERT INTO assessments
       (name, assessment_type, class_id, subject_id, teacher_id, max_score, weight,
        academic_session_id, term_id, assessment_date, is_published)
     VALUES
       (:name, :type, :classId, :subjectId, :teacherId, :maxScore, :weight,
        :sessionId, :termId, :assessmentDate, :isPublished)`,
    {
      name: data.name,
      type: data.assessmentType,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId || null,
      maxScore: data.maxScore != null ? data.maxScore : 100,
      weight: data.weight != null ? data.weight : null,
      sessionId: data.sessionId || null,
      termId: data.termId || null,
      assessmentDate: data.assessmentDate || null,
      isPublished: data.isPublished ? 1 : 0
    }
  );
  return result.insertId;
}

async function findAssessmentById(id) {
  const rows = await query(
    `SELECT a.*, c.name AS class_name, s.name AS subject_name
     FROM assessments a
     JOIN classes c ON c.id = a.class_id
     JOIN subjects s ON s.id = a.subject_id
     WHERE a.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function listAssessments({ teacherId = null, classId = null, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (teacherId) {
    where += ' AND a.teacher_id = :teacherId';
    params.teacherId = teacherId;
  }
  if (classId) {
    where += ' AND a.class_id = :classId';
    params.classId = classId;
  }
  const rows = await query(
    `SELECT a.id, a.name, a.assessment_type, a.max_score, a.is_published, a.assessment_date,
            c.name AS class_name, s.name AS subject_name
     FROM assessments a
     JOIN classes c ON c.id = a.class_id
     JOIN subjects s ON s.id = a.subject_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM assessments a WHERE ${where}`,
    params
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function setAssessmentPublished(id, published) {
  await query(`UPDATE assessments SET is_published = :p WHERE id = :id`, {
    id,
    p: published ? 1 : 0
  });
}

// ---------- Scores ----------

async function getStudentsInClass(classId) {
  return query(
    `SELECT id, student_id, first_name, last_name
     FROM students
     WHERE class_id = :classId AND status = 'active'
     ORDER BY last_name, first_name`,
    { classId }
  );
}

async function getScoresForAssessment(assessmentId) {
  return query(
    `SELECT ss.*, s.student_id, s.first_name, s.last_name
     FROM student_scores ss
     JOIN students s ON s.id = ss.student_id
     WHERE ss.assessment_id = :assessmentId
     ORDER BY s.last_name, s.first_name`,
    { assessmentId }
  );
}

async function upsertScore({ assessmentId, studentId, score, teacherComment, enteredBy }) {
  await query(
    `INSERT INTO student_scores (assessment_id, student_id, score, teacher_comment, entered_by, entered_at)
     VALUES (:assessmentId, :studentId, :score, :comment, :enteredBy, NOW())
     ON DUPLICATE KEY UPDATE
       score = VALUES(score),
       teacher_comment = VALUES(teacher_comment),
       entered_by = VALUES(entered_by),
       entered_at = NOW()`,
    {
      assessmentId,
      studentId,
      score: score === '' || score == null ? null : Number(score),
      comment: teacherComment || null,
      enteredBy: enteredBy || null
    }
  );
}

async function teacherOwnsClass(teacherId, classId) {
  const rows = await query(
    `SELECT 1 FROM teacher_classes WHERE teacher_id = :tid AND class_id = :cid LIMIT 1`,
    { tid: teacherId, cid: classId }
  );
  return rows.length > 0;
}

async function teacherOwnsSubject(teacherId, subjectId) {
  const rows = await query(
    `SELECT 1 FROM teacher_subjects WHERE teacher_id = :tid AND subject_id = :sid LIMIT 1`,
    { tid: teacherId, sid: subjectId }
  );
  return rows.length > 0;
}

async function listTerms() {
  return query(
    `SELECT t.id, t.name, t.is_current, t.academic_session_id, s.name AS session_name
     FROM terms t
     JOIN academic_sessions s ON s.id = t.academic_session_id
     ORDER BY t.start_date DESC`
  );
}

module.exports = {
  createAssignment,
  updateAssignment,
  findAssignmentById,
  listAssignments,
  createAssessment,
  findAssessmentById,
  listAssessments,
  setAssessmentPublished,
  getStudentsInClass,
  getScoresForAssessment,
  upsertScore,
  teacherOwnsClass,
  teacherOwnsSubject,
  listTerms
};
