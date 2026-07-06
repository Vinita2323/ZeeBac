import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await mongoose.connection.db.collection('vendors').updateOne(
    { storeName: 'Noir Concept Store' }, 
    { $set: { profilePic: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=800&q=80' } }
  );
  console.log('Updated logo for Noir Concept Store');
  process.exit();
}).catch(console.error);
