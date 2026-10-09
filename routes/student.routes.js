'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const studentController = require('../controllers/student.controller');
const resultController = require('../controllers/result.controller');
const feeController = require('../controllers/fee.controller');
const commsController = require('../controllers/comms.controller');

router.use(requireAuth, requireRole('student', 'administrator'));

router.get('/dashboard', studentController.portalDashboard);
router.get('/profile', studentController.portalProfile);
router.get('/attendance', studentController.portalAttendance);
router.get('/results', resultController.studentReportCard);
router.get('/fees', feeController.studentFees);


router.get('/announcements', commsController.portalAnnouncements);
router.get('/events', commsController.portalEvents);

module.exports = router;
