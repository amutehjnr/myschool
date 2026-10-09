'use strict';

const userRepo = require('../repositories/user.repository');
const teacherRepo = require('../repositories/teacher.repository');
const studentRepo = require('../repositories/student.repository');
const { query } = require('../config/database');

async function getAdminDashboardStats() {
  const [students, teachers, parents, admissionsPending] = await Promise.all([
    studentRepo.countActive(),
    teacherRepo.countActive(),
    userRepo.countByRole('parent'),
    query(
      `SELECT COUNT(*) AS total FROM admissions WHERE status IN ('submitted','under_review','additional_info_required')`
    ).then((r) => r[0]?.total || 0)
  ]);

  return {
    students,
    teachers,
    parents,
    admissions: admissionsPending
  };
}

module.exports = {
  getAdminDashboardStats
};
