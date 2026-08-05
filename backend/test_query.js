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
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));
    
    const userCount = await User.countDocuments();
    const vendorCount = await Vendor.countDocuments();
    
    console.log(`User Count: ${userCount}`);
    console.log(`Vendor Count: ${vendorCount}`);
    
    if (userCount > 0) {
      const users = await User.find({}).limit(5).lean();
      console.log("\nUsers:");
      users.forEach(u => console.log(`Name: ${u.name}, Phone: ${u.phone}`));
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
