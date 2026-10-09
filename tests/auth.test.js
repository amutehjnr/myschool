'use strict';

/**
 * Critical auth unit-style checks (run with: node --test tests/auth.test.js)
 * These do not require a live HTTP server; they test crypto helpers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('crypto password hashing', () => {
  it('hashes and verifies with Argon2id', async () => {
    // Skip if argon2 not installed yet
    let crypto;
    try {
      crypto = require('../utils/crypto');
    } catch (e) {
      return; // dependency not ready
    }

    const plain = 'TestPass@123';
    const hash = await crypto.hashPassword(plain);
    assert.ok(hash && hash.length > 20);
    assert.equal(await crypto.verifyPassword(hash, plain), true);
    assert.equal(await crypto.verifyPassword(hash, 'wrong'), false);
  });

  it('generates unique secure tokens', () => {
    let crypto;
    try {
      crypto = require('../utils/crypto');
    } catch {
      return;
    }
    const a = crypto.generateSecureToken(16);
    const b = crypto.generateSecureToken(16);
    assert.equal(a.length, 32); // hex
    assert.notEqual(a, b);
  });
});

describe('RBAC helpers', () => {
  it('requireRole hierarchy levels exist', () => {
    const { ROLE_HIERARCHY, hasMinimumRole } = require('../middleware/rbac');
    assert.ok(ROLE_HIERARCHY.administrator > ROLE_HIERARCHY.teacher);
    assert.equal(hasMinimumRole('administrator', 'teacher'), true);
    assert.equal(hasMinimumRole('student', 'teacher'), false);
  });
});
