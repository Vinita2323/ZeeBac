import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const baseUri = process.env.MONGODB_URI;

// Function to seed a specific database
async function seedDatabase(dbUri, dbName) {
  const connection = await mongoose.createConnection(dbUri).asPromise();
  console.log(`Connected to database: ${dbName}`);
  
  const User = connection.model('User', new mongoose.Schema({}, { strict: false }));
  const Vendor = connection.model('Vendor', new mongoose.Schema({}, { strict: false }));
  
  // Seed User
  await User.updateOne(
    { phone: "9999999999" },
    {
      $set: {
        zeebacId: "ZBC-1234",
        name: "Test User",
        phone: "9999999999",
        email: "user@test.com",
        role: "customer",
        status: "Active",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  // Seed Vendor
  await Vendor.updateOne(
    { phone: "8888888888" },
    {
      $set: {
        zeebacId: "ZBV-5678",
        storeName: "Test Vendor Store",
        ownerName: "Test Vendor",
        phone: "8888888888",
        email: "vendor@test.com",
        role: "vendor",
        status: "Verified",
        shopType: "Independent Store",
        category: "Electronics",
        address: {
          fullAddress: "123 Test St",
          city: "Test City",
          state: "Test State",
          pincode: "123456"
        },
        bankDetails: {
          accountHolderName: "Test Vendor",
          bankName: "Test Bank",
          accountNumber: "1234567890",
          ifscCode: "TEST0001234"
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
  
  console.log(`Seeded accounts in ${dbName}`);
  await connection.close();
}

async function run() {
  try {
    // Seed default DB (usually 'test')
    await seedDatabase(baseUri, 'default (test)');
    
    // Seed 'zeebac' DB
    // Insert 'zeebac' into the connection string before the query parameters
    const zeebacUri = baseUri.replace('.mongodb.net/?', '.mongodb.net/zeebac?');
    if (zeebacUri !== baseUri) {
       await seedDatabase(zeebacUri, 'zeebac');
    }
    
    console.log("All seeding complete.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
