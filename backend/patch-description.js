import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await mongoose.connection.db.collection('vendors').updateOne(
    { storeName: 'Noir Concept Store' }, 
    { $set: { description: 'Welcome to Noir Concept Store! We offer the best luxury fashion and accessories. Our collections are exclusively curated for style enthusiasts who appreciate premium quality and design.' } }
  );
  console.log('Updated description for Noir Concept Store');
  process.exit();
}).catch(console.error);
