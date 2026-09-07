import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Vitest doesn't go through src/index.js (where dotenv normally loads), so
// anything reading process.env — JWT secrets, QR_TOKEN_SECRET — would
// otherwise be undefined during tests.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
