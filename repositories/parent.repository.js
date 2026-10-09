'use strict';

const { query } = require('../config/database');

async function listAll({ search = null, limit = 100 } = {}) {
  let where = '1=1';
  const params = { limit: Number(limit) };
  if (search) {
    where += ` AND (p.first_name LIKE :search OR p.last_name LIKE :search OR u.email LIKE :search)`;
    params.search = `%${search}%`;
  }
  return query(
    `SELECT p.id, p.first_name, p.last_name, p.phone, p.relationship, u.email
     FROM parents p
     JOIN users u ON u.id = p.user_id
     WHERE ${where}
     ORDER BY p.last_name, p.first_name
     LIMIT :limit`,
    params
  );
}

async function isLinked(parentId, studentId) {
  const rows = await query(
    `SELECT 1 FROM parent_students WHERE parent_id = :pid AND student_id = :sid LIMIT 1`,
    { pid: parentId, sid: studentId }
  );
  return rows.length > 0;
}

async function findByUserId(userId) {
  const rows = await query(
    `SELECT p.*, u.email
     FROM parents p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = :userId
     LIMIT 1`,
    { userId }
  );
  return rows[0] || null;
}

async function findById(id) {
  const rows = await query(
    `SELECT p.*, u.email
     FROM parents p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function create({ userId, firstName, lastName, phone = null, relationship = null, address = null }) {
  const result = await query(
    `INSERT INTO parents (user_id, first_name, last_name, phone, relationship, address)
     VALUES (:userId, :firstName, :lastName, :phone, :relationship, :address)`,
    { userId, firstName, lastName, phone, relationship, address }
  );
  return result.insertId;
}

async function linkStudent(parentId, studentId, isPrimary = false) {
  await query(
    `INSERT IGNORE INTO parent_students (parent_id, student_id, is_primary)
     VALUES (:parentId, :studentId, :isPrimary)`,
    { parentId, studentId, isPrimary: isPrimary ? 1 : 0 }
  );
}

async function update(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    first_name: 'firstName',
    last_name: 'lastName',
    phone: 'phone',
    relationship: 'relationship',
    address: 'address',
    occupation: 'occupation'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = data[key];
    }
  }
  if (!fields.length) return;
  await query(`UPDATE parents SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function unlinkStudent(parentId, studentId) {
  await query(
    `DELETE FROM parent_students WHERE parent_id = :parentId AND student_id = :studentId`,
    { parentId, studentId }
  );
}

module.exports = {
  listAll,
  isLinked,
  findByUserId,
  findById,
  create,
  update,
  linkStudent,
  unlinkStudent
};
