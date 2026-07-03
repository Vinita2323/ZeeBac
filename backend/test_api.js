import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
  .then(async () => {
    const userSchema = new mongoose.Schema({}, { strict: false });
    const Vendor = mongoose.model('Vendor', userSchema, 'vendors');
    const vendor = await Vendor.findOne({ phone: /999/ });
    
    // Generate token manually
    const accessToken = jwt.sign(
      { id: vendor._id, role: 'vendor', zeebacId: vendor.zeebacId },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY }
    );

    console.log("Fetching customer 9999999999 with token...");
    try {
      const custRes = await axios.get('http://localhost:5000/api/vendor/customers/9999999999', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      console.log("Customer Res:", custRes.data);
    } catch (err) {
      console.error("API ERROR:", err.response ? err.response.data : err.message);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
