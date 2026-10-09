'use strict';

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');
const { admissionLimiter } = require('../middleware/rateLimiter');

router.get('/', publicController.home);
router.get('/about', publicController.about);
router.get('/admissions', publicController.admissions);
router.get('/gallery', publicController.gallery);
router.get('/contact', publicController.contact);
router.post('/contact', admissionLimiter, publicController.contactRules, publicController.submitContact);

module.exports = router;
