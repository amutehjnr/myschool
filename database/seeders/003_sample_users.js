'use strict';

const { hashPassword } = require('../../utils/crypto');

/**
 * Realistic sample teachers, students and parents for development.
 * All passwords are temporary and set to must_change_password where applicable.
 */

async function seed(query) {
  const defaultHash = await hashPassword('Password@123');

  const [teacherRole] = await query(`SELECT id FROM roles WHERE name = 'teacher' LIMIT 1`);
  const [studentRole] = await query(`SELECT id FROM roles WHERE name = 'student' LIMIT 1`);
  const [parentRole] = await query(`SELECT id FROM roles WHERE name = 'parent' LIMIT 1`);
  const [session] = await query(`SELECT id FROM academic_sessions WHERE is_current = 1 LIMIT 1`);
  const departments = await query(`SELECT id, code FROM departments`);
  const classes = await query(`SELECT id, name FROM classes`);
  const houses = await query(`SELECT id, name FROM houses`);
  const subjects = await query(`SELECT id, code FROM subjects`);

  const deptMap = Object.fromEntries(departments.map((d) => [d.code, d.id]));
  const classMap = Object.fromEntries(classes.map((c) => [c.name, c.id]));
  const houseMap = Object.fromEntries(houses.map((h) => [h.name, h.id]));
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.code, s.id]));

  // ---------- Teachers ----------
  const teachers = [
    {
      email: 'adebayo.okafor@psha.edu.ng',
      staff_id: 'TCH-001',
      first_name: 'Adebayo',
      last_name: 'Okafor',
      department: 'MATH',
      qualification: 'B.Sc Mathematics, PGDE',
      phone: '08031234501',
      subjects: ['MTH', 'FMTH'],
      classes: ['JSS 1A', 'JSS 2A']
    },
    {
      email: 'chioma.eze@psha.edu.ng',
      staff_id: 'TCH-002',
      first_name: 'Chioma',
      last_name: 'Eze',
      department: 'LANG',
      qualification: 'B.A English, M.Ed',
      phone: '08031234502',
      subjects: ['ENG', 'LIT'],
      classes: ['JSS 1A', 'SSS 1A']
    },
    {
      email: 'ibrahim.bello@psha.edu.ng',
      staff_id: 'TCH-003',
      first_name: 'Ibrahim',
      last_name: 'Bello',
      department: 'SCI',
      qualification: 'B.Sc Physics',
      phone: '08031234503',
      subjects: ['PHY', 'BSC'],
      classes: ['SSS 1A', 'SSS 2A']
    },
    {
      email: 'funke.adeyemi@psha.edu.ng',
      staff_id: 'TCH-004',
      first_name: 'Funke',
      last_name: 'Adeyemi',
      department: 'SCI',
      qualification: 'B.Sc Biology, PGDE',
      phone: '08031234504',
      subjects: ['BIO', 'AGR'],
      classes: ['JSS 2A', 'JSS 3A']
    },
    {
      email: 'tunde.sanni@psha.edu.ng',
      staff_id: 'TCH-005',
      first_name: 'Tunde',
      last_name: 'Sanni',
      department: 'COM',
      qualification: 'B.Sc Economics',
      phone: '08031234505',
      subjects: ['ECO', 'BUS'],
      classes: ['SSS 1B', 'SSS 2A']
    }
  ];

  for (const t of teachers) {
    await query(
      `INSERT INTO users (email, password_hash, role_id, is_active, must_change_password)
       VALUES (:email, :hash, :role_id, 1, 0)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      { email: t.email, hash: defaultHash, role_id: teacherRole.id }
    );
    const [user] = await query(`SELECT id FROM users WHERE email = :email LIMIT 1`, { email: t.email });

    await query(
      `INSERT INTO teachers (user_id, staff_id, first_name, last_name, department_id, qualification, phone, employment_date, is_active)
       VALUES (:user_id, :staff_id, :first_name, :last_name, :dept_id, :qualification, :phone, '2020-09-01', 1)
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name)`,
      {
        user_id: user.id,
        staff_id: t.staff_id,
        first_name: t.first_name,
        last_name: t.last_name,
        dept_id: deptMap[t.department] || null,
        qualification: t.qualification,
        phone: t.phone
      }
    );
    const [teacher] = await query(`SELECT id FROM teachers WHERE staff_id = :staff_id LIMIT 1`, {
      staff_id: t.staff_id
    });

    for (const code of t.subjects) {
      if (subjectMap[code]) {
        await query(
          `INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (:tid, :sid)`,
          { tid: teacher.id, sid: subjectMap[code] }
        );
      }
    }
    for (const cname of t.classes) {
      if (classMap[cname]) {
        await query(
          `INSERT IGNORE INTO teacher_classes (teacher_id, class_id, is_class_teacher) VALUES (:tid, :cid, 0)`,
          { tid: teacher.id, cid: classMap[cname] }
        );
      }
    }
  }
  console.log('  ✓ sample teachers');

  // ---------- Students ----------
  const studentData = [
    { first: 'Adaeze', last: 'Nwosu', class: 'JSS 1A', house: 'Gold House', gender: 'female', id: 'STU-2025-001' },
    { first: 'Chinedu', last: 'Okeke', class: 'JSS 1A', house: 'Blue House', gender: 'male', id: 'STU-2025-002' },
    { first: 'Fatima', last: 'Abdullahi', class: 'JSS 1B', house: 'Green House', gender: 'female', id: 'STU-2025-003' },
    { first: 'Emeka', last: 'Okonkwo', class: 'JSS 2A', house: 'Red House', gender: 'male', id: 'STU-2025-004' },
    { first: 'Blessing', last: 'Adeyemi', class: 'JSS 2A', house: 'Gold House', gender: 'female', id: 'STU-2025-005' },
    { first: 'Yusuf', last: 'Mohammed', class: 'JSS 3A', house: 'Blue House', gender: 'male', id: 'STU-2025-006' },
    { first: 'Grace', last: 'Ibrahim', class: 'SSS 1A', house: 'Green House', gender: 'female', id: 'STU-2025-007' },
    { first: 'David', last: 'Okafor', class: 'SSS 1A', house: 'Red House', gender: 'male', id: 'STU-2025-008' },
    { first: 'Amina', last: 'Bello', class: 'SSS 2A', house: 'Gold House', gender: 'female', id: 'STU-2025-009' },
    { first: 'Kelechi', last: 'Eze', class: 'Primary 5', house: 'Blue House', gender: 'male', id: 'STU-2025-010' }
  ];

  for (const s of studentData) {
    const email = `${s.id.toLowerCase()}@student.psha.edu.ng`;
    await query(
      `INSERT INTO users (email, password_hash, role_id, is_active, must_change_password)
       VALUES (:email, :hash, :role_id, 1, 0)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      { email, hash: defaultHash, role_id: studentRole.id }
    );
    const [user] = await query(`SELECT id FROM users WHERE email = :email LIMIT 1`, { email });

    await query(
      `INSERT INTO students (user_id, student_id, first_name, last_name, gender, class_id, house_id, academic_session_id, admission_date, status)
       VALUES (:user_id, :student_id, :first_name, :last_name, :gender, :class_id, :house_id, :session_id, '2025-09-01', 'active')
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name)`,
      {
        user_id: user.id,
        student_id: s.id,
        first_name: s.first,
        last_name: s.last,
        gender: s.gender,
        class_id: classMap[s.class] || null,
        house_id: houseMap[s.house] || null,
        session_id: session ? session.id : null
      }
    );
  }
  console.log('  ✓ sample students');

  // ---------- Parents ----------
  const parents = [
    {
      email: 'parent.nwosu@example.com',
      first: 'Chukwudi',
      last: 'Nwosu',
      phone: '08045550001',
      children: ['STU-2025-001']
    },
    {
      email: 'parent.okeke@example.com',
      first: 'Ngozi',
      last: 'Okeke',
      phone: '08045550002',
      children: ['STU-2025-002']
    },
    {
      email: 'parent.shared@example.com',
      first: 'Musa',
      last: 'Abdullahi',
      phone: '08045550003',
      children: ['STU-2025-003', 'STU-2025-006']
    }
  ];

  for (const p of parents) {
    await query(
      `INSERT INTO users (email, password_hash, role_id, is_active, must_change_password)
       VALUES (:email, :hash, :role_id, 1, 0)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      { email: p.email, hash: defaultHash, role_id: parentRole.id }
    );
    const [user] = await query(`SELECT id FROM users WHERE email = :email LIMIT 1`, { email: p.email });

    await query(
      `INSERT INTO parents (user_id, first_name, last_name, phone, relationship)
       VALUES (:user_id, :first_name, :last_name, :phone, 'Parent')
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name)`,
      {
        user_id: user.id,
        first_name: p.first,
        last_name: p.last,
        phone: p.phone
      }
    );
    const [parent] = await query(`SELECT id FROM parents WHERE user_id = :uid LIMIT 1`, { uid: user.id });

    for (const sid of p.children) {
      const [student] = await query(`SELECT id FROM students WHERE student_id = :sid LIMIT 1`, { sid });
      if (student) {
        await query(
          `INSERT IGNORE INTO parent_students (parent_id, student_id, is_primary)
           VALUES (:pid, :stid, 1)`,
          { pid: parent.id, stid: student.id }
        );
      }
    }
  }
  console.log('  ✓ sample parents');
}

module.exports = { seed };
