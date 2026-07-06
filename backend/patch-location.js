import 'dotenv/config';
import mongoose from 'mongoose';
import Vendor from './src/models/Vendor.js';

async function patchLocations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    // Update all vendors to have Indore coordinates if they don't have location
    const result = await Vendor.updateMany(
      {},
      {
        $set: {
          'location': {
            type: 'Point',
            coordinates: [75.8577, 22.7196] // [lng, lat] for Indore
          }
        }
      }
    );
    
    console.log(`Updated ${result.modifiedCount} vendors with location.`);
    
    // Also recreate index just to be sure
    await Vendor.syncIndexes();
    console.log('Synced indexes.');
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

patchLocations();
