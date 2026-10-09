'use strict';

const { query } = require('../config/database');

async function findByEmail(email) {
  const rows = await query(
    `SELECT u.id, u.email, u.password_hash, u.role_id, u.is_active, u.must_change_password,
            u.email_verified_at, u.last_login_at, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = :email
     LIMIT 1`,
    { email: String(email).trim().toLowerCase() }
  );
  return rows[0] || null;
}

async function findById(id) {
  const rows = await query(
    `SELECT u.id, u.email, u.role_id, u.is_active, u.must_change_password,
            u.last_login_at, u.created_at, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function updateLastLogin(userId) {
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = :id`, { id: userId });
}

async function setPasswordResetToken(userId, token, expiresAt) {
  await query(
    `UPDATE users SET password_reset_token = :token, password_reset_expires_at = :expires
     WHERE id = :id`,
    { id: userId, token, expires: expiresAt }
  );
}

async function findByPasswordResetToken(token) {
  const rows = await query(
    `SELECT id, email, password_reset_expires_at
     FROM users
     WHERE password_reset_token = :token
       AND password_reset_expires_at > NOW()
     LIMIT 1`,
    { token }
  );
  return rows[0] || null;
}

async function updatePassword(userId, passwordHash, clearReset = true) {
  if (clearReset) {
    await query(
      `UPDATE users
       SET password_hash = :hash, must_change_password = 0,
           password_reset_token = NULL, password_reset_expires_at = NULL
       WHERE id = :id`,
      { id: userId, hash: passwordHash }
    );
  } else {
    await query(`UPDATE users SET password_hash = :hash WHERE id = :id`, {
      id: userId,
      hash: passwordHash
    });
  }
}

async function countByRole(roleName) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = :role AND u.is_active = 1`,
    { role: roleName }
  );
  return rows[0]?.total || 0;
}

async function listUsers({ page = 1, limit = 20, role = null, search = null, isActive = null } = {}) {
  const offset = (page - 1) * limit;
  let where = '1=1';
  const params = { limit: Number(limit), offset: Number(offset) };

  if (role) {
    where += ' AND r.name = :role';
    params.role = role;
  }
  if (search) {
    where += ' AND u.email LIKE :search';
    params.search = `%${search}%`;
  }
  if (isActive !== null && isActive !== undefined && isActive !== '') {
    where += ' AND u.is_active = :isActive';
    params.isActive = isActive === true || isActive === '1' || isActive === 1 ? 1 : 0;
  }

  const rows = await query(
    `SELECT u.id, u.email, u.is_active, u.must_change_password, u.last_login_at, u.created_at,
            r.name AS role_name, r.id AS role_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function create({ email, passwordHash, roleId, mustChangePassword = true }) {
  const result = await query(
    `INSERT INTO users (email, password_hash, role_id, is_active, must_change_password)
     VALUES (:email, :password_hash, :role_id, 1, :must_change)`,
    {
      email: String(email).trim().toLowerCase(),
      password_hash: passwordHash,
      role_id: roleId,
      must_change: mustChangePassword ? 1 : 0
    }
  );
  return result.insertId;
}

async function update(id, { email, roleId }) {
  const fields = [];
  const params = { id };
  if (email !== undefined) {
    fields.push('email = :email');
    params.email = String(email).trim().toLowerCase();
  }
  if (roleId !== undefined) {
    fields.push('role_id = :role_id');
    params.role_id = roleId;
  }
  if (!fields.length) return;
  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function setActive(id, isActive) {
  await query(`UPDATE users SET is_active = :active WHERE id = :id`, {
    id,
    active: isActive ? 1 : 0
  });
}

async function emailExists(email, excludeId = null) {
  let sql = `SELECT id FROM users WHERE email = :email`;
  const params = { email: String(email).trim().toLowerCase() };
  if (excludeId) {
    sql += ` AND id != :excludeId`;
    params.excludeId = excludeId;
  }
  sql += ` LIMIT 1`;
  const rows = await query(sql, params);
  return rows.length > 0;
}

module.exports = {
  findByEmail,
  findById,
  updateLastLogin,
  setPasswordResetToken,
  findByPasswordResetToken,
  updatePassword,
  countByRole,
  listUsers,
  create,
  update,
  setActive,
  emailExists
};
