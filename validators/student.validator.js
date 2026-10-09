'use strict';

const { body } = require('express-validator');

const createStudentRules = [
  body('student_id').trim().notEmpty().withMessage('Student ID is required.'),
  body('first_name').trim().notEmpty().withMessage('First name is required.'),
  body('last_name').trim().notEmpty().withMessage('Last name is required.'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters if provided.')
];

const updateStudentRules = [
  body('student_id').trim().notEmpty().withMessage('Student ID is required.'),
  body('first_name').trim().notEmpty().withMessage('First name is required.'),
  body('last_name').trim().notEmpty().withMessage('Last name is required.')
];

module.exports = {
  createStudentRules,
  updateStudentRules
};
