import { create } from 'zustand';

// Supported Languages - Currently restricted to English and Hindi only as per product specification.
// (Future area-wise / regional languages will be plugged into this schema later).
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', icon: 'translate' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', icon: 'language' }
];

export const translations = {
  hi: {
    // Navigation & Menus
    'home': 'होम',
    'dashboard': 'डैशबोर्ड',
    'wallet': 'वॉलेट',
    'passbook': 'पासबुक',
    'profile': 'प्रोफ़ाइल',
    'requests': 'रिक्वेस्ट्स',
    'notifications': 'सूचनाएं',
    'support': 'सपोर्ट',
    'settings': 'सेटिंग्स',
    'logout': 'लॉगआउट',
    'logout account': 'खाता लॉगआउट करें',
    'scan_qr': 'QR स्कैन करें',
    'store_qr': 'दुकान QR',
    'explore': 'एक्सप्लोर',
    'history': 'इतिहास',
    'chats': 'चैट्स',
    'chat': 'चैट',
    'bills': 'बिल',
    'store': 'स्टोर',
    'storefront': 'स्टोरफ्रंट',
    'ratings': 'रेटिंग्स',
    'subscription': 'सब्सक्रिप्शन',
    'transactions': 'लेन-देन',
    'customers': 'ग्राहक',
    'shop & pay later': 'शॉप एंड पे लेटर',
    'apply loan': 'लोन आवेदन',
    'soon': 'जल्द',
    'help & support': 'मदद एवं सहायता',
    'support': 'सहायता',

    // Dashboard Cards & Stats
    'welcome back': 'वापसी पर स्वागत है',
    'total revenue': 'कुल राजस्व',
    'cashback given': 'दिया गया कैशबैक',
    'total txns': 'कुल लेन-देन',
    'total transactions': 'कुल लेन-देन',
    'action required': 'कार्रवाई आवश्यक',
    'view all': 'सभी देखें',
    'recent activity': 'हालिया गतिविधि',
    'bill no:': 'बिल नं:',
    'bill no': 'बिल नं',
    'bill amount': 'बिल राशि',
    'estimated cb': 'अनुमानित कैशबैक',
    'cb:': 'कैशबैक:',
    'cashback': 'कैशबैक',
    'request': 'अनुरोध',
    'unique': 'विशिष्ट',
    'all time': 'कुल समय',
    'no pending requests': 'कोई लंबित अनुरोध नहीं है',
    'no notifications': 'कोई सूचना नहीं है',
    'view attached receipt': 'संलग्न रसीद देखें',
    'add story': 'स्टोरी जोड़ें',
    'post daily deals & photos to nearby customers': 'आस-पास के ग्राहकों के लिए दैनिक ऑफ़र व फ़ोटो पोस्ट करें',

    // Cash Mode & OTP Cashback
    'cash mode': 'कैश मोड',
    'cash mode • otp required': 'कैश मोड • OTP आवश्यक',
    'customer otp': 'कस्टमर OTP कोड',
    'customer otp code': 'कस्टमर OTP कोड',
    'verification code': 'सत्यापन कोड (OTP)',
    'enter 3-digit vendor code': '3 अंकों का वेंडर कोड दर्ज करें',
    'enter code': 'कोड दर्ज करें',
    'tell this code to customer': 'यह कोड कस्टमर को बताएं',
    'tell code to customer': 'यह कोड कस्टमर को बताएं',
    'share code to approve': 'स्वीकृत करने के लिए कोड बताएं',
    'auto-approves cashback upon entry': 'कोड दर्ज होते ही कैशबैक तुरंत स्वीकृत होगा',
    'ask the shopkeeper for the 3-digit code on their app for instant auto-approval.': 'तत्काल कैशबैक के लिए दुकानदार से उनकी ऐप में दिख रहा 3 अंकों का कोड पूछें।',
    'verify & auto-approve': 'सत्यापित व स्वीकृत करें',
    'cashback successful': 'कैशबैक सफल',
    'verified via otp': 'OTP द्वारा सत्यापित',
    'cashback processed successfully': 'कैशबैक सफलतापूर्वक प्रोसेस हुआ',
    'verified': 'सत्यापित',
    'approved': 'स्वीकृत',
    'pending': 'लंबित',
    'rejected': 'अस्वीकृत',
    'on hold': 'होल्ड पर',
    'release hold': 'होल्ड हटाएं',
    'hold': 'होल्ड',
    'approve': 'स्वीकार करें',
    'reject': 'अस्वीकार करें',
    'verifying...': 'सत्यापित हो रहा है...',

    // Top Bar & Buttons
    'my qr': 'मेरा QR',
    'scan qr': 'QR स्कैन करें',
    'store qr': 'दुकान QR',
    'quick bill': 'त्वरित बिल',
    'generate bill': 'बिल बनाएं',
    'pos bill': 'POS बिल',
    'generate pos bill': 'POS बिल बनाएं',
    'recharge wallet': 'वॉलेट रिचार्ज करें',
    'cashback wallet balance is ₹0': 'कैशबैक वॉलेट बैलेंस ₹0 है',

    // Preferences & Settings
    'app language': 'ऐप भाषा',
    'select language': 'भाषा चुनें',
    'current language': 'वर्तमान भाषा',
    'currently available in english and hindi': 'वर्तमान में केवल हिन्दी और अंग्रेज़ी उपलब्ध हैं',
    'currently available in english & hindi': 'वर्तमान में केवल हिन्दी और अंग्रेज़ी उपलब्ध हैं',
    'push notifications': 'पुश नोटिफ़िकेशन',
    'biometric security': 'बायोमेट्रिक सुरक्षा',
    'accounts & history': 'खाते और इतिहास',
    'withdrawal accounts': 'निकासी खाते (बैंक/UPI)',
    'rewards wallet': 'रिवार्ड्स वॉलेट',
    'my qr code': 'मेरा QR कोड',
    'refer & earn': 'रेफ़र और कमाएं',
    'help & faq support': 'मदद एवं सहायता',
    'save': 'सुरक्षित करें',
    'cancel': 'रद्द करें',
    'done': 'संपन्न'
  }
};

const getSavedLanguage = () => {
  try {
    const saved = localStorage.getItem('zeebac_app_language');
    if (saved === 'hi' || saved === 'en') return saved;
  } catch (e) {
    // ignore
  }
  return 'en';
};

export const useLanguageStore = create((set, get) => ({
  language: getSavedLanguage(),
  supportedLanguages: SUPPORTED_LANGUAGES,

  setLanguage: (langCode) => {
    if (langCode === 'en' || langCode === 'hi') {
      try {
        localStorage.setItem('zeebac_app_language', langCode);
      } catch (e) {
        // ignore
      }
      set({ language: langCode });
    }
  },

  // Smart translation function
  // Accepts either a translation key or raw English text and returns Hindi if selected
  t: (textOrKey, fallback = '') => {
    const lang = get().language || 'en';
    if (!textOrKey) return fallback || '';
    if (lang === 'en') return fallback || textOrKey;

    const dict = translations.hi || {};

    // 1. Direct key match
    if (dict[textOrKey] !== undefined) {
      return dict[textOrKey];
    }

    // 2. Normalized lowercase match
    const normalized = String(textOrKey).trim().toLowerCase();
    if (dict[normalized] !== undefined) {
      return dict[normalized];
    }

    return fallback || textOrKey;
  }
}));

export default useLanguageStore;
