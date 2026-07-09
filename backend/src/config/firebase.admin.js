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

if (existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized successfully');
  } catch (error) {
    logger.error(`Firebase Admin init error: ${error.message}`);
  }
} else {
  logger.warn('Firebase Admin: serviceAccountKey.json not found. Push notifications will be disabled.');
  logger.warn('Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
}

export { firebaseInitialized };
