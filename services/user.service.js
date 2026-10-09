'use strict';

const userRepo = require('../repositories/user.repository');
const roleRepo = require('../repositories/role.repository');
const auditRepo = require('../repositories/audit.repository');
const { hashPassword, generateSecureToken } = require('../utils/crypto');

async function listUsers(filters) {
  return userRepo.listUsers(filters);
}

async function getUser(id) {
  return userRepo.findById(id);
}

/**
 * Create a user account. Never allows self-escalation checks here —
 * caller must be admin. Temporary password is generated if none provided.
 */
async function createUser({ email, roleId, password, adminUserId, meta = {} }) {
  if (!email || !roleId) {
    return { error: 'Email and role are required.' };
  }

  if (await userRepo.emailExists(email)) {
    return { error: 'An account with this email already exists.' };
  }

  const role = await roleRepo.findById(roleId);
  if (!role) {
    return { error: 'Invalid role.' };
  }

  const plainPassword = password && password.length >= 8 ? password : generateSecureToken(6) + 'Aa1!';
  const passwordHash = await hashPassword(plainPassword);

  const userId = await userRepo.create({
    email,
    passwordHash,
    roleId,
    mustChangePassword: true
  });

  await auditRepo.create({
    userId: adminUserId,
    action: 'CREATE_USER',
    module: 'users',
    recordId: userId,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { email, role: role.name }
  });

  return {
    success: true,
    userId,
    temporaryPassword: password ? null : plainPassword
  };
}

async function updateUser(id, { email, roleId }, adminUserId, meta = {}) {
  const existing = await userRepo.findById(id);
  if (!existing) {
    return { error: 'User not found.' };
  }

  // Prevent removing the last administrator / self-lockout of sole admin is handled loosely
  if (email && (await userRepo.emailExists(email, id))) {
    return { error: 'An account with this email already exists.' };
  }

  if (roleId) {
    const role = await roleRepo.findById(roleId);
    if (!role) return { error: 'Invalid role.' };
  }

  await userRepo.update(id, { email, roleId });

  await auditRepo.create({
    userId: adminUserId,
    action: 'UPDATE_USER',
    module: 'users',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { email, roleId }
  });

  return { success: true };
}

async function activateUser(id, adminUserId, meta = {}) {
  const existing = await userRepo.findById(id);
  if (!existing) return { error: 'User not found.' };

  await userRepo.setActive(id, true);

  await auditRepo.create({
    userId: adminUserId,
    action: 'ACTIVATE_USER',
    module: 'users',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function deactivateUser(id, adminUserId, meta = {}) {
  const existing = await userRepo.findById(id);
  if (!existing) return { error: 'User not found.' };

  // Prevent deactivating yourself
  if (Number(id) === Number(adminUserId)) {
    return { error: 'You cannot deactivate your own account.' };
  }

  await userRepo.setActive(id, false);

  await auditRepo.create({
    userId: adminUserId,
    action: 'DEACTIVATE_USER',
    module: 'users',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true };
}

async function adminResetPassword(id, adminUserId, meta = {}) {
  const existing = await userRepo.findById(id);
  if (!existing) return { error: 'User not found.' };

  const tempPassword = generateSecureToken(6) + 'Aa1!';
  const passwordHash = await hashPassword(tempPassword);
  await userRepo.updatePassword(id, passwordHash, true);
  // Force change on next login
  const { query } = require('../config/database');
  await query(`UPDATE users SET must_change_password = 1 WHERE id = :id`, { id });

  await auditRepo.create({
    userId: adminUserId,
    action: 'ADMIN_PASSWORD_RESET',
    module: 'users',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent
  });

  return { success: true, temporaryPassword: tempPassword };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  activateUser,
  deactivateUser,
  adminResetPassword
};
