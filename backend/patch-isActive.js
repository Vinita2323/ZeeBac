import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await mongoose.connection.db.collection('products').updateMany({}, { $set: { isActive: true } });
  console.log('Updated isActive flag');
  process.exit();
}).catch(console.error);
