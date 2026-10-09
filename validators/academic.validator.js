'use strict';

const { body } = require('express-validator');

const assignmentRules = [
  body('title').trim().notEmpty().withMessage('Title is required.'),
  body('class_id').notEmpty().withMessage('Class is required.').isInt({ min: 1 }),
  body('subject_id').notEmpty().withMessage('Subject is required.').isInt({ min: 1 })
];

const assessmentRules = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('assessment_type')
    .notEmpty()
    .withMessage('Type is required.')
    .isIn(['ca', 'test', 'exam', 'assignment'])
    .withMessage('Invalid assessment type.'),
  body('class_id').notEmpty().withMessage('Class is required.').isInt({ min: 1 }),
  body('subject_id').notEmpty().withMessage('Subject is required.').isInt({ min: 1 })
];

module.exports = {
  assignmentRules,
  assessmentRules
};
