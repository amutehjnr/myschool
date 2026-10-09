'use strict';

const parentRepo = require('../repositories/parent.repository');
const auditRepo = require('../repositories/audit.repository');
const userRepo = require('../repositories/user.repository');
const studentRepo = require('../repositories/student.repository');
const feeRepo = require('../repositories/fee.repository');
const resultRepo = require('../repositories/result.repository');
const commsRepo = require('../repositories/comms.repository');
const { query } = require('../config/database');

async function getParentByUserId(userId) {
  return parentRepo.findByUserId(userId);
}

async function getChildren(parentUserId) {
  return studentRepo.getChildrenOfParent(parentUserId);
}

/**
 * Object-level authorization: parent may only access linked children.
 */
async function getAuthorizedChild(parentUserId, studentId) {
  const allowed = await studentRepo.isChildOfParent(studentId, parentUserId);
  if (!allowed) return null;
  return studentRepo.findById(studentId);
}

async function getAttendanceStats(studentId, days = 30) {
  const rows = await query(
    `SELECT status, COUNT(*) AS cnt
     FROM student_attendance
     WHERE student_id = :sid
       AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
     GROUP BY status`,
    { sid: studentId, days: Number(days) }
  );
  const stats = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  for (const r of rows) {
    const key = String(r.status || '').toLowerCase();
    if (stats[key] !== undefined) stats[key] = Number(r.cnt);
    stats.total += Number(r.cnt);
  }
  stats.rate =
    stats.total > 0
      ? Math.round(((stats.present + stats.late) / stats.total) * 100)
      : null;
  return stats;
}

async function getFeesSummary(studentId) {
  const bills = await feeRepo.listStudentFees({ studentId, limit: 100 });
  let outstanding = 0;
  let paid = 0;
  let openCount = 0;
  for (const b of bills.rows || []) {
    const due = Number(b.amount_due) || 0;
    const got = Number(b.amount_paid) || 0;
    paid += got;
    if (['outstanding', 'partially_paid'].includes(b.status)) {
      outstanding += Math.max(0, due - got);
      openCount += 1;
    }
  }
  return {
    outstanding: Math.round(outstanding * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    openCount,
    recent: (bills.rows || []).slice(0, 5)
  };
}

async function getResultsSummary(studentId) {
  const results = await resultRepo.getStudentResults(studentId, {
    publishedOnly: true
  });
  return {
    count: results.length,
    recent: results.slice(0, 5)
  };
}

async function getPortalData(parentUserId, selectedStudentId = null) {
  const parent = await parentRepo.findByUserId(parentUserId);
  if (!parent) return null;

  const children = await studentRepo.getChildrenOfParent(parentUserId);
  if (!children.length) {
    return {
      parent,
      children: [],
      selectedChild: null,
      attendance: [],
      attendanceStats: null,
      feesSummary: null,
      resultsSummary: null,
      announcements: [],
      events: [],
      unreadNotifications: 0
    };
  }

  let selectedChild = null;
  if (selectedStudentId) {
    const allowed = children.find((c) => Number(c.id) === Number(selectedStudentId));
    if (allowed) {
      selectedChild = await studentRepo.findById(allowed.id);
    }
  }
  if (!selectedChild) {
    selectedChild = await studentRepo.findById(children[0].id);
  }

  const [attendance, attendanceStats, feesSummary, resultsSummary, announcements, events, unreadNotifications] =
    await Promise.all([
      studentRepo.getAttendance(selectedChild.id, { limit: 14 }),
      getAttendanceStats(selectedChild.id, 30),
      getFeesSummary(selectedChild.id),
      getResultsSummary(selectedChild.id),
      commsRepo.listForAudience('parent', {
        classId: selectedChild.class_id || null,
        limit: 5
      }),
      commsRepo.listEventsForAudience('parent', { limit: 5 }),
      commsRepo.countUnread(parentUserId)
    ]);

  return {
    parent,
    children,
    selectedChild,
    attendance,
    attendanceStats,
    feesSummary,
    resultsSummary,
    announcements,
    events,
    unreadNotifications
  };
}


async function updateProfile(userId, data, meta = {}) {
  const parent = await parentRepo.findByUserId(userId);
  if (!parent) return { error: 'Parent profile not found.' };

  if (!data.firstName || !data.lastName) {
    return { error: 'First name and last name are required.' };
  }

  // Optional email change on user account
  if (data.email && data.email !== parent.email) {
    const email = String(data.email).trim().toLowerCase();
    if (await userRepo.emailExists(email, parent.user_id)) {
      return { error: 'That email is already in use by another account.' };
    }
    await userRepo.update(parent.user_id, { email });
  }

  await parentRepo.update(parent.id, {
    firstName: String(data.firstName).trim(),
    lastName: String(data.lastName).trim(),
    phone: data.phone != null ? String(data.phone).trim() || null : null,
    relationship: data.relationship != null ? String(data.relationship).trim() || null : null,
    address: data.address != null ? String(data.address).trim() || null : null,
    occupation: data.occupation != null ? String(data.occupation).trim() || null : null
  });

  await auditRepo.create({
    userId,
    action: 'PROFILE_UPDATED',
    module: 'parents',
    recordId: parent.id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

module.exports = {
  updateProfile,
  getParentByUserId,
  getChildren,
  getAuthorizedChild,
  getPortalData,
  getAttendanceStats,
  getFeesSummary,
  getResultsSummary
};
