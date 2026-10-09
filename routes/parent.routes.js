'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const parentController = require('../controllers/parent.controller');
const { body } = require('express-validator');
const resultController = require('../controllers/result.controller');
const feeController = require('../controllers/fee.controller');
const commsController = require('../controllers/comms.controller');

router.use(requireAuth, requireRole('parent', 'administrator'));

router.get('/dashboard', parentController.dashboard);
router.get('/children', parentController.children);
router.get('/children/link', parentController.showLinkChild);
router.post('/children/link', parentController.requestLinkChild);
router.get('/children/:studentId', parentController.childProfile);
router.get('/attendance', parentController.attendance);
router.get('/profile', parentController.profile);
router.get('/profile/edit', parentController.showEditProfile);
router.post(
  '/profile',
  [
    body('first_name').trim().notEmpty().withMessage('First name is required.'),
    body('last_name').trim().notEmpty().withMessage('Last name is required.'),
    body('email').trim().isEmail().withMessage('Valid email is required.').normalizeEmail()
  ],
  parentController.updateProfile
);
router.get('/results', resultController.parentReportCard);
router.get('/fees', feeController.parentFees);


router.get('/announcements', commsController.portalAnnouncements);
router.get('/events', commsController.portalEvents);

module.exports = router;
