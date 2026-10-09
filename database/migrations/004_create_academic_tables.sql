-- PSHA — Academic management, assignments, scores, results
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Timetables
CREATE TABLE IF NOT EXISTS timetables (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NULL,
  day_of_week TINYINT UNSIGNED NOT NULL, -- 1=Mon .. 5=Fri
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50) NULL,
  academic_session_id INT UNSIGNED NULL,
  term_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tt_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_tt_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_tt_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL,
  INDEX idx_tt_class_day (class_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  due_date DATETIME NULL,
  max_score DECIMAL(6,2) NULL DEFAULT 100.00,
  academic_session_id INT UNSIGNED NULL,
  term_id INT UNSIGNED NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asg_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_asg_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_asg_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_asg_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_asg_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  submitted_at TIMESTAMP NULL,
  score DECIMAL(6,2) NULL,
  feedback TEXT NULL,
  status ENUM('pending','submitted','graded','late') NOT NULL DEFAULT 'pending',
  file_path VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submission (assignment_id, student_id),
  CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assessments (tests, exams, CA)
CREATE TABLE IF NOT EXISTS assessments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  assessment_type ENUM('ca','test','exam','assignment') NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NULL,
  max_score DECIMAL(6,2) NOT NULL DEFAULT 100.00,
  weight DECIMAL(5,2) NULL, -- percentage contribution
  academic_session_id INT UNSIGNED NULL,
  term_id INT UNSIGNED NULL,
  assessment_date DATE NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assess_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_assess_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_assess_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_assess_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_assess_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_scores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  score DECIMAL(6,2) NULL,
  teacher_comment VARCHAR(500) NULL,
  entered_by INT UNSIGNED NULL,
  entered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_score (assessment_id, student_id),
  CONSTRAINT fk_score_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_score_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_score_entered_by FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grading systems
CREATE TABLE IF NOT EXISTS grading_systems (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grade_boundaries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grading_system_id INT UNSIGNED NOT NULL,
  grade_label VARCHAR(10) NOT NULL, -- A, B, C...
  min_score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  remark VARCHAR(100) NULL,
  CONSTRAINT fk_gb_system FOREIGN KEY (grading_system_id) REFERENCES grading_systems(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Results (term results per student/subject or overall)
CREATE TABLE IF NOT EXISTS results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NULL, -- NULL for overall term result
  academic_session_id INT UNSIGNED NOT NULL,
  term_id INT UNSIGNED NOT NULL,
  total_score DECIMAL(6,2) NULL,
  grade VARCHAR(10) NULL,
  position INT UNSIGNED NULL,
  teacher_comment TEXT NULL,
  principal_comment TEXT NULL,
  status ENUM('draft','submitted','approved','published') NOT NULL DEFAULT 'draft',
  approved_by INT UNSIGNED NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_results_student_term (student_id, term_id),
  INDEX idx_results_status (status),
  CONSTRAINT fk_res_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_res_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_res_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id),
  CONSTRAINT fk_res_term FOREIGN KEY (term_id) REFERENCES terms(id),
  CONSTRAINT fk_res_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS result_components (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  result_id INT UNSIGNED NOT NULL,
  component_name VARCHAR(80) NOT NULL, -- CA, Test, Exam
  score DECIMAL(6,2) NULL,
  max_score DECIMAL(6,2) NULL,
  weight DECIMAL(5,2) NULL,
  CONSTRAINT fk_rc_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
