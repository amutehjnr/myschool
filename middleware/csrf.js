'use strict';

const csrf = require('csurf');

/**
 * CSRF protection using the double-submit cookie pattern via express-session.
 * Token is available as req.csrfToken() and should be included in all forms
 * as a hidden field named _csrf.
 */
const csrfProtection = csrf({
  cookie: false, // use session store
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) => {
    return (
      (req.body && req.body._csrf) ||
      (req.query && req.query._csrf) ||
      (req.headers['csrf-token']) ||
      (req.headers['xsrf-token']) ||
      (req.headers['x-csrf-token'])
    );
  }
});

/**
 * Make the CSRF token available to all views.
 */
function exposeCsrfToken(req, res, next) {
  res.locals.csrfToken = typeof req.csrfToken === 'function' ? req.csrfToken() : '';
  next();
}

module.exports = {
  csrfProtection,
  exposeCsrfToken
};
