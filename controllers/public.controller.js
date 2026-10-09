'use strict';

const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const commsService = require('../services/comms.service');
const { formatDate } = require('../utils/helpers');

async function home(req, res, next) {
  try {
    let events = [];
    try {
      events = await commsService.listEventsForUser('all');
    } catch {
      events = [];
    }
    // Fallback: published events for all
    if (!events.length) {
      try {
        events = await query(
          `SELECT id, title, event_date, start_time, location
           FROM events
           WHERE is_published = 1 AND event_date >= CURDATE()
             AND (audience = 'all' OR audience = 'students' OR audience = 'parents')
           ORDER BY event_date ASC
           LIMIT 5`
        );
      } catch {
        events = [];
      }
    }
    res.render('public/home', {
      title: 'Home',
      events,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

function about(req, res) {
  res.render('public/about', { title: 'About Us' });
}

function admissions(req, res) {
  res.render('public/admissions', { title: 'Admissions' });
}

function gallery(req, res) {
  // Static gallery placeholders — replace with CMS/media later
  const images = [
    { title: 'Classroom learning', caption: 'Engaged learners in a modern classroom' },
    { title: 'Science lab', caption: 'Hands-on experiments and discovery' },
    { title: 'Sports day', caption: 'Building teamwork and healthy competition' },
    { title: 'Assembly', caption: 'Weekly assembly and character talks' },
    { title: 'Library', caption: 'A quiet space for reading and research' },
    { title: 'Cultural day', caption: 'Celebrating our heritage and diversity' }
  ];
  res.render('public/gallery', { title: 'Gallery', images });
}

function contact(req, res) {
  res.render('public/contact', {
    title: 'Contact Us',
    form: {},
    success: req.session.flash && req.session.flash.type === 'success'
  });
}

const contactRules = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').trim().isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters.')
];

async function submitContact(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('public/contact', {
        title: 'Contact Us',
        form: req.body,
        error: errors.array()[0].msg
      });
    }

    await query(
      `INSERT INTO contact_messages (name, email, phone, subject, message)
       VALUES (:name, :email, :phone, :subject, :message)`,
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone || null,
        subject: req.body.subject || null,
        message: req.body.message
      }
    );

    req.session.flash = {
      type: 'success',
      message: 'Thank you. Your message has been sent. We will get back to you soon.'
    };
    res.redirect('/contact');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  home,
  about,
  admissions,
  gallery,
  contact,
  contactRules,
  submitContact
};
