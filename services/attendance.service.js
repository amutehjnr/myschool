'use strict';

const crypto = require('crypto');
const attendanceRepo = require('../repositories/attendance.repository');
const teacherRepo = require('../repositories/teacher.repository');
const academicRepo = require('../repositories/academic.repository');
const auditRepo = require('../repositories/audit.repository');

/**
 * Ingest a biometric event from a device.
 * Idempotent via idempotency_key.
 */
async function ingestEvent(payload, meta = {}) {
  const {
    device_code: deviceCode,
    staff_id: staffId,
    event_type: eventType,
    event_timestamp: eventTimestamp,
    idempotency_key: clientKey
  } = payload;

  if (!staffId || !eventType || !eventTimestamp) {
    return { error: 'staff_id, event_type and event_timestamp are required.' };
  }
  if (!['check_in', 'check_out'].includes(eventType)) {
    return { error: 'event_type must be check_in or check_out.' };
  }

  let device = null;
  if (deviceCode) {
    device = await attendanceRepo.findDeviceByCode(deviceCode);
    if (!device || !device.is_active) {
      return { error: 'Unknown or inactive device.' };
    }
    await attendanceRepo.touchDevice(device.id);
  }

  const idempotencyKey =
    clientKey ||
    crypto
      .createHash('sha256')
      .update(`${deviceCode || ''}|${staffId}|${eventType}|${eventTimestamp}`)
      .digest('hex');

  const inserted = await attendanceRepo.insertEvent({
    deviceId: device ? device.id : null,
    staffId: String(staffId),
    eventType,
    eventTimestamp,
    rawPayload: payload,
    idempotencyKey
  });

  if (inserted.duplicate) {
    return { success: true, duplicate: true, message: 'Event already recorded.' };
  }

  // Process immediately (can also be batched)
  await processEventById(inserted.id);

  return { success: true, eventId: inserted.id, duplicate: false };
}

/**
 * Process a single unprocessed event into teacher_attendance.
 */
async function processEventById(eventId) {
  const events = await attendanceRepo.listUnprocessedEvents({ limit: 500 });
  const event = events.find((e) => Number(e.id) === Number(eventId));
  if (!event) {
    // May already be processed
    return;
  }
  await processEvent(event);
}

async function processEvent(event) {
  const teacher = await attendanceRepo.findTeacherByStaffId(event.staff_id);
  if (!teacher) {
    // Unknown staff — mark processed to avoid infinite retry; log via notes later
    await attendanceRepo.markEventProcessed(event.id);
    return { skipped: true, reason: 'unknown_staff' };
  }

  const ts = new Date(event.event_timestamp);
  const dateStr = ts.toISOString().slice(0, 10);

  // Skip holidays
  if (await attendanceRepo.isHoliday(dateStr)) {
    await attendanceRepo.markEventProcessed(event.id);
    return { skipped: true, reason: 'holiday' };
  }

  const existing = await attendanceRepo.getTeacherAttendanceDay(teacher.id, dateStr);

  const lateAfter = await attendanceRepo.getSetting('late_after', '08:00');
  const earlyBefore = await attendanceRepo.getSetting('early_departure_before', '15:00');

  let checkIn = existing ? existing.check_in_time : null;
  let checkOut = existing ? existing.check_out_time : null;

  if (event.event_type === 'check_in') {
    // First check-in of the day wins (earliest)
    if (!checkIn || new Date(event.event_timestamp) < new Date(checkIn)) {
      checkIn = event.event_timestamp;
    }
  } else if (event.event_type === 'check_out') {
    // Latest check-out wins
    if (!checkOut || new Date(event.event_timestamp) > new Date(checkOut)) {
      checkOut = event.event_timestamp;
    }
  }

  let totalMinutes = null;
  if (checkIn && checkOut) {
    totalMinutes = Math.max(
      0,
      Math.round((new Date(checkOut) - new Date(checkIn)) / 60000)
    );
  }

  let status = 'present';
  if (checkIn) {
    const checkInTime = new Date(checkIn);
    const [lh, lm] = String(lateAfter).split(':').map(Number);
    const lateThreshold = new Date(checkInTime);
    lateThreshold.setHours(lh || 8, lm || 0, 0, 0);
    if (checkInTime > lateThreshold) {
      status = 'late';
    }
  }
  if (checkOut && status !== 'absent') {
    const checkOutTime = new Date(checkOut);
    const [eh, em] = String(earlyBefore).split(':').map(Number);
    const earlyThreshold = new Date(checkOutTime);
    earlyThreshold.setHours(eh || 15, em || 0, 0, 0);
    if (checkOutTime < earlyThreshold) {
      status = status === 'late' ? 'late' : 'early_departure';
    }
  }
  if (!checkIn && !checkOut) {
    status = 'absent';
  }

  await attendanceRepo.upsertTeacherAttendance({
    teacherId: teacher.id,
    staffId: teacher.staff_id,
    attendanceDate: dateStr,
    checkInTime: checkIn,
    checkOutTime: checkOut,
    totalMinutes,
    status,
    source: 'biometric'
  });

  await attendanceRepo.markEventProcessed(event.id);
  return { processed: true, teacherId: teacher.id, status };
}

/**
 * Batch process unprocessed events.
 */
async function processPendingEvents({ limit = 100 } = {}) {
  const events = await attendanceRepo.listUnprocessedEvents({ limit });
  let processed = 0;
  for (const event of events) {
    await processEvent(event);
    processed += 1;
  }
  return { processed };
}

async function listDevices() {
  return attendanceRepo.listDevices();
}

async function createDevice(data, userId, meta = {}) {
  if (!data.deviceCode || !data.name) {
    return { error: 'Device code and name are required.' };
  }
  const existing = await attendanceRepo.findDeviceByCode(data.deviceCode);
  if (existing) return { error: 'Device code already exists.' };

  const id = await attendanceRepo.createDevice(data);
  await auditRepo.create({
    userId,
    action: 'DEVICE_REGISTERED',
    module: 'attendance',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { deviceCode: data.deviceCode }
  });
  return { success: true, id };
}

async function listEvents(filters) {
  return attendanceRepo.listEvents(filters);
}

async function listTeacherAttendance(filters) {
  return attendanceRepo.listTeacherAttendance(filters);
}

async function getMyAttendance(userId) {
  const teacher = await teacherRepo.findByUserId(userId);
  if (!teacher) return { error: 'No teacher profile.' };
  const result = await attendanceRepo.listTeacherAttendance({
    teacherId: teacher.id,
    limit: 60
  });
  return { teacher, records: result.rows };
}

/**
 * Manual student attendance for a class on a date.
 */
async function markStudentAttendance(classId, date, records, recordedBy, meta = {}) {
  const students = await academicRepo.getStudentsInClass(classId);
  const studentIds = new Set(students.map((s) => s.id));

  for (const row of records) {
    if (!studentIds.has(Number(row.studentId))) continue;
    await attendanceRepo.upsertStudentAttendance({
      studentId: row.studentId,
      classId,
      attendanceDate: date,
      status: row.status || 'present',
      recordedBy,
      notes: row.notes || null
    });
  }

  await auditRepo.create({
    userId: recordedBy,
    action: 'ATTENDANCE_RECORDED',
    module: 'attendance',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { classId, date, count: records.length }
  });

  return { success: true };
}

async function getClassAttendanceSheet(classId, date) {
  const students = await academicRepo.getStudentsInClass(classId);
  const existing = await attendanceRepo.listStudentAttendance({
    classId,
    date,
    limit: 200
  });
  const map = {};
  for (const e of existing) {
    map[e.student_id] = e;
  }
  return students.map((s) => ({
    studentId: s.id,
    studentCode: s.student_id,
    firstName: s.first_name,
    lastName: s.last_name,
    status: map[s.id] ? map[s.id].status : 'present',
    notes: map[s.id] ? map[s.id].notes : null
  }));
}

async function listStudentAttendance(filters) {
  return attendanceRepo.listStudentAttendance(filters);
}

module.exports = {
  ingestEvent,
  processPendingEvents,
  processEventById,
  listDevices,
  createDevice,
  listEvents,
  listTeacherAttendance,
  getMyAttendance,
  markStudentAttendance,
  getClassAttendanceSheet,
  listStudentAttendance
};
