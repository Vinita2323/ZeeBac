/**
 * Firebase Admin Config
 * 
 * SETUP REQUIRED:
 * 1. Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate new private key"
 * 3. Save the downloaded JSON as: backend/src/config/serviceAccountKey.json
 * 4. Add to .gitignore: serviceAccountKey.json
 * 
 * Alternatively on Render / cloud environments:
 * Provide the JSON content or Base64 string in the FIREBASE_SERVICE_ACCOUNT env var.
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

/**
 * Safely parse raw service account string or object.
 * Handles escaped newlines, Base64 strings, and surrounding quotes.
 * Never logs credentials or private keys.
 */
function parseServiceAccount(rawInput) {
  if (!rawInput) return null;
  if (typeof rawInput === 'object') return rawInput;

  let raw = String(rawInput).trim();
  if (!raw) return null;

  // 1. Strip surrounding quotes (common artifact of .env or deployment dashboards)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }

  // 2. Decode Base64 if not directly JSON
  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        raw = decoded;
      }
    } catch (_) {
      // Continue with raw string
    }
  }

  // 3. Attempt JSON parse
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Attempt parsing after replacing literal unescaped control newlines
    try {
      const sanitized = raw.replace(/\r?\n/g, '\\n');
      parsed = JSON.parse(sanitized);
    } catch (_) {
      throw err;
    }
  }

  return parsed;
}

/**
 * Normalize service account properties (e.g. PEM private_key line breaks).
 */
function normalizeServiceAccount(account) {
  if (!account || typeof account !== 'object') return null;

  const normalized = { ...account };

  // Fix escaped newlines in PEM private key
  if (typeof normalized.private_key === 'string') {
    normalized.private_key = normalized.private_key.replace(/\\n/g, '\n');
  }

  return normalized;
}

try {
  let serviceAccount = null;

  // 1. Check direct serviceAccountKey.json file first (most reliable, no dotenv escaping issues)
  if (existsSync(serviceAccountPath)) {
    try {
      const fileContent = readFileSync(serviceAccountPath, 'utf8');
      serviceAccount = normalizeServiceAccount(JSON.parse(fileContent));
      logger.info('Loaded Firebase service account from serviceAccountKey.json');
    } catch (fErr) {
      logger.warn(`Failed reading serviceAccountKey.json: ${fErr.message}`);
    }
  }

  // 2. Fall back to FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64 env
  const envRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!serviceAccount && envRaw) {
    try {
      const parsed = parseServiceAccount(envRaw);
      serviceAccount = normalizeServiceAccount(parsed);
      logger.info('Loaded Firebase service account from environment variable');
    } catch (envErr) {
      logger.warn(`Failed parsing FIREBASE_SERVICE_ACCOUNT env: ${envErr.message}`);
    }
  }

  if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key && serviceAccount.client_email) {
    initializeApp({
      credential: cert(serviceAccount),
    });
    firebaseInitialized = true;
    logger.info(`Firebase Admin initialized successfully for project: ${serviceAccount.project_id}`);
  } else if (serviceAccount) {
    logger.warn('Firebase Admin: Service account object is missing required fields (project_id, private_key, or client_email). Push notifications will be disabled.');
  } else {
    logger.warn('Firebase Admin: serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT env not found. Push notifications will be disabled.');
  }
} catch (error) {
  logger.error(`Firebase Admin init error: ${error.message}`);
}

export { firebaseInitialized };
