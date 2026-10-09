'use strict';

const { query } = require('../config/database');

// ---------- Devices ----------

async function listDevices() {
  return query(
    `SELECT id, device_code, name, location, device_type, is_active, last_seen_at, created_at
     FROM attendance_devices ORDER BY name`
  );
}

async function findDeviceByCode(deviceCode) {
  const rows = await query(
    `SELECT * FROM attendance_devices WHERE device_code = :code LIMIT 1`,
    { code: deviceCode }
  );
  return rows[0] || null;
}

async function findDeviceById(id) {
  const rows = await query(`SELECT * FROM attendance_devices WHERE id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function createDevice(data) {
  const result = await query(
    `INSERT INTO attendance_devices (device_code, name, location, device_type, is_active)
     VALUES (:code, :name, :location, :type, 1)`,
    {
      code: data.deviceCode,
      name: data.name,
      location: data.location || null,
      type: data.deviceType || 'biometric'
    }
  );
  return result.insertId;
}

async function touchDevice(id) {
  await query(`UPDATE attendance_devices SET last_seen_at = NOW() WHERE id = :id`, { id });
}

// ---------- Events ----------

async function insertEvent(data) {
  try {
    const result = await query(
      `INSERT INTO attendance_events
         (device_id, staff_id, event_type, event_timestamp, raw_payload, processed, idempotency_key)
       VALUES
         (:deviceId, :staffId, :eventType, :eventTimestamp, :rawPayload, 0, :idempotencyKey)`,
      {
        deviceId: data.deviceId || null,
        staffId: data.staffId,
        eventType: data.eventType,
        eventTimestamp: data.eventTimestamp,
        rawPayload: data.rawPayload ? JSON.stringify(data.rawPayload) : null,
        idempotencyKey: data.idempotencyKey
      }
    );
    return { id: result.insertId, duplicate: false };
  } catch (err) {
    // Unique constraint on idempotency_key
    if (err.code === 'ER_DUP_ENTRY') {
      return { id: null, duplicate: true };
    }
    throw err;
  }
}

async function listUnprocessedEvents({ limit = 100 } = {}) {
  return query(
    `SELECT * FROM attendance_events
     WHERE processed = 0
     ORDER BY event_timestamp ASC
     LIMIT :limit`,
    { limit: Number(limit) }
  );
}

async function markEventProcessed(id) {
  await query(`UPDATE attendance_events SET processed = 1 WHERE id = :id`, { id });
}

async function listEvents({ page = 1, limit = 30, staffId = null } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (staffId) {
    where += ' AND e.staff_id = :staffId';
    params.staffId = staffId;
  }
  const rows = await query(
    `SELECT e.*, d.name AS device_name, d.device_code
     FROM attendance_events e
     LEFT JOIN attendance_devices d ON d.id = e.device_id
     WHERE ${where}
     ORDER BY e.event_timestamp DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM attendance_events e WHERE ${where}`,
    params
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

// ---------- Teacher attendance ----------

async function findTeacherByStaffId(staffId) {
  const rows = await query(
    `SELECT id, staff_id, first_name, last_name, user_id
     FROM teachers WHERE staff_id = :staffId LIMIT 1`,
    { staffId }
  );
  return rows[0] || null;
}

async function upsertTeacherAttendance(data) {
  await query(
    `INSERT INTO teacher_attendance
       (teacher_id, staff_id, attendance_date, check_in_time, check_out_time,
        total_minutes, status, source, notes)
     VALUES
       (:teacherId, :staffId, :date, :checkIn, :checkOut, :minutes, :status, :source, :notes)
     ON DUPLICATE KEY UPDATE
       check_in_time = COALESCE(VALUES(check_in_time), check_in_time),
       check_out_time = COALESCE(VALUES(check_out_time), check_out_time),
       total_minutes = VALUES(total_minutes),
       status = VALUES(status),
       notes = COALESCE(VALUES(notes), notes)`,
    {
      teacherId: data.teacherId,
      staffId: data.staffId,
      date: data.attendanceDate,
      checkIn: data.checkInTime || null,
      checkOut: data.checkOutTime || null,
      minutes: data.totalMinutes || null,
      status: data.status || 'present',
      source: data.source || 'biometric',
      notes: data.notes || null
    }
  );
}

async function getTeacherAttendanceDay(teacherId, date) {
  const rows = await query(
    `SELECT * FROM teacher_attendance
     WHERE teacher_id = :teacherId AND attendance_date = :date
     LIMIT 1`,
    { teacherId, date }
  );
  return rows[0] || null;
}

async function listTeacherAttendance({
  teacherId = null,
  fromDate = null,
  toDate = null,
  page = 1,
  limit = 30
} = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (teacherId) {
    where += ' AND ta.teacher_id = :teacherId';
    params.teacherId = teacherId;
  }
  if (fromDate) {
    where += ' AND ta.attendance_date >= :fromDate';
    params.fromDate = fromDate;
  }
  if (toDate) {
    where += ' AND ta.attendance_date <= :toDate';
    params.toDate = toDate;
  }
  const rows = await query(
    `SELECT ta.*, t.first_name, t.last_name, t.staff_id AS teacher_staff_id
     FROM teacher_attendance ta
     JOIN teachers t ON t.id = ta.teacher_id
     WHERE ${where}
     ORDER BY ta.attendance_date DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM teacher_attendance ta WHERE ${where}`,
    params
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

// ---------- Student attendance ----------

async function upsertStudentAttendance(data) {
  await query(
    `INSERT INTO student_attendance
       (student_id, class_id, attendance_date, status, recorded_by, notes)
     VALUES
       (:studentId, :classId, :date, :status, :recordedBy, :notes)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       recorded_by = VALUES(recorded_by),
       notes = VALUES(notes)`,
    {
      studentId: data.studentId,
      classId: data.classId || null,
      date: data.attendanceDate,
      status: data.status,
      recordedBy: data.recordedBy || null,
      notes: data.notes || null
    }
  );
}

async function listStudentAttendance({
  classId = null,
  studentId = null,
  date = null,
  page = 1,
  limit = 50
} = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (classId) {
    where += ' AND sa.class_id = :classId';
    params.classId = classId;
  }
  if (studentId) {
    where += ' AND sa.student_id = :studentId';
    params.studentId = studentId;
  }
  if (date) {
    where += ' AND sa.attendance_date = :date';
    params.date = date;
  }
  const rows = await query(
    `SELECT sa.*, s.student_id AS student_code, s.first_name, s.last_name, c.name AS class_name
     FROM student_attendance sa
     JOIN students s ON s.id = sa.student_id
     LEFT JOIN classes c ON c.id = sa.class_id
     WHERE ${where}
     ORDER BY sa.attendance_date DESC, s.last_name
     LIMIT :limit OFFSET :offset`,
    params
  );
  return rows;
}

async function getSetting(key, defaultValue = null) {
  const rows = await query(
    `SELECT setting_value FROM attendance_settings WHERE setting_key = :key LIMIT 1`,
    { key }
  );
  return rows[0] ? rows[0].setting_value : defaultValue;
}

async function isHoliday(date) {
  const rows = await query(
    `SELECT id FROM holidays WHERE holiday_date = :date LIMIT 1`,
    { date }
  );
  return rows.length > 0;
}

module.exports = {
  listDevices,
  findDeviceByCode,
  findDeviceById,
  createDevice,
  touchDevice,
  insertEvent,
  listUnprocessedEvents,
  markEventProcessed,
  listEvents,
  findTeacherByStaffId,
  upsertTeacherAttendance,
  getTeacherAttendanceDay,
  listTeacherAttendance,
  upsertStudentAttendance,
  listStudentAttendance,
  getSetting,
  isHoliday
};
