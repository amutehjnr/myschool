'use strict';

const userRepo = require('../repositories/user.repository');
const roleRepo = require('../repositories/role.repository');
const parentRepo = require('../repositories/parent.repository');
const auditRepo = require('../repositories/audit.repository');
const { hashPassword, verifyPassword, generateSecureToken } = require('../utils/crypto');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

async function login(email, password, meta = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    await auditRepo.create({
      action: 'LOGIN_FAILED',
      module: 'auth',
      status: 'failure',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: 'missing_credentials' }
    });
    return { error: 'Invalid email or password.' };
  }

  const user = await userRepo.findByEmail(normalizedEmail);

  if (!user || !user.is_active) {
    await auditRepo.create({
      action: 'LOGIN_FAILED',
      module: 'auth',
      status: 'failure',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { email: normalizedEmail, reason: user ? 'inactive' : 'not_found' }
    });
    return { error: 'Invalid email or password.' };
  }

  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    await auditRepo.create({
      userId: user.id,
      action: 'LOGIN_FAILED',
      module: 'auth',
      status: 'failure',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: 'bad_password' }
    });
    return { error: 'Invalid email or password.' };
  }

  await userRepo.updateLastLogin(user.id);

  await auditRepo.create({
    userId: user.id,
    action: 'LOGIN',
    module: 'auth',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role_name,
      mustChangePassword: Boolean(user.must_change_password)
    }
  };
}

async function requestPasswordReset(email, meta = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return { success: true };
  }

  const user = await userRepo.findByEmail(normalizedEmail);

  if (user && user.is_active) {
    const token = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    await userRepo.setPasswordResetToken(user.id, token, expiresAt);

    await auditRepo.create({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'auth',
      status: 'success',
      ipAddress: meta.ip,
      userAgent: meta.userAgent
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(
        { email: normalizedEmail, resetToken: token },
        'Password reset token generated (dev only — do not log in production)'
      );
    }
  } else {
    await auditRepo.create({
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'auth',
      status: 'ignored',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { email: normalizedEmail, reason: 'not_found_or_inactive' }
    });
  }

  return { success: true };
}

async function resetPassword(token, newPassword, meta = {}) {
  if (!token || !newPassword || newPassword.length < 8) {
    return { error: 'Invalid or expired reset link, or password too short.' };
  }

  const user = await userRepo.findByPasswordResetToken(token);
  if (!user) {
    await auditRepo.create({
      action: 'PASSWORD_RESET_FAILED',
      module: 'auth',
      status: 'failure',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: 'invalid_token' }
    });
    return { error: 'Invalid or expired reset link.' };
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepo.updatePassword(user.id, passwordHash, true);

  await auditRepo.create({
    userId: user.id,
    action: 'PASSWORD_RESET',
    module: 'auth',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function changePassword(userId, currentPassword, newPassword, meta = {}) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' };
  }

  const rows = await query(
    `SELECT id, password_hash FROM users WHERE id = :id LIMIT 1`,
    { id: userId }
  );
  const record = rows[0];
  if (!record) {
    return { error: 'User not found.' };
  }

  const valid = await verifyPassword(record.password_hash, currentPassword);
  if (!valid) {
    await auditRepo.create({
      userId,
      action: 'PASSWORD_CHANGE_FAILED',
      module: 'auth',
      status: 'failure',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: 'bad_current_password' }
    });
    return { error: 'Current password is incorrect.' };
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepo.updatePassword(userId, passwordHash, true);

  await auditRepo.create({
    userId,
    action: 'PASSWORD_CHANGED',
    module: 'auth',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function forceChangePassword(userId, newPassword, meta = {}) {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return {
      error: 'Password must contain uppercase, lowercase, and a number.'
    };
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepo.updatePassword(userId, passwordHash, true);

  await auditRepo.create({
    userId,
    action: 'PASSWORD_FORCE_CHANGED',
    module: 'auth',
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function logout(userId, meta = {}) {
  if (userId) {
    await auditRepo.create({
      userId,
      action: 'LOGOUT',
      module: 'auth',
      status: 'success',
      ipAddress: meta.ip,
      userAgent: meta.userAgent
    });
  }
}


/**
 * Public parent self-registration.
 * Creates user (parent role) + parent profile. Staff accounts are admin-provisioned only.
 */
async function registerParent(data, meta = {}) {
  const email = String(data.email || '').trim().toLowerCase();
  const { firstName, lastName, phone, password, relationship } = data;

  if (!email || !firstName || !lastName || !password) {
    return { error: 'Name, email and password are required.' };
  }

  if (await userRepo.emailExists(email)) {
    return { error: 'An account with this email already exists. Please sign in or reset your password.' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: 'Password must contain uppercase, lowercase, and a number.' };
  }

  const parentRole = await roleRepo.findByName('parent');
  if (!parentRole) {
    return { error: 'Registration is temporarily unavailable. Please contact the school.' };
  }

  const passwordHash = await hashPassword(password);
  const userId = await userRepo.create({
    email,
    passwordHash,
    roleId: parentRole.id,
    mustChangePassword: false
  });

  await parentRepo.create({
    userId,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    phone: phone ? String(phone).trim() : null,
    relationship: relationship ? String(relationship).trim() : null
  });

  await auditRepo.create({
    userId,
    action: 'USER_REGISTERED',
    module: 'auth',
    recordId: userId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { role: 'parent', email }
  });

  return { success: true, userId, email };
}

module.exports = {
  registerParent,
  login,
  requestPasswordReset,
  resetPassword,
  changePassword,
  forceChangePassword,
  logout
};
