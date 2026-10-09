'use strict';

const express = require('express');
const router = express.Router();
const { requireDeviceKey } = require('../middleware/deviceAuth');
const { apiLimiter } = require('../middleware/rateLimiter');
const attendanceController = require('../controllers/attendance.controller');

// Device ingestion API — no session/CSRF; uses API key
router.post('/events', apiLimiter, requireDeviceKey, attendanceController.apiIngest);
router.post('/process', apiLimiter, requireDeviceKey, attendanceController.apiProcessPending);

module.exports = router;
