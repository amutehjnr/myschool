'use strict';

const { query } = require('../config/database');

async function create({
  userId = null,
  action,
  module = null,
  recordId = null,
  status = 'success',
  ipAddress = null,
  userAgent = null,
  metadata = null
}) {
  await query(
    `INSERT INTO audit_logs
       (user_id, action, module, record_id, status, ip_address, user_agent, metadata)
     VALUES
       (:user_id, :action, :module, :record_id, :status, :ip, :ua, :metadata)`,
    {
      user_id: userId,
      action,
      module,
      record_id: recordId != null ? String(recordId) : null,
      status,
      ip: ipAddress,
      ua: userAgent ? String(userAgent).slice(0, 512) : null,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  );
}

async function list({
  page = 1,
  limit = 50,
  action = null,
  module = null,
  userId = null,
  status = null,
  from = null,
  to = null,
  search = null
} = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (action) {
    where += ' AND a.action = :action';
    params.action = action;
  }
  if (module) {
    where += ' AND a.module = :module';
    params.module = module;
  }
  if (userId) {
    where += ' AND a.user_id = :userId';
    params.userId = userId;
  }
  if (status) {
    where += ' AND a.status = :status';
    params.status = status;
  }
  if (from) {
    where += ' AND a.created_at >= :from';
    params.from = from;
  }
  if (to) {
    where += ' AND a.created_at <= :to';
    params.to = to;
  }
  if (search) {
    where += ' AND (u.email LIKE :search OR a.action LIKE :search OR a.ip_address LIKE :search)';
    params.search = `%${search}%`;
  }

  const rows = await query(
    `SELECT a.*, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function findById(id) {
  const rows = await query(
    `SELECT a.*, u.email AS user_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function listActions() {
  const rows = await query(`SELECT DISTINCT action FROM audit_logs ORDER BY action`);
  return rows.map((r) => r.action);
}

async function listModules() {
  const rows = await query(
    `SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL ORDER BY module`
  );
  return rows.map((r) => r.module);
}

async function recentSummary({ days = 7 } = {}) {
  const rows = await query(
    `SELECT action, COUNT(*) AS cnt
     FROM audit_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
     GROUP BY action
     ORDER BY cnt DESC
     LIMIT 15`,
    { days: Number(days) }
  );
  return rows;
}

module.exports = {
  create,
  list,
  findById,
  listActions,
  listModules,
  recentSummary
};
