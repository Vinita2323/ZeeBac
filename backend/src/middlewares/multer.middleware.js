import multer from 'multer';
import path from 'path';

// Storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Pick subfolder based on fieldname
    const map = {
      profilePic:        'uploads/profiles',
      storeLogo:         'uploads/profiles',
      aadhaarPan:        'uploads/documents',
      gstCertificate:    'uploads/documents',
      shopLicense:       'uploads/documents',
      cancelledCheque:   'uploads/documents',
      storeImage:        'uploads/storefront',
      productImage:      'uploads/storefront',
      mediaFile:         'uploads/media',
      billImg:           'uploads/receipts',
      chatImage:         'uploads/chat',
    };
    cb(null, map[file.fieldname] || 'uploads/storefront');
  },
  filename: (req, file, cb) => {
    // Format: fieldname-timestamp.ext
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});

// File type filter — only images
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  allowed.includes(file.mimetype) 
    ? cb(null, true) 
    : cb(new Error('Only images are allowed'), false);
};

export const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } // Max: 5MB per file
}); 
