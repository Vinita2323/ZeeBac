import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { UserAPI, API_BASE_URL } from '../../../services/api';
import { calculateDistance } from '../../../utils/distance';
import useCartStore from '../../../store/useCartStore';
import useLanguageStore from '../../../store/useLanguageStore';

// Blinkit / Zepto Style Visual Category Hierarchy matching user reference interface
const BLINKIT_CATEGORY_SECTIONS = [
  {
    groupTitle: 'Grocery & Kitchen',
    department: 'Grocery & Kitchen',
    icon: 'local_mall',
    categories: [
      {
        id: 'vegetables-fruits',
        name: 'Vegetables & Fruits',
        image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'atta-rice-dal',
        name: 'Atta, Rice & Dal',
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'oil-ghee-masala',
        name: 'Oil, Ghee & Masala',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'dairy-bread-eggs',
        name: 'Dairy, Bread & Eggs',
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'bakery-biscuits',
        name: 'Bakery & Biscuits',
        image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'dry-fruits-cereals',
        name: 'Dry Fruits & Cereals',
        image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'chicken-meat-fish',
        name: 'Chicken, Meat & Fish',
        image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'kitchenware-appliances',
        name: 'Kitchenware & Appliances',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  },
  {
    groupTitle: 'Snacks & Drinks',
    department: 'Snacks & Drinks',
    icon: 'fastfood',
    categories: [
      {
        id: 'chips-namkeen',
        name: 'Chips & Namkeen',
        image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'sweets-chocolates',
        name: 'Sweets & Chocolates',
        image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'drinks-juices',
        name: 'Drinks & Juices',
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'tea-coffee-drinks',
        name: 'Tea, Coffee & Drinks',
        image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'instant-food',
        name: 'Instant Food',
        image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'sauces-spreads',
        name: 'Sauces & Spreads',
        image: 'https://images.unsplash.com/photo-1528750997573-59b89d56f4f7?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'paan-corner',
        name: 'Paan Corner',
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'ice-creams-more',
        name: 'Ice Creams & More',
        image: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  },
  {
    groupTitle: 'Personal Care & Household',
    department: 'Personal Care & Household',
    icon: 'spa',
    categories: [
      {
        id: 'bath-body',
        name: 'Bath & Body',
        image: 'https://images.unsplash.com/photo-1607006314605-724e54885834?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'cleaning-detergents',
        name: 'Cleaning & Detergents',
        image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'oral-dental-care',
        name: 'Oral & Dental Care',
        image: 'https://images.unsplash.com/photo-1559591937-e16e45f65b11?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      },
      {
        id: 'pooja-needs',
        name: 'Pooja Needs',
        image: 'https://images.unsplash.com/photo-1609137144822-446757d5eeea?w=240&auto=format&fit=crop&q=80',
        bgColor: 'bg-[#EBF7FD]'
      }
    ]
  }
];

// Department quick filters across the top
const DEPARTMENT_TABS = [
  { id: 'all', label: 'All', icon: 'grid_view' },
  { id: 'grocery', label: 'Grocery & Kitchen', icon: 'shopping_basket', department: 'Grocery & Kitchen' },
  { id: 'snacks', label: 'Snacks & Drinks', icon: 'lunch_dining', department: 'Snacks & Drinks' },
  { id: 'personal', label: 'Personal & Care', icon: 'sanitizer', department: 'Personal Care & Household' }
];

// Comprehensive realistic shop catalog spanning every Blinkit/Zepto category
const DEFAULT_SHOP_PRODUCTS = [
  // Vegetables & Fruits
  {
    _id: 'prod_veg_tomato',
    name: 'Fresh Hybrid Tomatoes 1 kg',
    price: 35,
    discountPrice: 45,
    category: 'Vegetables & Fruits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80',
    description: 'Farm-fresh juicy red tomatoes, rich in vitamin C and antioxidants.'
  },
  {
    _id: 'prod_veg_potato',
    name: 'Fresh Farm Potatoes (Aloo) 1 kg',
    price: 28,
    discountPrice: 35,
    category: 'Vegetables & Fruits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&auto=format&fit=crop&q=80',
    description: 'Fresh earthen potatoes suitable for curries, boiling, and roasting.'
  },
  {
    _id: 'prod_veg_apple',
    name: 'Shimla Royal Delicious Apples 1 kg',
    price: 140,
    discountPrice: 180,
    category: 'Vegetables & Fruits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&auto=format&fit=crop&q=80',
    description: 'Crisp and sweet hand-picked premium mountain apples.'
  },
  {
    _id: 'prod_veg_banana',
    name: 'Fresh Robusta Bananas (1 Dozen)',
    price: 60,
    discountPrice: 75,
    category: 'Vegetables & Fruits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&auto=format&fit=crop&q=80',
    description: 'Naturally ripened, rich in potassium and instant energy.'
  },

  // Atta, Rice & Dal
  {
    _id: 'prod_atta_aashirvaad',
    name: 'Aashirvaad Shudh Chakki Atta 5 kg',
    price: 260,
    discountPrice: 295,
    category: 'Atta, Rice & Dal',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
    description: '100% whole wheat chakki atta with natural dietary fibers.'
  },
  {
    _id: 'prod_rice_indiagate',
    name: 'India Gate Super Basmati Rice 1 kg',
    price: 135,
    discountPrice: 160,
    category: 'Atta, Rice & Dal',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
    description: 'Aromatic long-grain aged Basmati rice for special biryanis.'
  },
  {
    _id: 'prod_dal_toor',
    name: 'Tata Sampann Unpolished Toor Dal 1 kg',
    price: 175,
    discountPrice: 199,
    category: 'Atta, Rice & Dal',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1585994192700-4e12e12e3e60?w=400&auto=format&fit=crop&q=80',
    description: 'High protein unpolished toor dal for everyday nutrition.'
  },

  // Oil, Ghee & Masala
  {
    _id: 'prod_oil_fortune',
    name: 'Fortune Sunlite Refined Sunflower Oil 1 L',
    price: 145,
    discountPrice: 175,
    category: 'Oil, Ghee & Masala',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&auto=format&fit=crop&q=80',
    description: 'Enriched with Vitamin A and D for healthy daily cooking.'
  },
  {
    _id: 'prod_ghee_amul',
    name: 'Amul Pure Cow Ghee 1 L',
    price: 590,
    discountPrice: 640,
    category: 'Oil, Ghee & Masala',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&auto=format&fit=crop&q=80',
    description: 'Traditional aroma and pure cow ghee goodness for home delicacies.'
  },
  {
    _id: 'prod_salt_tata',
    name: 'Tata Salt Vacuum Evaporated 1 kg',
    price: 28,
    discountPrice: 32,
    category: 'Oil, Ghee & Masala',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=400&auto=format&fit=crop&q=80',
    description: 'Desh Ka Namak - Vacuum evaporated iodized salt.'
  },

  // Dairy, Bread & Eggs
  {
    _id: 'prod_dairy_milk',
    name: 'Amul Taaza Homogenised Toned Milk 1 L',
    price: 72,
    discountPrice: 75,
    category: 'Dairy, Bread & Eggs',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&auto=format&fit=crop&q=80',
    description: 'Pasteurized long-life toned milk with zero preservatives.'
  },
  {
    _id: 'prod_dairy_butter',
    name: 'Amul Salted Butter 500g',
    price: 275,
    discountPrice: 290,
    category: 'Dairy, Bread & Eggs',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&auto=format&fit=crop&q=80',
    description: 'Utterly butterly delicious creamy salted butter.'
  },
  {
    _id: 'prod_dairy_bread',
    name: 'Britannia 100% Whole Wheat Bread 400g',
    price: 45,
    discountPrice: 50,
    category: 'Dairy, Bread & Eggs',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=80',
    description: 'Soft and healthy whole wheat bread baked fresh daily.'
  },
  {
    _id: 'prod_dairy_eggs',
    name: 'Farm Fresh White Eggs (Pack of 6)',
    price: 55,
    discountPrice: 65,
    category: 'Dairy, Bread & Eggs',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=400&auto=format&fit=crop&q=80',
    description: 'Nutritious farm fresh protein-rich poultry eggs.'
  },

  // Bakery & Biscuits
  {
    _id: 'prod_bisc_oreo',
    name: 'Oreo Vanilla Cream Biscuits 120g',
    price: 40,
    discountPrice: 45,
    category: 'Bakery & Biscuits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&auto=format&fit=crop&q=80',
    description: 'Crunchy chocolate cookie sandwich with smooth vanilla cream.'
  },
  {
    _id: 'prod_bisc_goodday',
    name: 'Britannia Good Day Cashew Cookies 200g',
    price: 45,
    discountPrice: 50,
    category: 'Bakery & Biscuits',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=80',
    description: 'Rich buttery cookies with roasted crunchy cashew nuts.'
  },

  // Dry Fruits & Cereals
  {
    _id: 'prod_dry_almonds',
    name: 'Premium California Almonds (Badam) 250g',
    price: 230,
    discountPrice: 280,
    category: 'Dry Fruits & Cereals',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?w=400&auto=format&fit=crop&q=80',
    description: 'Whole crisp crunchy California badam packed with vitamin E.'
  },
  {
    _id: 'prod_cereal_cornflakes',
    name: "Kellogg's Real Honey & Almond Corn Flakes 500g",
    price: 195,
    discountPrice: 240,
    category: 'Dry Fruits & Cereals',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1521483451569-e33803c0330c?w=400&auto=format&fit=crop&q=80',
    description: 'Golden crunchy corn flakes for wholesome breakfast energy.'
  },

  // Chicken, Meat & Fish
  {
    _id: 'prod_meat_chicken',
    name: 'Fresh Chicken Curry Cut (Skinless) 500g',
    price: 160,
    discountPrice: 190,
    category: 'Chicken, Meat & Fish',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&auto=format&fit=crop&q=80',
    description: 'Tender antibiotic-free chicken washed and cut for homestyle curry.'
  },

  // Kitchenware & Appliances
  {
    _id: 'prod_kit_bottle',
    name: 'Prestige Stainless Steel Water Bottle 1 L',
    price: 299,
    discountPrice: 450,
    category: 'Kitchenware & Appliances',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&auto=format&fit=crop&q=80',
    description: 'BPA-free durable single-wall stainless steel sports bottle.'
  },

  // Chips & Namkeen
  {
    _id: 'prod_chips_lays',
    name: "Lay's India's Magic Masala Chips 50g",
    price: 20,
    discountPrice: 20,
    category: 'Chips & Namkeen',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&auto=format&fit=crop&q=80',
    description: 'Crispy wafer thin potato chips seasoned with authentic Indian spices.'
  },
  {
    _id: 'prod_namkeen_bhujia',
    name: "Haldiram's Nagpur Aloo Bhujia 400g",
    price: 95,
    discountPrice: 110,
    category: 'Chips & Namkeen',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=80',
    description: 'Crispy spicy mint-flavoured potato and gram flour sev namkeen.'
  },

  // Sweets & Chocolates
  {
    _id: 'prod_choc_silk',
    name: 'Cadbury Dairy Milk Silk Chocolate 150g',
    price: 175,
    discountPrice: 190,
    category: 'Sweets & Chocolates',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&auto=format&fit=crop&q=80',
    description: 'Velvety smooth melt-in-mouth milk chocolate delight.'
  },
  {
    _id: 'prod_sweet_gulabjamun',
    name: "Haldiram's Gulab Jamun Tin 1 kg",
    price: 220,
    discountPrice: 260,
    category: 'Sweets & Chocolates',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&auto=format&fit=crop&q=80',
    description: 'Soft traditional Indian khoya dumplings soaked in fragrant rose syrup.'
  },

  // Drinks & Juices
  {
    _id: 'prod_drink_coke',
    name: 'Coca-Cola Soft Drink 750ml Bottle',
    price: 40,
    discountPrice: 45,
    category: 'Drinks & Juices',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&auto=format&fit=crop&q=80',
    description: 'Chilled refreshing sparkling cola drink with classic crisp taste.'
  },
  {
    _id: 'prod_juice_real',
    name: 'Real Fruit Power Mixed Fruit Juice 1 L',
    price: 110,
    discountPrice: 135,
    category: 'Drinks & Juices',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80',
    description: 'Made from 9 delicious fruits with no added preservatives.'
  },

  // Tea, Coffee & Drinks
  {
    _id: 'prod_tea_redlabel',
    name: 'Brooke Bond Red Label Natural Care Tea 500g',
    price: 285,
    discountPrice: 330,
    category: 'Tea, Coffee & Drinks',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&auto=format&fit=crop&q=80',
    description: 'CTC tea blended with 5 ayurvedic ingredients like Tulsi, Ashwagandha and Ginger.'
  },
  {
    _id: 'prod_coffee_nescafe',
    name: 'Nescafe Classic 100% Pure Coffee 50g',
    price: 165,
    discountPrice: 190,
    category: 'Tea, Coffee & Drinks',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80',
    description: 'Rich aroma and signature roast coffee granules for an instant boost.'
  },

  // Instant Food
  {
    _id: 'prod_food_maggi',
    name: 'Maggi 2-Minute Masala Instant Noodles 280g',
    price: 55,
    discountPrice: 60,
    category: 'Instant Food',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=400&auto=format&fit=crop&q=80',
    description: "India's favourite noodles with iron and authentic roasted masala tastemaker."
  },

  // Sauces & Spreads
  {
    _id: 'prod_sauce_ketchup',
    name: 'Kissan Fresh Tomato Ketchup 1 kg',
    price: 125,
    discountPrice: 150,
    category: 'Sauces & Spreads',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1528750997573-59b89d56f4f7?w=400&auto=format&fit=crop&q=80',
    description: 'Tangy red tomato ketchup made from 100% real ripe tomatoes.'
  },
  {
    _id: 'prod_spread_nutella',
    name: 'Nutella Hazelnut Cocoa Spread 350g',
    price: 360,
    discountPrice: 410,
    category: 'Sauces & Spreads',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?w=400&auto=format&fit=crop&q=80',
    description: 'Creamy rich hazelnut spread with premium cocoa.'
  },

  // Paan Corner
  {
    _id: 'prod_paan_passpass',
    name: 'Pass Pass Mint Mouth Freshener 115g',
    price: 45,
    discountPrice: 50,
    category: 'Paan Corner',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=80',
    description: 'Traditional herbal mouth freshener with sweet dates and mint.'
  },

  // Ice Creams & More
  {
    _id: 'prod_ice_amul',
    name: 'Amul Real Milk Vanilla Magic Ice Cream 1 L',
    price: 160,
    discountPrice: 180,
    category: 'Ice Creams & More',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&auto=format&fit=crop&q=80',
    description: 'Rich creamy vanilla ice cream prepared with pure dairy milk.'
  },

  // Bath & Body
  {
    _id: 'prod_soap_dettol',
    name: 'Dettol Original Germ Protection Bath Soap (125g)',
    price: 40,
    discountPrice: 48,
    category: 'Bath & Body',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1607006314605-724e54885834?w=400&auto=format&fit=crop&q=80',
    description: 'Complete germ protection bath soap for daily skin hygiene.'
  },
  {
    _id: 'prod_soap_dove',
    name: 'Dove Deep Moisture Body Wash 250ml',
    price: 199,
    discountPrice: 245,
    category: 'Bath & Body',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
    description: 'Nourishing microbiome gentle body wash for softer smoother skin.'
  },

  // Cleaning & Detergents
  {
    _id: 'prod_clean_surf',
    name: 'Surf Excel Easy Wash Detergent Powder 1 kg',
    price: 140,
    discountPrice: 160,
    category: 'Cleaning & Detergents',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&auto=format&fit=crop&q=80',
    description: 'Superfast stain removal washing powder that dissolves easily in water.'
  },

  // Oral & Dental Care
  {
    _id: 'prod_oral_colgate',
    name: 'Colgate Strong Teeth Dental Care Toothpaste 200g',
    price: 110,
    discountPrice: 125,
    category: 'Oral & Dental Care',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1559591937-e16e45f65b11?w=400&auto=format&fit=crop&q=80',
    description: 'Amino Shakti formula adds natural calcium to make teeth 2X stronger.'
  },

  // Pooja Needs
  {
    _id: 'prod_pooja_agarbatti',
    name: 'Mangaldeep Sandalwood Fragrance Agarbatti',
    price: 45,
    discountPrice: 50,
    category: 'Pooja Needs',
    cashbackRate: 3,
    image: 'https://images.unsplash.com/photo-1609137144822-446757d5eeea?w=400&auto=format&fit=crop&q=80',
    description: 'Pure sandalwood aroma incense sticks for peaceful home worship.'
  }
];

export default function VendorDetailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguageStore();

  const passedVendor = location.state?.vendor;
  const defaultVendor = {
    _id: 'sharma_gen_store',
    zeebacId: 'ZBV-1001',
    storeName: "Sharma General Store",
    cashbackRate: 3,
    category: "Grocery",
    address: "Kirana • FMCG • Household, Hazratganj, Lucknow",
    city: "Lucknow",
    storeLogo: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400&auto=format&fit=crop&q=80",
    phone: "9876543210",
    openingHours: "9:00 AM – 10:00 PM",
    rating: 4.5,
    reviewCount: 128,
    isVerified: true,
  };

  const [vendor, setVendor] = useState(passedVendor || defaultVendor);
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showShopDetailsModal, setShowShopDetailsModal] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Cart store hooks
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const getItemQuantity = useCartStore((state) => state.getItemQuantity);
  const cartItemsCount = useCartStore((state) => state.getTotalItemsCount());
  const cartTotalAmount = useCartStore((state) => state.getTotalAmount());
  const cartTotalCashback = useCartStore((state) => state.getTotalCashback());

  const productSectionRef = useRef(null);

  // Location handling for real-time distance
  const [userCoords] = useState(() => {
    try {
      const stored = localStorage.getItem('zeebac_location');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Fetch full vendor details if available
  useEffect(() => {
    const fetchVendorData = async () => {
      const zeebacId = vendor.zeebacId;
      if (!zeebacId) return;
      try {
        const res = await UserAPI.getVendorDetails(zeebacId);
        if (res.success && res.data) {
          setVendor(prev => ({ ...prev, ...res.data }));
        }
      } catch (err) {
        console.warn('Could not load extra vendor details', err);
      }
    };
    fetchVendorData();
  }, [vendor.zeebacId]);

  // Fetch Products from Backend or load rich realistic catalog
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        if (vendor?._id && typeof vendor._id === 'string' && vendor._id.length === 24) {
          const res = await UserAPI.getVendorProducts(vendor._id);
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setProducts(res.data);
            setIsLoadingProducts(false);
            return;
          }
        }
        // Fallback realistic shop catalog tailored with this store's cashback
        const storeCashback = vendor.cashbackRate || 3;
        const mappedDemo = DEFAULT_SHOP_PRODUCTS.map(p => ({
          ...p,
          cashbackRate: storeCashback
        }));
        setProducts(mappedDemo);
      } catch (err) {
        console.warn('Failed to load products, using fallback:', err);
        setProducts(DEFAULT_SHOP_PRODUCTS);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    loadProducts();
  }, [vendor]);

  // Check favorite status
  useEffect(() => {
    const checkFav = async () => {
      if (!vendor?._id) return;
      try {
        const res = await UserAPI.getFavorites();
        if (res.success && Array.isArray(res.data)) {
          const ids = res.data.map(v => String(v._id));
          setIsFavorite(ids.includes(String(vendor._id)));
        }
      } catch (e) {
        console.warn('Failed to check favorite status', e);
      }
    };
    checkFav();
  }, [vendor._id]);

  const handleFavoriteToggle = async () => {
    try {
      if (vendor?._id) {
        const res = await UserAPI.toggleFavorite(vendor._id);
        setIsFavorite(res.isFavorite);
      } else {
        setIsFavorite(!isFavorite);
      }
    } catch {
      setIsFavorite(!isFavorite);
    }
  };

  // Helper distance calculator
  const displayDistance = useMemo(() => {
    if (vendor.distanceDisplay) return vendor.distanceDisplay;
    if (userCoords?.lat && userCoords?.lng && vendor.location?.coordinates?.length === 2) {
      const d = calculateDistance(
        userCoords.lat,
        userCoords.lng,
        vendor.location.coordinates[1],
        vendor.location.coordinates[0]
      );
      return `${d} km`;
    }
    return '0.6 km';
  }, [vendor, userCoords]);

  const displayCity = useMemo(() => {
    if (vendor.city) return vendor.city;
    if (vendor.address?.city) return vendor.address.city;
    if (typeof vendor.address === 'string' && vendor.address.includes('Lucknow')) return 'Lucknow';
    return 'Lucknow';
  }, [vendor]);

  // Category Matching Helper to support both exact categories and broad merchant categories
  const matchesCategory = (productCategory, targetCategory) => {
    if (targetCategory === 'All') return true;
    const p = (productCategory || '').toLowerCase();
    const t = targetCategory.toLowerCase();

    if (p === t) return true;
    if (p.includes(t) || t.includes(p)) return true;

    if (t.includes('vegetables') || t.includes('fruits')) {
      return p.includes('vegetables') || p.includes('fruits') || p.includes('produce') || p === 'grocery';
    }
    if (t.includes('atta') || t.includes('rice') || t.includes('dal')) {
      return p.includes('atta') || p.includes('rice') || p.includes('dal') || p === 'grocery';
    }
    if (t.includes('oil') || t.includes('ghee') || t.includes('masala')) {
      return p.includes('oil') || p.includes('ghee') || p.includes('masala') || p.includes('salt');
    }
    if (t.includes('dairy') || t.includes('bread') || t.includes('eggs')) {
      return p.includes('dairy') || p.includes('milk') || p.includes('butter') || p.includes('bread') || p.includes('egg');
    }
    if (t.includes('bakery') || t.includes('biscuits')) {
      return p.includes('bakery') || p.includes('biscuit') || p.includes('cookie');
    }
    if (t.includes('dry fruits') || t.includes('cereals')) {
      return p.includes('dry fruits') || p.includes('cereal') || p.includes('almond') || p.includes('kaju');
    }
    if (t.includes('chicken') || t.includes('meat') || t.includes('fish')) {
      return p.includes('chicken') || p.includes('meat') || p.includes('fish') || p.includes('egg');
    }
    if (t.includes('kitchenware') || t.includes('appliances')) {
      return p.includes('kitchen') || p.includes('bottle') || p.includes('pan') || p.includes('appliance');
    }
    if (t.includes('chips') || t.includes('namkeen')) {
      return p.includes('chip') || p.includes('namkeen') || p.includes('snack') || p === 'fmcg';
    }
    if (t.includes('sweets') || t.includes('chocolates')) {
      return p.includes('sweet') || p.includes('chocolate') || p.includes('mithai');
    }
    if (t.includes('drinks') || t.includes('juices')) {
      return p.includes('drink') || p.includes('juice') || p.includes('coke') || p.includes('beverage') || p === 'fmcg';
    }
    if (t.includes('tea') || t.includes('coffee')) {
      return p.includes('tea') || p.includes('coffee') || p.includes('chai');
    }
    if (t.includes('instant food')) {
      return p.includes('instant') || p.includes('noodle') || p.includes('maggi') || p === 'fmcg';
    }
    if (t.includes('sauces') || t.includes('spreads')) {
      return p.includes('sauce') || p.includes('ketchup') || p.includes('spread') || p.includes('jam');
    }
    if (t.includes('bath') || t.includes('body')) {
      return p.includes('bath') || p.includes('body') || p.includes('soap') || p === 'household';
    }
    if (t.includes('cleaning') || t.includes('detergents')) {
      return p.includes('clean') || p.includes('detergent') || p.includes('wash') || p === 'household';
    }
    if (t.includes('oral') || t.includes('dental')) {
      return p.includes('oral') || p.includes('dental') || p.includes('tooth');
    }
    if (t.includes('pooja')) {
      return p.includes('pooja') || p.includes('incense') || p.includes('agarbatti');
    }

    return false;
  };

  // Filtered products list based on active category and live search
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = searchQuery.trim() === '' ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = matchesCategory(product.category, activeCategory);
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, activeCategory]);

  // Voice Search Handler via Web Speech API
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in this browser. Please type in the search bar.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setActiveCategory('All');
        productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      recognition.start();
    } catch (e) {
      console.warn('Voice recognition error:', e);
      setIsListening(false);
    }
  };

  // Tapping a category card from the Blinkit visual grid
  const handleSelectCategory = (categoryName) => {
    setActiveCategory(categoryName);
    setSearchQuery('');
    setTimeout(() => {
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleGetDirections = () => {
    const query = encodeURIComponent(`${vendor.storeName}, ${displayCity}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const handleShopAtStore = () => {
    if (cartItemsCount > 0) {
      navigate('/cart');
    } else {
      productSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const vendorImageSrc = vendor.storeLogo || vendor.profilePic || vendor.storeCoverImage || DEFAULT_SHOP_PRODUCTS[0].image;

  return (
    <div className="mesh-gradient text-on-surface font-body-lg min-h-screen flex flex-col pb-36">

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => safeNavigateBack(navigate, '/explore')}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-800 cursor-pointer transition-colors shrink-0"
            title={t('Back')}
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-black text-[17px] sm:text-[19px] text-slate-900 truncate leading-tight">
              {vendor.storeName || 'Sharma General Store'}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              {vendor.category || 'Grocery'} • {displayDistance} • {displayCity}
            </p>
          </div>
        </div>

        <button
          onClick={handleFavoriteToggle}
          className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer transition-colors shrink-0"
          title={isFavorite ? t('Remove from Favorites') : t('Add to Favorites')}
        >
          <span
            className={`material-symbols-outlined text-[24px] ${isFavorite ? 'text-red-500' : 'text-slate-700'}`}
            style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : "'FILL' 0" }}
          >
            favorite
          </span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 app-container px-3.5 sm:px-4 py-3.5 space-y-4 text-left">

        {/* ── 1. STORE OVERVIEW CARD ── */}
        <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-slate-100 shadow-sm flex items-center gap-3.5 relative overflow-hidden">
          <div className="w-22 h-22 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-purple-50 border border-purple-100 shrink-0 relative group">
            <img
              src={vendorImageSrc.startsWith('http') || vendorImageSrc.startsWith('data:') ? vendorImageSrc : `${API_BASE_URL}${vendorImageSrc}`}
              alt={vendor.storeName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded-md bg-black/65 backdrop-blur-xs text-white text-[9px] font-bold">
              {vendor.category || 'Store'}
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-primary text-[11px] font-extrabold">
              <span className="material-symbols-outlined text-[15px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span className="truncate">Verified Zeebac Store</span>
            </div>

            <p className="text-[11.5px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <span className="material-symbols-outlined text-[13px] text-slate-400">location_on</span>
              <span className="truncate">{displayDistance} • {displayCity}</span>
            </p>

            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t('Open now')}
              </span>
              <span className="text-[11px] font-bold text-slate-600">
                ⭐ {vendor.rating || '4.5'}
              </span>
            </div>

            <button
              onClick={() => navigate('/pay-vendor', { state: { vendor } })}
              className="mt-1 w-full py-1.5 px-3 rounded-xl btn-primary-gradient text-white flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <span className="font-display font-black text-[12px] tracking-wide">
                {vendor.cashbackRate ? `${vendor.cashbackRate}%+ Cashback` : '3%+ Cashback'}
              </span>
            </button>
          </div>
        </div>

        {/* ── 2. BLINKIT-STYLE QUICK SEARCH BAR WITH VOICE INPUT ── */}
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for atta, dal, coke, snacks, milk..."
              className="w-full h-11 pl-11 pr-10 bg-white rounded-2xl border border-slate-200/90 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-[13px] text-slate-800 placeholder:text-slate-400 shadow-2xs transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleVoiceSearch}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
              isListening
                ? 'bg-red-500 text-white animate-pulse border-red-500 shadow-md'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-2xs'
            }`}
            title="Voice Search"
          >
            <span className="material-symbols-outlined text-[20px]">mic</span>
          </button>
        </div>

        {/* ── 3. TOP DEPARTMENT QUICK TABS (HORIZONTAL CAROUSEL) ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {DEPARTMENT_TABS.map((tab) => {
            const isSelected = selectedDepartment === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedDepartment(tab.id);
                  if (tab.id === 'all') {
                    setActiveCategory('All');
                  }
                }}
                className={`px-3.5 py-2 rounded-2xl text-[12px] whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-900 text-white font-extrabold shadow-sm'
                    : 'bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50 font-bold'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── 4. BLINKIT / ZEPTO STYLE GROUPED CATEGORIES GRID (AS PER REFERENCE IMAGE) ── */}
        {activeCategory === 'All' && !searchQuery && (
          <div className="space-y-5 pt-1">
            {BLINKIT_CATEGORY_SECTIONS.filter((section) =>
              selectedDepartment === 'all' || section.department.toLowerCase().includes(selectedDepartment.toLowerCase())
            ).map((section) => (
              <section key={section.groupTitle} className="space-y-3">
                {/* Section Header */}
                <div className="flex items-center justify-between pl-0.5">
                  <h2 className="font-display font-black text-[16px] sm:text-[17px] text-slate-900 tracking-tight">
                    {section.groupTitle}
                  </h2>
                  <span className="text-[11px] font-bold text-primary">
                    {section.categories.length} Categories
                  </span>
                </div>

                {/* 4-Column Category Grid matching reference image */}
                <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                  {section.categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.name)}
                      className="flex flex-col items-center group cursor-pointer text-center transition-transform active:scale-95"
                    >
                      {/* Pastel Rounded Square Card */}
                      <div className={`w-full aspect-square rounded-2xl ${cat.bgColor || 'bg-[#EBF7FD]'} flex items-center justify-center p-2 border border-sky-100/70 shadow-2xs group-hover:scale-105 group-hover:shadow-xs transition-all overflow-hidden`}>
                        <img
                          src={cat.image}
                          alt={cat.name}
                          className="w-full h-full object-contain drop-shadow-xs"
                          loading="lazy"
                        />
                      </div>
                      {/* 2-line Category Title below card */}
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-800 text-center leading-tight mt-1.5 line-clamp-2 h-[28px] flex items-center justify-center">
                        {cat.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── 5. ACTIVE CATEGORY FILTER BADGE (WHEN A CATEGORY IS TAPPED) ── */}
        {activeCategory !== 'All' && (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border border-purple-200/80 rounded-2xl p-3 flex items-center justify-between shadow-2xs animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">category</span>
              <div>
                <p className="font-display font-black text-[13.5px] text-slate-900 leading-tight">
                  {activeCategory}
                </p>
                <p className="text-[10.5px] font-bold text-slate-500">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'item available' : 'items available'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveCategory('All')}
              className="px-3 py-1.5 rounded-xl bg-white border border-purple-200 text-primary hover:bg-purple-50 text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>All Categories</span>
            </button>
          </div>
        )}

        {/* ── 6. PRODUCTS LISTING GRID ── */}
        <section ref={productSectionRef} className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between pl-0.5">
            <h2 className="font-display font-black text-[15px] sm:text-[16px] text-slate-900">
              {searchQuery
                ? `Search: "${searchQuery}"`
                : activeCategory === 'All'
                ? t('Popular Products')
                : `${activeCategory}`}
            </h2>
            <span className="text-[11.5px] font-bold text-slate-500">
              {filteredProducts.length} {t('Items')}
            </span>
          </div>

          {isLoadingProducts ? (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center space-y-2.5 bg-white rounded-3xl border border-slate-100 p-6">
              <span className="material-symbols-outlined text-slate-400 text-[42px]">inventory_2</span>
              <p className="font-bold text-[14px] text-slate-800">{t('No products matched in this category')}</p>
              <p className="text-[11.5px] text-slate-500">Try browsing other categories or clear search.</p>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="mt-1 px-4 py-2 rounded-xl btn-primary-gradient text-white text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>{t('View All Categories & Products')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {filteredProducts.map((product) => {
                const qty = getItemQuantity(product._id || product.id);
                const rawRate = product.cashbackPercentage ?? product.branding?.cashbackPercentage ?? product.cashbackRate ?? vendor.cashbackRate ?? 0;
                const rate = Math.max(0, Math.min(100, Number(rawRate) || 0));
                const cashbackPoints = Math.round(product.price * (rate / 100) * 100) / 100;

                return (
                  <div
                    key={product._id || product.id}
                    className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    {/* Product Image Card */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2 mb-2">
                      <img
                        src={product.image || DEFAULT_SHOP_PRODUCTS[0].image}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      {product.discountPrice && product.discountPrice > product.price && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-amber-400 text-purple-950 font-black text-[9px] uppercase tracking-wider">
                          SAVE ₹{product.discountPrice - product.price}
                        </span>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-bold text-[13px] sm:text-[13.5px] text-slate-900 leading-snug line-clamp-2 h-[36px]">
                        {product.name}
                      </h3>

                      {/* Price row */}
                      <div className="flex items-baseline gap-1.5 pt-0.5">
                        <span className="font-black text-[16px] text-slate-900">
                          ₹{product.price}
                        </span>
                        {product.discountPrice && product.discountPrice > product.price && (
                          <span className="text-[11.5px] text-slate-400 line-through font-medium">
                            ₹{product.discountPrice}
                          </span>
                        )}
                      </div>

                      {/* Per-Product Cashback Badge in Brand Purple Theme */}
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-primary border border-purple-100 font-extrabold text-[10px] sm:text-[10.5px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span>{rate}% Cashback (+{cashbackPoints} Pts)</span>
                      </div>
                    </div>

                    {/* Quick-Commerce Add / Quantity Stepper Button */}
                    <div className="pt-2.5">
                      {qty === 0 ? (
                        <button
                          onClick={() => addItem(product, vendor)}
                          className="w-full py-2 rounded-xl btn-primary-gradient text-white font-black text-[12px] flex items-center justify-center gap-1.5 shadow-sm shadow-primary/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                          <span>{t('Add')}</span>
                        </button>
                      ) : (
                        <div className="w-full h-8 rounded-xl btn-primary-gradient text-white flex items-center justify-between px-2 shadow-sm shadow-primary/25 font-black text-[13px]">
                          <button
                            onClick={() => updateQuantity(product._id || product.id, -1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                            title="Decrease quantity"
                          >
                            <span className="material-symbols-outlined text-[16px]">remove</span>
                          </button>
                          <span className="font-mono font-bold text-[13px]">{qty}</span>
                          <button
                            onClick={() => updateQuantity(product._id || product.id, 1)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/20 active:scale-90 transition-transform cursor-pointer"
                            title="Increase quantity"
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Floating Quick-Commerce Cart Bar (like Blinkit / Zepto) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-40 px-3 max-w-[480px] mx-auto animate-bounce-short">
          <div
            onClick={() => navigate('/cart')}
            className="w-full bg-slate-900 text-white rounded-2xl p-3 shadow-xl flex items-center justify-between cursor-pointer border border-purple-500/30 hover:bg-slate-850 active:scale-98 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black relative shrink-0">
                <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-purple-950 font-black text-[9px] flex items-center justify-center">
                  {cartItemsCount}
                </span>
              </div>
              <div className="text-left">
                <p className="font-extrabold text-[13px] leading-tight text-white">
                  {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'} • ₹{Math.round((Number(cartTotalAmount) || 0) * 100) / 100}
                </p>
                <p className="text-[11px] font-bold text-amber-300 mt-0.5 flex items-center gap-1">
                  <span>🎉 Earn ₹{Math.round((Number(cartTotalCashback) || 0) * 100) / 100} Cashback</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-primary text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-xs shrink-0">
              <span>{t('View Cart')}</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons (Get Directions | Shop at Store) */}
      <footer className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-100 p-3 max-w-[480px] mx-auto">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleGetDirections}
            className="h-11 rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[18px]">near_me</span>
            <span>{t('Get Directions')}</span>
          </button>

          <button
            onClick={handleShopAtStore}
            className="h-11 rounded-full btn-primary-gradient text-white font-black text-[13px] flex items-center justify-center gap-1.5 shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {cartItemsCount > 0 ? 'shopping_bag' : 'storefront'}
            </span>
            <span>{cartItemsCount > 0 ? `${t('Cart')} (${cartItemsCount})` : t('Shop at Store')}</span>
          </button>
        </div>
      </footer>

      {/* Shop Details Modal */}
      {showShopDetailsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">store</span>
                <h3 className="font-display font-black text-[16px] text-slate-900">{vendor.storeName}</h3>
              </div>
              <button
                onClick={() => setShowShopDetailsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-[12px] text-slate-700">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">location_on</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Address')}</p>
                  <p className="text-slate-600 mt-0.5">
                    {typeof vendor.address === 'object'
                      ? [vendor.address.fullAddress, vendor.address.landmark, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(', ') || 'Hazratganj, Lucknow'
                      : (vendor.address || 'Hazratganj, Lucknow')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">schedule</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Timings')}</p>
                  <p className="text-slate-600 mt-0.5">{vendor.openingHours || '9:00 AM – 10:00 PM (All Days)'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">call</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Contact')}</p>
                  <p className="text-slate-600 mt-0.5">+91 {vendor.phone || '9876543210'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">savings</span>
                <div>
                  <p className="font-bold text-slate-900">{t('Cashback Offered')}</p>
                  <p className="text-primary font-extrabold mt-0.5">{vendor.cashbackRate || 3}%+ Guaranteed on all products</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setShowShopDetailsModal(false);
                  navigate('/pay-vendor', { state: { vendor } });
                }}
                className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-xs shadow-xs"
              >
                {t('Pay Directly')}
              </button>
              <button
                onClick={() => setShowShopDetailsModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
