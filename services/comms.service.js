'use strict';

const commsRepo = require('../repositories/comms.repository');
const auditRepo = require('../repositories/audit.repository');
const studentRepo = require('../repositories/student.repository');
const teacherRepo = require('../repositories/teacher.repository');
const { query } = require('../config/database');

async function createAnnouncement(data, userId, meta = {}) {
  if (!data.title || !data.body) {
    return { error: 'Title and body are required.' };
  }
  const id = await commsRepo.createAnnouncement({
    ...data,
    createdBy: userId
  });

  // Fan-out notifications when publishing
  if (data.isPublished) {
    await fanOutAnnouncementNotifications(id, data);
  }

  await auditRepo.create({
    userId,
    action: 'ANNOUNCEMENT_CREATED',
    module: 'communications',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { title: data.title, audience: data.audience }
  });

  return { success: true, id };
}

async function publishAnnouncement(id, userId, meta = {}) {
  const existing = await commsRepo.findAnnouncementById(id);
  if (!existing) return { error: 'Announcement not found.' };
  await commsRepo.updateAnnouncement(id, { isPublished: true });
  await fanOutAnnouncementNotifications(id, {
    title: existing.title,
    body: existing.body,
    audience: existing.audience,
    targetClassId: existing.target_class_id
  });
  await auditRepo.create({
    userId,
    action: 'ANNOUNCEMENT_CREATED',
    module: 'communications',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { action: 'publish' }
  });
  return { success: true };
}

async function fanOutAnnouncementNotifications(announcementId, data) {
  let userIds = [];
  const audience = data.audience || 'all';
  if (audience === 'all') {
    const roles = ['teacher', 'student', 'parent'];
    for (const r of roles) {
      userIds = userIds.concat(await commsRepo.getUserIdsByRole(r));
    }
  } else if (audience === 'teachers') {
    userIds = await commsRepo.getUserIdsByRole('teacher');
  } else if (audience === 'students') {
    userIds = await commsRepo.getUserIdsByRole('student');
  } else if (audience === 'parents') {
    userIds = await commsRepo.getUserIdsByRole('parent');
  } else if (audience === 'class' && data.targetClassId) {
    userIds = await commsRepo.getUserIdsInClass(data.targetClassId);
  }

  // Dedupe
  userIds = [...new Set(userIds)];
  await commsRepo.createNotificationsForUsers(userIds, {
    title: data.title,
    body: (data.body || '').slice(0, 200),
    link: `/announcements/${announcementId}`
  });
}

async function listAnnouncementsAdmin(filters) {
  return commsRepo.listAnnouncements(filters);
}

async function getAnnouncement(id) {
  return commsRepo.findAnnouncementById(id);
}

async function listAnnouncementsForUser(userId, role) {
  let classId = null;
  if (String(role).toLowerCase() === 'student') {
    const s = await studentRepo.findByUserId(userId);
    classId = s ? s.class_id : null;
  } else if (String(role).toLowerCase() === 'teacher') {
    const t = await teacherRepo.findByUserId(userId);
    if (t) {
      const classes = await teacherRepo.getClasses(t.id);
      classId = classes[0] ? classes[0].id : null;
    }
  }
  return commsRepo.listForAudience(role, { classId, limit: 20 });
}

async function listNotifications(userId) {
  return {
    items: await commsRepo.listNotifications(userId, { limit: 30 }),
    unread: await commsRepo.countUnread(userId)
  };
}

async function markNotificationRead(id, userId) {
  await commsRepo.markRead(id, userId);
  return { success: true };
}

async function markAllNotificationsRead(userId) {
  await commsRepo.markAllRead(userId);
  return { success: true };
}

async function createEvent(data, userId, meta = {}) {
  if (!data.title || !data.eventDate) {
    return { error: 'Title and date are required.' };
  }
  const id = await commsRepo.createEvent({
    ...data,
    createdBy: userId
  });
  await auditRepo.create({
    userId,
    action: 'EVENT_CREATED',
    module: 'communications',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { title: data.title }
  });
  return { success: true, id };
}

async function listEventsAdmin() {
  return commsRepo.listEvents({ limit: 50 });
}

async function listEventsForUser(role) {
  return commsRepo.listEventsForAudience(role, { limit: 15 });
}

async function getEvent(id) {
  return commsRepo.findEventById(id);
}

async function listClasses() {
  return query(`SELECT id, name FROM classes WHERE is_active = 1 ORDER BY name`);
}

module.exports = {
  createAnnouncement,
  publishAnnouncement,
  listAnnouncementsAdmin,
  getAnnouncement,
  listAnnouncementsForUser,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createEvent,
  listEventsAdmin,
  listEventsForUser,
  getEvent,
  listClasses
};
