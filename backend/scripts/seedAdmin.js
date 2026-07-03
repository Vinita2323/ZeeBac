import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import AdminUser from '../src/models/AdminUser.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully for seeding.');

    const adminEmail = 'admin@zeebac.com';
    const plainPassword = 'admin123';

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin already exists. No need to seed.');
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainPassword, salt);

    // Create Admin
    const admin = await AdminUser.create({
      name: 'Super Admin',
      email: adminEmail,
      passwordHash,
      role: 'super_admin',
      permissions: ['vendors', 'users', 'transactions', 'settings'],
      isActive: true,
    });

    console.log(`Admin seeded successfully!`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${plainPassword}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
