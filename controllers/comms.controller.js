'use strict';

const commsService = require('../services/comms.service');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Admin announcements ----------

async function adminListAnnouncements(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 20);
    const result = await commsService.listAnnouncementsAdmin({ page, limit });
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('admin/comms/announcements', {
      title: 'Announcements',
      announcements: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowCreateAnnouncement(req, res, next) {
  try {
    const classes = await commsService.listClasses();
    res.render('admin/comms/announcement-form', {
      title: 'New Announcement',
      classes,
      announcement: null
    });
  } catch (err) {
    next(err);
  }
}

async function adminCreateAnnouncement(req, res, next) {
  try {
    const classes = await commsService.listClasses();
    const result = await commsService.createAnnouncement(
      {
        title: req.body.title,
        body: req.body.body,
        audience: req.body.audience || 'all',
        targetClassId: req.body.target_class_id ? Number(req.body.target_class_id) : null,
        priority: req.body.priority || 'normal',
        isPublished: req.body.publish === '1' || req.body.publish === 'on',
        expiresAt: req.body.expires_at || null
      },
      req.session.userId,
      meta(req)
    );
    if (result.error) {
      return res.status(400).render('admin/comms/announcement-form', {
        title: 'New Announcement',
        classes,
        announcement: req.body,
        error: result.error
      });
    }
    req.session.flash = { type: 'success', message: 'Announcement saved.' };
    res.redirect('/admin/announcements');
  } catch (err) {
    next(err);
  }
}

async function adminPublishAnnouncement(req, res, next) {
  try {
    const result = await commsService.publishAnnouncement(
      req.params.id,
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'Announcement published.'
    };
    res.redirect('/admin/announcements');
  } catch (err) {
    next(err);
  }
}

// ---------- Admin events ----------

async function adminListEvents(req, res, next) {
  try {
    const events = await commsService.listEventsAdmin();
    res.render('admin/comms/events', {
      title: 'Events',
      events,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowCreateEvent(req, res, next) {
  res.render('admin/comms/event-form', {
    title: 'New Event',
    event: null
  });
}

async function adminCreateEvent(req, res, next) {
  try {
    const result = await commsService.createEvent(
      {
        title: req.body.title,
        description: req.body.description,
        eventDate: req.body.event_date,
        startTime: req.body.start_time || null,
        endTime: req.body.end_time || null,
        location: req.body.location,
        audience: req.body.audience || 'all',
        isPublished: true
      },
      req.session.userId,
      meta(req)
    );
    if (result.error) {
      return res.status(400).render('admin/comms/event-form', {
        title: 'New Event',
        event: req.body,
        error: result.error
      });
    }
    req.session.flash = { type: 'success', message: 'Event created.' };
    res.redirect('/admin/events');
  } catch (err) {
    next(err);
  }
}

// ---------- Shared: notifications ----------

async function notifications(req, res, next) {
  try {
    const data = await commsService.listNotifications(req.session.userId);
    res.render('shared/notifications', {
      title: 'Notifications',
      notifications: data.items,
      unread: data.unread,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    await commsService.markNotificationRead(req.params.id, req.session.userId);
    const redirect = req.query.next || '/notifications';
    res.redirect(redirect);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await commsService.markAllNotificationsRead(req.session.userId);
    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
}

// ---------- Role portals: announcements & events ----------

async function portalAnnouncements(req, res, next) {
  try {
    const announcements = await commsService.listAnnouncementsForUser(
      req.session.userId,
      req.session.role
    );
    const role = String(req.session.role).toLowerCase();
    const layout =
      role === 'teacher'
        ? 'teacher'
        : role === 'student'
          ? 'student'
          : role === 'parent'
            ? 'parent'
            : 'admin';
    res.render(`${layout}/announcements`, {
      title: 'Announcements',
      announcements,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function portalEvents(req, res, next) {
  try {
    const events = await commsService.listEventsForUser(req.session.role);
    const role = String(req.session.role).toLowerCase();
    const layout =
      role === 'teacher'
        ? 'teacher'
        : role === 'student'
          ? 'student'
          : role === 'parent'
            ? 'parent'
            : 'admin';
    res.render(`${layout}/events`, {
      title: 'Events',
      events,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminListAnnouncements,
  adminShowCreateAnnouncement,
  adminCreateAnnouncement,
  adminPublishAnnouncement,
  adminListEvents,
  adminShowCreateEvent,
  adminCreateEvent,
  notifications,
  markRead,
  markAllRead,
  portalAnnouncements,
  portalEvents
};
