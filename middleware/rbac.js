'use strict';

/**
 * Role-Based Access Control helpers.
 * Roles: administrator, teacher, student, parent
 */

const ROLE_HIERARCHY = {
  administrator: 100,
  teacher: 50,
  student: 20,
  parent: 20
};

/**
 * Require one of the listed roles.
 * Always enforced server-side.
 */
function requireRole(...allowedRoles) {
  const allowed = allowedRoles.map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/auth/login');
    }

    const userRole = String(req.session.role || '').toLowerCase();

    if (!allowed.includes(userRole)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'You do not have permission to access this resource.'
      });
    }

    return next();
  };
}

/**
 * Require administrator role.
 */
function requireAdmin(req, res, next) {
  return requireRole('administrator')(req, res, next);
}

/**
 * Object-level authorization: ensure a parent can only access their own children.
 * Expects req.params.studentId or req.body.studentId.
 * The actual check against parent_students table must be done in the service/repository.
 * This middleware only enforces that the caller is a parent (or admin) and passes control.
 */
function requireParentOrAdmin(req, res, next) {
  return requireRole('parent', 'administrator')(req, res, next);
}

/**
 * Check if current user has at least the given role level.
 */
function hasMinimumRole(userRole, minimumRole) {
  const userLevel = ROLE_HIERARCHY[String(userRole).toLowerCase()] || 0;
  const minLevel = ROLE_HIERARCHY[String(minimumRole).toLowerCase()] || 0;
  return userLevel >= minLevel;
}

module.exports = {
  requireRole,
  requireAdmin,
  requireParentOrAdmin,
  hasMinimumRole,
  ROLE_HIERARCHY
};
