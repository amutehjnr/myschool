'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * Ensure the target database exists (requires CREATE privilege).
 * Then run all SQL migration files in order.
 */
async function runMigrations(logger = console) {
  const host = process.env.DATABASE_HOST || '127.0.0.1';
  const port = Number(process.env.DATABASE_PORT) || 3306;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME || 'psha_portal';

  if (!user) {
    throw new Error('DATABASE_USER is not set in .env');
  }

  // 1) Create database if missing (ignore error if user cannot CREATE)
  let serverConn;
  try {
    serverConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });
    await serverConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    logger.info && logger.info(`Database ready: ${database}`);
  } catch (err) {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(
        `MySQL access denied for user '${user}'. ` +
          'Fix DATABASE_USER / DATABASE_PASSWORD in .env so they match your MySQL account. ' +
          'Example (as MySQL root):\n' +
          `  CREATE USER '${user}'@'localhost' IDENTIFIED BY 'your_password';\n` +
          `  GRANT ALL ON ${database}.* TO '${user}'@'localhost';\n` +
          '  FLUSH PRIVILEGES;'
      );
    }
    // ER_DBACCESS_DENIED_ERROR etc — continue; tables may still work if DB already exists
    if (logger.warn) {
      logger.warn({ err: err.message }, 'Could not ensure database exists; continuing with migrations');
    }
  } finally {
    if (serverConn) await serverConn.end().catch(() => {});
  }

  // 2) Run migration SQL files
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.info && logger.info('No migration files found.');
    return { ran: 0 };
  }

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true
  });

  let ran = 0;
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info && logger.info(`Running migration ${file}...`);
      try {
        await connection.query(sql);
        ran += 1;
        logger.info && logger.info(`  ✓ ${file}`);
      } catch (err) {
        // Ignore "already exists" style noise for IF NOT EXISTS tables
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
          logger.info && logger.info(`  · ${file} (already applied)`);
          continue;
        }
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await connection.end();
  }

  logger.info && logger.info(`Migrations complete (${ran} file(s)).`);
  return { ran };
}

// CLI: node database/migrate.js
if (require.main === module) {
  runMigrations(console)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
