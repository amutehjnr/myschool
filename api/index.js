'use strict';

/**
 * Serverless entry (Vercel, Netlify Functions-style adapters, etc.)
 * Does NOT run long-lived migrate/listen — only exports the Express app.
 * Set DATABASE_* and SESSION_SECRET in the platform environment.
 * Run migrations once manually against the remote DB before first use.
 */
require('dotenv').config();

const app = require('../app');

module.exports = app;
