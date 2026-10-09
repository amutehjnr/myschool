'use strict';

const { query } = require('../config/database');

async function listRoles() {
  return query(
    `SELECT r.id, r.name, r.description, r.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
     FROM roles r
     ORDER BY r.name`
  );
}

async function findById(id) {
  const rows = await query(`SELECT * FROM roles WHERE id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function findByName(name) {
  const rows = await query(`SELECT * FROM roles WHERE name = :name LIMIT 1`, { name });
  return rows[0] || null;
}

async function getPermissions(roleId) {
  return query(
    `SELECT p.id, p.code, p.description, p.module
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = :roleId
     ORDER BY p.module, p.code`,
    { roleId }
  );
}

async function listAllPermissions() {
  return query(
    `SELECT id, code, description, module FROM permissions ORDER BY module, code`
  );
}

async function setRolePermissions(roleId, permissionIds) {
  const { getConnection } = require('../config/database');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
    for (const pid of permissionIds) {
      await conn.execute(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        [roleId, pid]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  listRoles,
  findById,
  findByName,
  getPermissions,
  listAllPermissions,
  setRolePermissions
};
