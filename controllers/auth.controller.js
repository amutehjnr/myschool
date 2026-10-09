'use strict';

const authService = require('../services/auth.service');
const { validationResult } = require('express-validator');

function getMeta(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent')
  };
}

function redirectByRole(role) {
  switch (String(role || '').toLowerCase()) {
    case 'administrator':
      return '/admin/dashboard';
    case 'teacher':
      return '/teacher/dashboard';
    case 'student':
      return '/student/dashboard';
    case 'parent':
      return '/parent/dashboard';
    default:
      return '/dashboard';
  }
}

async function showLogin(req, res) {
  res.render('auth/login', {
    title: 'Sign In',
    email: ''
  });
}

async function postLogin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth/login', {
      title: 'Sign In',
      email: req.body.email || '',
      error: errors.array()[0].msg
    });
  }

  const { email, password } = req.body;
  const result = await authService.login(email, password, getMeta(req));

  if (result.error) {
    return res.status(401).render('auth/login', {
      title: 'Sign In',
      email: email || '',
      error: result.error
    });
  }

  // Session fixation protection: regenerate session after successful login
  const user = result.user;
  return new Promise((resolve) => {
    req.session.regenerate((err) => {
      if (err) {
        req.session.flash = { type: 'error', message: 'Could not start session. Please try again.' };
        res.redirect('/auth/login');
        return resolve();
      }

      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.role = user.role;
      req.session.mustChangePassword = user.mustChangePassword;

      if (user.mustChangePassword) {
        res.redirect('/auth/change-password');
        return resolve();
      }

      const returnTo = req.session.returnTo;
      delete req.session.returnTo;
      res.redirect(returnTo || redirectByRole(user.role));
      resolve();
    });
  });
}

async function logout(req, res) {
  const userId = req.session?.userId;
  await authService.logout(userId, getMeta(req));

  req.session.destroy(() => {
    res.clearCookie('psha.sid');
    res.redirect('/auth/login');
  });
}

async function showForgotPassword(req, res) {
  res.render('auth/forgot-password', {
    title: 'Forgot Password'
  });
}

async function postForgotPassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth/forgot-password', {
      title: 'Forgot Password',
      error: errors.array()[0].msg
    });
  }

  await authService.requestPasswordReset(req.body.email, getMeta(req));

  // Always show the same message (no email enumeration)
  req.session.flash = {
    type: 'success',
    message: 'If an account with that email exists, a password reset link has been sent.'
  };
  res.redirect('/auth/forgot-password');
}

async function showResetPassword(req, res) {
  const token = req.query.token || '';
  if (!token) {
    req.session.flash = { type: 'error', message: 'Invalid or missing reset token.' };
    return res.redirect('/auth/forgot-password');
  }
  res.render('auth/reset-password', {
    title: 'Reset Password',
    token
  });
}

async function postResetPassword(req, res) {
  const errors = validationResult(req);
  const token = req.body.token || '';

  if (!errors.isEmpty()) {
    return res.status(400).render('auth/reset-password', {
      title: 'Reset Password',
      token,
      error: errors.array()[0].msg
    });
  }

  if (req.body.password !== req.body.password_confirm) {
    return res.status(400).render('auth/reset-password', {
      title: 'Reset Password',
      token,
      error: 'Passwords do not match.'
    });
  }

  const result = await authService.resetPassword(token, req.body.password, getMeta(req));

  if (result.error) {
    return res.status(400).render('auth/reset-password', {
      title: 'Reset Password',
      token,
      error: result.error
    });
  }

  req.session.flash = {
    type: 'success',
    message: 'Your password has been reset. You can now sign in.'
  };
  res.redirect('/auth/login');
}

async function showChangePassword(req, res) {
  if (!req.session?.userId) {
    return res.redirect('/auth/login');
  }
  res.render('auth/change-password', {
    title: 'Change Password',
    forced: Boolean(req.session.mustChangePassword)
  });
}

async function postChangePassword(req, res) {
  if (!req.session?.userId) {
    return res.redirect('/auth/login');
  }

  const errors = validationResult(req);
  const forced = Boolean(req.session.mustChangePassword);

  if (!errors.isEmpty()) {
    return res.status(400).render('auth/change-password', {
      title: 'Change Password',
      forced,
      error: errors.array()[0].msg
    });
  }

  if (req.body.password !== req.body.password_confirm) {
    return res.status(400).render('auth/change-password', {
      title: 'Change Password',
      forced,
      error: 'Passwords do not match.'
    });
  }

  let result;
  if (forced) {
    result = await authService.forceChangePassword(
      req.session.userId,
      req.body.password,
      getMeta(req)
    );
  } else {
    result = await authService.changePassword(
      req.session.userId,
      req.body.current_password,
      req.body.password,
      getMeta(req)
    );
  }

  if (result.error) {
    return res.status(400).render('auth/change-password', {
      title: 'Change Password',
      forced,
      error: result.error
    });
  }

  req.session.mustChangePassword = false;
  req.session.flash = { type: 'success', message: 'Password updated successfully.' };
  res.redirect(redirectByRole(req.session.role));
}


async function showRegister(req, res) {
  res.render('auth/register', {
    title: 'Create Account',
    form: {}
  });
}

async function postRegister(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('auth/register', {
      title: 'Create Account',
      form: req.body,
      error: errors.array()[0].msg
    });
  }

  const result = await authService.registerParent(
    {
      firstName: req.body.first_name,
      lastName: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone,
      password: req.body.password,
      relationship: req.body.relationship
    },
    getMeta(req)
  );

  if (result.error) {
    return res.status(400).render('auth/register', {
      title: 'Create Account',
      form: req.body,
      error: result.error
    });
  }

  req.session.flash = {
    type: 'success',
    message: 'Account created successfully. You can now sign in. After login, contact the school to link your children to your account.'
  };
  res.redirect('/auth/login');
}

module.exports = {
  showRegister,
  postRegister,
  showLogin,
  postLogin,
  logout,
  showForgotPassword,
  postForgotPassword,
  showResetPassword,
  postResetPassword,
  showChangePassword,
  postChangePassword
};
