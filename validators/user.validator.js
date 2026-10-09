'use strict';

const { body } = require('express-validator');

const createUserRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Enter a valid email.')
    .normalizeEmail(),
  body('role_id')
    .notEmpty()
    .withMessage('Role is required.')
    .isInt({ min: 1 })
    .withMessage('Invalid role.'),
  body('password')
    .optional({ values: 'falsy' })
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters if provided.')
];

const updateUserRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Enter a valid email.')
    .normalizeEmail(),
  body('role_id')
    .notEmpty()
    .withMessage('Role is required.')
    .isInt({ min: 1 })
    .withMessage('Invalid role.')
];

module.exports = {
  createUserRules,
  updateUserRules
};
