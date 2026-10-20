'use strict';

require('dotenv').config();

const logger = require('./utils/logger');

// Fail fast on missing critical secrets (long-running process only)
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  logger.error('SESSION_SECRET must be set (min 16 characters). Refusing to start.');
  process.exit(1);
}

if (!process.env.DATABASE_USER || !process.env.DATABASE_NAME) {
  logger.error('DATABASE_USER and DATABASE_NAME must be set in .env');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  if (!process.env.BIOMETRIC_API_KEY && !process.env.DEVICE_API_KEY) {
    logger.warn('BIOMETRIC_API_KEY not set — device API will reject requests in production.');
  }
}

const { runMigrations } = require('./database/migrate');

async function boot() {
  // Auto-migrate when RUN_MIGRATIONS_ON_BOOT is not "false" (default: true for VPS/containers)
  const shouldMigrate = process.env.RUN_MIGRATIONS_ON_BOOT !== 'false';
  if (shouldMigrate) {
    try {
      logger.info('Ensuring database schema (auto-migrate)...');
      await runMigrations(logger);
    } catch (err) {
      logger.error({ err: err.message || err }, 'Auto-migrate failed');
      console.error('\n=== DATABASE SETUP REQUIRED ===');
      console.error(err.message || err);
      console.error('\nFix DATABASE_* in environment, then restart.\n');
      process.exit(1);
    }
  }

  // Auto-seed when empty (dev / first deploy only)
  if (process.env.AUTO_SEED === 'true' || (process.env.NODE_ENV !== 'production' && process.env.AUTO_SEED !== 'false')) {
    try {
      const { query } = require('./config/database');
      const rows = await query('SELECT COUNT(*) AS c FROM users');
      if (Number(rows[0]?.c || 0) === 0) {
        logger.info('No users found — running seed...');
        const { runSeed } = require('./database/seed');
        await runSeed();
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Auto-seed skipped');
    }
  }

  const app = require('./app');
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  const server = app.listen(PORT, HOST, () => {
    logger.info(`PSHA School Portal listening on http://${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
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
}

boot();
