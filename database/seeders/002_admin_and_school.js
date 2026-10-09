'use strict';

const { hashPassword } = require('../../utils/crypto');

/**
 * Seed:
 * - Initial administrator (must change password)
 * - Academic session & terms
 * - Departments, houses, classes, subjects
 * - Attendance settings
 * - Default grading system
 * - Fee categories
 */

async function seed(query) {
  // --- Administrator ---
  // Default password is temporary and must be changed on first login.
  const tempPassword = 'ChangeMe@PSHA2026';
  const passwordHash = await hashPassword(tempPassword);

  const [adminRole] = await query(`SELECT id FROM roles WHERE name = 'administrator' LIMIT 1`);
  if (!adminRole) {
    throw new Error('Administrator role not found. Run roles seeder first.');
  }

  await query(
    `INSERT INTO users (email, password_hash, role_id, is_active, must_change_password)
     VALUES (:email, :password_hash, :role_id, 1, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), must_change_password = 1`,
    {
      email: 'admin@psha.edu.ng',
      password_hash: passwordHash,
      role_id: adminRole.id
    }
  );
  console.log('  ✓ administrator account (admin@psha.edu.ng / ChangeMe@PSHA2026 — must change on first login)');

  // --- Academic session ---
  await query(
    `INSERT INTO academic_sessions (name, start_date, end_date, is_current)
     VALUES ('2025/2026', '2025-09-01', '2026-07-31', 1)
     ON DUPLICATE KEY UPDATE is_current = 1`
  );
  const [session] = await query(`SELECT id FROM academic_sessions WHERE name = '2025/2026' LIMIT 1`);

  const terms = [
    { name: 'First Term', start_date: '2025-09-01', end_date: '2025-12-15', is_current: 1 },
    { name: 'Second Term', start_date: '2026-01-08', end_date: '2026-04-10', is_current: 0 },
    { name: 'Third Term', start_date: '2026-04-20', end_date: '2026-07-31', is_current: 0 }
  ];
  for (const t of terms) {
    await query(
      `INSERT INTO terms (academic_session_id, name, start_date, end_date, is_current)
       VALUES (:session_id, :name, :start_date, :end_date, :is_current)
       ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date)`,
      { session_id: session.id, ...t }
    );
  }
  console.log('  ✓ academic session & terms');

  // --- Departments ---
  const departments = [
    { name: 'Science', code: 'SCI' },
    { name: 'Arts', code: 'ART' },
    { name: 'Commercial', code: 'COM' },
    { name: 'Languages', code: 'LANG' },
    { name: 'Mathematics', code: 'MATH' }
  ];
  for (const d of departments) {
    await query(
      `INSERT INTO departments (name, code) VALUES (:name, :code)
       ON DUPLICATE KEY UPDATE code = VALUES(code)`,
      d
    );
  }
  console.log('  ✓ departments');

  // --- Houses ---
  const houses = [
    { name: 'Gold House', color: '#C9A227' },
    { name: 'Blue House', color: '#2C5282' },
    { name: 'Green House', color: '#38A169' },
    { name: 'Red House', color: '#E53E3E' }
  ];
  for (const h of houses) {
    await query(
      `INSERT INTO houses (name, color) VALUES (:name, :color)
       ON DUPLICATE KEY UPDATE color = VALUES(color)`,
      h
    );
  }
  console.log('  ✓ houses');

  // --- Classes ---
  const classNames = [
    'Nursery 1', 'Nursery 2',
    'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
    'JSS 1A', 'JSS 1B', 'JSS 2A', 'JSS 2B', 'JSS 3A',
    'SSS 1A', 'SSS 1B', 'SSS 2A', 'SSS 3A'
  ];
  for (const name of classNames) {
    let level = 'Primary';
    if (name.startsWith('Nursery')) level = 'Nursery';
    else if (name.startsWith('JSS')) level = 'JSS';
    else if (name.startsWith('SSS')) level = 'SSS';
    await query(
      `INSERT INTO classes (name, level, academic_session_id, capacity)
       VALUES (:name, :level, :session_id, 40)
       ON DUPLICATE KEY UPDATE level = VALUES(level)`,
      { name, level, session_id: session.id }
    );
  }
  console.log('  ✓ classes');

  // --- Subjects ---
  const subjects = [
    { name: 'Mathematics', code: 'MTH' },
    { name: 'English Language', code: 'ENG' },
    { name: 'Basic Science', code: 'BSC' },
    { name: 'Basic Technology', code: 'BTE' },
    { name: 'Social Studies', code: 'SOS' },
    { name: 'Civic Education', code: 'CIV' },
    { name: 'Computer Studies', code: 'CMP' },
    { name: 'French', code: 'FRE' },
    { name: 'Yoruba', code: 'YOR' },
    { name: 'Physics', code: 'PHY' },
    { name: 'Chemistry', code: 'CHM' },
    { name: 'Biology', code: 'BIO' },
    { name: 'Economics', code: 'ECO' },
    { name: 'Government', code: 'GOV' },
    { name: 'Literature in English', code: 'LIT' },
    { name: 'Further Mathematics', code: 'FMTH' },
    { name: 'Agricultural Science', code: 'AGR' },
    { name: 'CRS', code: 'CRS' },
    { name: 'Business Studies', code: 'BUS' },
    { name: 'Physical & Health Education', code: 'PHE' }
  ];
  for (const s of subjects) {
    await query(
      `INSERT INTO subjects (name, code) VALUES (:name, :code)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      s
    );
  }
  console.log('  ✓ subjects');

  // --- Attendance settings (Mon–Fri) ---
  const attendanceSettings = [
    { setting_key: 'opening_time', setting_value: '07:30', description: 'Official school opening time' },
    { setting_key: 'expected_check_in', setting_value: '07:45', description: 'Expected teacher check-in time' },
    { setting_key: 'closing_time', setting_value: '15:30', description: 'Official closing time' },
    { setting_key: 'late_threshold_minutes', setting_value: '15', description: 'Minutes after expected check-in to mark late' },
    { setting_key: 'early_departure_threshold_minutes', setting_value: '30', description: 'Minutes before closing to mark early departure' },
    { setting_key: 'working_days', setting_value: '1,2,3,4,5', description: 'Monday=1 … Friday=5' }
  ];
  for (const s of attendanceSettings) {
    await query(
      `INSERT INTO attendance_settings (setting_key, setting_value, description)
       VALUES (:setting_key, :setting_value, :description)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      s
    );
  }
  console.log('  ✓ attendance settings');

  // --- Default grading system ---
  await query(
    `INSERT INTO grading_systems (name, is_default) VALUES ('PSHA Standard', 1)
     ON DUPLICATE KEY UPDATE is_default = 1`
  );
  const [gs] = await query(`SELECT id FROM grading_systems WHERE name = 'PSHA Standard' LIMIT 1`);
  if (gs) {
    const boundaries = [
      { grade_label: 'A', min_score: 70, max_score: 100, remark: 'Excellent' },
      { grade_label: 'B', min_score: 60, max_score: 69.99, remark: 'Very Good' },
      { grade_label: 'C', min_score: 50, max_score: 59.99, remark: 'Good' },
      { grade_label: 'D', min_score: 45, max_score: 49.99, remark: 'Fair' },
      { grade_label: 'E', min_score: 40, max_score: 44.99, remark: 'Pass' },
      { grade_label: 'F', min_score: 0, max_score: 39.99, remark: 'Fail' }
    ];
    // Clear existing for idempotency
    await query(`DELETE FROM grade_boundaries WHERE grading_system_id = :id`, { id: gs.id });
    for (const b of boundaries) {
      await query(
        `INSERT INTO grade_boundaries (grading_system_id, grade_label, min_score, max_score, remark)
         VALUES (:gs_id, :grade_label, :min_score, :max_score, :remark)`,
        { gs_id: gs.id, ...b }
      );
    }
  }
  console.log('  ✓ grading system');

  // --- Fee categories ---
  const feeCats = [
    { name: 'Tuition', description: 'Termly tuition fees' },
    { name: 'Development Levy', description: 'Infrastructure and development' },
    { name: 'PTA Levy', description: 'Parent-Teacher Association' },
    { name: 'Examination Fee', description: 'Internal examinations' },
    { name: 'Uniform', description: 'School uniform' }
  ];
  for (const c of feeCats) {
    await query(
      `INSERT INTO fee_categories (name, description) VALUES (:name, :description)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      c
    );
  }
  console.log('  ✓ fee categories');

  // --- School settings ---
  const schoolSettings = [
    { setting_key: 'school_name', setting_value: 'Precious Star Heritage Academy' },
    { setting_key: 'school_short_name', setting_value: 'PSHA' },
    { setting_key: 'school_email', setting_value: 'info@psha.edu.ng' },
    { setting_key: 'school_phone', setting_value: '+234 000 000 0000' },
    { setting_key: 'currency', setting_value: 'NGN' },
    { setting_key: 'currency_symbol', setting_value: '₦' }
  ];
  for (const s of schoolSettings) {
    await query(
      `INSERT INTO school_settings (setting_key, setting_value)
       VALUES (:setting_key, :setting_value)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      s
    );
  }
  console.log('  ✓ school settings');
}

module.exports = { seed };
