'use strict';

const studentService = require('../services/student.service');
const { validationResult } = require('express-validator');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Admin ----------

async function adminList(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, req.query.limit || 20);
    const result = await studentService.listStudents({
      page,
      limit,
      search: req.query.search || null,
      classId: req.query.class_id || null,
      status: req.query.status || 'active'
    });
    const classes = await studentService.listClasses();
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/students/list', {
      title: 'Students',
      students: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages,
      classes,
      filters: {
        search: req.query.search || '',
        class_id: req.query.class_id || '',
        status: req.query.status || 'active'
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowCreate(req, res, next) {
  try {
    const [classes, houses, sessions] = await Promise.all([
      studentService.listClasses(),
      studentService.listHouses(),
      studentService.listSessions()
    ]);
    res.render('admin/students/form', {
      title: 'Add Student',
      student: null,
      classes,
      houses,
      sessions,
      mode: 'create'
    });
  } catch (err) {
    next(err);
  }
}

async function adminCreate(req, res, next) {
  try {
    const errors = validationResult(req);
    const [classes, houses, sessions] = await Promise.all([
      studentService.listClasses(),
      studentService.listHouses(),
      studentService.listSessions()
    ]);

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/students/form', {
        title: 'Add Student',
        student: req.body,
        classes,
        houses,
        sessions,
        mode: 'create',
        error: errors.array()[0].msg
      });
    }

    const result = await studentService.createStudent(
      {
        email: req.body.email,
        studentId: req.body.student_id,
        firstName: req.body.first_name,
        lastName: req.body.last_name,
        middleName: req.body.middle_name,
        dateOfBirth: req.body.date_of_birth || null,
        gender: req.body.gender || null,
        classId: req.body.class_id ? Number(req.body.class_id) : null,
        houseId: req.body.house_id ? Number(req.body.house_id) : null,
        academicSessionId: req.body.academic_session_id
          ? Number(req.body.academic_session_id)
          : null,
        admissionDate: req.body.admission_date || null,
        password: req.body.password || null,
        createLogin: req.body.create_login === '1' || req.body.create_login === 'on'
      },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/students/form', {
        title: 'Add Student',
        student: req.body,
        classes,
        houses,
        sessions,
        mode: 'create',
        error: result.error
      });
    }

    let msg = 'Student created successfully.';
    if (result.temporaryPassword) {
      msg += ` Temporary password: ${result.temporaryPassword}`;
    }
    req.session.flash = { type: 'success', message: msg };
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
}

async function adminShow(req, res, next) {
  try {
    const student = await studentService.getStudent(req.params.id);
    if (!student) {
      req.session.flash = { type: 'error', message: 'Student not found.' };
      return res.redirect('/admin/students');
    }
    const allParents = await studentService.listParentsForSelect();
    res.render('admin/students/profile', {
      title: `${student.first_name} ${student.last_name}`,
      student,
      allParents,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowEdit(req, res, next) {
  try {
    const student = await studentService.getStudent(req.params.id);
    if (!student) {
      req.session.flash = { type: 'error', message: 'Student not found.' };
      return res.redirect('/admin/students');
    }
    const [classes, houses, sessions] = await Promise.all([
      studentService.listClasses(),
      studentService.listHouses(),
      studentService.listSessions()
    ]);
    res.render('admin/students/form', {
      title: 'Edit Student',
      student,
      classes,
      houses,
      sessions,
      mode: 'edit'
    });
  } catch (err) {
    next(err);
  }
}

async function adminUpdate(req, res, next) {
  try {
    const errors = validationResult(req);
    const student = await studentService.getStudent(req.params.id);
    if (!student) {
      req.session.flash = { type: 'error', message: 'Student not found.' };
      return res.redirect('/admin/students');
    }
    const [classes, houses, sessions] = await Promise.all([
      studentService.listClasses(),
      studentService.listHouses(),
      studentService.listSessions()
    ]);

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/students/form', {
        title: 'Edit Student',
        student: { ...student, ...req.body },
        classes,
        houses,
        sessions,
        mode: 'edit',
        error: errors.array()[0].msg
      });
    }

    const result = await studentService.updateStudent(
      req.params.id,
      {
        email: req.body.email,
        studentId: req.body.student_id,
        firstName: req.body.first_name,
        lastName: req.body.last_name,
        middleName: req.body.middle_name,
        dateOfBirth: req.body.date_of_birth || null,
        gender: req.body.gender || null,
        classId: req.body.class_id ? Number(req.body.class_id) : null,
        houseId: req.body.house_id ? Number(req.body.house_id) : null,
        academicSessionId: req.body.academic_session_id
          ? Number(req.body.academic_session_id)
          : null,
        admissionDate: req.body.admission_date || null,
        status: req.body.status
      },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/students/form', {
        title: 'Edit Student',
        student: { ...student, ...req.body },
        classes,
        houses,
        sessions,
        mode: 'edit',
        error: result.error
      });
    }

    req.session.flash = { type: 'success', message: 'Student updated.' };
    res.redirect(`/admin/students/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

async function adminArchive(req, res, next) {
  try {
    const result = await studentService.archiveStudent(req.params.id, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Student archived (withdrawn).'
    };
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
}

// ---------- Student portal ----------

async function portalDashboard(req, res, next) {
  try {
    const data = await studentService.getStudentPortalData(req.session.userId);
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No student profile is linked to your account.'
      });
    }
    res.render('student/dashboard', {
      title: 'Student Dashboard',
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function portalProfile(req, res, next) {
  try {
    const student = await studentService.getStudentByUserId(req.session.userId);
    if (!student) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No student profile is linked to your account.'
      });
    }
    const full = await studentService.getStudent(student.id);
    res.render('student/profile', {
      title: 'My Profile',
      student: full,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function portalAttendance(req, res, next) {
  try {
    const student = await studentService.getStudentByUserId(req.session.userId);
    if (!student) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No student profile is linked to your account.'
      });
    }
    const attendance = await require('../repositories/student.repository').getAttendance(
      student.id,
      { limit: 90 }
    );
    res.render('student/attendance', {
      title: 'My Attendance',
      student,
      attendance,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}


async function adminLinkParent(req, res, next) {
  try {
    const result = await studentService.linkParentToStudent(
      req.params.id,
      Number(req.body.parent_id),
      req.body.is_primary === '1' || req.body.is_primary === 'on',
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Parent linked to student.'
    };
    res.redirect(`/admin/students/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

async function adminUnlinkParent(req, res, next) {
  try {
    const result = await studentService.unlinkParentFromStudent(
      req.params.id,
      Number(req.body.parent_id),
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Parent unlinked from student.'
    };
    res.redirect(`/admin/students/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLinkParent,
  adminUnlinkParent,
  adminList,
  adminShowCreate,
  adminCreate,
  adminShow,
  adminShowEdit,
  adminUpdate,
  adminArchive,
  portalDashboard,
  portalProfile,
  portalAttendance
};
