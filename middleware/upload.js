'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { generateSecureToken } = require('../utils/crypto');

const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIRECTORY || path.join(__dirname, '..', 'public', 'uploads')
);

const ADMISSION_DIR = path.join(UPLOAD_ROOT, 'admissions');

// Ensure directories exist
for (const dir of [UPLOAD_ROOT, ADMISSION_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx']);

const MAX_FILE_SIZE = (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, ADMISSION_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '';
    // Never trust user-supplied filename
    const name = `adm_${Date.now()}_${generateSecureToken(8)}${safeExt}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    return cb(new Error('Invalid file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX.'));
  }
  cb(null, true);
}

const admissionUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5
  }
});

module.exports = {
  admissionUpload,
  ADMISSION_DIR,
  UPLOAD_ROOT,
  ALLOWED_MIME,
  MAX_FILE_SIZE
};
