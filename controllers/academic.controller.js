'use strict';

const academicService = require('../services/academic.service');
const { validationResult } = require('express-validator');
const { paginate, formatDate } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Teacher: Assignments ----------

async function listAssignments(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 20);
    const result = await academicService.listAssignments(
      req.session.userId,
      req.session.role,
      { page, limit }
    );
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('teacher/assignments/list', {
      title: 'Assignments',
      assignments: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function showCreateAssignment(req, res, next) {
  try {
    const options = await academicService.getTeacherOptions(req.session.userId);
    res.render('teacher/assignments/form', {
      title: 'New Assignment',
      assignment: null,
      ...options,
      mode: 'create'
    });
  } catch (err) {
    next(err);
  }
}

async function createAssignment(req, res, next) {
  try {
    const errors = validationResult(req);
    const options = await academicService.getTeacherOptions(req.session.userId);
    if (!errors.isEmpty()) {
      return res.status(400).render('teacher/assignments/form', {
        title: 'New Assignment',
        assignment: req.body,
        ...options,
        mode: 'create',
        error: errors.array()[0].msg
      });
    }

    const result = await academicService.createAssignment(
      req.session.userId,
      req.session.role,
      {
        title: req.body.title,
        description: req.body.description,
        classId: Number(req.body.class_id),
        subjectId: Number(req.body.subject_id),
        dueDate: req.body.due_date || null,
        maxScore: req.body.max_score ? Number(req.body.max_score) : 100
      },
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('teacher/assignments/form', {
        title: 'New Assignment',
        assignment: req.body,
        ...options,
        mode: 'create',
        error: result.error
      });
    }

    req.session.flash = { type: 'success', message: 'Assignment created.' };
    res.redirect('/teacher/assignments');
  } catch (err) {
    next(err);
  }
}

// ---------- Teacher: Assessments ----------

async function listAssessments(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 20);
    const result = await academicService.listAssessments(
      req.session.userId,
      req.session.role,
      { page, limit }
    );
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('teacher/assessments/list', {
      title: 'Assessments',
      assessments: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function showCreateAssessment(req, res, next) {
  try {
    const options = await academicService.getTeacherOptions(req.session.userId);
    res.render('teacher/assessments/form', {
      title: 'New Assessment',
      assessment: null,
      ...options,
      mode: 'create'
    });
  } catch (err) {
    next(err);
  }
}

async function createAssessment(req, res, next) {
  try {
    const errors = validationResult(req);
    const options = await academicService.getTeacherOptions(req.session.userId);
    if (!errors.isEmpty()) {
      return res.status(400).render('teacher/assessments/form', {
        title: 'New Assessment',
        assessment: req.body,
        ...options,
        mode: 'create',
        error: errors.array()[0].msg
      });
    }

    const result = await academicService.createAssessment(
      req.session.userId,
      req.session.role,
      {
        name: req.body.name,
        assessmentType: req.body.assessment_type,
        classId: Number(req.body.class_id),
        subjectId: Number(req.body.subject_id),
        maxScore: req.body.max_score ? Number(req.body.max_score) : 100,
        weight: req.body.weight ? Number(req.body.weight) : null,
        assessmentDate: req.body.assessment_date || null,
        termId: req.body.term_id ? Number(req.body.term_id) : null
      },
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('teacher/assessments/form', {
        title: 'New Assessment',
        assessment: req.body,
        ...options,
        mode: 'create',
        error: result.error
      });
    }

    req.session.flash = { type: 'success', message: 'Assessment created. Enter scores next.' };
    res.redirect(`/teacher/assessments/${result.id}/scores`);
  } catch (err) {
    next(err);
  }
}

async function showScores(req, res, next) {
  try {
    const sheet = await academicService.getScoreSheet(
      req.params.id,
      req.session.userId,
      req.session.role
    );
    if (sheet.error) {
      req.session.flash = { type: 'error', message: sheet.error };
      return res.redirect('/teacher/assessments');
    }
    res.render('teacher/assessments/scores', {
      title: `Scores — ${sheet.assessment.name}`,
      assessment: sheet.assessment,
      rows: sheet.rows,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function saveScores(req, res, next) {
  try {
    const studentIds = [].concat(req.body.student_id || []);
    const scores = [].concat(req.body.score || []);
    const comments = [].concat(req.body.comment || []);

    const payload = studentIds.map((id, i) => ({
      studentId: Number(id),
      score: scores[i],
      comment: comments[i] || null
    }));

    const result = await academicService.saveScores(
      req.params.id,
      payload,
      req.session.userId,
      req.session.role,
      meta(req)
    );

    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Scores saved.'
    };
    res.redirect(`/teacher/assessments/${req.params.id}/scores`);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAssignments,
  showCreateAssignment,
  createAssignment,
  listAssessments,
  showCreateAssessment,
  createAssessment,
  showScores,
  saveScores
};
