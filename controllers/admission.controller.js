'use strict';

const admissionService = require('../services/admission.service');
const { validationResult } = require('express-validator');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Public applicant flow ----------

async function showStart(req, res) {
  const sessions = await admissionService.listSessions();
  const classes = await admissionService.listClasses();
  res.render('admissions/start', {
    title: 'Start Application',
    sessions,
    classes
  });
}

async function start(req, res, next) {
  try {
    const errors = validationResult(req);
    const sessions = await admissionService.listSessions();
    const classes = await admissionService.listClasses();

    if (!errors.isEmpty()) {
      return res.status(400).render('admissions/start', {
        title: 'Start Application',
        sessions,
        classes,
        form: req.body,
        error: errors.array()[0].msg
      });
    }

    const result = await admissionService.startApplication({
      firstName: req.body.first_name,
      lastName: req.body.last_name,
      middleName: req.body.middle_name,
      dateOfBirth: req.body.date_of_birth || null,
      gender: req.body.gender || null,
      applyingForClass: req.body.applying_for_class || null,
      academicSessionId: req.body.academic_session_id
        ? Number(req.body.academic_session_id)
        : null,
      parentFirstName: req.body.parent_first_name,
      parentLastName: req.body.parent_last_name,
      parentEmail: req.body.parent_email,
      parentPhone: req.body.parent_phone,
      parentRelationship: req.body.parent_relationship,
      address: req.body.address,
      previousSchool: req.body.previous_school,
      notes: req.body.notes
    });

    if (result.error) {
      return res.status(400).render('admissions/start', {
        title: 'Start Application',
        sessions,
        classes,
        form: req.body,
        error: result.error
      });
    }

    // Store application id in session for multi-step flow
    req.session.admissionId = result.id;
    req.session.admissionRef = result.referenceNumber;
    res.redirect(`/admissions/application/${result.id}/documents`);
  } catch (err) {
    next(err);
  }
}

async function showDocuments(req, res, next) {
  try {
    const app = await admissionService.getApplication(req.params.id);
    if (!app) {
      req.session.flash = { type: 'error', message: 'Application not found.' };
      return res.redirect('/admissions');
    }
    // Only allow owner of draft via session (simple public flow)
    if (
      req.session.admissionId &&
      Number(req.session.admissionId) !== Number(app.id) &&
      !req.session.userId
    ) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'You do not have access to this application.'
      });
    }
    res.render('admissions/documents', {
      title: 'Upload Documents',
      application: app,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function uploadDocument(req, res, next) {
  try {
    const app = await admissionService.getApplication(req.params.id);
    if (!app) {
      req.session.flash = { type: 'error', message: 'Application not found.' };
      return res.redirect('/admissions');
    }

    const result = await admissionService.addDocument(
      app.id,
      req.file,
      req.body.document_type || 'supporting',
      meta(req)
    );

    if (result.error) {
      req.session.flash = { type: 'error', message: result.error };
    } else {
      req.session.flash = { type: 'success', message: 'Document uploaded.' };
    }
    res.redirect(`/admissions/application/${app.id}/documents`);
  } catch (err) {
    if (err.message && err.message.includes('Invalid file')) {
      req.session.flash = { type: 'error', message: err.message };
      return res.redirect(`/admissions/application/${req.params.id}/documents`);
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      req.session.flash = { type: 'error', message: 'File too large. Maximum 5 MB.' };
      return res.redirect(`/admissions/application/${req.params.id}/documents`);
    }
    next(err);
  }
}

async function showReview(req, res, next) {
  try {
    const app = await admissionService.getApplication(req.params.id);
    if (!app) {
      req.session.flash = { type: 'error', message: 'Application not found.' };
      return res.redirect('/admissions');
    }
    res.render('admissions/review', {
      title: 'Review Application',
      application: app,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function submit(req, res, next) {
  try {
    const result = await admissionService.submitApplication(req.params.id, meta(req));
    if (result.error) {
      req.session.flash = { type: 'error', message: result.error };
      return res.redirect(`/admissions/application/${req.params.id}/review`);
    }
    delete req.session.admissionId;
    res.redirect(`/admissions/status?ref=${encodeURIComponent(result.referenceNumber)}`);
  } catch (err) {
    next(err);
  }
}

async function showStatus(req, res, next) {
  try {
    const ref = req.query.ref || req.body.reference || '';
    let application = null;
    if (ref) {
      application = await admissionService.getByReference(ref.trim());
    }
    res.render('admissions/status', {
      title: 'Track Application',
      reference: ref,
      application,
      formatDate,
      statusBadgeClass,
      notFound: Boolean(ref) && !application
    });
  } catch (err) {
    next(err);
  }
}

async function track(req, res, next) {
  const ref = (req.body.reference || '').trim();
  res.redirect(`/admissions/status?ref=${encodeURIComponent(ref)}`);
}

// ---------- Admin ----------

async function adminList(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, req.query.limit || 20);
    const result = await admissionService.listApplications({
      page,
      limit,
      status: req.query.status || null,
      search: req.query.search || null
    });
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/admissions/list', {
      title: 'Admissions',
      applications: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages,
      filters: {
        status: req.query.status || '',
        search: req.query.search || ''
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShow(req, res, next) {
  try {
    const application = await admissionService.getApplication(req.params.id);
    if (!application) {
      req.session.flash = { type: 'error', message: 'Application not found.' };
      return res.redirect('/admin/admissions');
    }
    res.render('admin/admissions/detail', {
      title: application.reference_number,
      application,
      formatDate,
      statusBadgeClass,
      transitions: require('../services/admission.service').VALID_TRANSITIONS[application.status] || []
    });
  } catch (err) {
    next(err);
  }
}

async function adminChangeStatus(req, res, next) {
  try {
    const result = await admissionService.changeStatus(
      req.params.id,
      req.body.status,
      req.session.userId,
      { adminNotes: req.body.admin_notes || null },
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || `Status updated to ${req.body.status}.`
    };
    res.redirect(`/admin/admissions/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

async function adminDownloadDoc(req, res, next) {
  try {
    const admissionRepo = require('../repositories/admission.repository');
    const doc = await admissionRepo.getDocument(req.params.docId);
    if (!doc || Number(doc.admission_id) !== Number(req.params.id)) {
      return res.status(404).send('Document not found');
    }
    const abs = admissionService.documentAbsolutePath(doc.stored_filename);
    if (!fs.existsSync(abs)) {
      return res.status(404).send('File not found on server');
    }
    res.download(abs, doc.original_filename);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showStart,
  start,
  showDocuments,
  uploadDocument,
  showReview,
  submit,
  showStatus,
  track,
  adminList,
  adminShow,
  adminChangeStatus,
  adminDownloadDoc
};
