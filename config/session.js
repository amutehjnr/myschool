'use strict';

const session = require('express-session');

/**
 * Secure session configuration.
 * In production, prefer a Redis or database session store.
 * Here we use the default MemoryStore only for development.
 */
function createSessionMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';

  const sessionOptions = {
    name: 'psha.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction || process.env.COOKIE_SECURE === 'true',
      sameSite: process.env.COOKIE_SAME_SITE || (isProduction ? 'strict' : 'lax'),
      maxAge: Number(process.env.SESSION_MAX_AGE_MS) || 8 * 60 * 60 * 1000, // 8 hours
      path: '/'
    }
  };

  // TODO: In production replace MemoryStore with connect-redis or express-mysql-session
  // to avoid memory leaks and enable multi-instance deployments.

  return session(sessionOptions);
}

module.exports = {
  createSessionMiddleware
};
