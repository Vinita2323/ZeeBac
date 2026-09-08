import dns from 'dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import AdminUser from '../models/AdminUser.js';

dotenv.config();

// Ensure Node.js uses reliable public DNS resolvers for MongoDB Atlas SRV lookup
dns.setServers(['8.8.8.8', '1.1.1.1']);

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables.');
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);

    const email = 'admin@zeebac.com';
    const password = 'adminpassword123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const permissions = ['vendors', 'users', 'transactions', 'settings', 'payouts', 'analytics', 'rules', 'rewards'];

    let admin = await AdminUser.findOne({ email });
    if (admin) {
      admin.passwordHash = passwordHash;
      admin.role = 'super_admin';
      admin.permissions = permissions;
      admin.isActive = true;
      await admin.save();
      console.log(`✅ Existing Admin account updated: ${email}`);
    } else {
      admin = await AdminUser.create({
        name: 'Zeebac Super Admin',
        email,
        passwordHash,
        role: 'super_admin',
        permissions,
        isActive: true,
      });
      console.log(`✅ New Super Admin account created: ${email}`);
    }

    console.log('\n=========================================');
    console.log('🔑 SUPER ADMIN CREATED / UPDATED SUCCESS');
    console.log('=========================================');
    console.log(`Email:    ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     super_admin`);
    console.log('=========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding Admin user:', error.message);
    process.exit(1);
  }
};

seedAdmin();
