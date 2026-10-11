'use strict';

const { query, getConnection } = require('../config/database');

async function countActive() {
  const rows = await query(`SELECT COUNT(*) AS total FROM teachers WHERE is_active = 1`);
  return rows[0]?.total || 0;
}

async function findById(id) {
  const rows = await query(
    `SELECT t.*, d.name AS department_name, u.email, u.is_active AS user_active
     FROM teachers t
     LEFT JOIN departments d ON d.id = t.department_id
     JOIN users u ON u.id = t.user_id
     WHERE t.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function findByUserId(userId) {
  const rows = await query(
    `SELECT t.*, d.name AS department_name, u.email
     FROM teachers t
     LEFT JOIN departments d ON d.id = t.department_id
     JOIN users u ON u.id = t.user_id
     WHERE t.user_id = :userId
     LIMIT 1`,
    { userId }
  );
  return rows[0] || null;
}

async function findByStaffId(staffId) {
  const rows = await query(
    `SELECT t.*, u.email
     FROM teachers t
     JOIN users u ON u.id = t.user_id
     WHERE t.staff_id = :staffId
     LIMIT 1`,
    { staffId }
  );
  return rows[0] || null;
}

async function list({ page = 1, limit = 20, search = null, departmentId = null, isActive = null } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (search) {
    where += ` AND (t.first_name LIKE :search OR t.last_name LIKE :search OR t.staff_id LIKE :search OR u.email LIKE :search)`;
    params.search = `%${search}%`;
  }
  if (departmentId) {
    where += ' AND t.department_id = :departmentId';
    params.departmentId = departmentId;
  }
  if (isActive !== null && isActive !== undefined && isActive !== '') {
    where += ' AND t.is_active = :isActive';
    params.isActive = isActive === true || isActive === '1' || isActive === 1 ? 1 : 0;
  }

  const rows = await query(
    `SELECT t.id, t.staff_id, t.first_name, t.last_name, t.phone, t.is_active,
            t.qualification, t.photo_path, d.name AS department_name, u.email
     FROM teachers t
     LEFT JOIN departments d ON d.id = t.department_id
     JOIN users u ON u.id = t.user_id
     WHERE ${where}
     ORDER BY t.last_name, t.first_name
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM teachers t
     JOIN users u ON u.id = t.user_id
     WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function getSubjects(teacherId) {
  return query(
    `SELECT s.id, s.name, s.code
     FROM teacher_subjects ts
     JOIN subjects s ON s.id = ts.subject_id
     WHERE ts.teacher_id = :tid
     ORDER BY s.name`,
    { tid: teacherId }
  );
}

async function getClasses(teacherId) {
  return query(
    `SELECT c.id, c.name, c.level, tc.is_class_teacher
     FROM teacher_classes tc
     JOIN classes c ON c.id = tc.class_id
     WHERE tc.teacher_id = :tid
     ORDER BY c.name`,
    { tid: teacherId }
  );
}

async function staffIdExists(staffId, excludeId = null) {
  let sql = `SELECT id FROM teachers WHERE staff_id = :staffId`;
  const params = { staffId };
  if (excludeId) {
    sql += ` AND id != :excludeId`;
    params.excludeId = excludeId;
  }
  sql += ` LIMIT 1`;
  const rows = await query(sql, params);
  return rows.length > 0;
}

/**
 * Create teacher profile linked to an existing user.
 */
async function create({
  userId,
  staffId,
  firstName,
  lastName,
  middleName = null,
  departmentId = null,
  qualification = null,
  phone = null,
  photoPath = null,
  photoPublicId = null,
  employmentDate = null,
  employmentType = null
}) {
  const result = await query(
    `INSERT INTO teachers
       (user_id, staff_id, first_name, last_name, middle_name, department_id,
        qualification, phone, photo_path, photo_public_id, employment_date, employment_type, is_active)
     VALUES
       (:userId, :staffId, :firstName, :lastName, :middleName, :departmentId,
        :qualification, :phone, :photoPath, :photoPublicId, :employmentDate, :employmentType, 1)`,
    {
      userId,
      staffId,
      firstName,
      lastName,
      middleName,
      departmentId,
      qualification,
      phone,
      employmentDate,
      employmentType
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
    department_id: 'departmentId',
    qualification: 'qualification',
    phone: 'phone',
    employment_date: 'employmentDate',
    employment_type: 'employmentType',
    staff_id: 'staffId',
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
  await query(`UPDATE teachers SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function setActive(id, isActive) {
  await query(`UPDATE teachers SET is_active = :active WHERE id = :id`, {
    id,
    active: isActive ? 1 : 0
  });
}

async function setSubjects(teacherId, subjectIds) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM teacher_subjects WHERE teacher_id = ?`, [teacherId]);
    for (const sid of subjectIds) {
      await conn.execute(
        `INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)`,
        [teacherId, sid]
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

async function setClasses(teacherId, classIds, classTeacherId = null) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM teacher_classes WHERE teacher_id = ?`, [teacherId]);
    for (const cid of classIds) {
      const isClassTeacher = classTeacherId && Number(classTeacherId) === Number(cid) ? 1 : 0;
      await conn.execute(
        `INSERT INTO teacher_classes (teacher_id, class_id, is_class_teacher) VALUES (?, ?, ?)`,
        [teacherId, cid, isClassTeacher]
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

async function getAttendance(teacherId, { from = null, to = null, limit = 60 } = {}) {
  let where = 'teacher_id = :tid';
  const params = { tid: teacherId, limit: Number(limit) };
  if (from) {
    where += ' AND attendance_date >= :from';
    params.from = from;
  }
  if (to) {
    where += ' AND attendance_date <= :to';
    params.to = to;
  }
  return query(
    `SELECT id, attendance_date, check_in_time, check_out_time, total_minutes, status, source, notes
     FROM teacher_attendance
     WHERE ${where}
     ORDER BY attendance_date DESC
     LIMIT :limit`,
    params
  );
}

async function getLeaveRecords(teacherId) {
  return query(
    `SELECT id, leave_type, start_date, end_date, reason, status, created_at
     FROM leave_records
     WHERE teacher_id = :tid
     ORDER BY start_date DESC
     LIMIT 50`,
    { tid: teacherId }
  );
}

async function getTimetable(teacherId) {
  return query(
    `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room,
            c.name AS class_name, s.name AS subject_name
     FROM timetables tt
     JOIN classes c ON c.id = tt.class_id
     JOIN subjects s ON s.id = tt.subject_id
     WHERE tt.teacher_id = :tid
     ORDER BY tt.day_of_week, tt.start_time`,
    { tid: teacherId }
  );
}

module.exports = {
  countActive,
  findById,
  findByUserId,
  findByStaffId,
  list,
  getSubjects,
  getClasses,
  staffIdExists,
  create,
  update,
  setActive,
  setSubjects,
  setClasses,
  getAttendance,
  getLeaveRecords,
  getTimetable
};
