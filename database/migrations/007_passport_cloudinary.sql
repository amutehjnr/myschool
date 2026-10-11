-- Passport / photo URL fields (Cloudinary secure URLs stored here)
SET NAMES utf8mb4;

-- students.photo_path already exists in 001 — ensure length for full Cloudinary URLs
ALTER TABLE students
  MODIFY COLUMN photo_path VARCHAR(512) NULL;

ALTER TABLE teachers
  MODIFY COLUMN photo_path VARCHAR(512) NULL;

-- Optional public_id for Cloudinary cleanup
-- Use information_schema-safe pattern: ignore if column exists via procedure-free approach
-- MySQL 8: ADD COLUMN IF NOT EXISTS not always available — try and ignore in runner

ALTER TABLE students
  ADD COLUMN photo_public_id VARCHAR(255) NULL AFTER photo_path;

ALTER TABLE teachers
  ADD COLUMN photo_public_id VARCHAR(255) NULL AFTER photo_path;
