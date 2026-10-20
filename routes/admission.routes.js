'use strict';

const express = require('express');
const router = express.Router();
const { admissionLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { admissionUpload, uploadToCloudinary } = require('../middleware/upload');
const { csrfProtection } = require('../middleware/csrf');
const admissionController = require('../controllers/admission.controller');
const { startApplicationRules } = require('../validators/admission.validator');

// Public admission flow
router.get('/apply', admissionController.showStart);
router.post('/apply', admissionLimiter, startApplicationRules, admissionController.start);

router.get('/application/:id/documents', admissionController.showDocuments);
router.post(
  '/application/:id/documents',
  uploadLimiter,
  admissionUpload.single('document'),
  csrfProtection,
  uploadToCloudinary('admissions'),
  admissionController.uploadDocument
);

router.get('/application/:id/review', admissionController.showReview);
router.post('/application/:id/submit', admissionLimiter, admissionController.submit);

router.get('/status', admissionController.showStatus);
router.post('/status', admissionController.track);

module.exports = router;
