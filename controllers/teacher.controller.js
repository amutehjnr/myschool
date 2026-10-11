'use strict';

const teacherService = require('../services/teacher.service');
const { validationResult } = require('express-validator');
const { paginate, formatDate, formatTime, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Admin: Teacher management ----------

async function adminList(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, req.query.limit || 20);
    const result = await teacherService.listTeachers({
      page,
      limit,
      search: req.query.search || null,
      departmentId: req.query.department_id || null,
      isActive:
        req.query.status === 'active' ? 1 : req.query.status === 'inactive' ? 0 : null
    });
    const departments = await teacherService.listDepartments();
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/teachers/list', {
      title: 'Teachers',
      teachers: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages,
      departments,
      filters: {
        search: req.query.search || '',
        department_id: req.query.department_id || '',
        status: req.query.status || ''
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
    const [departments, subjects, classes] = await Promise.all([
      teacherService.listDepartments(),
      teacherService.listSubjects(),
      teacherService.listClasses()
    ]);
    res.render('admin/teachers/form', {
      title: 'Add Teacher',
      teacher: null,
      departments,
      subjects,
      classes,
      selectedSubjects: [],
      selectedClasses: [],
      mode: 'create'
    });
  } catch (err) {
    next(err);
  }
}

async function adminCreate(req, res, next) {
  try {
    const errors = validationResult(req);
    const [departments, subjects, classes] = await Promise.all([
      teacherService.listDepartments(),
      teacherService.listSubjects(),
      teacherService.listClasses()
    ]);

    const selectedSubjects = [].concat(req.body.subject_ids || []).map(Number);
    const selectedClasses = [].concat(req.body.class_ids || []).map(Number);

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/teachers/form', {
        title: 'Add Teacher',
        teacher: req.body,
        departments,
        subjects,
        classes,
        selectedSubjects,
        selectedClasses,
        mode: 'create',
        error: errors.array()[0].msg
      });
    }

    const photoPath = req.file && (req.file.cloudinaryUrl || (req.file.cloudinary && req.file.cloudinary.url));
    const photoPublicId = req.file && (req.file.cloudinaryPublicId || (req.file.cloudinary && req.file.cloudinary.publicId));
    const result = await teacherService.createTeacher(
      {
        email: req.body.email,
        staffId: req.body.staff_id,
        firstName: req.body.first_name,
        lastName: req.body.last_name,
        middleName: req.body.middle_name,
        departmentId: req.body.department_id ? Number(req.body.department_id) : null,
        qualification: req.body.qualification,
        phone: req.body.phone,
        photoPath: photoPath || null,
        photoPublicId: photoPublicId || null,
        employmentDate: req.body.employment_date || null,
        employmentType: req.body.employment_type,
        subjectIds: selectedSubjects,
        classIds: selectedClasses,
        password: req.body.password || null
      },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/teachers/form', {
        title: 'Add Teacher',
        teacher: req.body,
        departments,
        subjects,
        classes,
        selectedSubjects,
        selectedClasses,
        mode: 'create',
        error: result.error
      });
    }

    let msg = 'Teacher created successfully.';
    if (result.temporaryPassword) {
      msg += ` Temporary password: ${result.temporaryPassword}`;
    }
    req.session.flash = { type: 'success', message: msg };
    res.redirect('/admin/teachers');
  } catch (err) {
    next(err);
  }
}

async function adminShow(req, res, next) {
  try {
    const teacher = await teacherService.getTeacher(req.params.id);
    if (!teacher) {
      req.session.flash = { type: 'error', message: 'Teacher not found.' };
      return res.redirect('/admin/teachers');
    }
    res.render('admin/teachers/profile', {
      title: `${teacher.first_name} ${teacher.last_name}`,
      teacher,
      formatDate,
      formatTime,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowEdit(req, res, next) {
  try {
    const teacher = await teacherService.getTeacher(req.params.id);
    if (!teacher) {
      req.session.flash = { type: 'error', message: 'Teacher not found.' };
      return res.redirect('/admin/teachers');
    }
    const [departments, subjects, classes] = await Promise.all([
      teacherService.listDepartments(),
      teacherService.listSubjects(),
      teacherService.listClasses()
    ]);
    res.render('admin/teachers/form', {
      title: 'Edit Teacher',
      teacher,
      departments,
      subjects,
      classes,
      selectedSubjects: (teacher.subjects || []).map((s) => s.id),
      selectedClasses: (teacher.classes || []).map((c) => c.id),
      mode: 'edit'
    });
  } catch (err) {
    next(err);
  }
}

async function adminUpdate(req, res, next) {
  try {
    const errors = validationResult(req);
    const teacher = await teacherService.getTeacher(req.params.id);
    if (!teacher) {
      req.session.flash = { type: 'error', message: 'Teacher not found.' };
      return res.redirect('/admin/teachers');
    }

    const [departments, subjects, classes] = await Promise.all([
      teacherService.listDepartments(),
      teacherService.listSubjects(),
      teacherService.listClasses()
    ]);
    const selectedSubjects = [].concat(req.body.subject_ids || []).map(Number);
    const selectedClasses = [].concat(req.body.class_ids || []).map(Number);

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/teachers/form', {
        title: 'Edit Teacher',
        teacher: { ...teacher, ...req.body },
        departments,
        subjects,
        classes,
        selectedSubjects,
        selectedClasses,
        mode: 'edit',
        error: errors.array()[0].msg
      });
    }

    const photoPath = req.file && (req.file.cloudinaryUrl || (req.file.cloudinary && req.file.cloudinary.url));
    const photoPublicId = req.file && (req.file.cloudinaryPublicId || (req.file.cloudinary && req.file.cloudinary.publicId));
    const result = await teacherService.updateTeacher(
      req.params.id,
      {
        email: req.body.email,
        staffId: req.body.staff_id,
        firstName: req.body.first_name,
        lastName: req.body.last_name,
        middleName: req.body.middle_name,
        departmentId: req.body.department_id ? Number(req.body.department_id) : null,
        qualification: req.body.qualification,
        phone: req.body.phone,
        photoPath: photoPath || null,
        photoPublicId: photoPublicId || null,
        employmentDate: req.body.employment_date || null,
        employmentType: req.body.employment_type,
        subjectIds: selectedSubjects,
        classIds: selectedClasses
      },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/teachers/form', {
        title: 'Edit Teacher',
        teacher: { ...teacher, ...req.body },
        departments,
        subjects,
        classes,
        selectedSubjects,
        selectedClasses,
        mode: 'edit',
        error: result.error
      });
    }

    req.session.flash = { type: 'success', message: 'Teacher updated.' };
    res.redirect(`/admin/teachers/${req.params.id}`);
  } catch (err) {
    next(err);
  }
}

async function adminActivate(req, res, next) {
  try {
    const result = await teacherService.activateTeacher(req.params.id, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Teacher activated.'
    };
    res.redirect('/admin/teachers');
  } catch (err) {
    next(err);
  }
}

async function adminDeactivate(req, res, next) {
  try {
    const result = await teacherService.deactivateTeacher(
      req.params.id,
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Teacher deactivated.'
    };
    res.redirect('/admin/teachers');
  } catch (err) {
    next(err);
  }
}

// ---------- Teacher portal ----------

async function portalDashboard(req, res, next) {
  try {
    const data = await teacherService.getTeacherPortalData(req.session.userId);
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No teacher profile is linked to your account.'
      });
    }
    res.render('teacher/dashboard', {
      title: 'Teacher Dashboard',
      ...data,
      formatDate,
      formatTime,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function portalProfile(req, res, next) {
  try {
    const teacher = await teacherService.getTeacherByUserId(req.session.userId);
    if (!teacher) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No teacher profile is linked to your account.'
      });
    }
    const full = await teacherService.getTeacher(teacher.id);
    res.render('teacher/profile', {
      title: 'My Profile',
      teacher: full,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function portalClasses(req, res, next) {
  try {
    const data = await teacherService.getTeacherPortalData(req.session.userId);
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No teacher profile is linked to your account.'
      });
    }
    res.render('teacher/classes', {
      title: 'My Classes',
      ...data
    });
  } catch (err) {
    next(err);
  }
}

async function portalAttendance(req, res, next) {
  try {
    const teacher = await teacherService.getTeacherByUserId(req.session.userId);
    if (!teacher) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No teacher profile is linked to your account.'
      });
    }
    const attendance = await require('../repositories/teacher.repository').getAttendance(
      teacher.id,
      { limit: 90 }
    );
    res.render('teacher/attendance', {
      title: 'My Attendance',
      teacher,
      attendance,
      formatDate,
      formatTime,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function portalTimetable(req, res, next) {
  try {
    const data = await teacherService.getTeacherPortalData(req.session.userId);
    if (!data) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No teacher profile is linked to your account.'
      });
    }
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    res.render('teacher/timetable', {
      title: 'My Timetable',
      ...data,
      dayNames
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminList,
  adminShowCreate,
  adminCreate,
  adminShow,
  adminShowEdit,
  adminUpdate,
  adminActivate,
  adminDeactivate,
  portalDashboard,
  portalProfile,
  portalClasses,
  portalAttendance,
  portalTimetable
};
