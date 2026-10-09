'use strict';

const { query } = require('../config/database');

// ---------- Announcements ----------

async function createAnnouncement(data) {
  const result = await query(
    `INSERT INTO announcements
       (title, body, audience, target_class_id, target_department_id, priority,
        is_published, published_at, expires_at, created_by)
     VALUES
       (:title, :body, :audience, :classId, :deptId, :priority,
        :published, :publishedAt, :expiresAt, :createdBy)`,
    {
      title: data.title,
      body: data.body,
      audience: data.audience || 'all',
      classId: data.targetClassId || null,
      deptId: data.targetDepartmentId || null,
      priority: data.priority || 'normal',
      published: data.isPublished ? 1 : 0,
      publishedAt: data.isPublished ? new Date() : null,
      expiresAt: data.expiresAt || null,
      createdBy: data.createdBy || null
    }
  );
  return result.insertId;
}

async function updateAnnouncement(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    title: 'title',
    body: 'body',
    audience: 'audience',
    target_class_id: 'targetClassId',
    priority: 'priority',
    expires_at: 'expiresAt'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = data[key];
    }
  }
  if (data.isPublished !== undefined) {
    fields.push('is_published = :isPublished');
    params.isPublished = data.isPublished ? 1 : 0;
    if (data.isPublished) {
      fields.push('published_at = COALESCE(published_at, NOW())');
    }
  }
  if (!fields.length) return;
  await query(`UPDATE announcements SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function findAnnouncementById(id) {
  const rows = await query(
    `SELECT a.*, c.name AS class_name, u.email AS creator_email
     FROM announcements a
     LEFT JOIN classes c ON c.id = a.target_class_id
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function listAnnouncements({ page = 1, limit = 20, publishedOnly = false } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  if (publishedOnly) {
    where += ` AND a.is_published = 1
               AND (a.expires_at IS NULL OR a.expires_at > NOW())`;
  }
  const rows = await query(
    `SELECT a.id, a.title, a.audience, a.priority, a.is_published, a.published_at, a.expires_at, a.created_at,
            c.name AS class_name
     FROM announcements a
     LEFT JOIN classes c ON c.id = a.target_class_id
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { limit: Number(limit), offset }
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM announcements a WHERE ${where}`,
    {}
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

/**
 * Published announcements visible to a role (and optional class).
 */
async function listForAudience(role, { classId = null, limit = 10 } = {}) {
  const roleLower = String(role || '').toLowerCase();
  // all always matches; role-specific; class if class audience and classId matches
  let where = `a.is_published = 1
               AND (a.expires_at IS NULL OR a.expires_at > NOW())
               AND (
                 a.audience = 'all'
                 OR a.audience = :role
                 OR (a.audience = 'class' AND a.target_class_id = :classId)
               )`;
  // map administrator to all (admins see everything via publishedOnly list)
  const audienceRole =
    roleLower === 'administrator'
      ? 'teachers' // unused when admin uses full list
      : roleLower === 'teacher'
        ? 'teachers'
        : roleLower === 'student'
          ? 'students'
          : roleLower === 'parent'
            ? 'parents'
            : roleLower;

  return query(
    `SELECT a.id, a.title, a.body, a.priority, a.published_at, a.audience
     FROM announcements a
     WHERE ${where}
     ORDER BY FIELD(a.priority, 'emergency', 'important', 'normal'), a.published_at DESC
     LIMIT :limit`,
    { role: audienceRole, classId: classId || 0, limit: Number(limit) }
  );
}

// ---------- Notifications ----------

async function createNotification({ userId, title, body = null, link = null }) {
  const result = await query(
    `INSERT INTO notifications (user_id, title, body, link)
     VALUES (:userId, :title, :body, :link)`,
    { userId, title, body, link }
  );
  return result.insertId;
}

async function createNotificationsForUsers(userIds, { title, body = null, link = null }) {
  if (!userIds.length) return 0;
  let count = 0;
  for (const userId of userIds) {
    await createNotification({ userId, title, body, link });
    count += 1;
  }
  return count;
}

async function listNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  let where = 'user_id = :userId';
  if (unreadOnly) where += ' AND is_read = 0';
  return query(
    `SELECT id, title, body, link, is_read, read_at, created_at
     FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT :limit`,
    { userId, limit: Number(limit) }
  );
}

async function markRead(id, userId) {
  await query(
    `UPDATE notifications SET is_read = 1, read_at = NOW()
     WHERE id = :id AND user_id = :userId`,
    { id, userId }
  );
}

async function markAllRead(userId) {
  await query(
    `UPDATE notifications SET is_read = 1, read_at = NOW()
     WHERE user_id = :userId AND is_read = 0`,
    { userId }
  );
}

async function countUnread(userId) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = :userId AND is_read = 0`,
    { userId }
  );
  return rows[0]?.total || 0;
}

async function getUserIdsByRole(roleName) {
  return query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = :role AND u.is_active = 1`,
    { role: roleName }
  ).then((rows) => rows.map((r) => r.id));
}

async function getUserIdsInClass(classId) {
  // Students in class + their parents
  const students = await query(
    `SELECT user_id FROM students WHERE class_id = :classId AND user_id IS NOT NULL AND status = 'active'`,
    { classId }
  );
  const parents = await query(
    `SELECT DISTINCT p.user_id
     FROM parent_students ps
     JOIN parents p ON p.id = ps.parent_id
     JOIN students s ON s.id = ps.student_id
     WHERE s.class_id = :classId`,
    { classId }
  );
  return [...students.map((s) => s.user_id), ...parents.map((p) => p.user_id)].filter(Boolean);
}

// ---------- Events ----------

async function createEvent(data) {
  const result = await query(
    `INSERT INTO events
       (title, description, event_date, start_time, end_time, location, audience, is_published, created_by)
     VALUES
       (:title, :description, :eventDate, :startTime, :endTime, :location, :audience, :published, :createdBy)`,
    {
      title: data.title,
      description: data.description || null,
      eventDate: data.eventDate,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      location: data.location || null,
      audience: data.audience || 'all',
      published: data.isPublished !== false ? 1 : 0,
      createdBy: data.createdBy || null
    }
  );
  return result.insertId;
}

async function updateEvent(id, data) {
  const fields = [];
  const params = { id };
  const map = {
    title: 'title',
    description: 'description',
    event_date: 'eventDate',
    start_time: 'startTime',
    end_time: 'endTime',
    location: 'location',
    audience: 'audience',
    is_published: 'isPublished'
  };
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = :${key}`);
      params[key] = key === 'isPublished' ? (data[key] ? 1 : 0) : data[key];
    }
  }
  if (!fields.length) return;
  await query(`UPDATE events SET ${fields.join(', ')} WHERE id = :id`, params);
}

async function findEventById(id) {
  const rows = await query(`SELECT * FROM events WHERE id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function listEvents({ upcoming = false, publishedOnly = false, limit = 30 } = {}) {
  let where = '1=1';
  if (publishedOnly) where += ' AND is_published = 1';
  if (upcoming) where += ' AND event_date >= CURDATE()';
  return query(
    `SELECT id, title, description, event_date, start_time, end_time, location, audience, is_published
     FROM events
     WHERE ${where}
     ORDER BY event_date ASC, start_time ASC
     LIMIT :limit`,
    { limit: Number(limit) }
  );
}

async function listEventsForAudience(role, { limit = 10 } = {}) {
  const roleLower = String(role || '').toLowerCase();
  const audienceRole =
    roleLower === 'teacher'
      ? 'teachers'
      : roleLower === 'student'
        ? 'students'
        : roleLower === 'parent'
          ? 'parents'
          : null;

  let where = `is_published = 1 AND event_date >= CURDATE()
               AND (audience = 'all'`;
  if (audienceRole) where += ` OR audience = :role`;
  where += ')';

  return query(
    `SELECT id, title, event_date, start_time, end_time, location
     FROM events
     WHERE ${where}
     ORDER BY event_date ASC
     LIMIT :limit`,
    { role: audienceRole, limit: Number(limit) }
  );
}

module.exports = {
  createAnnouncement,
  updateAnnouncement,
  findAnnouncementById,
  listAnnouncements,
  listForAudience,
  createNotification,
  createNotificationsForUsers,
  listNotifications,
  markRead,
  markAllRead,
  countUnread,
  getUserIdsByRole,
  getUserIdsInClass,
  createEvent,
  updateEvent,
  findEventById,
  listEvents,
  listEventsForAudience
};
