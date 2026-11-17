// Tailored Category Sections, Department Tabs, and Realistic Products for Every Shop Type

export function detectStoreCategoryKey(rawCategory = '') {
  const cat = String(rawCategory || '').toLowerCase();
  if (cat.includes('electr') || cat.includes('mobile') || cat.includes('gadget') || cat.includes('computer') || cat.includes('tech')) {
    return 'electronics';
  }
  if (cat.includes('fash') || cat.includes('cloth') || cat.includes('apparel') || cat.includes('wear') || cat.includes('garment') || cat.includes('textile')) {
    return 'fashion';
  }
  if (cat.includes('pharm') || cat.includes('medic') || cat.includes('health') || cat.includes('chemist') || cat.includes('ayurved')) {
    return 'pharmacy';
  }
  if (cat.includes('rest') || cat.includes('cafe') || cat.includes('food') || cat.includes('bakery') || cat.includes('dining') || cat.includes('sweet') || cat.includes('pizza') || cat.includes('burger')) {
    return 'restaurant';
  }
  if (cat.includes('hardw') || cat.includes('electri') || cat.includes('sanitary') || cat.includes('paint') || cat.includes('tool') || cat.includes('plywood')) {
    return 'hardware';
  }
  if (cat.includes('beauty') || cat.includes('salon') || cat.includes('cosmetic') || cat.includes('parlour') || cat.includes('spa')) {
    return 'beauty';
  }
  if (cat.includes('auto') || cat.includes('vehicle') || cat.includes('bike') || cat.includes('motor') || cat.includes('car') || cat.includes('spare')) {
    return 'automobile';
  }
  if (cat.includes('book') || cat.includes('station') || cat.includes('toy') || cat.includes('gift') || cat.includes('pen')) {
    return 'stationery';
  }
  if (cat.includes('furnit') || cat.includes('home') || cat.includes('decor') || cat.includes('mattress')) {
    return 'furniture';
  }
  if (cat.includes('groc') || cat.includes('super') || cat.includes('fmcg') || cat.includes('kirana') || cat.includes('mart') || cat.includes('provision')) {
    return 'grocery';
  }
  return 'general';
}

export const CATEGORY_IMAGE_MAP = {
  // Electronics
  'audio & headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=240&auto=format&fit=crop&q=80',
  'mobile accessories': 'https://images.unsplash.com/photo-1584006682522-dc17d6c0d9ac?w=240&auto=format&fit=crop&q=80',
  'cables & chargers': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=240&auto=format&fit=crop&q=80',
  'smart wearables': 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=240&auto=format&fit=crop&q=80',
  'bluetooth speakers': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=240&auto=format&fit=crop&q=80',
  'power banks & batteries': 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?w=240&auto=format&fit=crop&q=80',
  'computer & gaming': 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=240&auto=format&fit=crop&q=80',
  'storage & memory cards': 'https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=240&auto=format&fit=crop&q=80',

  // Fashion
  "men's wear": 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=240&auto=format&fit=crop&q=80',
  "women's wear": 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=240&auto=format&fit=crop&q=80',
  'ethnic & festive': 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=240&auto=format&fit=crop&q=80',
  'shoes & footwear': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=240&auto=format&fit=crop&q=80',
  'bags & wallets': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=240&auto=format&fit=crop&q=80',
  'watches & accessories': 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=240&auto=format&fit=crop&q=80',
  "kids' wear": 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=240&auto=format&fit=crop&q=80',
  'jackets & winter': 'https://images.unsplash.com/photo-1544441893-675973e31985?w=240&auto=format&fit=crop&q=80',

  // Pharmacy
  'medicines & tablets': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=240&auto=format&fit=crop&q=80',
  'first aid & bandages': 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=240&auto=format&fit=crop&q=80',
  'vitamins & supplements': 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=240&auto=format&fit=crop&q=80',
  'personal hygiene': 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=240&auto=format&fit=crop&q=80',
  'baby care essentials': 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=240&auto=format&fit=crop&q=80',
  'medical devices': 'https://images.unsplash.com/photo-1584362917165-526a968579e8?w=240&auto=format&fit=crop&q=80',

  // Restaurant
  'starters & snacks': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80',
  'main course curries': 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=240&auto=format&fit=crop&q=80',
  'biryani & fried rice': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=240&auto=format&fit=crop&q=80',
  'fresh breads & naan': 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=240&auto=format&fit=crop&q=80',
  'cold beverages & shakes': 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=240&auto=format&fit=crop&q=80',
  'desserts & ice creams': 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=240&auto=format&fit=crop&q=80',

  // Grocery
  'vegetables & fruits': 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=240&auto=format&fit=crop&q=80',
  'atta, rice & dal': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=240&auto=format&fit=crop&q=80',
  'oil, ghee & masala': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=240&auto=format&fit=crop&q=80',
  'dairy, bread & eggs': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=240&auto=format&fit=crop&q=80',
  'bakery & biscuits': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=240&auto=format&fit=crop&q=80',
  'dry fruits & cereals': 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=240&auto=format&fit=crop&q=80',
  'chips & namkeen': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=240&auto=format&fit=crop&q=80',
  'drinks & juices': 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=240&auto=format&fit=crop&q=80',
};

export function getCategoryFallbackImage(categoryName = '') {
  const norm = String(categoryName || '').toLowerCase().trim();
  for (const [key, url] of Object.entries(CATEGORY_IMAGE_MAP)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) {
      return url;
    }
  }
  return 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=240&auto=format&fit=crop&q=80';
}

export const STORE_PRESETS = {
  electronics: {
    title: 'Electronics & Gadgets',
    searchPlaceholder: 'Search for earbuds, cables, chargers, smartwatch, mouse, power banks...',
    departmentTabs: [
      { id: 'all', label: 'All', icon: 'grid_view' },
      { id: 'audio', label: 'Audio & Sound', icon: 'headphones', department: 'Audio' },
      { id: 'mobile', label: 'Mobile & Accessories', icon: 'smartphone', department: 'Mobile' },
      { id: 'chargers', label: 'Cables & Power', icon: 'bolt', department: 'Power' },
    ],
    categorySections: [
      {
        groupTitle: 'Electronics & Gadgets',
        department: 'Electronics',
        icon: 'devices',
        categories: [
          { id: 'audio-headphones', name: 'Audio & Headphones', image: CATEGORY_IMAGE_MAP['audio & headphones'], bgColor: 'bg-[#EFF6FF]' },
          { id: 'mobile-acc', name: 'Mobile Accessories', image: CATEGORY_IMAGE_MAP['mobile accessories'], bgColor: 'bg-[#F5F3FF]' },
          { id: 'cables-chargers', name: 'Cables & Chargers', image: CATEGORY_IMAGE_MAP['cables & chargers'], bgColor: 'bg-[#EFF6FF]' },
          { id: 'smart-wearables', name: 'Smart Wearables', image: CATEGORY_IMAGE_MAP['smart wearables'], bgColor: 'bg-[#F0FDF4]' },
          { id: 'power-banks', name: 'Power Banks & Batteries', image: CATEGORY_IMAGE_MAP['power banks & batteries'], bgColor: 'bg-[#FFFBEB]' },
          { id: 'computer-gaming', name: 'Computer & Gaming', image: CATEGORY_IMAGE_MAP['computer & gaming'], bgColor: 'bg-[#FDF2F8]' },
          { id: 'speakers-home', name: 'Bluetooth Speakers', image: CATEGORY_IMAGE_MAP['bluetooth speakers'], bgColor: 'bg-[#EFF6FF]' },
          { id: 'storage-memory', name: 'Storage & Memory Cards', image: CATEGORY_IMAGE_MAP['storage & memory cards'], bgColor: 'bg-[#F5F3FF]' },
        ],
      },
    ],
    defaultProducts: [
      {
        _id: 'el_prod_1',
        name: 'Boat Airdopes 141 True Wireless Earbuds',
        price: 1299,
        discountPrice: 4490,
        category: 'Audio & Headphones',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80',
        description: '42H playtime, ENx noise cancellation, Beast mode low latency with ASAP charge.',
      },
      {
        _id: 'el_prod_2',
        name: 'Boat Rugged Type-C Fast Charging Cable 1.5m',
        price: 299,
        discountPrice: 599,
        category: 'Cables & Chargers',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&auto=format&fit=crop&q=80',
        description: 'Braided tangle-free 3A fast charging and 480Mbps high speed data sync.',
      },
      {
        _id: 'el_prod_3',
        name: 'Mi 20W Fast USB-C Power Adapter Wall Charger',
        price: 549,
        discountPrice: 799,
        category: 'Cables & Chargers',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=400&auto=format&fit=crop&q=80',
        description: 'Quick charge 3.0 certified compact adapter with multi-layer surge protection.',
      },
      {
        _id: 'el_prod_4',
        name: 'Fire-Boltt Ninja Call Pro Smartwatch 1.83"',
        price: 1499,
        discountPrice: 9999,
        category: 'Smart Wearables',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400&auto=format&fit=crop&q=80',
        description: 'Bluetooth calling, 100+ sports modes, SpO2 & 24/7 heart rate monitoring.',
      },
      {
        _id: 'el_prod_5',
        name: 'JBL GO 3 Portable Waterproof Bluetooth Speaker',
        price: 2499,
        discountPrice: 3999,
        category: 'Bluetooth Speakers',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400&auto=format&fit=crop&q=80',
        description: 'Original JBL Pro Sound, IP67 water and dustproof with vibrant fabric style.',
      },
      {
        _id: 'el_prod_6',
        name: 'Logitech B170 Wireless Optical Mouse',
        price: 599,
        discountPrice: 895,
        category: 'Computer & Gaming',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&auto=format&fit=crop&q=80',
        description: 'Reliable 2.4GHz wireless connection with 12-month battery life and smooth optical tracking.',
      },
      {
        _id: 'el_prod_7',
        name: 'Ambrane 10000mAh Slim Power Bank 20W Fast Charge',
        price: 899,
        discountPrice: 1999,
        category: 'Power Banks & Batteries',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?w=400&auto=format&fit=crop&q=80',
        description: 'Dual USB output, Type-C two-way PD fast charging, flight approved compact shell.',
      },
      {
        _id: 'el_prod_8',
        name: 'SanDisk Ultra 64GB MicroSD Class 10 Card',
        price: 449,
        discountPrice: 850,
        category: 'Storage & Memory Cards',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=400&auto=format&fit=crop&q=80',
        description: 'Up to 140MB/s read speed for Full HD video playback and rapid app loading.',
      },
    ],
  },

  fashion: {
    title: 'Fashion & Apparel',
    searchPlaceholder: 'Search for shirts, t-shirts, jeans, kurtis, shoes, jackets...',
    departmentTabs: [
      { id: 'all', label: 'All', icon: 'grid_view' },
      { id: 'men', label: "Men's", icon: 'man', department: "Men" },
      { id: 'women', label: "Women's", icon: 'woman', department: "Women" },
      { id: 'footwear', label: 'Footwear', icon: 'steps', department: "Footwear" },
    ],
    categorySections: [
      {
        groupTitle: "Men & Women's Fashion",
        department: 'Fashion',
        icon: 'checkroom',
        categories: [
          { id: 'mens-wear', name: "Men's Wear", image: CATEGORY_IMAGE_MAP["men's wear"], bgColor: 'bg-[#EFF6FF]' },
          { id: 'womens-wear', name: "Women's Wear", image: CATEGORY_IMAGE_MAP["women's wear"], bgColor: 'bg-[#FDF2F8]' },
          { id: 'ethnic-wear', name: 'Ethnic & Festive', image: CATEGORY_IMAGE_MAP['ethnic & festive'], bgColor: 'bg-[#FFFBEB]' },
          { id: 'footwear', name: 'Shoes & Footwear', image: CATEGORY_IMAGE_MAP['shoes & footwear'], bgColor: 'bg-[#F5F3FF]' },
          { id: 'bags-wallets', name: 'Bags & Wallets', image: CATEGORY_IMAGE_MAP['bags & wallets'], bgColor: 'bg-[#F0FDF4]' },
          { id: 'watches-acc', name: 'Watches & Accessories', image: CATEGORY_IMAGE_MAP['watches & accessories'], bgColor: 'bg-[#FFF7ED]' },
          { id: 'kids-wear', name: "Kids' Wear", image: CATEGORY_IMAGE_MAP["kids' wear"], bgColor: 'bg-[#EFF6FF]' },
          { id: 'winter-wear', name: 'Jackets & Winter', image: CATEGORY_IMAGE_MAP['jackets & winter'], bgColor: 'bg-[#F5F3FF]' },
        ],
      },
    ],
    defaultProducts: [
      {
        _id: 'fash_1',
        name: 'Pure Cotton Slim Fit Casual Shirt (Navy Blue)',
        price: 699,
        discountPrice: 1499,
        category: "Men's Wear",
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80',
        description: 'Breathable combed cotton casual shirt for office and casual wear.',
      },
      {
        _id: 'fash_2',
        name: 'Women Floral Embroidered Anarkali Kurti',
        price: 899,
        discountPrice: 1999,
        category: 'Ethnic & Festive',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop&q=80',
        description: 'Soft rayon festive kurti with intricate threadwork and 3/4 sleeves.',
      },
      {
        _id: 'fash_3',
        name: 'Lightweight Breathable Running Sneakers',
        price: 999,
        discountPrice: 2499,
        category: 'Shoes & Footwear',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=80',
        description: 'Cushioned EVA memory foam sole for running, walking, and gym workouts.',
      },
      {
        _id: 'fash_4',
        name: 'Genuine Leather Men Bi-Fold RFID Wallet',
        price: 499,
        discountPrice: 999,
        category: 'Bags & Wallets',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400&auto=format&fit=crop&q=80',
        description: 'Premium top-grain leather with 8 card slots, coin pocket and RFID shield.',
      },
    ],
  },

  pharmacy: {
    title: 'Pharmacy & Wellness',
    searchPlaceholder: 'Search for medicines, vitamins, first aid, baby care...',
    departmentTabs: [
      { id: 'all', label: 'All', icon: 'grid_view' },
      { id: 'meds', label: 'Medicines', icon: 'medication', department: 'Medicines' },
      { id: 'supplements', label: 'Supplements', icon: 'nutrition', department: 'Supplements' },
      { id: 'firstaid', label: 'First Aid', icon: 'medical_services', department: 'First Aid' },
    ],
    categorySections: [
      {
        groupTitle: 'Health & Personal Care',
        department: 'Pharmacy',
        icon: 'local_pharmacy',
        categories: [
          { id: 'medicines', name: 'Medicines & Tablets', image: CATEGORY_IMAGE_MAP['medicines & tablets'], bgColor: 'bg-[#EFF6FF]' },
          { id: 'first-aid', name: 'First Aid & Bandages', image: CATEGORY_IMAGE_MAP['first aid & bandages'], bgColor: 'bg-[#FEF2F2]' },
          { id: 'vitamins', name: 'Vitamins & Supplements', image: CATEGORY_IMAGE_MAP['vitamins & supplements'], bgColor: 'bg-[#FFFBEB]' },
          { id: 'hygiene', name: 'Personal Hygiene', image: CATEGORY_IMAGE_MAP['personal hygiene'], bgColor: 'bg-[#F0FDF4]' },
          { id: 'baby-care', name: 'Baby Care Essentials', image: CATEGORY_IMAGE_MAP['baby care essentials'], bgColor: 'bg-[#FDF2F8]' },
          { id: 'devices', name: 'Medical Devices', image: CATEGORY_IMAGE_MAP['medical devices'], bgColor: 'bg-[#F5F3FF]' },
        ],
      },
    ],
    defaultProducts: [
      {
        _id: 'pharm_1',
        name: 'Dettol Antiseptic Liquid Disinfectant 550ml',
        price: 185,
        discountPrice: 210,
        category: 'First Aid & Bandages',
        cashbackRate: 3,
        image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&auto=format&fit=crop&q=80',
        description: 'Effective multi-purpose antiseptic liquid for cuts, scrapes, and hygiene.',
      },
      {
        _id: 'pharm_2',
        name: 'Limcee Vitamin C Chewable 500mg Tablets (Strip of 15)',
        price: 35,
        discountPrice: 42,
        category: 'Vitamins & Supplements',
        cashbackRate: 3,
        image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=400&auto=format&fit=crop&q=80',
        description: 'Daily immunity booster chewable orange flavour vitamin C tablets.',
      },
      {
        _id: 'pharm_3',
        name: 'Omron Digital Body Thermometer with Beep Alert',
        price: 249,
        discountPrice: 350,
        category: 'Medical Devices',
        cashbackRate: 3,
        image: 'https://images.unsplash.com/photo-1584362917165-526a968579e8?w=400&auto=format&fit=crop&q=80',
        description: 'Fast 60-second accurate temperature reading with memory recall.',
      },
    ],
  },

  restaurant: {
    title: 'Food & Dining Menu',
    searchPlaceholder: 'Search for starters, biryani, curries, naan, cold coffee...',
    departmentTabs: [
      { id: 'all', label: 'All', icon: 'restaurant_menu' },
      { id: 'starters', label: 'Starters', icon: 'tapas', department: 'Starters' },
      { id: 'curries', label: 'Main Course', icon: 'dinner_dining', department: 'Curries' },
      { id: 'beverages', label: 'Drinks', icon: 'local_bar', department: 'Drinks' },
    ],
    categorySections: [
      {
        groupTitle: 'Food Menu & Delicacies',
        department: 'Food',
        icon: 'restaurant',
        categories: [
          { id: 'starters', name: 'Starters & Snacks', image: CATEGORY_IMAGE_MAP['starters & snacks'], bgColor: 'bg-[#FFFBEB]' },
          { id: 'curries', name: 'Main Course Curries', image: CATEGORY_IMAGE_MAP['main course curries'], bgColor: 'bg-[#FEF2F2]' },
          { id: 'biryani', name: 'Biryani & Fried Rice', image: CATEGORY_IMAGE_MAP['biryani & fried rice'], bgColor: 'bg-[#FFF7ED]' },
          { id: 'breads', name: 'Fresh Breads & Naan', image: CATEGORY_IMAGE_MAP['fresh breads & naan'], bgColor: 'bg-[#F0FDF4]' },
          { id: 'beverages', name: 'Cold Beverages & Shakes', image: CATEGORY_IMAGE_MAP['cold beverages & shakes'], bgColor: 'bg-[#EFF6FF]' },
          { id: 'desserts', name: 'Desserts & Ice Creams', image: CATEGORY_IMAGE_MAP['desserts & ice creams'], bgColor: 'bg-[#FDF2F8]' },
        ],
      },
    ],
    defaultProducts: [
      {
        _id: 'rest_1',
        name: 'Paneer Butter Masala (Full Handi)',
        price: 260,
        discountPrice: 299,
        category: 'Main Course Curries',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400&auto=format&fit=crop&q=80',
        description: 'Creamy slow-simmered rich tomato gravy loaded with fresh malai paneer cubes.',
      },
      {
        _id: 'rest_2',
        name: 'Special Dum Hyderabadi Veg Biryani with Raita',
        price: 220,
        discountPrice: 250,
        category: 'Biryani & Fried Rice',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&auto=format&fit=crop&q=80',
        description: 'Aromatic long-grain basmati rice infused with whole saffron and exotic spices.',
      },
      {
        _id: 'rest_3',
        name: 'Crispy Veg Manchurian Dry (8 Pcs)',
        price: 180,
        discountPrice: 210,
        category: 'Starters & Snacks',
        cashbackRate: 5,
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=80',
        description: 'Golden fried vegetable balls tossed in spicy garlic soy sauce.',
      },
    ],
  },
};

export function getStoreTypeConfig(categoryString = '') {
  const key = detectStoreCategoryKey(categoryString);
  return STORE_PRESETS[key] || null;
}
