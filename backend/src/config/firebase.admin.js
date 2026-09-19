/**
 * Firebase Admin Config
 * 
 * SETUP REQUIRED:
 * 1. Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate new private key"
 * 3. Save the downloaded JSON as: backend/src/config/serviceAccountKey.json
 * 4. Add to .gitignore: serviceAccountKey.json
 */


import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import { initializeApp, cert } from 'firebase-admin/app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');

let firebaseInitialized = false;

try {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : process.env.FIREBASE_SERVICE_ACCOUNT;
  } else if (existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  }

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized successfully');
  } else {
    logger.warn('Firebase Admin: serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT env not found. Push notifications will be disabled.');
    logger.warn('Provide FIREBASE_SERVICE_ACCOUNT in .env or download serviceAccountKey.json from Firebase Console.');
  }
} catch (error) {
  logger.error(`Firebase Admin init error: ${error.message}`);
}

export { firebaseInitialized };
