import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from './src/models/Vendor.js';

dotenv.config();

const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zeebac';

async function patchLocation() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // 1. Sync indexes to create the 2dsphere index
    console.log('Syncing indexes for Vendor collection...');
    await Vendor.syncIndexes();
    console.log('Indexes synced successfully.');

    // 2. Backfill missing location data for vendors
    // Default coordinates: Indore center [75.8577, 22.7196] (Longitude, Latitude)
    const defaultLng = 75.8577;
    const defaultLat = 22.7196;

    console.log('Looking for vendors missing location data...');
    const vendors = await Vendor.find({ 'location.coordinates': { $exists: false } });
    
    console.log(`Found ${vendors.length} vendors missing location data.`);

    for (const vendor of vendors) {
      vendor.location = {
        type: 'Point',
        coordinates: [defaultLng, defaultLat]
      };
      await vendor.save();
      console.log(`Updated vendor ${vendor.storeName} with default Indore location.`);
    }
    
    // Also check for empty arrays
    const emptyVendors = await Vendor.find({ 'location.coordinates': { $size: 0 } });
    console.log(`Found ${emptyVendors.length} vendors with empty location array.`);
    for (const vendor of emptyVendors) {
      vendor.location = {
        type: 'Point',
        coordinates: [defaultLng, defaultLat]
      };
      await vendor.save();
      console.log(`Updated vendor ${vendor.storeName} with default Indore location.`);
    }

    console.log('\n--- Patch completed successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Error during patch:', error);
    process.exit(1);
  }
}

patchLocation();
