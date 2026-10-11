'use strict';

const path = require('path');
const multer = require('multer');
const cloudinaryConfig = require('../config/cloudinary');

const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_DOC_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx']);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MAX_FILE_SIZE = (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

// Memory storage — files go to Cloudinary, not disk
const memoryStorage = multer.memoryStorage();

function makeFilter(allowedMime, allowedExt) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedMime.has(file.mimetype) || !allowedExt.has(ext)) {
      return cb(new Error(`Invalid file type: ${file.originalname}`));
    }
    cb(null, true);
  };
}

const admissionUpload = multer({
  storage: memoryStorage,
  fileFilter: makeFilter(ALLOWED_DOC_MIME, ALLOWED_DOC_EXT),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 }
});

const passportUpload = multer({
  storage: memoryStorage,
  fileFilter: makeFilter(ALLOWED_IMAGE_MIME, ALLOWED_IMAGE_EXT),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

/**
 * After multer, upload req.file / req.files to Cloudinary.
 * Attaches cloudinary result onto each file as file.cloudinary = { url, publicId }
 */
function uploadToCloudinary(subfolder) {
  return async (req, res, next) => {
    try {
      if (!cloudinaryConfig.isConfigured()) {
        return next(
          new Error(
            'File uploads require Cloudinary. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.'
          )
        );
      }

      const files = [];
      if (req.file) files.push(req.file);
      if (req.files) {
        if (Array.isArray(req.files)) files.push(...req.files);
        else Object.values(req.files).forEach((arr) => files.push(...arr));
      }

      for (const file of files) {
        const isImage = ALLOWED_IMAGE_MIME.has(file.mimetype);
        const result = isImage && subfolder === 'passports'
          ? await cloudinaryConfig.uploadPassport(file.buffer, subfolder)
          : await cloudinaryConfig.uploadBuffer(file.buffer, {
              subfolder,
              resourceType: isImage ? 'image' : 'auto'
            });
        file.cloudinary = result;
        file.cloudinaryUrl = result.url;
        file.cloudinaryPublicId = result.publicId;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  admissionUpload,
  passportUpload,
  uploadToCloudinary,
  ALLOWED_DOC_MIME,
  ALLOWED_IMAGE_MIME,
  MAX_FILE_SIZE
};
