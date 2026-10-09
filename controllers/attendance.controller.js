'use strict';

const attendanceService = require('../services/attendance.service');
const academicService = require('../services/academic.service');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Device API (JSON) ----------

async function apiIngest(req, res, next) {
  try {
    const result = await attendanceService.ingestEvent(req.body, meta(req));
    if (result.error) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

async function apiProcessPending(req, res, next) {
  try {
    const result = await attendanceService.processPendingEvents({
      limit: Number(req.query.limit) || 100
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- Admin ----------

async function adminDevices(req, res, next) {
  try {
    const devices = await attendanceService.listDevices();
    res.render('admin/attendance/devices', {
      title: 'Attendance Devices',
      devices,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowCreateDevice(req, res) {
  res.render('admin/attendance/device-form', {
    title: 'Register Device',
    device: null
  });
}

async function adminCreateDevice(req, res, next) {
  try {
    const result = await attendanceService.createDevice(
      {
        deviceCode: req.body.device_code,
        name: req.body.name,
        location: req.body.location,
        deviceType: req.body.device_type || 'biometric'
      },
      req.session.userId,
      meta(req)
    );
    if (result.error) {
      return res.status(400).render('admin/attendance/device-form', {
        title: 'Register Device',
        device: req.body,
        error: result.error
      });
    }
    req.session.flash = { type: 'success', message: 'Device registered.' };
    res.redirect('/admin/attendance/devices');
  } catch (err) {
    next(err);
  }
}

async function adminEvents(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 30);
    const result = await attendanceService.listEvents({ page, limit });
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('admin/attendance/events', {
      title: 'Biometric Events',
      events: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function adminTeacherAttendance(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 30);
    const result = await attendanceService.listTeacherAttendance({
      page,
      limit,
      fromDate: req.query.from || null,
      toDate: req.query.to || null
    });
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('admin/attendance/teachers', {
      title: 'Teacher Attendance',
      records: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      filters: { from: req.query.from || '', to: req.query.to || '' },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminProcessPending(req, res, next) {
  try {
    const result = await attendanceService.processPendingEvents({ limit: 200 });
    req.session.flash = {
      type: 'success',
      message: `Processed ${result.processed} event(s).`
    };
    res.redirect('/admin/attendance/events');
  } catch (err) {
    next(err);
  }
}

// ---------- Teacher: own attendance + mark class ----------

async function teacherMyAttendance(req, res, next) {
  try {
    const data = await attendanceService.getMyAttendance(req.session.userId);
    if (data.error) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: data.error
      });
    }
    res.render('teacher/attendance', {
      title: 'My Attendance',
      ...data,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function teacherShowMarkClass(req, res, next) {
  try {
    const options = await academicService.getTeacherOptions(req.session.userId);
    const classId = req.query.class_id ? Number(req.query.class_id) : null;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    let sheet = [];
    if (classId) {
      // Scope check
      const owns = options.classes.some((c) => Number(c.id) === classId);
      if (!owns && String(req.session.role).toLowerCase() !== 'administrator') {
        req.session.flash = { type: 'error', message: 'Not assigned to this class.' };
        return res.redirect('/teacher/attendance/mark');
      }
      sheet = await attendanceService.getClassAttendanceSheet(classId, date);
    }
    res.render('teacher/attendance-mark', {
      title: 'Mark Class Attendance',
      ...options,
      classId,
      date,
      sheet,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function teacherMarkClass(req, res, next) {
  try {
    const classId = Number(req.body.class_id);
    const date = req.body.date;
    const studentIds = [].concat(req.body.student_id || []);
    const statuses = [].concat(req.body.status || []);
    const records = studentIds.map((id, i) => ({
      studentId: Number(id),
      status: statuses[i] || 'present'
    }));

    const result = await attendanceService.markStudentAttendance(
      classId,
      date,
      records,
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Attendance saved.'
    };
    res.redirect(`/teacher/attendance/mark?class_id=${classId}&date=${date}`);
  } catch (err) {
    next(err);
  }
}

// ---------- Simulate event form (admin/dev) ----------

async function adminShowSimulate(req, res, next) {
  try {
    const devices = await attendanceService.listDevices();
    res.render('admin/attendance/simulate', {
      title: 'Simulate Biometric Event',
      devices
    });
  } catch (err) {
    next(err);
  }
}

async function adminSimulate(req, res, next) {
  try {
    const result = await attendanceService.ingestEvent(
      {
        device_code: req.body.device_code,
        staff_id: req.body.staff_id,
        event_type: req.body.event_type,
        event_timestamp: req.body.event_timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ')
      },
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || (result.duplicate ? 'Duplicate event ignored.' : 'Event ingested and processed.')
    };
    res.redirect('/admin/attendance/events');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  apiIngest,
  apiProcessPending,
  adminDevices,
  adminShowCreateDevice,
  adminCreateDevice,
  adminEvents,
  adminTeacherAttendance,
  adminProcessPending,
  teacherMyAttendance,
  teacherShowMarkClass,
  teacherMarkClass,
  adminShowSimulate,
  adminSimulate
};
