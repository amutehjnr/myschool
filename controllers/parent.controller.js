'use strict';

const parentService = require('../services/parent.service');
const studentService = require('../services/student.service');
const { validationResult } = require('express-validator');
const { formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

/**
 * Resolve selected child from query or session; enforce object-level auth.
 */
function resolveChildId(req) {
  if (req.query.child) {
    req.session.selectedChildId = req.query.child;
    return req.query.child;
  }
  return req.session.selectedChildId || null;
}

async function dashboard(req, res, next) {
  try {
    const childId = resolveChildId(req);
    const data = await parentService.getPortalData(req.session.userId, childId);
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    if (data.selectedChild) {
      req.session.selectedChildId = data.selectedChild.id;
    }
    res.render('parent/dashboard', {
      title: 'Parent Dashboard',
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function children(req, res, next) {
  try {
    const data = await parentService.getPortalData(req.session.userId, resolveChildId(req));
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    res.render('parent/children', {
      title: 'My Children',
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function attendance(req, res, next) {
  try {
    const data = await parentService.getPortalData(req.session.userId, resolveChildId(req));
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    res.render('parent/attendance', {
      title: 'Attendance',
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function childProfile(req, res, next) {
  try {
    // Object-level: never trust student id without parent link check
    const student = await parentService.getAuthorizedChild(
      req.session.userId,
      req.params.studentId
    );
    if (!student) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'You do not have access to this student record.'
      });
    }
    req.session.selectedChildId = student.id;
    const data = await parentService.getPortalData(req.session.userId, student.id);
    res.render('parent/child-profile', {
      title: `${student.first_name} ${student.last_name}`,
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function profile(req, res, next) {
  try {
    const parent = await parentService.getParentByUserId(req.session.userId);
    if (!parent) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    const children = await parentService.getChildren(req.session.userId);
    res.render('parent/profile', {
      title: 'My Profile',
      parent,
      children,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}


async function showEditProfile(req, res, next) {
  try {
    const parent = await parentService.getParentByUserId(req.session.userId);
    if (!parent) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    res.render('parent/profile-edit', {
      title: 'Edit Profile',
      parent
    });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const errors = validationResult(req);
    const parent = await parentService.getParentByUserId(req.session.userId);
    if (!parent) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }

    if (!errors.isEmpty()) {
      return res.status(400).render('parent/profile-edit', {
        title: 'Edit Profile',
        parent: { ...parent, ...req.body },
        error: errors.array()[0].msg
      });
    }

    const result = await parentService.updateProfile(
      req.session.userId,
      {
        firstName: req.body.first_name,
        lastName: req.body.last_name,
        email: req.body.email,
        phone: req.body.phone,
        relationship: req.body.relationship,
        address: req.body.address,
        occupation: req.body.occupation
      },
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('parent/profile-edit', {
        title: 'Edit Profile',
        parent: { ...parent, ...req.body, first_name: req.body.first_name, last_name: req.body.last_name },
        error: result.error
      });
    }

    // Keep session email in sync if changed
    if (req.body.email) {
      req.session.email = String(req.body.email).trim().toLowerCase();
    }

    req.session.flash = { type: 'success', message: 'Profile updated successfully.' };
    res.redirect('/parent/profile');
  } catch (err) {
    next(err);
  }
}


async function showLinkChild(req, res, next) {
  try {
    const parent = await parentService.getParentByUserId(req.session.userId);
    if (!parent) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No parent profile is linked to your account.'
      });
    }
    res.render('parent/link-child', {
      title: 'Link a child',
      form: {}
    });
  } catch (err) {
    next(err);
  }
}

async function requestLinkChild(req, res, next) {
  try {
    const result = await studentService.parentSelfLink(
      req.session.userId,
      {
        studentCode: req.body.student_id,
        dateOfBirth: req.body.date_of_birth
      },
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('parent/link-child', {
        title: 'Link a child',
        form: req.body,
        error: result.error
      });
    }

    req.session.selectedChildId = result.student.id;
    req.session.flash = {
      type: 'success',
      message: `${result.student.first_name} ${result.student.last_name} has been linked to your account.`
    };
    res.redirect('/parent/children');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showLinkChild,
  requestLinkChild,
  showEditProfile,
  updateProfile,
  dashboard,
  children,
  attendance,
  childProfile,
  profile
};
