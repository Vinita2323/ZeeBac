import { describe, it, expect } from 'vitest';
import { uploadFileToCloudinary } from './cloudinary.util.js';

describe('cloudinary.util', () => {
  it('throws error when uploadFileToCloudinary is called without credentials', async () => {
    const origCloud = process.env.CLOUDINARY_CLOUD_NAME;
    const origKey = process.env.CLOUDINARY_API_KEY;
    const origSec = process.env.CLOUDINARY_API_SECRET;

    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    try {
      await expect(uploadFileToCloudinary('dummy.jpg')).rejects.toThrow(
        'Cloudinary credentials are not configured in environment variables'
      );
    } finally {
      process.env.CLOUDINARY_CLOUD_NAME = origCloud;
      process.env.CLOUDINARY_API_KEY = origKey;
      process.env.CLOUDINARY_API_SECRET = origSec;
    }
  });
});
