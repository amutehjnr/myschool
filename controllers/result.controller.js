'use strict';

const resultService = require('../services/result.service');
const studentService = require('../services/student.service');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function parseIds(body) {
  return [].concat(body.result_ids || body.result_id || [])
    .map(Number)
    .filter(Boolean);
}

// ---------- Teacher ----------

async function teacherList(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 50);
    const result = await resultService.listResults(req.session.userId, req.session.role, {
      page,
      limit,
      classId: req.query.class_id || null,
      subjectId: req.query.subject_id || null,
      termId: req.query.term_id || null,
      status: req.query.status || null
    });
    const options = await resultService.getTeacherOptions(req.session.userId);
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('teacher/results/list', {
      title: 'Results',
      results: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      ...options,
      filters: {
        class_id: req.query.class_id || '',
        subject_id: req.query.subject_id || '',
        term_id: req.query.term_id || '',
        status: req.query.status || ''
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function showGenerate(req, res, next) {
  try {
    const options = await resultService.getTeacherOptions(req.session.userId);
    res.render('teacher/results/generate', {
      title: 'Generate Results',
      ...options
    });
  } catch (err) {
    next(err);
  }
}

async function generate(req, res, next) {
  try {
    const options = await resultService.getTeacherOptions(req.session.userId);
    const termId = req.body.term_id ? Number(req.body.term_id) : null;
    let sessId = null;
    if (termId && options.terms.length) {
      const term = options.terms.find((t) => Number(t.id) === termId);
      if (term) sessId = term.academic_session_id;
    }
    if (!sessId && options.currentTerm) {
      sessId = options.currentTerm.session_id || options.currentTerm.academic_session_id;
    }

    const result = await resultService.generateResults(
      {
        classId: Number(req.body.class_id),
        subjectId: Number(req.body.subject_id),
        termId,
        sessionId: sessId
      },
      req.session.userId,
      req.session.role,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('teacher/results/generate', {
        title: 'Generate Results',
        ...options,
        error: result.error,
        form: req.body
      });
    }

    req.session.flash = {
      type: 'success',
      message: `Generated ${result.generated} result(s). Review and submit them.`
    };
    res.redirect('/teacher/results');
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const ids = parseIds(req.body);
    const result = await resultService.submitResults(
      ids,
      req.session.userId,
      req.session.role,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Results submitted for approval.'
    };
    res.redirect('/teacher/results');
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------

async function adminList(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 50);
    const result = await resultService.listResults(req.session.userId, 'administrator', {
      page,
      limit,
      classId: req.query.class_id || null,
      termId: req.query.term_id || null,
      status: req.query.status || null
    });
    const classes = await studentService.listClasses();
    const { listTerms } = require('../repositories/academic.repository');
    const terms = await listTerms();
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/results/list', {
      title: 'Results',
      results: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      classes,
      terms,
      filters: {
        class_id: req.query.class_id || '',
        term_id: req.query.term_id || '',
        status: req.query.status || ''
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminApprove(req, res, next) {
  try {
    const ids = parseIds(req.body);
    const result = await resultService.approveResults(ids, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Results approved.'
    };
    res.redirect('/admin/results');
  } catch (err) {
    next(err);
  }
}

async function adminPublish(req, res, next) {
  try {
    const ids = parseIds(req.body);
    const result = await resultService.publishResults(ids, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Results published.'
    };
    res.redirect('/admin/results');
  } catch (err) {
    next(err);
  }
}

// ---------- Report cards (student / parent) ----------

async function studentReportCard(req, res, next) {
  try {
    const student = await require('../services/student.service').getStudentByUserId(
      req.session.userId
    );
    if (!student) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No student profile linked.'
      });
    }
    const report = await resultService.getStudentReportCard(student.id, {
      termId: req.query.term_id || null,
      viewerUserId: req.session.userId,
      viewerRole: req.session.role
    });
    if (report.error) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: report.error
      });
    }
    res.render('student/results', {
      title: 'My Results',
      ...report,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function parentReportCard(req, res, next) {
  try {
    const parentService = require('../services/parent.service');
    const childId = req.query.child || req.session.selectedChildId;
    const data = await parentService.getPortalData(req.session.userId, childId);
    if (!data || !data.selectedChild) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No child selected or linked.'
      });
    }
    const report = await resultService.getStudentReportCard(data.selectedChild.id, {
      termId: req.query.term_id || null,
      viewerUserId: req.session.userId,
      viewerRole: req.session.role
    });
    if (report.error) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: report.error
      });
    }
    res.render('parent/results', {
      title: 'Results',
      ...data,
      ...report,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  teacherList,
  showGenerate,
  generate,
  submit,
  adminList,
  adminApprove,
  adminPublish,
  studentReportCard,
  parentReportCard
};
