'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const dashboardService = require('../services/dashboard.service');
const userController = require('../controllers/user.controller');
const roleController = require('../controllers/role.controller');
const { createUserRules, updateUserRules } = require('../validators/user.validator');
const teacherController = require('../controllers/teacher.controller');
const { createTeacherRules, updateTeacherRules } = require('../validators/teacher.validator');
const studentController = require('../controllers/student.controller');
const { createStudentRules, updateStudentRules } = require('../validators/student.validator');
const admissionController = require('../controllers/admission.controller');
const resultController = require('../controllers/result.controller');
const feeController = require('../controllers/fee.controller');
const commsController = require('../controllers/comms.controller');
const attendanceController = require('../controllers/attendance.controller');
const auditController = require('../controllers/audit.controller');
const { passportUpload, uploadToCloudinary } = require('../middleware/upload');
const logger = require('../utils/logger');

router.use(requireAuth, requireAdmin);

// Dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    let stats = { students: 0, teachers: 0, parents: 0, admissions: 0 };
    try {
      stats = await dashboardService.getAdminDashboardStats();
    } catch (err) {
      logger.warn({ err: err.message }, 'Dashboard stats unavailable');
    }
    res.render('admin/dashboard', { title: 'Administrator Dashboard', stats });
  } catch (err) {
    next(err);
  }
});

// Users
router.get('/users', userController.list);
router.get('/users/new', userController.showCreate);
router.post('/users', createUserRules, userController.create);
router.get('/users/:id/edit', userController.showEdit);
router.post('/users/:id', updateUserRules, userController.update);
router.post('/users/:id/activate', userController.activate);
router.post('/users/:id/deactivate', userController.deactivate);
router.post('/users/:id/reset-password', userController.resetPassword);

// Roles & permissions
router.get('/roles', roleController.list);
router.get('/roles/:id/permissions', roleController.showEdit);
router.post('/roles/:id/permissions', roleController.updatePermissions);


// Teachers
router.get('/teachers', teacherController.adminList);
router.get('/teachers/new', teacherController.adminShowCreate);
router.post('/teachers', passportUpload.single('passport'), uploadToCloudinary('passports/teachers'), createTeacherRules, teacherController.adminCreate);
router.get('/teachers/:id', teacherController.adminShow);
router.get('/teachers/:id/edit', teacherController.adminShowEdit);
router.post('/teachers/:id', passportUpload.single('passport'), uploadToCloudinary('passports/teachers'), updateTeacherRules, teacherController.adminUpdate);
router.post('/teachers/:id/activate', teacherController.adminActivate);
router.post('/teachers/:id/deactivate', teacherController.adminDeactivate);


// Students
router.get('/students', studentController.adminList);
router.get('/students/new', studentController.adminShowCreate);
router.post('/students', passportUpload.single('passport'), uploadToCloudinary('passports/students'), createStudentRules, studentController.adminCreate);
router.get('/students/:id', studentController.adminShow);
router.get('/students/:id/edit', studentController.adminShowEdit);
router.post('/students/:id', passportUpload.single('passport'), uploadToCloudinary('passports/students'), updateStudentRules, studentController.adminUpdate);
router.post('/students/:id/archive', studentController.adminArchive);
router.post('/students/:id/link-parent', studentController.adminLinkParent);
router.post('/students/:id/unlink-parent', studentController.adminUnlinkParent);


// Admissions
router.get('/admissions', admissionController.adminList);
router.get('/admissions/:id', admissionController.adminShow);
router.post('/admissions/:id/status', admissionController.adminChangeStatus);
router.get('/admissions/:id/documents/:docId', admissionController.adminDownloadDoc);


// Results
router.get('/results', resultController.adminList);
router.post('/results/approve', resultController.adminApprove);
router.post('/results/publish', resultController.adminPublish);


// Fees
router.get('/fees', feeController.adminListFees);
router.get('/fees/new', feeController.adminShowCreateFee);
router.post('/fees', feeController.adminCreateFee);
router.get('/fees/bills', feeController.adminListBills);
router.get('/fees/assign', feeController.adminShowAssign);
router.post('/fees/assign', feeController.adminAssign);
router.get('/fees/bills/:id/pay', feeController.adminShowRecordPayment);
router.post('/fees/bills/:id/pay', feeController.adminRecordPayment);
router.get('/fees/payments', feeController.adminListPayments);
router.get('/fees/payments/:id', feeController.adminShowPayment);


// Communications
router.get('/announcements', commsController.adminListAnnouncements);
router.get('/announcements/new', commsController.adminShowCreateAnnouncement);
router.post('/announcements', commsController.adminCreateAnnouncement);
router.post('/announcements/:id/publish', commsController.adminPublishAnnouncement);
router.get('/events', commsController.adminListEvents);
router.get('/events/new', commsController.adminShowCreateEvent);
router.post('/events', commsController.adminCreateEvent);


// Attendance
router.get('/attendance/devices', attendanceController.adminDevices);
router.get('/attendance/devices/new', attendanceController.adminShowCreateDevice);
router.post('/attendance/devices', attendanceController.adminCreateDevice);
router.get('/attendance/events', attendanceController.adminEvents);
router.post('/attendance/events/process', attendanceController.adminProcessPending);
router.get('/attendance/teachers', attendanceController.adminTeacherAttendance);
router.get('/attendance/simulate', attendanceController.adminShowSimulate);
router.post('/attendance/simulate', attendanceController.adminSimulate);


// Audit & security
router.get('/audit', auditController.list);
router.get('/audit/:id', auditController.show);
router.get('/security', auditController.security);

module.exports = router;
