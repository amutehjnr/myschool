'use strict';

require('dotenv').config();

const logger = require('./utils/logger');

// Fail fast on missing critical secrets
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  logger.error('SESSION_SECRET must be set (min 16 characters). Refusing to start.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  if (!process.env.DB_PASSWORD) {
    logger.warn('DB_PASSWORD is empty in production — ensure this is intentional.');
  }
  if (!process.env.BIOMETRIC_API_KEY && !process.env.DEVICE_API_KEY) {
    logger.warn('BIOMETRIC_API_KEY not set — device API will reject requests in production.');
  }
}

const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  logger.info(`PSHA School Portal listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});
