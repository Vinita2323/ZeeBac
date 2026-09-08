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

/**
 * Upload a single file to Cloudinary and return its secure HTTPS URL.
 * Automatically cleans up the local temporary file after upload (success or failure).
 */
export const uploadFileToCloudinary = async (filePath, folder = 'general') => {
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

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `zeebac/${folder}`,
      resource_type: 'auto',
    });

    return result.secure_url;
  } catch (error) {
    logger.error(`[Cloudinary] Failed to upload ${filePath}: ${error.message}`);
    throw error;
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

