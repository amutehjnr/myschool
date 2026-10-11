'use strict';

const { query } = require('../config/database');

async function countActive() {
  const rows = await query(`SELECT COUNT(*) AS total FROM students WHERE status = 'active'`);
  return rows[0]?.total || 0;
}

async function findById(id) {
  const rows = await query(
    `SELECT s.*, c.name AS class_name, h.name AS house_name, u.email,
            sess.name AS session_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN houses h ON h.id = s.house_id
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN academic_sessions sess ON sess.id = s.academic_session_id
     WHERE s.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByUserId(userId) {
  const rows = await query(
    `SELECT s.*, c.name AS class_name, h.name AS house_name, u.email
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN houses h ON h.id = s.house_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.user_id = :userId
     LIMIT 1`,
    { userId }
  );
  return rows[0] || null;
}

async function findByStudentId(studentId) {
  const rows = await query(
    `SELECT s.*, c.name AS class_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.student_id = :studentId
     LIMIT 1`,
    { studentId }
  );
  return rows[0] || null;
}

async function list({ page = 1, limit = 20, search = null, classId = null, status = 'active' } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (status) {
    where += ' AND s.status = :status';
    params.status = status;
  }
  if (classId) {
    where += ' AND s.class_id = :classId';
    params.classId = classId;
  }
  if (search) {
    where += ` AND (s.first_name LIKE :search OR s.last_name LIKE :search OR s.student_id LIKE :search)`;
    params.search = `%${search}%`;
  }

  const rows = await query(
    `SELECT s.id, s.student_id, s.first_name, s.last_name, s.gender, s.status,
            s.date_of_birth, c.name AS class_name, h.name AS house_name, u.email
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN houses h ON h.id = s.house_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE ${where}
     ORDER BY s.last_name, s.first_name
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM students s WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function studentIdExists(studentId, excludeId = null) {
  let sql = `SELECT id FROM students WHERE student_id = :studentId`;
  const params = { studentId };
  if (excludeId) {
    sql += ` AND id != :excludeId`;
    params.excludeId = excludeId;
  }
  sql += ` LIMIT 1`;
  const rows = await query(sql, params);
  return rows.length > 0;
}

async function create({
  userId = null,
  studentId,
  firstName,
  lastName,
  middleName = null,
  dateOfBirth = null,
  gender = null,
  photoPath = null,
  photoPublicId = null,
  classId = null,
  houseId = null,
  academicSessionId = null,
  admissionDate = null,
  status = 'active'
}) {
  const result = await query(
    `INSERT INTO students
       (user_id, student_id, first_name, last_name, middle_name, date_of_birth, gender, photo_path, photo_public_id,
        class_id, house_id, academic_session_id, admission_date, status)
     VALUES
       (:userId, :studentId, :firstName, :lastName, :middleName, :dateOfBirth, :gender, :photoPath, :photoPublicId,
        :classId, :houseId, :academicSessionId, :admissionDate, :status)`,
    {
      userId,
      studentId,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
      gender,
      photoPath,
      photoPublicId,
      classId,
      houseId,
      academicSessionId,
      admissionDate,
      status
    }
  );
  return result.insertId;
}

async function update(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    first_name: 'firstName',
    last_name: 'lastName',
    middle_name: 'middleName',
    date_of_birth: 'dateOfBirth',
    gender: 'gender',
    class_id: 'classId',
    house_id: 'houseId',
    academic_session_id: 'academicSessionId',
    admission_date: 'admissionDate',
    status: 'status',
    student_id: 'studentId',
    photo_path: 'photoPath',
    photo_public_id: 'photoPublicId'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = data[key];
    }
  }
  if (!fields.length) return;
  await query(`UPDATE students SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function setStatus(id, status) {
  await query(`UPDATE students SET status = :status WHERE id = :id`, { id, status });
}

async function isChildOfParent(studentId, parentUserId) {
  const rows = await query(
    `SELECT 1
     FROM parent_students ps
     JOIN parents p ON p.id = ps.parent_id
     WHERE ps.student_id = :studentId AND p.user_id = :parentUserId
     LIMIT 1`,
    { studentId, parentUserId }
  );
  return rows.length > 0;
}

async function getChildrenOfParent(parentUserId) {
  return query(
    `SELECT s.id, s.student_id, s.first_name, s.last_name, s.status,
            c.name AS class_name, h.name AS house_name
     FROM parent_students ps
     JOIN parents p ON p.id = ps.parent_id
     JOIN students s ON s.id = ps.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN houses h ON h.id = s.house_id
     WHERE p.user_id = :parentUserId
     ORDER BY s.first_name`,
    { parentUserId }
  );
}

async function getParents(studentId) {
  return query(
    `SELECT p.id, p.first_name, p.last_name, p.phone, p.relationship, u.email, ps.is_primary
     FROM parent_students ps
     JOIN parents p ON p.id = ps.parent_id
     JOIN users u ON u.id = p.user_id
     WHERE ps.student_id = :studentId`,
    { studentId }
  );
}

async function getAttendance(studentId, { limit = 30 } = {}) {
  return query(
    `SELECT id, attendance_date, status, notes
     FROM student_attendance
     WHERE student_id = :sid
     ORDER BY attendance_date DESC
     LIMIT :limit`,
    { sid: studentId, limit: Number(limit) }
  );
}

module.exports = {
  countActive,
  findById,
  findByUserId,
  findByStudentId,
  list,
  studentIdExists,
  create,
  update,
  setStatus,
  isChildOfParent,
  getChildrenOfParent,
  getParents,
  getAttendance
};
