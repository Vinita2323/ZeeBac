import dns from 'dns';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Node's c-ares resolver sometimes gets ECONNREFUSED or ETIMEOUT on SRV lookups
// when querying local or certain public DNS servers (like 1.1.1.1 on some networks/ISPs).
// Point Node at reliable public resolvers, prioritizing Google DNS (8.8.8.8, 8.8.4.4).
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

export const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    // Fix invalid write concern mode caused by accidental trailing db name (e.g. w=majority/zeebac)
    if (mongoUri && mongoUri.includes('w=majority/')) {
      mongoUri = mongoUri.replace(/w=majority\/[a-zA-Z0-9_-]+/g, 'w=majority');
    }
    const conn = await mongoose.connect(mongoUri);
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};
