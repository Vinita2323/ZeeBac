import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const baseUri = process.env.MONGODB_URI;

async function checkDb(dbUri, dbName) {
  const connection = await mongoose.createConnection(dbUri).asPromise();
  const Vendor = connection.model('Vendor', new mongoose.Schema({}, { strict: false }));
  
  const vendor = await Vendor.findOne({ phone: "8888888888" }).lean();
  console.log(`\n--- DB: ${dbName} ---`);
  if (vendor) {
    console.log(`FOUND VENDOR: ${vendor.storeName} with phone ${vendor.phone}`);
  } else {
    console.log(`NO VENDOR FOUND with phone 8888888888`);
  }
  await connection.close();
}

async function run() {
  await checkDb(baseUri, 'default (test)');
  const zeebacUri = baseUri.replace('.mongodb.net/?', '.mongodb.net/zeebac?');
  if (zeebacUri !== baseUri) {
    await checkDb(zeebacUri, 'zeebac');
  }
  process.exit(0);
}
run();
