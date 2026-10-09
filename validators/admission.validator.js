'use strict';

const { body } = require('express-validator');

const startApplicationRules = [
  body('first_name').trim().notEmpty().withMessage('Applicant first name is required.'),
  body('last_name').trim().notEmpty().withMessage('Applicant last name is required.'),
  body('parent_email')
    .optional({ values: 'falsy' })
    .isEmail()
    .withMessage('Enter a valid parent email.')
    .normalizeEmail()
];

module.exports = {
  startApplicationRules
};
