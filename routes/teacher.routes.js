'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const teacherController = require('../controllers/teacher.controller');
const academicController = require('../controllers/academic.controller');
const { assignmentRules, assessmentRules } = require('../validators/academic.validator');
const resultController = require('../controllers/result.controller');
const commsController = require('../controllers/comms.controller');
const attendanceController = require('../controllers/attendance.controller');

router.use(requireAuth, requireRole('teacher', 'administrator'));

router.get('/dashboard', teacherController.portalDashboard);
router.get('/profile', teacherController.portalProfile);
router.get('/classes', teacherController.portalClasses);
router.get('/attendance', teacherController.portalAttendance);
router.get('/timetable', teacherController.portalTimetable);


// Academics
router.get('/assignments', academicController.listAssignments);
router.get('/assignments/new', academicController.showCreateAssignment);
router.post('/assignments', assignmentRules, academicController.createAssignment);

router.get('/assessments', academicController.listAssessments);
router.get('/assessments/new', academicController.showCreateAssessment);
router.post('/assessments', assessmentRules, academicController.createAssessment);
router.get('/assessments/:id/scores', academicController.showScores);
router.post('/assessments/:id/scores', academicController.saveScores);


// Results
router.get('/results', resultController.teacherList);
router.get('/results/generate', resultController.showGenerate);
router.post('/results/generate', resultController.generate);
router.post('/results/submit', resultController.submit);


router.get('/announcements', commsController.portalAnnouncements);
router.get('/events', commsController.portalEvents);


router.get('/attendance', attendanceController.teacherMyAttendance);
router.get('/attendance/mark', attendanceController.teacherShowMarkClass);
router.post('/attendance/mark', attendanceController.teacherMarkClass);

module.exports = router;
