-- PSHA — Online Admissions
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS admissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_number VARCHAR(30) NOT NULL UNIQUE,
  status ENUM('draft','submitted','under_review','additional_info_required','approved','rejected') NOT NULL DEFAULT 'draft',
  applicant_first_name VARCHAR(100) NOT NULL,
  applicant_last_name VARCHAR(100) NOT NULL,
  applicant_middle_name VARCHAR(100) NULL,
  date_of_birth DATE NULL,
  gender ENUM('male','female','other') NULL,
  applying_for_class VARCHAR(50) NULL,
  academic_session_id INT UNSIGNED NULL,
  parent_first_name VARCHAR(100) NULL,
  parent_last_name VARCHAR(100) NULL,
  parent_email VARCHAR(255) NULL,
  parent_phone VARCHAR(30) NULL,
  parent_relationship VARCHAR(50) NULL,
  address TEXT NULL,
  previous_school VARCHAR(255) NULL,
  notes TEXT NULL,
  admin_notes TEXT NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admissions_status (status),
  INDEX idx_admissions_ref (reference_number),
  CONSTRAINT fk_adm_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_adm_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admission_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admission_id INT UNSIGNED NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ad_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE,
  INDEX idx_ad_admission (admission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
