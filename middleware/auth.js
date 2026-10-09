'use strict';

const userRepo = require('../repositories/user.repository');

/**
 * Require an authenticated user.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    // Force password change gate (allow only change-password and logout)
    if (
      req.session.mustChangePassword &&
      !req.path.startsWith('/change-password') &&
      !req.originalUrl.startsWith('/auth/change-password') &&
      !req.originalUrl.startsWith('/auth/logout')
    ) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Password change required' });
      }
      return res.redirect('/auth/change-password');
    }
    return next();
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
}

/**
 * Redirect authenticated users away from guest-only pages.
 */
function requireGuest(req, res, next) {
  if (req.session && req.session.userId) {
    if (req.session.mustChangePassword) {
      return res.redirect('/auth/change-password');
    }
    return res.redirect('/dashboard');
  }
  return next();
}

/**
 * Load current user from session into req.user and res.locals.
 */
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.isAuthenticated = false;

  if (req.session && req.session.userId) {
    try {
      const user = await userRepo.findById(req.session.userId);
      if (user && user.is_active) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role_name,
          mustChangePassword: Boolean(user.must_change_password)
        };
        // Keep session in sync
        req.session.role = user.role_name;
        req.session.mustChangePassword = Boolean(user.must_change_password);
        res.locals.currentUser = req.user;
        res.locals.isAuthenticated = true;
      } else {
        // Stale session
        req.session.destroy(() => {});
      }
    } catch {
      // DB may be unavailable during early setup
    }
  }
  next();
}

function attachUser(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.isAuthenticated = Boolean(req.session && req.session.userId);
  next();
}

module.exports = {
  requireAuth,
  requireGuest,
  loadUser,
  attachUser
};
