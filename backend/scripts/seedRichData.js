import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Force DNS resolution for mongodb+srv
dns.setServers(['1.1.1.1', '8.8.8.8']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const baseUri = process.env.MONGODB_URI;

const richVendors = [
  {
    zeebacId: 'ZBV-1001',
    storeName: 'Sharma Electronics & Mobiles',
    ownerName: 'Rajesh Sharma',
    phone: '9826011111',
    email: 'sharma.electronics@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 8,
    category: 'Electronics',
    shopType: 'Independent Store',
    description: 'Premier destination for latest smartphones, laptops, smart TVs, accessories, and instant repair services in Indore.',
    operatingHours: 'Open Daily: 10:00 AM - 09:30 PM',
    storeLogo: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: 'Shop 14, MG Road Electronics Market',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    stats: { avgRating: 4.8, totalReviews: 142, totalTransactions: 380 },
    socialLinks: { instagram: '@sharma_electronics_indore', website: 'sharmaelectronics.in', whatsapp: '919826011111' },
    location: { type: 'Point', coordinates: [75.8577, 22.7196] }
  },
  {
    zeebacId: 'ZBV-1002',
    storeName: 'FreshBites Organic Cafe & Bakery',
    ownerName: 'Ananya Verma',
    phone: '9826022222',
    email: 'freshbites@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 10,
    category: 'Bakery & Cafe',
    shopType: 'Independent Store',
    description: 'Artisanal sourdough breads, organic coffee beans, vegan pastries, and cozy rooftop seating.',
    operatingHours: 'Open Daily: 08:00 AM - 10:30 PM',
    storeLogo: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '102 Vijay Nagar Square, Opposite C21 Mall',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452010'
    },
    stats: { avgRating: 4.9, totalReviews: 215, totalTransactions: 520 },
    socialLinks: { instagram: '@freshbites_cafe', website: 'freshbites.in', whatsapp: '919826022222' },
    location: { type: 'Point', coordinates: [75.8900, 22.7500] }
  },
  {
    zeebacId: 'ZBV-1003',
    storeName: 'Royal Threads Fashion Boutique',
    ownerName: 'Vikram Malhotra',
    phone: '9826033333',
    email: 'royalthreads@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 12,
    category: 'Fashion & Apparel',
    shopType: 'Boutique',
    description: 'Designer ethnic wear, bridal lehengas, custom suits, and premium Western fashion collection.',
    operatingHours: 'Open Tue-Sun: 11:00 AM - 09:00 PM',
    storeLogo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '45 Palasia Main Road, Near Saket Circle',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    stats: { avgRating: 4.7, totalReviews: 98, totalTransactions: 240 },
    socialLinks: { instagram: '@royalthreads_fashion', website: 'royalthreads.com' },
    location: { type: 'Point', coordinates: [75.8820, 22.7280] }
  },
  {
    zeebacId: 'ZBV-1004',
    storeName: 'Apex Fitness & Gym Supplements',
    ownerName: 'Karan Singh',
    phone: '9826044444',
    email: 'apexfitness@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 15,
    category: 'Health & Fitness',
    shopType: 'Independent Store',
    description: '100% authentic Whey Proteins, Creatine, Pre-workouts, dumbbells, and fitness gear with expert consultation.',
    operatingHours: 'Open Daily: 06:00 AM - 10:00 PM',
    storeLogo: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '88 AB Road, Near Geeta Bhawan',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    stats: { avgRating: 4.9, totalReviews: 180, totalTransactions: 410 },
    socialLinks: { instagram: '@apexfitness_indore', whatsapp: '919826044444' },
    location: { type: 'Point', coordinates: [75.8750, 22.7200] }
  },
  {
    zeebacId: 'ZBV-1005',
    storeName: 'Shree Ji Supermart & Grocery',
    ownerName: 'Mahesh Gupta',
    phone: '9826055555',
    email: 'shreeji.supermart@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 5,
    category: 'Supermarket',
    shopType: 'Supermarket',
    description: 'Your neighborhood family supermarket for daily groceries, fresh dairy, personal care, and household essentials.',
    operatingHours: 'Open Daily: 07:30 AM - 10:00 PM',
    storeLogo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '12 Annapurna Road, Near Temple',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452009'
    },
    stats: { avgRating: 4.6, totalReviews: 310, totalTransactions: 890 },
    socialLinks: { whatsapp: '919826055555' },
    location: { type: 'Point', coordinates: [75.8400, 22.7000] }
  },
  {
    zeebacId: 'ZBV-1006',
    storeName: 'Glamour Looks Beauty Salon & Spa',
    ownerName: 'Pooja Joshi',
    phone: '9826066666',
    email: 'glamourlooks@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 10,
    category: 'Beauty & Wellness',
    shopType: 'Salon',
    description: 'Luxury haircuts, hair spa, skin treatments, bridal makeup, and relaxing body massage therapy.',
    operatingHours: 'Open Mon-Sun: 10:00 AM - 08:30 PM',
    storeLogo: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '301 Race Course Road',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452003'
    },
    stats: { avgRating: 4.8, totalReviews: 165, totalTransactions: 310 },
    socialLinks: { instagram: '@glamourlooks_spa' },
    location: { type: 'Point', coordinates: [75.8700, 22.7250] }
  },
  {
    zeebacId: 'ZBV-1007',
    storeName: 'Urban Bites Multi-Cuisine Restaurant',
    ownerName: 'Aman Deep',
    phone: '9826077777',
    email: 'urbanbites@test.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 7,
    category: 'Food & Dining',
    shopType: 'Restaurant',
    description: 'Authentic North Indian, Chinese, Italian pizzas, and refreshing mocktails in a vibrant fine-dining ambience.',
    operatingHours: 'Open Daily: 11:30 AM - 11:30 PM',
    storeLogo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80',
    address: {
      fullAddress: '56 Food Street, Chappan Dukan Zone',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    stats: { avgRating: 4.9, totalReviews: 450, totalTransactions: 1200 },
    socialLinks: { instagram: '@urbanbites_indore', website: 'urbanbites.com' },
    location: { type: 'Point', coordinates: [75.8780, 22.7230] }
  }
];

async function seedData() {
  await mongoose.connect(baseUri);
  console.log('Connected to MongoDB database...');
  const connection = mongoose.connection;

  const Vendor = connection.model('Vendor', new mongoose.Schema({}, { strict: false }));
  const User = connection.model('User', new mongoose.Schema({}, { strict: false }));
  const Wallet = connection.model('Wallet', new mongoose.Schema({}, { strict: false }));
  const Product = connection.model('Product', new mongoose.Schema({}, { strict: false }));

  // 1. Seed Customer User
  await User.updateOne(
    { phone: '9999999999' },
    {
      $set: {
        zeebacId: 'ZBC-1234',
        name: 'Rahul Sharma',
        phone: '9999999999',
        email: 'rahul.test@gmail.com',
        role: 'customer',
        status: 'Active',
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  const customerUser = await User.findOne({ phone: '9999999999' });
  await Wallet.updateOne(
    { ownerId: customerUser._id, ownerType: 'User' },
    { $set: { balance: 1250, totalEarned: 1500, ownerZeebacId: 'ZBC-1234' } },
    { upsert: true }
  );

  // 2. Seed 7 Real Verified Vendors
  for (const vData of richVendors) {
    const res = await Vendor.findOneAndUpdate(
      { zeebacId: vData.zeebacId },
      { $set: { ...vData, updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    // Create Wallet for Vendor with ₹25,000 balance
    await Wallet.updateOne(
      { ownerId: res._id, ownerType: 'Vendor' },
      { $set: { balance: 25000, totalEarned: 50000, ownerZeebacId: vData.zeebacId } },
      { upsert: true }
    );

    // Seed 2 Sample Products per Vendor
    await Product.deleteMany({ vendorId: res._id });
    await Product.create([
      {
        vendorId: res._id,
        name: `${vData.storeName.split(' ')[0]} Special Item 1`,
        description: 'Bestselling item with maximum cashback benefits',
        price: 499,
        category: vData.category,
        image: vData.storeLogo,
        isHighlight: true,
        inStock: true
      },
      {
        vendorId: res._id,
        name: `${vData.storeName.split(' ')[0]} Premium Offer Pack`,
        description: 'Exclusive bundle pack for Zeebac members',
        price: 999,
        category: vData.category,
        image: vData.storeLogo,
        isHighlight: false,
        inStock: true
      }
    ]);
  }

  console.log(`Successfully seeded 7 realistic Verified Vendors with Wallets, Products & Stats!`);
  await connection.close();
  process.exit(0);
}

seedData().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
