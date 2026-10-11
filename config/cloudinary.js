'use strict';

/**
 * Cloudinary configuration.
 * Required env:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 * Optional:
 *   CLOUDINARY_FOLDER  (default: psha)
 */
const cloudinary = require('cloudinary').v2;

const configured =
  Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(process.env.CLOUDINARY_API_KEY) &&
  Boolean(process.env.CLOUDINARY_API_SECRET);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function isConfigured() {
  return configured;
}

/**
 * Upload a buffer (from multer memoryStorage) to Cloudinary.
 * @returns {{ url: string, publicId: string, resourceType: string }}
 */
async function uploadBuffer(buffer, options = {}) {
  if (!configured) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
    );
  }

  const folder = options.folder || process.env.CLOUDINARY_FOLDER || 'psha';
  const resourceType = options.resourceType || 'auto';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${folder}/${options.subfolder || 'uploads'}`,
        resource_type: resourceType,
        overwrite: false,
        unique_filename: true,
        transformation: options.transformation || undefined
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          bytes: result.bytes,
          format: result.format
        });
      }
    );
    stream.end(buffer);
  });
}

/** Passport photo: square crop, face-aware when possible */
async function uploadPassport(buffer, subfolder = 'passports') {
  return uploadBuffer(buffer, {
    subfolder,
    resourceType: 'image',
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' }
    ]
  });
}

async function destroy(publicId) {
  if (!configured || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch {
    // non-fatal
  }
}

module.exports = {
  cloudinary,
  isConfigured,
  uploadBuffer,
  uploadPassport,
  destroy
};
