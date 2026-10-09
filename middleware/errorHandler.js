'use strict';

const logger = require('../utils/logger');

/**
 * 404 Not Found handler.
 */
function notFoundHandler(req, res, next) {
  res.status(404);
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ error: 'Resource not found' });
  }
  return res.render('errors/404', {
    title: 'Page Not Found',
    path: req.originalUrl
  });
}

/**
 * Centralized error handler.
 * Never leaks stack traces or internal details in production.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error(
    {
      err: {
        message: err.message,
        stack: isProduction ? undefined : err.stack,
        code: err.code
      },
      method: req.method,
      url: req.originalUrl,
      userId: req.session?.userId
    },
    'Request error'
  );

  // CSRF token errors
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ error: 'Invalid or missing CSRF token. Please refresh and try again.' });
    }
    return res.render('errors/403', {
      title: 'Security Error',
      message: 'Invalid form submission. Please go back, refresh the page, and try again.'
    });
  }

  // Validation errors (express-validator style)
  if (err.name === 'ValidationError' || Array.isArray(err.errors)) {
    res.status(400);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ error: 'Validation failed', details: err.errors || err.message });
    }
    req.session.flash = { type: 'error', message: err.message || 'Please check the form and try again.' };
    return res.redirect('back');
  }

  // Generic response
  res.status(status);
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({
      error: isProduction ? 'An unexpected error occurred' : err.message
    });
  }

  return res.render('errors/500', {
    title: 'Server Error',
    message: isProduction
      ? 'Something went wrong. Please try again later.'
      : err.message
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
