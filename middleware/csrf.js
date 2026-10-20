'use strict';

const csrf = require('csurf');

/**
 * Cookie-backed CSRF (works across Vercel instances).
 *
 * Multipart POSTs skip global CSRF (body not parsed yet). Those routes must
 * run multer first, then csrfProtection so _csrf is available in req.body.
 */
const isProd = process.env.NODE_ENV === 'production';

const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    path: '/',
    httpOnly: true,
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    secure: isProd || process.env.COOKIE_SECURE === 'true'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) =>
    (req.body && req.body._csrf) ||
    (req.query && req.query._csrf) ||
    req.headers['csrf-token'] ||
    req.headers['xsrf-token'] ||
    req.headers['x-csrf-token']
});

/** Skip CSRF validation for multipart; validate later after multer. */
function csrfUnlessMultipart(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    return next();
  }
  return csrfProtection(req, res, next);
}

function exposeCsrfToken(req, res, next) {
  try {
    if (typeof req.csrfToken === 'function') {
      res.locals.csrfToken = req.csrfToken();
    } else {
      // Multipart POST path skipped global CSRF — still try to expose if present
      res.locals.csrfToken = (req.query && req.query._csrf) || '';
    }
  } catch {
    res.locals.csrfToken = '';
  }
  next();
}

module.exports = {
  csrfProtection,
  csrfUnlessMultipart,
  exposeCsrfToken
};
