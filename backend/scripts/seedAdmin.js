import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import AdminUser from '../src/models/AdminUser.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not set in environment or .env file');
    }

    if (mongoUri.includes('w=majority/')) {
      mongoUri = mongoUri.replace(/w=majority\/[a-zA-Z0-9_-]+/g, 'w=majority');
    }

    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully for seeding.');

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@zeebac.com').toLowerCase().trim();
    const plainPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainPassword, salt);

    // Upsert Admin
    let admin = await AdminUser.findOne({ email: adminEmail });
    if (admin) {
      admin.name = 'Super Admin';
      admin.passwordHash = passwordHash;
      admin.role = 'super_admin';
      admin.permissions = ['vendors', 'users', 'transactions', 'settings', 'payouts', 'analytics', 'support'];
      admin.isActive = true;
      await admin.save();
      console.log('Existing admin account refreshed with current credentials & permissions.');
    } else {
      admin = await AdminUser.create({
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        role: 'super_admin',
        permissions: ['vendors', 'users', 'transactions', 'settings', 'payouts', 'analytics', 'support'],
        isActive: true,
      });
      console.log('New admin account created successfully.');
    }

    console.log('==============================================');
    console.log('   ZEEBAC ADMIN CREDENTIALS');
    console.log('==============================================');
    console.log(` Email:    ${adminEmail}`);
    console.log(` Password: ${plainPassword}`);
    console.log(` Role:     ${admin.role}`);
    console.log(` Status:   Active (${admin.isActive})`);
    console.log('==============================================');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
