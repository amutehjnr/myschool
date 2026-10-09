'use strict';

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: Number(process.env.DATABASE_PORT) || 3306,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+00:00',
  dateStrings: true,
  namedPlaceholders: true
});

pool.on('connection', () => {
  logger.debug('New MySQL connection established');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected MySQL pool error');
});

/**
 * Execute a parameterized query.
 * Always use this (or transactions) — never concatenate user input.
 */
async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Get a connection for multi-statement transactions.
 */
async function getConnection() {
  return pool.getConnection();
}

/**
 * Health check for the database.
 */
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = {
  pool,
  query,
  getConnection,
  ping
};
