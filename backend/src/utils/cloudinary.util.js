import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  logger.error('[Cloudinary] Missing required credentials in environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

import path from 'path';

/**
 * Normalizes any error from Cloudinary SDK into a standard Error with a descriptive message.
 */
const normalizeCloudinaryError = (error, filePath) => {
  if (!error) return new Error(`Unknown upload error for ${filePath}`);
  if (error instanceof Error && error.message) return error;
  const msg = error.message || error.error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const err = new Error(msg || `Failed to upload ${filePath}`);
  if (error.http_code) err.http_code = error.http_code;
  return err;
};

/**
 * Upload a single file to Cloudinary and return its secure HTTPS URL.
 * Supports automatic retry on network errors, intelligent resource_type selection for PDFs,
 * and guaranteed cleanup of the local temporary file.
 */
export const uploadFileToCloudinary = async (filePath, folder = 'general', options = {}) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials are not configured in environment variables');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File not found for upload: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    try { fs.unlinkSync(filePath); } catch (_) {}
    throw new Error(`Uploaded file is empty (0 bytes): ${path.basename(filePath)}`);
  }

  const isPdf = filePath.toLowerCase().endsWith('.pdf') || options.mimetype === 'application/pdf';
  let resourceType = options.resource_type || 'auto';

  const maxAttempts = 2;
  let lastError;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await cloudinary.uploader.upload(filePath, {
          folder: `zeebac/${folder}`,
          resource_type: resourceType,
          timeout: options.timeout || 60000,
        });

        return result.secure_url;
      } catch (err) {
        lastError = normalizeCloudinaryError(err, filePath);
        logger.warn(`[Cloudinary] Upload attempt ${attempt}/${maxAttempts} for ${filePath} failed: ${lastError.message}`);

        // If it failed because of PDF formatting/image rendering, retry as 'raw'
        if (isPdf && resourceType !== 'raw' && (
          lastError.message?.toLowerCase().includes('pdf') ||
          lastError.message?.toLowerCase().includes('format') ||
          lastError.http_code === 400
        )) {
          resourceType = 'raw';
          logger.info(`[Cloudinary] Retrying PDF ${filePath} as resource_type: raw`);
          continue;
        }

        if (attempt < maxAttempts) {
          // Brief pause before retry on network/timeout errors
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    logger.error(`[Cloudinary] All upload attempts failed for ${filePath}: ${lastError.message}`);
    throw lastError;
  } finally {
    // Guaranteed removal of temporary local file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.warn(`[Cloudinary] Could not remove temp file ${filePath}: ${err.message}`);
      }
    }
  }
};

export default cloudinary;

