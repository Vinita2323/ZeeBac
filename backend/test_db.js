import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log("No MongoDB URI found in .env");
  process.exit(1);
}

mongoose.connect(uri)
  .then(async () => {
    console.log("Connected to DB...");
    const userSchema = new mongoose.Schema({}, { strict: false });
    const User = mongoose.model('User', userSchema, 'users');
    
    // Find customer with phone 9999999999
    const users = await User.find({ phone: { $regex: /9999/ } });
    console.log("Found users matching 9999:", JSON.stringify(users, null, 2));
    
    // Find vendor matching 9999
    const Vendor = mongoose.model('Vendor', userSchema, 'vendors');
    const vendors = await Vendor.find({ phone: { $regex: /999/ } });
    console.log("Found vendors matching 999:", JSON.stringify(vendors.map(v => ({name: v.storeName, phone: v.phone})), null, 2));

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
