'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const methodOverride = require('method-override');
const pinoHttp = require('pino-http');

const logger = require('./utils/logger');
const { createSessionMiddleware } = require('./config/session');
const { createHelmetMiddleware } = require('./config/security');
const { generalLimiter } = require('./middleware/rateLimiter');
const { csrfProtection, exposeCsrfToken } = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy (important behind Nginx / load balancer)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', process.env.NODE_ENV === 'production');

// Request ID for log correlation
app.use((req, res, next) => {
  const id = req.get('X-Request-Id') || require('crypto').randomBytes(8).toString('hex');
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// Security headers
app.use(createHelmetMiddleware());

// Compression
app.use(compression());

// Request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health'
    }
  })
);

// Body parsing with strict size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// Static assets
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true
  })
);

// Session
app.use(createSessionMiddleware());

// Rate limiting (general)
app.use(generalLimiter);

// Locals available to every view
app.use((req, res, next) => {
  res.locals.appName = 'Precious Star Heritage Academy';
  res.locals.appShortName = 'PSHA';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.path = req.path;
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, role: req.session.role, email: req.session.email }
    : null;
  res.locals.userRole = req.session.role || null;
  next();
});

app.use(loadUser);

// Health check (no CSRF, no auth)
app.get('/health', async (req, res) => {
  try {
    const { ping } = require('./config/database');
    const dbOk = await ping().catch(() => false);
    const status = dbOk ? 'ok' : 'degraded';
    res.status(dbOk ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

const attendanceApiRoutes = require('./routes/attendance.api.routes');
// Device API — no CSRF (uses API key auth)
app.use('/api/attendance', attendanceApiRoutes);

// CSRF for all subsequent routes that mutate state
app.use(csrfProtection);
app.use(exposeCsrfToken);

// Routes (will be expanded in later phases)
const publicRoutes = require('./routes/public.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const teacherRoutes = require('./routes/teacher.routes');
const studentRoutes = require('./routes/student.routes');
const parentRoutes = require('./routes/parent.routes');
const admissionRoutes = require('./routes/admission.routes');
const { requireAuth } = require('./middleware/auth');
const commsController = require('./controllers/comms.controller');

app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);
app.use('/parent', parentRoutes);
app.use('/admissions', admissionRoutes);

// Shared notifications (any authenticated user)
app.get('/notifications', requireAuth, commsController.notifications);
app.post('/notifications/:id/read', requireAuth, commsController.markRead);
app.post('/notifications/read-all', requireAuth, commsController.markAllRead);


// Dashboard redirect helper
app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login');
  }
  const role = String(req.session.role || '').toLowerCase();
  switch (role) {
    case 'administrator':
      return res.redirect('/admin/dashboard');
    case 'teacher':
      return res.redirect('/teacher/dashboard');
    case 'student':
      return res.redirect('/student/dashboard');
    case 'parent':
      return res.redirect('/parent/dashboard');
    default:
      return res.redirect('/auth/login');
  }
});

// 404 + error handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
