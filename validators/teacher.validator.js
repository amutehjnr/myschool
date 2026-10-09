'use strict';

const { body } = require('express-validator');

const createTeacherRules = [
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('staff_id').trim().notEmpty().withMessage('Staff ID is required.'),
  body('first_name').trim().notEmpty().withMessage('First name is required.'),
  body('last_name').trim().notEmpty().withMessage('Last name is required.'),
  body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters if provided.')
];

const updateTeacherRules = [
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('staff_id').trim().notEmpty().withMessage('Staff ID is required.'),
  body('first_name').trim().notEmpty().withMessage('First name is required.'),
  body('last_name').trim().notEmpty().withMessage('Last name is required.')
];

module.exports = {
  createTeacherRules,
  updateTeacherRules
};
