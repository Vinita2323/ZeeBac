import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Mongoose sessions (session.withTransaction) require a real replica set —
// a standalone mongod doesn't support multi-document transactions, so a
// single-node replica set is the minimum needed to test the atomicity fixes
// the same way they'll actually run in production (MongoDB Atlas is always
// a replica set).
let replset;

export const connectTestDb = async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
};

export const disconnectTestDb = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (replset) await replset.stop();
};

export const clearCollections = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};
