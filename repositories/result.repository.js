'use strict';

const { query, getConnection } = require('../config/database');

async function getDefaultGradingSystem() {
  const rows = await query(
    `SELECT id, name FROM grading_systems WHERE is_default = 1 LIMIT 1`
  );
  return rows[0] || null;
}

async function getGradeBoundaries(gradingSystemId) {
  return query(
    `SELECT grade_label, min_score, max_score, remark
     FROM grade_boundaries
     WHERE grading_system_id = :id
     ORDER BY min_score DESC`,
    { id: gradingSystemId }
  );
}

/**
 * Compute grade label for a score using boundaries.
 */
function computeGrade(score, boundaries) {
  if (score == null || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  for (const b of boundaries) {
    if (s >= Number(b.min_score) && s <= Number(b.max_score)) {
      return { grade: b.grade_label, remark: b.remark };
    }
  }
  return null;
}

async function listAssessmentsForClassSubjectTerm({ classId, subjectId, termId, sessionId }) {
  let where = 'class_id = :classId AND subject_id = :subjectId';
  const params = { classId, subjectId };
  if (termId) {
    where += ' AND term_id = :termId';
    params.termId = termId;
  }
  if (sessionId) {
    where += ' AND academic_session_id = :sessionId';
    params.sessionId = sessionId;
  }
  return query(
    `SELECT id, name, assessment_type, max_score, weight, is_published
     FROM assessments
     WHERE ${where}
     ORDER BY assessment_type, id`,
    params
  );
}

async function getScoresForAssessments(assessmentIds) {
  if (!assessmentIds.length) return [];
  // Named placeholders don't support IN lists well; build safely with integers only
  const ids = assessmentIds.map((id) => Number(id)).filter(Boolean);
  if (!ids.length) return [];
  return query(
    `SELECT assessment_id, student_id, score
     FROM student_scores
     WHERE assessment_id IN (${ids.join(',')})`
  );
}

async function findResult({ studentId, classId, subjectId, termId, sessionId }) {
  const rows = await query(
    `SELECT * FROM results
     WHERE student_id = :studentId AND class_id = :classId
       AND subject_id = :subjectId AND term_id = :termId
       AND academic_session_id = :sessionId
     LIMIT 1`,
    { studentId, classId, subjectId, termId, sessionId }
  );
  return rows[0] || null;
}

async function upsertResult(data) {
  const existing = await findResult({
    studentId: data.studentId,
    classId: data.classId,
    subjectId: data.subjectId,
    termId: data.termId,
    sessionId: data.sessionId
  });

  if (existing) {
    if (existing.status === 'published') {
      return { error: 'Cannot modify published result.', id: existing.id };
    }
    await query(
      `UPDATE results
       SET total_score = :totalScore, grade = :grade, teacher_comment = :teacherComment,
           status = :status, updated_at = NOW()
       WHERE id = :id`,
      {
        id: existing.id,
        totalScore: data.totalScore,
        grade: data.grade,
        teacherComment: data.teacherComment || null,
        status: data.status || existing.status
      }
    );
    // Refresh components
    await query(`DELETE FROM result_components WHERE result_id = :id`, { id: existing.id });
    for (const c of data.components || []) {
      await query(
        `INSERT INTO result_components (result_id, component_name, score, max_score, weight)
         VALUES (:resultId, :name, :score, :maxScore, :weight)`,
        {
          resultId: existing.id,
          name: c.name,
          score: c.score,
          maxScore: c.maxScore,
          weight: c.weight
        }
      );
    }
    return { id: existing.id, updated: true };
  }

  const result = await query(
    `INSERT INTO results
       (student_id, class_id, subject_id, academic_session_id, term_id,
        total_score, grade, teacher_comment, status)
     VALUES
       (:studentId, :classId, :subjectId, :sessionId, :termId,
        :totalScore, :grade, :teacherComment, :status)`,
    {
      studentId: data.studentId,
      classId: data.classId,
      subjectId: data.subjectId,
      sessionId: data.sessionId,
      termId: data.termId,
      totalScore: data.totalScore,
      grade: data.grade,
      teacherComment: data.teacherComment || null,
      status: data.status || 'draft'
    }
  );
  const resultId = result.insertId;
  for (const c of data.components || []) {
    await query(
      `INSERT INTO result_components (result_id, component_name, score, max_score, weight)
       VALUES (:resultId, :name, :score, :maxScore, :weight)`,
      {
        resultId,
        name: c.name,
        score: c.score,
        maxScore: c.maxScore,
        weight: c.weight
      }
    );
  }
  return { id: resultId, created: true };
}

async function listResults({
  classId = null,
  subjectId = null,
  termId = null,
  sessionId = null,
  status = null,
  teacherId = null,
  page = 1,
  limit = 50
} = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (classId) {
    where += ' AND r.class_id = :classId';
    params.classId = classId;
  }
  if (subjectId) {
    where += ' AND r.subject_id = :subjectId';
    params.subjectId = subjectId;
  }
  if (termId) {
    where += ' AND r.term_id = :termId';
    params.termId = termId;
  }
  if (sessionId) {
    where += ' AND r.academic_session_id = :sessionId';
    params.sessionId = sessionId;
  }
  if (status) {
    where += ' AND r.status = :status';
    params.status = status;
  }
  // Teacher scope: only results for their class+subject combos
  if (teacherId) {
    where += ` AND EXISTS (
      SELECT 1 FROM teacher_classes tc WHERE tc.teacher_id = :teacherId AND tc.class_id = r.class_id
    ) AND EXISTS (
      SELECT 1 FROM teacher_subjects ts WHERE ts.teacher_id = :teacherId AND ts.subject_id = r.subject_id
    )`;
    params.teacherId = teacherId;
  }

  const rows = await query(
    `SELECT r.id, r.total_score, r.grade, r.status, r.teacher_comment, r.published_at,
            s.student_id, s.first_name, s.last_name,
            c.name AS class_name, sub.name AS subject_name,
            t.name AS term_name
     FROM results r
     JOIN students s ON s.id = r.student_id
     JOIN classes c ON c.id = r.class_id
     LEFT JOIN subjects sub ON sub.id = r.subject_id
     JOIN terms t ON t.id = r.term_id
     WHERE ${where}
     ORDER BY c.name, sub.name, s.last_name
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM results r WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function findById(id) {
  const rows = await query(
    `SELECT r.*, s.student_id, s.first_name, s.last_name,
            c.name AS class_name, sub.name AS subject_name,
            t.name AS term_name, sess.name AS session_name
     FROM results r
     JOIN students s ON s.id = r.student_id
     JOIN classes c ON c.id = r.class_id
     LEFT JOIN subjects sub ON sub.id = r.subject_id
     JOIN terms t ON t.id = r.term_id
     JOIN academic_sessions sess ON sess.id = r.academic_session_id
     WHERE r.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function getComponents(resultId) {
  return query(
    `SELECT component_name, score, max_score, weight
     FROM result_components WHERE result_id = :id`,
    { id: resultId }
  );
}

async function setStatus(id, status, { approvedBy = null } = {}) {
  await query(
    `UPDATE results
     SET status = :status,
         approved_by = COALESCE(:approvedBy, approved_by),
         published_at = CASE WHEN :status = 'published' THEN NOW() ELSE published_at END
     WHERE id = :id`,
    { id, status, approvedBy }
  );
}

async function bulkSetStatus(ids, status, approvedBy = null) {
  if (!ids.length) return;
  const idList = ids.map(Number).filter(Boolean);
  if (!idList.length) return;
  await query(
    `UPDATE results
     SET status = :status,
         approved_by = COALESCE(:approvedBy, approved_by),
         published_at = CASE WHEN :status = 'published' THEN NOW() ELSE published_at END
     WHERE id IN (${idList.join(',')})`,
    { status, approvedBy }
  );
}

async function getStudentResults(studentId, { termId = null, sessionId = null, publishedOnly = true } = {}) {
  let where = 'r.student_id = :studentId';
  const params = { studentId };
  if (sessionId) {
    where += ' AND r.academic_session_id = :sessionId';
    params.sessionId = sessionId;
  }
  if (termId) {
    where += ' AND r.term_id = :termId';
    params.termId = termId;
  }
  if (publishedOnly) {
    where += ` AND r.status = 'published'`;
  }
  return query(
    `SELECT r.id, r.total_score, r.grade, r.teacher_comment, r.principal_comment, r.status,
            r.term_id, r.academic_session_id, r.published_at,
            sub.name AS subject_name, t.name AS term_name, c.name AS class_name,
            s.name AS session_name
     FROM results r
     LEFT JOIN subjects sub ON sub.id = r.subject_id
     JOIN terms t ON t.id = r.term_id
     JOIN classes c ON c.id = r.class_id
     LEFT JOIN academic_sessions s ON s.id = r.academic_session_id
     WHERE ${where}
     ORDER BY s.name DESC, t.name, sub.name`,
    params
  );
}

async function listSessions() {
  return query(
    `SELECT id, name, is_current, start_date, end_date
     FROM academic_sessions
     ORDER BY start_date DESC, id DESC`
  );
}

async function listTerms(sessionId = null) {
  let where = '1=1';
  const params = {};
  if (sessionId) {
    where = 't.academic_session_id = :sessionId';
    params.sessionId = sessionId;
  }
  return query(
    `SELECT t.id, t.name, t.is_current, t.academic_session_id, s.name AS session_name,
            t.start_date, t.end_date
     FROM terms t
     JOIN academic_sessions s ON s.id = t.academic_session_id
     WHERE ${where}
     ORDER BY t.start_date ASC, t.id ASC`,
    params
  );
}

async function getCurrentTerm() {
  const rows = await query(
    `SELECT t.*, s.name AS session_name, s.id AS session_id
     FROM terms t
     JOIN academic_sessions s ON s.id = t.academic_session_id
     WHERE t.is_current = 1
     LIMIT 1`
  );
  return rows[0] || null;
}

module.exports = {
  getDefaultGradingSystem,
  getGradeBoundaries,
  computeGrade,
  listAssessmentsForClassSubjectTerm,
  getScoresForAssessments,
  findResult,
  upsertResult,
  listResults,
  findById,
  getComponents,
  setStatus,
  bulkSetStatus,
  getStudentResults,
  getCurrentTerm,
  listSessions,
  listTerms
};
