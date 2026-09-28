import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Force DNS resolution for mongodb+srv
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

let baseUri = process.env.MONGODB_URI;
if (baseUri && baseUri.includes('w=majority/')) {
  baseUri = baseUri.replace(/w=majority\/[a-zA-Z0-9_-]+/g, 'w=majority');
}

// -------------------------------------------------------------
// VENDORS DATA
// 5 Near User's Live Location (Jankipuram / Lucknow ~26.928, 80.961) + HRX
// 6 Across Indore Commercial Hubs (MG Road, Vijay Nagar, Palasia, Chappan Dukan, Annapurna, Race Course Road)
// -------------------------------------------------------------
const allVendors = [
  // ===================== NEAR USER LOCATION (LUCKNOW) =====================
  {
    zeebacId: 'ZBV-8382',
    storeName: 'HRX Lifestyle & Sportswear',
    ownerName: 'Hrithik Roshan',
    phone: '9839011111',
    email: 'hrx.jankipuram@zeebac.com',
    businessContactNumber: '9839011111',
    businessEmail: 'hrx.jankipuram@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 12,
    category: 'Fashion & Apparel',
    subCategory: 'Activewear, Athleisure & Sports Shoes',
    shopType: 'Chain & Brand',
    description: 'Flagship store offering cutting-edge fitness apparel, rapid-dry workout tees, training shoes, and activewear with high cashback rewards.',
    operatingHours: 'Open Daily: 10:00 AM - 10:00 PM',
    businessHours: { openingTime: '10:00', closingTime: '22:00', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Shop 4, Jankipuram Garden Circle, Sector F',
      landmark: 'Near Garden Circle',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226021'
    },
    location: { type: 'Point', coordinates: [80.9601233, 26.9264441] }, // ~0.3 km away
    stats: { avgRating: 4.9, totalReviews: 280, totalCustomers: 720, totalRevenue: 450000 },
    socialLinks: { instagram: '@hrxbrand_lucknow', website: 'hrxbrand.com', whatsapp: '919839011111' },
    products: [
      {
        name: 'HRX Pro-Strobe Running Shoes',
        price: 3499,
        discountPrice: 2499,
        category: 'Footwear',
        description: 'Engineered lightweight cushioned sole for marathon endurance and daily gym workouts.',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 45
      },
      {
        name: 'HRX Rapid-Dry Seamless Workout Tee',
        price: 1299,
        discountPrice: 899,
        category: 'Apparel',
        description: 'Moisture-wicking breathable fabric keeping you cool during intense training.',
        image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 80
      },
      {
        name: 'HRX All-Weather Gym Duffle Bag',
        price: 1999,
        discountPrice: 1399,
        category: 'Accessories',
        description: 'Water-resistant duffle bag with dedicated shoe compartment and padded straps.',
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 30
      }
    ]
  },
  {
    zeebacId: 'ZBV-1001',
    storeName: 'The Roastery Coffee & Bakery',
    ownerName: 'Kabir Singhania',
    phone: '9839022222',
    email: 'roastery.lucknow@zeebac.com',
    businessContactNumber: '9839022222',
    businessEmail: 'roastery.lucknow@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 10,
    category: 'Bakery & Cafe',
    subCategory: 'Specialty Coffee, Artisanal Breads & French Pastries',
    shopType: 'Independent Store',
    description: 'Freshly roasted single-origin Arabica coffees, warm sourdough bakes, French butter croissants, and cozy indoor & garden seating.',
    operatingHours: 'Open Daily: 08:00 AM - 11:00 PM',
    businessHours: { openingTime: '08:00', closingTime: '23:00', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Shop 12, Main Kursi Road, Near Tedhi Pulia',
      landmark: 'Near Tedhi Pulia Circle',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226021'
    },
    location: { type: 'Point', coordinates: [80.9635, 26.9298] }, // ~0.4 km away
    stats: { avgRating: 4.9, totalReviews: 320, totalCustomers: 890, totalRevenue: 520000 },
    socialLinks: { instagram: '@roastery_lucknow', website: 'roasterycoffee.in', whatsapp: '919839022222' },
    products: [
      {
        name: 'Artisanal Sourdough Country Loaf',
        price: 280,
        discountPrice: 240,
        category: 'Bakery',
        description: 'Slow-fermented for 36 hours with wild yeast culture and a crunchy golden crust.',
        image: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 25
      },
      {
        name: 'Signature Iced Spanish Latte',
        price: 240,
        discountPrice: 199,
        category: 'Beverages',
        description: 'Double shot espresso shaken with chilled condensed milk and organic dairy.',
        image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 50
      },
      {
        name: 'Dark Chocolate Almond Croissant',
        price: 220,
        discountPrice: 180,
        category: 'Pastry',
        description: 'Flaky French butter layers infused with 70% dark Belgian cocoa and toasted almonds.',
        image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 35
      }
    ]
  },
  {
    zeebacId: 'ZBV-1002',
    storeName: 'Reliance Digital Mega Store',
    ownerName: 'Vikas Agarwal',
    phone: '9839033333',
    email: 'reliancedigital.jankipuram@zeebac.com',
    businessContactNumber: '9839033333',
    businessEmail: 'reliancedigital.jankipuram@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 8,
    category: 'Electronics',
    subCategory: 'Smartphones, Laptops, Audio & Home Appliances',
    shopType: 'Chain & Brand',
    description: 'Premier multi-brand electronics superstore featuring top brands: Apple, Samsung, Sony, HP, and instant doorstep installation.',
    operatingHours: 'Open Daily: 10:00 AM - 09:30 PM',
    businessHours: { openingTime: '10:00', closingTime: '21:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Plot 45, Engineering College Chauraha, Ring Road',
      landmark: 'Opposite Engineering College Gate',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226021'
    },
    location: { type: 'Point', coordinates: [80.9570, 26.9230] }, // ~1.1 km away
    stats: { avgRating: 4.8, totalReviews: 410, totalCustomers: 1250, totalRevenue: 980000 },
    socialLinks: { instagram: '@reliancedigital_up', website: 'reliancedigital.in', whatsapp: '919839033333' },
    products: [
      {
        name: 'Sony WH-1000XM5 ANC Headphones',
        price: 29990,
        discountPrice: 26990,
        category: 'Audio',
        description: 'Industry-leading noise canceling with 30-hour battery life and crystal clear hands-free calling.',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 15
      },
      {
        name: 'Apple Watch Series 9 GPS 45mm',
        price: 44900,
        discountPrice: 41900,
        category: 'Wearables',
        description: 'Brighter Always-On Retina display, S9 SiP chip with Double Tap gesture control.',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 20
      },
      {
        name: 'JBL Charge 5 Waterproof Speaker',
        price: 15999,
        discountPrice: 12999,
        category: 'Audio',
        description: 'Bold JBL Original Pro Sound with long excursion driver, separate tweeter and dual bass radiators.',
        image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 40
      }
    ]
  },
  {
    zeebacId: 'ZBV-1003',
    storeName: 'Zara Trends & Ethnic Studio',
    ownerName: 'Priya Mehra',
    phone: '9839044444',
    email: 'zaratrends.lucknow@zeebac.com',
    businessContactNumber: '9839044444',
    businessEmail: 'zaratrends.lucknow@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 12,
    category: 'Fashion & Apparel',
    subCategory: 'Bridal Lehengas, Designer Kurtis & Fusion Gowns',
    shopType: 'Boutique',
    description: 'Handcrafted Chikankari, bridal silks, contemporary Indo-Western ensembles, and custom tailored designer partywear.',
    operatingHours: 'Open Mon-Sun: 11:00 AM - 09:30 PM',
    businessHours: { openingTime: '11:00', closingTime: '21:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'B-Block Commercial Complex, Sector H, Aliganj',
      landmark: 'Near Aliganj Post Office',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226024'
    },
    location: { type: 'Point', coordinates: [80.9720, 26.9200] }, // ~1.8 km away
    stats: { avgRating: 4.9, totalReviews: 195, totalTransactions: 480, totalRevenue: 380000 },
    socialLinks: { instagram: '@zaratrends_aliganj', website: 'zaratrendsstudio.com', whatsapp: '919839044444' },
    products: [
      {
        name: 'Handcrafted Lucknowi Chikankari Anarkali',
        price: 5499,
        discountPrice: 4299,
        category: 'Ethnic Wear',
        description: 'Intricate handmade shadow work and mukaish detailing on pure georgette silk with matching dupatta.',
        image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 12
      },
      {
        name: 'Italian Tailored Velvet Slim Tuxedo',
        price: 8999,
        discountPrice: 6999,
        category: 'Formal Wear',
        description: 'Royal midnight blue velvet blazer with satin shawl lapels and bespoke tailoring fit.',
        image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 10
      },
      {
        name: 'Banarasi Zari Woven Festive Dupatta',
        price: 2499,
        discountPrice: 1899,
        category: 'Dupattas',
        description: 'Authentic gold brocade weaving with regal floral borders and lustrous sheen.',
        image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 25
      }
    ]
  },
  {
    zeebacId: 'ZBV-1004',
    storeName: 'FitZone Nutrition & Gym Gear',
    ownerName: 'Manish Rawat',
    phone: '9839055555',
    email: 'fitzone.aliganj@zeebac.com',
    businessContactNumber: '9839055555',
    businessEmail: 'fitzone.aliganj@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 15,
    category: 'Health & Fitness',
    subCategory: 'Whey Proteins, Pre-Workouts & Fitness Hardware',
    shopType: 'Independent Store',
    description: '100% genuine imported supplements with batch verification codes, dumbbells, lifting belts, and certified nutritionist consultations.',
    operatingHours: 'Open Daily: 07:00 AM - 10:00 PM',
    businessHours: { openingTime: '07:00', closingTime: '22:00', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Kapoorthala Commercial Market, Near Post Office',
      landmark: 'Near Kapoorthala Chauraha',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226024'
    },
    location: { type: 'Point', coordinates: [80.9500, 26.9100] }, // ~2.9 km away
    stats: { avgRating: 4.8, totalReviews: 240, totalCustomers: 650, totalRevenue: 410000 },
    socialLinks: { instagram: '@fitzone_nutrition_lko', whatsapp: '919839055555' },
    products: [
      {
        name: 'Optimum Nutrition Gold Standard Whey (2kg)',
        price: 6499,
        discountPrice: 5399,
        category: 'Proteins',
        description: '24g of high quality whey protein isolate per serving for rapid muscle repair and recovery.',
        image: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 30
      },
      {
        name: 'Creapure Micronized Creatine (300g)',
        price: 1499,
        discountPrice: 1099,
        category: 'Supplements',
        description: 'Ultra-pure unflavored creatine monohydrate to maximize explosive power and muscle volume.',
        image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 50
      },
      {
        name: 'Heavy-Duty Padded Gym Lifting Straps',
        price: 699,
        discountPrice: 449,
        category: 'Accessories',
        description: 'Reinforced cotton webbing with neoprene wrist padding for heavy deadlifts and rows.',
        image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 60
      }
    ]
  },
  {
    zeebacId: 'ZBV-1005',
    storeName: 'Awadh Royal Fine Dining Restaurant',
    ownerName: 'Chef Tariq Siddiqui',
    phone: '9839066666',
    email: 'awadhroyal.gomtinagar@zeebac.com',
    businessContactNumber: '9839066666',
    businessEmail: 'awadhroyal.gomtinagar@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 10,
    category: 'Food & Dining',
    subCategory: 'Awadhi Dum Biryani, Mughlai Gravies & Kebabs',
    shopType: 'Restaurant',
    description: 'Authentic royal recipes passed down generations: Galawati Kebabs, fragrant saffron Dum Biryani, Mughlai roomali rolls, and live Sufi music.',
    operatingHours: 'Open Daily: 12:30 PM - 11:30 PM',
    businessHours: { openingTime: '12:30', closingTime: '23:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Building 88, Riverside Road, Gomti Nagar Extension',
      landmark: 'Near Riverfront Promenade',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226010'
    },
    location: { type: 'Point', coordinates: [80.9400, 26.9000] }, // ~4.5 km away
    stats: { avgRating: 4.9, totalReviews: 540, totalCustomers: 1400, totalRevenue: 850000 },
    socialLinks: { instagram: '@awadhroyal_dine', website: 'awadhroyal.com', whatsapp: '919839066666' },
    products: [
      {
        name: 'Royal Shahi Awadhi Dum Biryani Handi',
        price: 499,
        discountPrice: 429,
        category: 'Main Course',
        description: 'Long grain Basmati slow-cooked in earthen handi with saffron, whole spices, and rich gravy.',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 60
      },
      {
        name: 'Tandoori Smoked Paneer Tikka Platter',
        price: 380,
        discountPrice: 320,
        category: 'Starters',
        description: 'Charcoal-grilled cottage cheese marinated in mustard oil, hung curd, and roasted carom seeds.',
        image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 50
      },
      {
        name: 'Wood-Fired Truffle Margherita Pizza',
        price: 450,
        discountPrice: 380,
        category: 'Italian',
        description: 'San Marzano tomato sauce, fresh buffalo mozzarella, aromatic basil, and black truffle oil drizzle.',
        image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600&auto=format&fit=crop&q=80',
        isHighlight: false,
        stock: 40
      }
    ]
  },

  // ===================== ACROSS WHOLE INDORE =====================
  {
    zeebacId: 'ZBV-1006',
    storeName: 'Sharma Electronics & Gadget Hub',
    ownerName: 'Rajesh Sharma',
    phone: '9826011111',
    email: 'sharma.indore@zeebac.com',
    businessContactNumber: '9826011111',
    businessEmail: 'sharma.indore@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 8,
    category: 'Electronics',
    subCategory: 'Mobiles, Laptops & Smart Home Gadgets',
    shopType: 'Independent Store',
    description: 'Indore premier hub for flagship smartphones, gaming laptops, smart TVs, Apple accessories, and instant repair services.',
    operatingHours: 'Open Daily: 10:00 AM - 09:30 PM',
    businessHours: { openingTime: '10:00', closingTime: '21:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Shop 14, MG Road Electronics Plaza, Near Kothari Market',
      landmark: 'Near Kothari Market',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    location: { type: 'Point', coordinates: [75.8577, 22.7196] }, // MG Road Center
    stats: { avgRating: 4.8, totalReviews: 240, totalCustomers: 780, totalRevenue: 590000 },
    socialLinks: { instagram: '@sharma_gadgets_indore', website: 'sharmaelectronics.in', whatsapp: '919826011111' },
    products: [
      {
        name: 'Samsung Galaxy Watch 6 LTE 44mm',
        price: 33999,
        discountPrice: 28999,
        category: 'Smartwatches',
        description: 'Super AMOLED sapphire crystal screen with sleep tracking, ECG and blood pressure monitor.',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 20
      },
      {
        name: 'Bose SoundLink Flex Bluetooth Speaker',
        price: 14900,
        discountPrice: 12900,
        category: 'Audio',
        description: 'PositionIQ technology with waterproof dustproof IP67 rugged enclosure.',
        image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 25
      }
    ]
  },
  {
    zeebacId: 'ZBV-1007',
    storeName: 'Urban Brew Organic Cafe & Bistro',
    ownerName: 'Ananya Verma',
    phone: '9826022222',
    email: 'urbanbrew.indore@zeebac.com',
    businessContactNumber: '9826022222',
    businessEmail: 'urbanbrew.indore@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 10,
    category: 'Bakery & Cafe',
    subCategory: 'Rooftop Cafe, Wood-fired Pizzas & Pour-over Brews',
    shopType: 'Independent Store',
    description: 'Vibrant Vijay Nagar rooftop cafe serving single-origin pour-overs, cold brew tonic, sourdough toasties, and vegan cheesecakes.',
    operatingHours: 'Open Daily: 08:30 AM - 11:30 PM',
    businessHours: { openingTime: '08:30', closingTime: '23:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: '102 Vijay Nagar Square, Opposite C21 Mall, AB Road',
      landmark: 'Opposite C21 Mall',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452010'
    },
    location: { type: 'Point', coordinates: [75.8900, 22.7500] }, // Vijay Nagar Commercial
    stats: { avgRating: 4.9, totalReviews: 380, totalCustomers: 920, totalRevenue: 620000 },
    socialLinks: { instagram: '@urbanbrew_indore', website: 'urbanbrewindore.com', whatsapp: '919826022222' },
    products: [
      {
        name: 'Ethiopian Yirgacheffe Pour-Over Coffee',
        price: 260,
        discountPrice: 220,
        category: 'Coffee',
        description: 'Floral notes of bergamot and jasmine with bright citrus acidity brewed manually via V60.',
        image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 40
      },
      {
        name: 'Avocado Feta Sourdough Tartine',
        price: 340,
        discountPrice: 290,
        category: 'Breakfast',
        description: 'Fresh Hass avocado, crumbled Greek feta, cherry tomatoes, and microgreens on toasted sourdough.',
        image: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 30
      }
    ]
  },
  {
    zeebacId: 'ZBV-1008',
    storeName: 'Royal Threads Designer Boutique',
    ownerName: 'Vikram Malhotra',
    phone: '9826033333',
    email: 'royalthreads.indore@zeebac.com',
    businessContactNumber: '9826033333',
    businessEmail: 'royalthreads.indore@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 12,
    category: 'Fashion & Apparel',
    subCategory: 'Bridal Couture, Chanderi Silks & Bespoke Sherwanis',
    shopType: 'Boutique',
    description: 'Indore destination for heritage Chanderi sarees, bridal lehengas, custom bespoke sherwanis, and luxury Western couture.',
    operatingHours: 'Open Tue-Sun: 11:00 AM - 09:30 PM',
    businessHours: { openingTime: '11:00', closingTime: '21:30', workingDays: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: '45 Palasia Main Road, Near Saket Circle',
      landmark: 'Near Saket Circle',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    location: { type: 'Point', coordinates: [75.8820, 22.7280] }, // Old Palasia
    stats: { avgRating: 4.8, totalReviews: 180, totalCustomers: 490, totalRevenue: 480000 },
    socialLinks: { instagram: '@royalthreads_palasia', website: 'royalthreadsindore.com', whatsapp: '919826033333' },
    products: [
      {
        name: 'Handloom Chanderi Tissue Zari Saree',
        price: 7999,
        discountPrice: 6499,
        category: 'Sarees',
        description: 'Traditional Madhya Pradesh handwoven pure silk cotton with intricate gold meenakari bootis.',
        image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 15
      },
      {
        name: 'Royal Raw Silk Embroidered Sherwani',
        price: 18999,
        discountPrice: 15999,
        category: 'Mens Ethnic',
        description: 'Ivory raw silk sherwani adorned with zardozi embroidery, pearl buttons, and tailored churidar.',
        image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 8
      }
    ]
  },
  {
    zeebacId: 'ZBV-1009',
    storeName: 'Chappan Street Bistro & Desserts',
    ownerName: 'Gaurav Jain',
    phone: '9826077777',
    email: 'chappanbistro@zeebac.com',
    businessContactNumber: '9826077777',
    businessEmail: 'chappanbistro@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 7,
    category: 'Food & Dining',
    subCategory: 'Street Gourmet, Chaats, Mocktails & Desserts',
    shopType: 'Restaurant',
    description: 'Iconic Chappan Dukan hangout serving signature Indore street fusion, gourmet chaats, wood-fired rolls, and cold stone ice-creams.',
    operatingHours: 'Open Daily: 11:00 AM - 11:30 PM',
    businessHours: { openingTime: '11:00', closingTime: '23:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1552611052-33e04de081de?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1552611052-33e04de081de?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1552611052-33e04de081de?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Shop 22, 56 Dukan Commercial Food Street, New Palasia',
      landmark: 'Chappan Dukan Center Point',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001'
    },
    location: { type: 'Point', coordinates: [75.8780, 22.7230] }, // Chappan Dukan
    stats: { avgRating: 4.9, totalReviews: 620, totalCustomers: 1850, totalRevenue: 920000 },
    socialLinks: { instagram: '@chappan_bistro_indore', website: 'chappanbistro.com', whatsapp: '919826077777' },
    products: [
      {
        name: 'Gourmet Crispy Dahi Puri Shots (6 pcs)',
        price: 180,
        discountPrice: 150,
        category: 'Chaat',
        description: 'Artisanal semolina spheres stuffed with spiced sprouts, sweetened yoghurt, and pomegranate drizzle.',
        image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 80
      },
      {
        name: 'Sizzling Brownie with Belgian Ganache',
        price: 240,
        discountPrice: 199,
        category: 'Desserts',
        description: 'Freshly baked walnut brownie on a smoking cast-iron platter topped with French vanilla bean gelato.',
        image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 60
      }
    ]
  },
  {
    zeebacId: 'ZBV-1010',
    storeName: 'Shree Ji Mega Supermart',
    ownerName: 'Mahesh Gupta',
    phone: '9826055555',
    email: 'shreeji.supermart@zeebac.com',
    businessContactNumber: '9826055555',
    businessEmail: 'shreeji.supermart@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 5,
    category: 'Supermarket',
    subCategory: 'Daily Groceries, Organic Pantry & Imported Snacks',
    shopType: 'Supermarket',
    description: 'Your one-stop family supermarket for daily groceries, farm fresh produce, cold-pressed oils, organic millets, and household goods.',
    operatingHours: 'Open Daily: 07:30 AM - 10:30 PM',
    businessHours: { openingTime: '07:30', closingTime: '22:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Plot 12, Annapurna Temple Road, Sudama Nagar',
      landmark: 'Near Annapurna Temple Gate',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452009'
    },
    location: { type: 'Point', coordinates: [75.8400, 22.7000] }, // Annapurna Road
    stats: { avgRating: 4.7, totalReviews: 450, totalCustomers: 1600, totalRevenue: 780000 },
    socialLinks: { instagram: '@shreeji_supermart', whatsapp: '919826055555' },
    products: [
      {
        name: 'Cold Pressed Wood-Churned Mustard Oil (1L)',
        price: 240,
        discountPrice: 205,
        category: 'Pantry',
        description: 'Traditional kachi ghani unrefined oil packed with natural pungent aroma and antioxidants.',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 50
      },
      {
        name: 'Premium California Jumbo Almonds (500g)',
        price: 520,
        discountPrice: 449,
        category: 'Dry Fruits',
        description: '100% natural, vacuum-sealed crunchy almonds rich in Vitamin E and essential healthy fats.',
        image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 45
      }
    ]
  },
  {
    zeebacId: 'ZBV-1011',
    storeName: 'Glamour Looks Luxury Salon & Spa',
    ownerName: 'Pooja Joshi',
    phone: '9826066666',
    email: 'glamourlooks.indore@zeebac.com',
    businessContactNumber: '9826066666',
    businessEmail: 'glamourlooks.indore@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 15,
    category: 'Beauty & Wellness',
    subCategory: 'Bridal Makeovers, Keratin Hair Spa & HydraFacial',
    shopType: 'Salon',
    description: 'Premier Indore beauty destination featuring certified L’Oréal professionals, luxury bridal makeup, ozone hair spa, and relaxing Swedish therapy.',
    operatingHours: 'Open Mon-Sun: 10:00 AM - 08:30 PM',
    businessHours: { openingTime: '10:00', closingTime: '20:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Suite 301, Race Course Road, Near High Court Circle',
      landmark: 'Near High Court Circle',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452003'
    },
    location: { type: 'Point', coordinates: [75.8700, 22.7250] }, // Race Course Road
    stats: { avgRating: 4.9, totalReviews: 290, totalCustomers: 740, totalRevenue: 510000 },
    socialLinks: { instagram: '@glamourlooks_spa_indore', website: 'glamourlooks.in', whatsapp: '919826066666' },
    products: [
      {
        name: 'L’Oréal Professionnel Absolut Keratin Spa',
        price: 2499,
        discountPrice: 1899,
        category: 'Hair Care',
        description: 'Intense micro-nourishing hair repair with steam infusion for smooth, frizz-free lustrous hair.',
        image: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 25
      },
      {
        name: 'Korean Deep Infusion 7-Step HydraFacial',
        price: 3499,
        discountPrice: 2799,
        category: 'Skin Care',
        description: 'Hydro-dermabrasion, peptide peel, and hyaluronic hydration booster for radiant youthful glow.',
        image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 20
      }
    ]
  },
  {
    zeebacId: 'ZBV-1012',
    storeName: 'Tanishq Heritage Fine Jewellery',
    ownerName: 'Deepak Soni',
    phone: '9826088888',
    email: 'tanishq.sarafa@zeebac.com',
    businessContactNumber: '9826088888',
    businessEmail: 'tanishq.sarafa@zeebac.com',
    role: 'vendor',
    status: 'Verified',
    applicationStatus: 'APPROVED',
    cashbackRate: 5,
    category: 'Jewellery & Watches',
    subCategory: 'BIS 916 Hallmarked Gold, Solitaires & Polki Ornaments',
    shopType: 'Independent Store',
    description: 'Renowned Sarafa Bazaar jewelers specializing in BIS Hallmarked 22K bridal gold, certified conflict-free diamonds, and antique heritage kundan.',
    operatingHours: 'Open Mon-Sun: 11:30 AM - 09:30 PM',
    businessHours: { openingTime: '11:30', closingTime: '21:30', workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    storeLogo: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80',
    profilePic: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&auto=format&fit=crop&q=80',
    storeCoverImage: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=1200&auto=format&fit=crop&q=80',
    storeImages: [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80'
    ],
    address: {
      fullAddress: 'Showroom 8, Sarafa Bazaar Gold Market, Rajwada',
      landmark: 'Near Historic Rajwada Palace',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452002'
    },
    location: { type: 'Point', coordinates: [75.8650, 22.7150] }, // Sarafa / Rajwada
    stats: { avgRating: 4.9, totalReviews: 510, totalCustomers: 1100, totalRevenue: 1500000 },
    socialLinks: { instagram: '@tanishq_sarafa_indore', website: 'tanishqjewels.com', whatsapp: '919826088888' },
    products: [
      {
        name: '22K Kundan Heritage Choker Set',
        price: 45000,
        discountPrice: 42500,
        category: 'Gold Jewellery',
        description: 'BIS hallmarked 916 pure gold with uncut Polki diamonds and emerald drop hangings.',
        image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 5
      },
      {
        name: 'VVS Clarity Solitaire Diamond Studs',
        price: 28000,
        discountPrice: 25900,
        category: 'Diamonds',
        description: 'IGI certified round brilliant cut diamonds set in 18K white gold four-prong basket.',
        image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?w=600&auto=format&fit=crop&q=80',
        isHighlight: true,
        stock: 8
      }
    ]
  }
];

async function seedData() {
  console.log('Connecting to MongoDB database...');
  await mongoose.connect(baseUri);
  console.log('Connected to MongoDB database successfully.');
  const connection = mongoose.connection;

  const Vendor = connection.model('Vendor', new mongoose.Schema({}, { strict: false }));
  const User = connection.model('User', new mongoose.Schema({}, { strict: false }));
  const Wallet = connection.model('Wallet', new mongoose.Schema({}, { strict: false }));
  const Product = connection.model('Product', new mongoose.Schema({}, { strict: false }));
  const StorefrontMedia = connection.model('StorefrontMedia', new mongoose.Schema({}, { strict: false }));
  const Promotion = connection.model('Promotion', new mongoose.Schema({}, { strict: false }));
  const Review = connection.model('Review', new mongoose.Schema({}, { strict: false }));
  const Story = connection.model('Story', new mongoose.Schema({}, { strict: false }));

  // Ensure 2dsphere index on vendors
  try {
    await connection.db.collection('vendors').createIndex({ location: '2dsphere' });
    console.log('Verified 2dsphere index on vendors.location.');
  } catch (err) {
    console.warn('Index notice:', err.message);
  }

  // 1. Seed / Update Customer Users
  console.log('Seeding Customer Users & Wallets...');
  const userShiv = await User.findOneAndUpdate(
    { phone: '9335825081' },
    {
      $set: {
        name: 'Shiv',
        phone: '9335825081',
        email: 'shiv@zeebac.com',
        role: 'customer',
        status: 'Active',
        location: {
          coordinates: {
            latitude: 26.9285671,
            longitude: 80.9617939
          }
        },
        address: {
          fullAddress: 'Jankipuram Sector F, Kursi Road',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pincode: '226021'
        },
        updatedAt: new Date()
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  const userRahul = await User.findOneAndUpdate(
    { phone: '9999999999' },
    {
      $set: {
        zeebacId: 'ZBC-1234',
        name: 'Rahul Sharma',
        phone: '9999999999',
        email: 'rahul.test@gmail.com',
        role: 'customer',
        status: 'Active',
        location: {
          coordinates: {
            latitude: 26.9285671,
            longitude: 80.9617939
          }
        },
        updatedAt: new Date()
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Wallets for customers
  await Wallet.updateOne(
    { ownerId: userShiv._id, ownerType: 'User' },
    { $set: { balance: 2500, totalEarned: 3800, ownerZeebacId: userShiv.zeebacId || 'ZBC-5266' } },
    { upsert: true }
  );
  await Wallet.updateOne(
    { ownerId: userRahul._id, ownerType: 'User' },
    { $set: { balance: 1850, totalEarned: 2400, ownerZeebacId: 'ZBC-1234' } },
    { upsert: true }
  );

  // 2. Clear old test stories and seed fresh 24h stories
  await Story.deleteMany({});

  // 3. Seed Vendors with Full Details
  console.log(`Seeding ${allVendors.length} fully-detailed Vendors with Products, Media, Promotions & Reviews...`);

  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  for (const vData of allVendors) {
    const { products, ...vendorFields } = vData;

    const vendorDoc = await Vendor.findOneAndUpdate(
      { zeebacId: vData.zeebacId },
      {
        $set: {
          ...vendorFields,
          subscription: {
            planType: 'Yearly',
            price: 4999,
            status: 'ACTIVE',
            startDate: new Date('2026-01-01'),
            expiresAt: oneYearFromNow,
            lastRenewedAt: now,
            bonusDaysApplied: 15
          },
          bankDetails: {
            accountHolderName: vendorFields.ownerName,
            bankName: 'HDFC Bank Ltd',
            accountNumber: '50100492817492',
            ifscCode: 'HDFC0001234',
            upiId: `${vendorFields.phone}@hdfcbank`,
            isVerified: true,
            verifiedAt: now
          },
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${vData.zeebacId}`,
          updatedAt: now
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const vendorId = vendorDoc._id;

    // A. Seed Vendor Wallet (₹35,000 balance)
    await Wallet.updateOne(
      { ownerId: vendorId, ownerType: 'Vendor' },
      { $set: { balance: 35000, totalEarned: 85000, ownerZeebacId: vData.zeebacId } },
      { upsert: true }
    );

    // B. Seed Products
    await Product.deleteMany({ vendorId });
    if (products && products.length > 0) {
      const productDocs = products.map(p => ({
        vendorId,
        name: p.name,
        price: p.price,
        discountPrice: p.discountPrice,
        category: p.category,
        description: p.description,
        image: p.image,
        isHighlight: !!p.isHighlight,
        isActive: true,
        stock: p.stock || 50,
        branding: {
          isBranded: true,
          brandName: vendorFields.storeName,
          cashbackPercentage: vendorFields.cashbackRate
        }
      }));
      await Product.insertMany(productDocs);
    }

    // C. Seed StorefrontMedia (Photo gallery)
    await StorefrontMedia.deleteMany({ vendorId });
    if (vendorFields.storeImages && vendorFields.storeImages.length > 0) {
      const mediaDocs = vendorFields.storeImages.map((imgUrl, idx) => ({
        vendorId,
        type: 'image',
        url: imgUrl,
        caption: `${vendorFields.storeName} - Gallery Photo ${idx + 1}`,
        sortOrder: idx,
        isActive: true
      }));
      await StorefrontMedia.insertMany(mediaDocs);
    }

    // D. Seed Active Promotion
    await Promotion.deleteMany({ vendorId });
    await Promotion.create({
      vendorId,
      title: `${vendorFields.cashbackRate}% Extra Festive Cashback`,
      description: `Shop and earn guaranteed flat ${vendorFields.cashbackRate}% instant reward into your ZeeBac wallet on all in-store and online payments!`,
      type: 'percent',
      value: vendorFields.cashbackRate,
      minPurchase: 499,
      isActive: true,
      validFrom: now,
      validUntil: oneYearFromNow
    });

    // E. Seed Verified Customer Reviews
    await Review.deleteMany({ vendorId });
    await Review.create([
      {
        vendorId,
        customerId: userShiv._id,
        customerName: 'Shiv',
        rating: 5,
        text: `Outstanding experience at ${vendorFields.storeName}! Seamless Zeebac cashback payment, friendly staff, and premium quality products. Highly recommended!`,
        isVerified: true,
        reply: {
          text: `Thank you Shiv! We are thrilled to serve you and look forward to welcoming you back soon!`,
          repliedAt: now
        },
        isVisible: true
      },
      {
        vendorId,
        customerId: userRahul._id,
        customerName: 'Rahul Sharma',
        rating: 5,
        text: `Got instant ${vendorFields.cashbackRate}% cashback credited right into my wallet. Best store in town with great deals.`,
        isVerified: true,
        isVisible: true
      }
    ]);

    // F. Seed 24h Stories for top stores
    if (['ZBV-8382', 'ZBV-1001', 'ZBV-1002', 'ZBV-1007', 'ZBV-1009'].includes(vData.zeebacId)) {
      await Story.create({
        vendorId,
        mediaUrl: vendorFields.storeCoverImage || vendorFields.storeLogo,
        mediaType: 'image',
        caption: `🔥 Flash Deal at ${vendorFields.storeName}! Flat ${vendorFields.cashbackRate}% cashback on every purchase today!`,
        offerTag: `Flat ${vendorFields.cashbackRate}% Cashback`,
        backgroundColor: '#1e1b4b',
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        isActive: true
      });
    }

    console.log(`  ✓ Seeded [${vData.zeebacId}] ${vendorFields.storeName} (${vendorFields.address.city})`);
  }

  console.log('\n======================================================');
  console.log(`SUCCESS! Seeded ${allVendors.length} fully verified vendors with complete profiles, coordinates, products, galleries, reviews, wallets, and active stories!`);
  console.log('======================================================\n');

  await connection.close();
  process.exit(0);
}

seedData().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
