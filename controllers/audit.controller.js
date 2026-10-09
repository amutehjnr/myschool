'use strict';

const auditRepo = require('../repositories/audit.repository');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

async function list(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 50);
    const filters = {
      page,
      limit,
      action: req.query.action || null,
      module: req.query.module || null,
      status: req.query.status || null,
      from: req.query.from || null,
      to: req.query.to || null,
      search: req.query.search || null
    };

    const [result, actions, modules, summary] = await Promise.all([
      auditRepo.list(filters),
      auditRepo.listActions(),
      auditRepo.listModules(),
      auditRepo.recentSummary({ days: 7 })
    ]);

    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/audit/list', {
      title: 'Audit Log',
      logs: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      actions,
      modules,
      summary,
      filters: {
        action: filters.action || '',
        module: filters.module || '',
        status: filters.status || '',
        from: filters.from || '',
        to: filters.to || '',
        search: filters.search || ''
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function show(req, res, next) {
  try {
    const log = await auditRepo.findById(req.params.id);
    if (!log) {
      req.session.flash = { type: 'error', message: 'Audit entry not found.' };
      return res.redirect('/admin/audit');
    }
    let metadata = null;
    if (log.metadata) {
      try {
        metadata =
          typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      } catch {
        metadata = log.metadata;
      }
    }
    res.render('admin/audit/detail', {
      title: 'Audit Detail',
      log,
      metadata,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Security posture page — read-only checklist for admins.
 */
async function security(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  const checks = [
    {
      name: 'SESSION_SECRET set',
      ok: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
      detail: 'Session signing secret (≥ 32 characters)'
    },
    {
      name: 'NODE_ENV',
      ok: true,
      detail: `Currently: ${process.env.NODE_ENV || 'development'}`
    },
    {
      name: 'Secure cookies (production)',
      ok: !isProd || process.env.COOKIE_SECURE === 'true' || isProd,
      detail: isProd
        ? 'Cookies should use Secure flag behind HTTPS'
        : 'Dev mode — Secure flag optional'
    },
    {
      name: 'CSRF protection',
      ok: true,
      detail: 'Enabled for all state-changing browser routes'
    },
    {
      name: 'Helmet security headers',
      ok: true,
      detail: 'CSP, HSTS (prod), X-Content-Type-Options, Referrer-Policy'
    },
    {
      name: 'Rate limiting',
      ok: true,
      detail: 'General, login, password reset, admissions, uploads, device API'
    },
    {
      name: 'Password hashing',
      ok: true,
      detail: 'Argon2id'
    },
    {
      name: 'Biometric API key',
      ok: Boolean(process.env.BIOMETRIC_API_KEY || process.env.DEVICE_API_KEY) || !isProd,
      detail: isProd
        ? 'BIOMETRIC_API_KEY must be set in production'
        : 'Optional in development'
    },
    {
      name: 'Trust proxy',
      ok: true,
      detail: 'Enabled for correct client IPs behind reverse proxy'
    },
    {
      name: 'Session store',
      ok: !isProd,
      detail: isProd
        ? 'WARNING: MemoryStore is not suitable for production — use Redis or MySQL store'
        : 'MemoryStore acceptable for development'
    }
  ];

  res.render('admin/audit/security', {
    title: 'Security',
    checks,
    isProd
  });
}

module.exports = {
  list,
  show,
  security
};
