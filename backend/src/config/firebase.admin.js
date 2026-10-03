/**
 * Firebase Admin Config
 * 
 * SETUP REQUIRED:
 * 1. Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate new private key"
 * 3. Save the downloaded JSON as: backend/src/config/serviceAccountKey.json
 * 4. Add to .gitignore: serviceAccountKey.json
 */


import 'dotenv/config';
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

  // 1. Check direct serviceAccountKey.json file first (most reliable, no dotenv escaping issues)
  if (existsSync(serviceAccountPath)) {
    try {
      serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      logger.info('Loaded Firebase service account from serviceAccountKey.json');
    } catch (fErr) {
      logger.warn(`Failed reading serviceAccountKey.json: ${fErr.message}`);
    }
  }

  // 2. Fall back to FIREBASE_SERVICE_ACCOUNT environment variable if file not used
  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
      logger.info('Loaded Firebase service account from FIREBASE_SERVICE_ACCOUNT env');
    } catch (envErr) {
      logger.warn(`Failed parsing FIREBASE_SERVICE_ACCOUNT env: ${envErr.message}`);
    }
  }

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
    });
    firebaseInitialized = true;
    logger.info(`Firebase Admin initialized successfully for project: ${serviceAccount.project_id}`);
  } else {
    logger.warn('Firebase Admin: serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT env not found. Push notifications will be disabled.');
  }
} catch (error) {
  logger.error(`Firebase Admin init error: ${error.message}`);
}

export { firebaseInitialized };
