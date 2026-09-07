import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Pick subfolder based on fieldname
    const map = {
      profilePic:        'uploads/profiles',
      storeLogo:         'uploads/profiles',
      storeCoverImage:   'uploads/storefront',
      storeImages:       'uploads/storefront',
      aadhaarPan:        'uploads/documents',
      gstCertificate:    'uploads/documents',
      shopLicense:       'uploads/documents',
      cancelledCheque:   'uploads/documents',
      panCard:           'uploads/documents',
      additionalDoc:     'uploads/documents',
      storeImage:        'uploads/storefront',
      productImage:      'uploads/storefront',
      mediaFile:         'uploads/media',
      billImg:           'uploads/receipts',
      chatImage:         'uploads/chat',
    };
    const dest = map[file.fieldname] || 'uploads/storefront';
    // multer's diskStorage does NOT create missing directories itself — it
    // throws ENOENT on the first upload to a folder that doesn't exist yet
    // (e.g. `uploads/receipts/` before Phase 2, since nothing ever wrote to
    // it before). Ensuring it here makes every subfolder self-healing.
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Format: fieldname-timestamp.ext
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});

// Document fields may be a scanned PDF as well as a photo; every other field
// (logos, cover/gallery images, media, chat, receipts) stays image-only.
const PDF_ALLOWED_FIELDS = new Set(['aadhaarPan', 'gstCertificate', 'shopLicense', 'cancelledCheque', 'panCard', 'additionalDoc']);

const fileFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const allowed = PDF_ALLOWED_FIELDS.has(file.fieldname)
    ? [...allowedImages, 'application/pdf']
    : allowedImages;

  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error(PDF_ALLOWED_FIELDS.has(file.fieldname) ? 'Only images or PDF files are allowed' : 'Only images are allowed'), false);
};

export const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } // Max: 5MB per file
}); 
