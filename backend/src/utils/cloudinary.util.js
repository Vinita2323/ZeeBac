import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'm4u1eato',
  api_key: process.env.CLOUDINARY_API_KEY || '861613617571636',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'f-L6CtK3_I_eIRLfljjZ4azPqR8',
});

/**
 * Upload a single file to Cloudinary and return its secure HTTPS URL.
 * Automatically cleans up the local temporary file after upload.
 */
export const uploadFileToCloudinary = async (filePath, folder = 'general') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `zeebac/${folder}`,
      resource_type: 'auto',
    });

    // Remove temporary local file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`[Cloudinary] Could not remove temp file ${filePath}:`, err.message);
      }
    }

    return result.secure_url;
  } catch (error) {
    console.error(`[Cloudinary] Failed to upload ${filePath}:`, error.message);
    throw error;
  }
};

export default cloudinary;
