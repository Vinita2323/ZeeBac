import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadFileToCloudinary } from '../utils/cloudinary.util.js';

// Disk storage for temporary file handling before uploading to Cloudinary
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = 'uploads/temp';
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});

// Document fields may be a scanned PDF as well as a photo; every other field stays image-only.
const PDF_ALLOWED_FIELDS = new Set([
  'aadhaarPan', 'gstCertificate', 'shopLicense', 
  'cancelledCheque', 'panCard', 'additionalDoc'
]);

const fileFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const allowed = PDF_ALLOWED_FIELDS.has(file.fieldname)
    ? [...allowedImages, 'application/pdf']
    : allowedImages;

  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error(PDF_ALLOWED_FIELDS.has(file.fieldname) ? 'Only images or PDF files are allowed' : 'Only images are allowed'), false);
};

const rawUpload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 10 * 1024 * 1024 } // Max: 10MB per file
});

const FOLDER_MAP = {
  profilePic: 'profiles',
  storeLogo: 'profiles',
  avatar: 'profiles',
  profileImage: 'profiles',
  storeCoverImage: 'storefront',
  storeImages: 'storefront',
  billImg: 'receipts',
  chatImage: 'chat',
  mediaFile: 'media',
  image: 'products',
  brandLogo: 'products',
  aadhaarPan: 'documents',
  gstCertificate: 'documents',
  shopLicense: 'documents',
  cancelledCheque: 'documents',
  panCard: 'documents',
  additionalDoc: 'documents',
};

const cleanupLocalFiles = (req) => {
  try {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    if (req.files) {
      const list = Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat();
      for (const f of list) {
        if (f?.path && fs.existsSync(f.path)) {
          try { fs.unlinkSync(f.path); } catch (_) {}
        }
      }
    }
  } catch (_) {}
};

/**
 * Middleware that seamlessly uploads all Multer-processed files to Cloudinary CDN
 */
export const uploadToCloudinaryMiddleware = async (req, res, next) => {
  try {
    if (req.file) {
      const folder = FOLDER_MAP[req.file.fieldname] || 'general';
      const cloudinaryUrl = await uploadFileToCloudinary(req.file.path, folder);

      req.file.filename = cloudinaryUrl;
      req.file.path = cloudinaryUrl;
      req.file.url = cloudinaryUrl;
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        for (const fileObj of req.files) {
          const folder = FOLDER_MAP[fileObj.fieldname] || 'general';
          const cloudinaryUrl = await uploadFileToCloudinary(fileObj.path, folder);
          fileObj.filename = cloudinaryUrl;
          fileObj.path = cloudinaryUrl;
          fileObj.url = cloudinaryUrl;
        }
      } else if (typeof req.files === 'object') {
        for (const fieldName of Object.keys(req.files)) {
          const fileList = req.files[fieldName];
          const folder = FOLDER_MAP[fieldName] || 'general';

          for (const fileObj of fileList) {
            const cloudinaryUrl = await uploadFileToCloudinary(fileObj.path, folder);
            fileObj.filename = cloudinaryUrl;
            fileObj.path = cloudinaryUrl;
            fileObj.url = cloudinaryUrl;
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error('[Multer-Cloudinary] Middleware Upload Error:', error.message);
    cleanupLocalFiles(req);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to upload asset to Cloudinary', 
      error: error.message 
    });
  }
};

/**
 * Universal upload object exposing Express middleware arrays compatible with all routes
 */
export const upload = {
  single: (fieldName) => [rawUpload.single(fieldName), uploadToCloudinaryMiddleware],
  array: (fieldName, maxCount) => [rawUpload.array(fieldName, maxCount), uploadToCloudinaryMiddleware],
  fields: (fieldsArray) => [rawUpload.fields(fieldsArray), uploadToCloudinaryMiddleware],
  any: () => [rawUpload.any(), uploadToCloudinaryMiddleware],
};
