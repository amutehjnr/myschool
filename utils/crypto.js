'use strict';

const argon2 = require('argon2');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 1
};

/**
 * Hash a password with Argon2id.
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password is required');
  }
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verify a password against an Argon2id hash.
 */
async function verifyPassword(hash, plainPassword) {
  if (!hash || !plainPassword) return false;
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token (hex).
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a UUID v4.
 */
function generateUuid() {
  return uuidv4();
}

/**
 * Constant-time string comparison (for tokens).
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateUuid,
  timingSafeEqual
};
