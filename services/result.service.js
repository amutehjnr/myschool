'use strict';

const resultRepo = require('../repositories/result.repository');
const academicRepo = require('../repositories/academic.repository');
const teacherRepo = require('../repositories/teacher.repository');
const studentRepo = require('../repositories/student.repository');
const auditRepo = require('../repositories/audit.repository');

async function resolveTeacherId(userId) {
  const t = await teacherRepo.findByUserId(userId);
  return t ? t.id : null;
}

/**
 * Generate subject results for a class + subject + term from assessment scores.
 * Weighted average if weights present; otherwise simple average of percentages.
 */
async function generateResults(
  { classId, subjectId, termId, sessionId },
  userId,
  role,
  meta = {}
) {
  if (!classId || !subjectId || !termId || !sessionId) {
    return { error: 'Class, subject, term and session are required.' };
  }

  if (String(role).toLowerCase() !== 'administrator') {
    const teacherId = await resolveTeacherId(userId);
    if (!teacherId) return { error: 'Teacher profile required.' };
    const ownsClass = await academicRepo.teacherOwnsClass(teacherId, classId);
    const ownsSubject = await academicRepo.teacherOwnsSubject(teacherId, subjectId);
    if (!ownsClass || !ownsSubject) {
      return { error: 'You are not assigned to this class or subject.' };
    }
  }

  const assessments = await resultRepo.listAssessmentsForClassSubjectTerm({
    classId,
    subjectId,
    termId,
    sessionId
  });

  if (!assessments.length) {
    return { error: 'No assessments found for this class, subject and term.' };
  }

  const assessmentIds = assessments.map((a) => a.id);
  const allScores = await resultRepo.getScoresForAssessments(assessmentIds);
  const students = await academicRepo.getStudentsInClass(classId);

  const grading = await resultRepo.getDefaultGradingSystem();
  const boundaries = grading
    ? await resultRepo.getGradeBoundaries(grading.id)
    : [];

  // Score lookup: assessmentId -> studentId -> score
  const scoreMap = {};
  for (const sc of allScores) {
    if (!scoreMap[sc.assessment_id]) scoreMap[sc.assessment_id] = {};
    scoreMap[sc.assessment_id][sc.student_id] = sc.score;
  }

  let generated = 0;
  for (const student of students) {
    const components = [];
    let weightedSum = 0;
    let totalWeight = 0;
    let percentSum = 0;
    let percentCount = 0;

    for (const a of assessments) {
      const raw = scoreMap[a.id] ? scoreMap[a.id][student.id] : null;
      const max = Number(a.max_score) || 100;
      const pct = raw != null && max > 0 ? (Number(raw) / max) * 100 : null;
      const weight = a.weight != null ? Number(a.weight) : null;

      components.push({
        name: a.name,
        score: raw,
        maxScore: max,
        weight
      });

      if (pct != null) {
        if (weight != null && weight > 0) {
          weightedSum += pct * (weight / 100);
          totalWeight += weight;
        } else {
          percentSum += pct;
          percentCount += 1;
        }
      }
    }

    let totalScore = null;
    if (totalWeight > 0) {
      // Normalize if weights don't sum to 100
      totalScore = totalWeight >= 99 ? weightedSum : (weightedSum / totalWeight) * 100;
    } else if (percentCount > 0) {
      totalScore = percentSum / percentCount;
    }

    if (totalScore != null) {
      totalScore = Math.round(totalScore * 100) / 100;
    }

    const gradeInfo = totalScore != null ? resultRepo.computeGrade(totalScore, boundaries) : null;

    const result = await resultRepo.upsertResult({
      studentId: student.id,
      classId,
      subjectId,
      termId,
      sessionId,
      totalScore,
      grade: gradeInfo ? gradeInfo.grade : null,
      status: 'draft',
      components
    });

    if (!result.error) generated += 1;
  }

  await auditRepo.create({
    userId,
    action: 'RESULT_ENTERED',
    module: 'results',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { classId, subjectId, termId, generated }
  });

  return { success: true, generated };
}

async function listResults(userId, role, filters) {
  let teacherId = null;
  if (String(role).toLowerCase() === 'teacher') {
    teacherId = await resolveTeacherId(userId);
    if (!teacherId) return { rows: [], total: 0, page: 1, limit: 50 };
  }
  return resultRepo.listResults({ ...filters, teacherId });
}

async function getResult(id) {
  const result = await resultRepo.findById(id);
  if (!result) return null;
  const components = await resultRepo.getComponents(id);
  return { ...result, components };
}

async function submitResults(ids, userId, role, meta = {}) {
  if (!ids.length) return { error: 'No results selected.' };
  // Teachers can only submit their scoped results
  for (const id of ids) {
    const r = await resultRepo.findById(id);
    if (!r) continue;
    if (String(role).toLowerCase() !== 'administrator') {
      const teacherId = await resolveTeacherId(userId);
      const ownsClass = await academicRepo.teacherOwnsClass(teacherId, r.class_id);
      const ownsSubject = await academicRepo.teacherOwnsSubject(teacherId, r.subject_id);
      if (!ownsClass || !ownsSubject) {
        return { error: 'You cannot submit one or more of these results.' };
      }
    }
    if (r.status === 'published') continue;
    await resultRepo.setStatus(id, 'submitted');
  }

  await auditRepo.create({
    userId,
    action: 'RESULT_SUBMITTED',
    module: 'results',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { ids }
  });

  return { success: true };
}

async function approveResults(ids, adminUserId, meta = {}) {
  if (!ids.length) return { error: 'No results selected.' };
  await resultRepo.bulkSetStatus(ids, 'approved', adminUserId);
  await auditRepo.create({
    userId: adminUserId,
    action: 'RESULT_APPROVED',
    module: 'results',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { ids }
  });
  return { success: true };
}

async function publishResults(ids, adminUserId, meta = {}) {
  if (!ids.length) return { error: 'No results selected.' };
  // Only publish approved (or allow direct from submitted for flexibility)
  for (const id of ids) {
    const r = await resultRepo.findById(id);
    if (!r) continue;
    if (!['approved', 'submitted'].includes(r.status)) continue;
    await resultRepo.setStatus(id, 'published', { approvedBy: adminUserId });
  }
  await auditRepo.create({
    userId: adminUserId,
    action: 'RESULT_PUBLISHED',
    module: 'results',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { ids }
  });
  return { success: true };
}

async function getStudentReportCard(studentId, { termId = null, sessionId = null, viewerUserId, viewerRole } = {}) {
  // Object-level: student self, parent of child, or admin/teacher
  const role = String(viewerRole || '').toLowerCase();
  if (role === 'student') {
    const me = await studentRepo.findByUserId(viewerUserId);
    if (!me || Number(me.id) !== Number(studentId)) {
      return { error: 'Access denied.' };
    }
  } else if (role === 'parent') {
    const allowed = await studentRepo.isChildOfParent(studentId, viewerUserId);
    if (!allowed) return { error: 'Access denied.' };
  } else if (role !== 'administrator' && role !== 'teacher') {
    return { error: 'Access denied.' };
  }

  const student = await studentRepo.findById(studentId);
  if (!student) return { error: 'Student not found.' };

  const publishedOnly = role === 'student' || role === 'parent';

  // Default filters: current session + current term when none selected
  let effectiveSessionId = sessionId ? Number(sessionId) : null;
  let effectiveTermId = termId ? Number(termId) : null;

  const currentTerm = await resultRepo.getCurrentTerm();
  // No filters at all → current session + current term (one report card)
  if (!sessionId && !termId && currentTerm) {
    effectiveSessionId = currentTerm.session_id || currentTerm.academic_session_id || null;
    effectiveTermId = currentTerm.id;
  } else if (sessionId && !termId) {
    // Session only → all terms in that session (up to 3 report cards)
    effectiveSessionId = Number(sessionId);
    effectiveTermId = null;
  } else if (!sessionId && termId) {
    effectiveTermId = Number(termId);
  }

  const [sessions, terms, results] = await Promise.all([
    resultRepo.listSessions(),
    resultRepo.listTerms(effectiveSessionId || null),
    resultRepo.getStudentResults(studentId, {
      termId: effectiveTermId,
      sessionId: effectiveSessionId,
      publishedOnly
    })
  ]);

  // Attach components
  for (const r of results) {
    r.components = await resultRepo.getComponents(r.id);
  }

  const selectedSession = sessions.find((s) => Number(s.id) === Number(effectiveSessionId)) || null;
  const selectedTerm = terms.find((t) => Number(t.id) === Number(effectiveTermId)) || null;

  return {
    student,
    results,
    sessions,
    terms,
    filters: {
      sessionId: effectiveSessionId,
      termId: effectiveTermId
    },
    selectedSession,
    selectedTerm
  };
}

async function getTeacherOptions(userId) {
  const teacher = await teacherRepo.findByUserId(userId);
  if (!teacher) return { classes: [], subjects: [], terms: [], currentTerm: null };
  const [classes, subjects, currentTerm] = await Promise.all([
    teacherRepo.getClasses(teacher.id),
    teacherRepo.getSubjects(teacher.id),
    resultRepo.getCurrentTerm()
  ]);
  const terms = await academicRepo.listTerms();
  return { teacher, classes, subjects, terms, currentTerm };
}

module.exports = {
  generateResults,
  listResults,
  getResult,
  submitResults,
  approveResults,
  publishResults,
  getStudentReportCard,
  getTeacherOptions
};
