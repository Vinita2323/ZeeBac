import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
  .then(async () => {
    // 1. Get the Vendor Model
    const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));
    
    // 2. Query vendor
    const vendor = await Vendor.findOne({ phone: "9999999991" });
    
    console.log("EXACT QUERY RESULT:", JSON.stringify(vendor, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
