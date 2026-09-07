import dns from 'dns';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Node's c-ares resolver sometimes gets ECONNREFUSED on the SRV lookup
// mongodb+srv:// needs, even when the OS resolver (nslookup, etc.) works
// fine, because the network's DHCP-assigned DNS server doesn't answer SRV
// queries the way Node expects. Point Node at public resolvers that do.
dns.setServers(['1.1.1.1', '8.8.8.8']);

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};
