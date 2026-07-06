import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const vendor = await db.collection('vendors').findOne({ storeName: 'Noir Concept Store' });
  
  if (vendor) {
    await db.collection('products').deleteMany({ vendorId: vendor._id });
    await db.collection('products').insertMany([
      {
        vendorId: vendor._id,
        name: "Noir Signature Dress",
        description: "Elegant signature dress for evening parties.",
        price: 2499,
        category: "Clothing",
        inStock: true,
        image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=300&q=80",
        isHighlight: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        vendorId: vendor._id,
        name: "Classic Leather Tote",
        description: "Premium leather tote bag.",
        price: 3999,
        category: "Accessories",
        inStock: true,
        image: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=300&q=80",
        isHighlight: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        vendorId: vendor._id,
        name: "Silk Scarf",
        description: "100% pure silk scarf.",
        price: 999,
        category: "Accessories",
        inStock: true,
        image: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=300&q=80",
        isHighlight: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('Inserted highlight products for Noir Concept Store');
  }
  process.exit();
}).catch(console.error);
