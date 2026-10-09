'use strict';

/**
 * Seed roles and basic permissions.
 */

const ROLES = [
  { name: 'administrator', description: 'Full system access' },
  { name: 'teacher', description: 'Teacher portal access' },
  { name: 'student', description: 'Student portal access' },
  { name: 'parent', description: 'Parent/Guardian portal access' }
];

const PERMISSIONS = [
  { code: 'users.manage', description: 'Manage users', module: 'users' },
  { code: 'roles.manage', description: 'Manage roles and permissions', module: 'users' },
  { code: 'teachers.manage', description: 'CRUD teachers', module: 'teachers' },
  { code: 'students.manage', description: 'CRUD students', module: 'students' },
  { code: 'admissions.manage', description: 'Review admissions', module: 'admissions' },
  { code: 'attendance.manage', description: 'Manage attendance settings and records', module: 'attendance' },
  { code: 'attendance.view', description: 'View attendance reports', module: 'attendance' },
  { code: 'academics.manage', description: 'Manage classes, subjects, assessments', module: 'academics' },
  { code: 'results.enter', description: 'Enter student scores', module: 'results' },
  { code: 'results.approve', description: 'Approve and publish results', module: 'results' },
  { code: 'fees.manage', description: 'Manage fees and record payments', module: 'fees' },
  { code: 'announcements.manage', description: 'Create announcements', module: 'communication' },
  { code: 'reports.view', description: 'View and export reports', module: 'reports' },
  { code: 'settings.manage', description: 'Manage school settings', module: 'settings' },
  { code: 'audit.view', description: 'View audit logs', module: 'audit' }
];

async function seed(query) {
  console.log('Seeding roles...');
  for (const role of ROLES) {
    await query(
      `INSERT INTO roles (name, description) VALUES (:name, :description)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      role
    );
  }

  console.log('Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await query(
      `INSERT INTO permissions (code, description, module) VALUES (:code, :description, :module)
       ON DUPLICATE KEY UPDATE description = VALUES(description), module = VALUES(module)`,
      perm
    );
  }

  // Grant all permissions to administrator
  const [adminRole] = await query(`SELECT id FROM roles WHERE name = 'administrator' LIMIT 1`);
  const perms = await query(`SELECT id FROM permissions`);
  if (adminRole && perms.length) {
    for (const p of perms) {
      await query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (:role_id, :permission_id)`,
        { role_id: adminRole.id, permission_id: p.id }
      );
    }
  }

  console.log('  ✓ roles & permissions');
}

module.exports = { seed };
