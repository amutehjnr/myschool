'use strict';

const express = require('express');
const router = express.Router();
const { loginLimiter, passwordResetLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { requireGuest, requireAuth } = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const {
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
  changePasswordWithCurrentRules,
  registerRules
} = require('../validators/auth.validator');

router.get('/register', requireGuest, authController.showRegister);
router.post('/register', requireGuest, registerLimiter, registerRules, authController.postRegister);

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', requireGuest, loginLimiter, loginRules, authController.postLogin);

router.get('/logout', requireAuth, authController.logout);
router.post('/logout', requireAuth, authController.logout);

router.get('/forgot-password', requireGuest, authController.showForgotPassword);
router.post(
  '/forgot-password',
  requireGuest,
  passwordResetLimiter,
  forgotPasswordRules,
  authController.postForgotPassword
);

router.get('/reset-password', requireGuest, authController.showResetPassword);
router.post(
  '/reset-password',
  requireGuest,
  passwordResetLimiter,
  resetPasswordRules,
  authController.postResetPassword
);

router.get('/change-password', requireAuth, authController.showChangePassword);
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const rules = req.session.mustChangePassword
      ? changePasswordRules
      : changePasswordWithCurrentRules;
    for (const rule of rules) {
      await rule.run(req);
    }
    return authController.postChangePassword(req, res, next);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
