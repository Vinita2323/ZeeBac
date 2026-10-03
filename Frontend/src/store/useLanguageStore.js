import { create } from 'zustand';

// Supported Languages - Currently restricted to English and Hindi only as per product specification.
// (Future area-wise / regional languages will be plugged into this schema later).
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', icon: 'translate' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', icon: 'language' }
];

export const translations = {
  hi: {
    // Greeting
    'hi': 'नमस्ते',
    'hi,': 'नमस्ते,',

    // Navigation & Menus
    'home': 'होम',
    'dashboard': 'डैशबोर्ड',
    'wallet': 'वॉलेट',
    'passbook': 'पासबुक',
    'profile': 'प्रोफ़ाइल',
    'requests': 'रिक्वेस्ट्स',
    'pending requests': 'लंबित अनुरोध',
    'review and approve cashback claims': 'कैशबैक दावों की समीक्षा करें और स्वीकृत करें',
    'notifications': 'सूचनाएं',
    'support': 'सहायता',
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
    'reviews': 'समीक्षाएं',
    'subscription': 'सब्सक्रिप्शन',
    'transactions': 'लेन-देन',
    'customers': 'ग्राहक',
    'shop & pay later': 'शॉप एंड पे लेटर',
    'apply loan': 'लोन आवेदन',
    'soon': 'जल्द',
    'coming soon': 'जल्द आ रहा है',
    'help & support': 'मदद एवं सहायता',
    'help & faqs': 'मदद व सवाल-जवाब',
    'help & faq support': 'मदद एवं सहायता',
    'whatsapp chat': 'वॉट्सऐप चैट',
    'share store': 'दुकान शेयर करें',
    'direct whatsapp, helpline & faqs': 'डायरेक्ट वॉट्सऐप, हेल्पलाइन और FAQs',
    '24x7 active': '24x7 सक्रिय',

    // Specific Transaction Types (As per user requirement)
    // English: "Cash transaction" / "Digital transaction"
    // Hindi: "नकद लेनदेन" / "डिजिटल लेनदेन"
    'cash transaction': 'नकद लेनदेन',
    'cash transction': 'नकद लेनदेन',
    'cash transactions': 'नकद लेनदेन',
    'digital transaction': 'डिजिटल लेनदेन',
    'digital transction': 'डिजिटल लेनदेन',
    'digital transactions': 'डिजिटल लेनदेन',
    'cash': 'नकद',
    'digital': 'डिजिटल',
    'cash mode': 'नकद मोड',
    'cash mode • otp required': 'नकद मोड • OTP आवश्यक',
    'cash collection': 'नकद लेनदेन',
    'digital collection': 'डिजिटल लेनदेन',

    // Dashboard Cards & Stats
    'welcome back': 'वापसी पर स्वागत है',
    'total revenue': 'कुल राजस्व',
    'cashback given': 'दिया गया कैशबैक',
    'total txns': 'कुल लेन-देन',
    'total transactions': 'कुल लेन-देन',
    "today's sale": "आज की बिक्री",
    'sales & collections': 'बिक्री और कलेक्शन',
    'platform sales & collections': 'प्लेटफ़ॉर्म बिक्री और कलेक्शन',
    'today': 'आज',
    'weekly': 'साप्ताहिक',
    'monthly': 'मासिक',
    'yearly': 'वार्षिक',
    'this week': 'इस सप्ताह',
    'this month': 'इस महीने',
    'last month': 'पिछले महीने',
    'total sales': 'कुल बिक्री',
    'orders': 'ऑर्डर्स',
    'orders breakdown': 'ऑर्डर्स विवरण',
    'no sales found': 'कोई बिक्री नहीं मिली',
    'all store transactions': 'स्टोर के सभी लेन-देन',
    'all platform transactions': 'प्लेटफ़ॉर्म के सभी लेन-देन',
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
    'all caught up!': 'सभी कार्य पूर्ण हैं!',
    'no pending requests require your attention.': 'कोई लंबित अनुरोध नहीं है।',
    'no pending requests': 'कोई लंबित अनुरोध नहीं है',
    'no notifications': 'कोई सूचना नहीं है',
    'view attached receipt': 'संलग्न रसीद देखें',
    'add story': 'स्टोरी जोड़ें',
    'post daily deals & photos to nearby customers': 'आस-पास के ग्राहकों के लिए दैनिक ऑफ़र व फ़ोटो पोस्ट करें',

    // Customer OTP Cashback
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
    'all': 'सभी',

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
    'select_language': 'भाषा चुनें',
    'current language': 'वर्तमान भाषा',
    'currently available in english and hindi': 'वर्तमान में केवल हिन्दी और अंग्रेज़ी उपलब्ध हैं',
    'currently available in english & hindi': 'वर्तमान में केवल हिन्दी और अंग्रेज़ी उपलब्ध हैं',
    'push notifications': 'पुश नोटिफ़िकेशन',
    'biometric security': 'बायोमेट्रिक सुरक्षा',
    'protect withdrawals & store funds with fingerprint, face id or pin': 'फ़िंगरप्रिंट, फेस ID या PIN से निकासी और स्टोर सुरक्षित करें',
    'backup security pin:': 'बैकअप सुरक्षा PIN:',
    'configured': 'कॉन्फ़िगर है',
    'not set': 'सेट नहीं है',
    'change pin': 'PIN बदलें',
    'set pin': 'PIN सेट करें',
    'active': 'सक्रिय',
    'accounts & history': 'खाते और इतिहास',
    'withdrawal accounts': 'निकासी खाते (बैंक/UPI)',
    'rewards wallet': 'रिवार्ड्स वॉलेट',
    'my qr code': 'मेरा QR कोड',
    'refer & earn': 'रेफ़र और कमाएं',
    'save': 'सुरक्षित करें',
    'cancel': 'रद्द करें',
    'done': 'संपन्न',
    'edit': 'संपादित करें',
    'save changes': 'बदलाव सुरक्षित करें',

    // Profile & Business Info
    'store credit & growth': 'स्टोर क्रेडिट और ग्रोथ',
    'store bnpl credit': 'स्टोर BNPL क्रेडिट',
    'merchant capital': 'मर्चेंट कैपिटल',
    'apply for business loan': 'बिज़नेस लोन के लिए आवेदन करें',
    'business information': 'व्यावसायिक जानकारी',
    'business name': 'दुकान / बिज़नेस का नाम',
    'category': 'श्रेणी',
    'contact number': 'फ़ोन नंबर',
    'business email': 'बिज़नेस ईमेल',
    'store address': 'दुकान का पता',
    'description': 'विवरण',
    'operating hours': 'दुकान खुलने का समय',
    'street address / area': 'सड़क का पता / इलाका',
    'landmark': 'लैंडमार्क',
    'city': 'शहर',
    'state': 'राज्य',
    'pin code': 'पिन कोड',
    'aadhaar / pan': 'आधार / पैन',
    'gst certificate': 'GST प्रमाणपत्र',
    'uploaded': 'अपलोड किया गया',
    'not uploaded': 'अपलोड नहीं है',
    'bank details': 'बैंक खाता विवरण',
    'account holder name': 'खाताधारक का नाम',
    'bank name': 'बैंक का नाम',
    'account number': 'खाता संख्या',
    'ifsc code': 'IFSC कोड',
    'upi id': 'UPI आईडी',
    'live': 'लाइव',

    // Store Bills & Transactions Page
    'store sales & bills': 'स्टोर बिक्री और बिल',
    'total store sales (revenue)': 'कुल स्टोर बिक्री (राजस्व)',
    'approved customer orders': 'स्वीकृत ग्राहक ऑर्डर्स',
    'search by id or customer...': 'ID या ग्राहक से खोजें...',
    'no transactions found': 'कोई लेन-देन नहीं मिला',
    'try changing your filters.': 'कृपया फ़िल्टर बदल कर देखें।',

    // Passbook & Wallet
    'wallet passbook': 'वॉलेट पासबुक',
    'export': 'एक्सपोर्ट',
    'looking for store sales / revenue?': 'स्टोर बिक्री / राजस्व देखना चाहते हैं?',
    'view customer bill transactions & gross sales history': 'ग्राहकों के बिल लेन-देन व कुल बिक्री इतिहास देखें',
    'view bills': 'बिल देखें',
    'current wallet balance': 'वर्तमान वॉलेट बैलेंस',
    'wallet ledger': 'वॉलेट लेज़र',
    'all entries': 'सभी प्रविष्टियां',
    'cashback given (-₹)': 'दिया गया कैशबैक (-₹)',
    'recharges (+₹)': 'रिचार्ज (+₹)',
    'payments (+₹)': 'भुगतान (+₹)',
    'ref:': 'संदर्भ:',
    'bal:': 'शेष:',
    'loading ledger...': 'लेज़र लोड हो रहा है...',
    'no ledger entries found': 'कोई लेज़र प्रविष्टि नहीं मिली',
    'available balance': 'उपलब्ध बैलेंस',
    'add money': 'पैसे जोड़ें',
    'withdraw': 'पैसे निकालें',
    'bank account': 'बैंक खाता',
    'recent transactions': 'हालिया लेन-देन',

    // Storefront Page
    'catalog / products': 'उत्पाद सूची',
    'photos & videos': 'फ़ोटो और वीडियो',
    'promotions': 'ऑफ़र व प्रोमोशन',
    'store stories': 'स्टोर स्टोरीज़',
    'add product': 'उत्पाद जोड़ें',
    'upload media': 'मीडिया अपलोड करें',
    'create promotion': 'नया ऑफ़र बनाएं',
    'no products found': 'कोई उत्पाद नहीं मिला',
    'no media uploaded': 'कोई मीडिया अपलोड नहीं है',
    'no promotions found': 'कोई ऑफ़र नहीं मिला',

    // User Side: Profile & Subviews
    'my profile': 'मेरी प्रोफ़ाइल',
    'identity verified': 'पहचान सत्यापित',
    'kyc done': 'KYC पूर्ण',
    'aadhaar': 'आधार',
    'pan card': 'पैन कार्ड',
    'total cashback': 'कुल कैशबैक',
    'in your wallet': 'आपके वॉलेट में',
    'pending audits': 'लंबित ऑडिट्स',
    'awaiting review': 'समीक्षाधीन',
    'request': 'अनुरोध',
    'requests': 'अनुरोध',
    'manage linked bank details & upi': 'लिंक्ड बैंक विवरण और UPI प्रबंधित करें',
    'check balance status, withdrawal & rewards': 'बैलेंस, निकासी और पुरस्कार देखें',
    'receive cashback or payments instantly': 'तुरंत कैशबैक या भुगतान प्राप्त करें',
    'get ₹150 reward for each friend you invite': 'हर आमंत्रित मित्र पर ₹150 पुरस्कार पाएं',
    'preferences': 'प्राथमिकताएं',
    'alerts on cashback audits and rewards': 'कैशबैक ऑडिट और पुरस्कारों के अलर्ट',
    'protect cashouts with fingerprint, face id or pin': 'फ़िंगरप्रिंट, फेस ID या PIN से निकासी सुरक्षित करें',
    'backup pin:': 'बैकअप PIN:',
    'configured ✅': 'कॉन्फ़िगर है ✅',
    'not set': 'सेट नहीं है',
    'change pin': 'PIN बदलें',
    'set pin': 'PIN सेट करें',
    'whatsapp chat & customer care helpline': 'वॉट्सऐप चैट और कस्टमर केयर हेल्पलाइन',
    'change profile photo': 'प्रोफ़ाइल फ़ोटो बदलें',
    'take photo': 'फ़ोटो लें',
    'choose gallery': 'गैलरी से चुनें',
    'remove photo': 'फ़ोटो हटाएं',
    'set security pin': 'सुरक्षा PIN सेट करें',
    'change security pin': 'सुरक्षा PIN बदलें',
    'set 4-digit pin': '4-अंकीय PIN सेट करें',
    'change 4-digit pin': '4-अंकीय PIN बदलें',
    'secures withdrawals & biometrics': 'निकासी और बायोमेट्रिक्स सुरक्षित करता है',
    'create a secret 4-digit pin for withdrawal authentication.': 'निकासी सत्यापन के लिए 4 अंकों का गुप्त PIN बनाएं।',
    'verify your current 4-digit pin and choose a new one.': 'अपना वर्तमान 4-अंकीय PIN सत्यापित करें और नया PIN चुनें।',
    'current 4-digit pin': 'वर्तमान 4-अंकीय PIN',
    'enter 4-digit pin': '4-अंकीय PIN दर्ज करें',
    'new 4-digit pin': 'नया 4-अंकीय PIN',
    'confirm 4-digit pin': '4-अंकीय PIN की पुष्टि करें',
    '4-digit pins match perfectly': '4-अंकीय PIN मेल खाते हैं ✅',
    'pins do not match': 'PIN मेल नहीं खा रहे हैं ❌',
    'save pin': 'PIN सुरक्षित करें',
    'update pin': 'PIN अपडेट करें',
    'strictly 4 digits. never share your security pin with anyone.': 'केवल 4 अंक। अपना सुरक्षा PIN कभी किसी के साथ साझा न करें।',
    'backup for biometrics & cashouts': 'बायोमेट्रिक्स और निकासी का बैकअप',
    'current pin': 'वर्तमान PIN',
    'enter current pin': 'वर्तमान PIN दर्ज करें',
    'create pin (4-8 digits)': 'PIN बनाएं (4 अंक)',
    'new pin (4-8 digits)': 'नया PIN (4 अंक)',
    'confirm pin': 'PIN की पुष्टि करें',
    're-enter pin': 'PIN पुनः दर्ज करें',
    'save & continue': 'सुरक्षित करें और आगे बढ़ें',
    'edit profile': 'प्रोफ़ाइल संपादित करें',
    'full name': 'पूरा नाम',
    'phone number': 'फ़ोन नंबर',
    'email address': 'ईमेल पता',
    'phone number cannot be modified.': 'फ़ोन नंबर बदला नहीं जा सकता।',
    'save changes': 'बदलाव सुरक्षित करें',
    'linked accounts': 'लिंक्ड खाते',
    'bank account number': 'बैंक खाता संख्या',
    're-enter account number': 'खाता संख्या पुनः दर्ज करें',
    'verify with mobile otp': 'मोबाइल OTP से सत्यापित करें',
    'sending otp...': 'OTP भेजा जा रहा है...',
    'verify bank linking': 'बैंक लिंकिंग सत्यापित करें',
    'enter the 4-digit code sent to your registered mobile number:': 'अपने पंजीकृत मोबाइल नंबर पर भेजा गया 4 अंकों का कोड दर्ज करें:',
    'resend otp in': 'पुनः OTP भेजें',
    'resend otp via sms': 'SMS द्वारा पुनः OTP भेजें',
    'confirm & link account': 'पुष्टि करें और खाता लिंक करें',
    'my zeebac qr': 'मेरा ZeeBac QR',
    'zeebac id': 'ZeeBac ID',
    'copy': 'कॉपी करें',
    'copied': 'कॉपी हो गया',
    'download': 'डाउनलोड',
    'share': 'शेयर करें',
    'show this qr to vendors for instant wallet cashback transactions. no receipt needed!': 'तत्काल वॉलेट कैशबैक लेन-देन के लिए यह QR दुकानदारों को दिखाएं। रसीद की आवश्यकता नहीं!',
    'refer & earn': 'रेफ़र और कमाएं',
    'instant cash reward': 'तत्काल नकद पुरस्कार',
    'friends invited': 'मित्र आमंत्रित',
    'total bonus earned': 'कुल अर्जित बोनस',
    'your unique referral code': 'आपका विशिष्ट रेफ़रल कोड',
    'copy code': 'कोड कॉपी करें',
    'invite link (auto-applies code)': 'आमंत्रण लिंक (कोड स्वतः लागू होगा)',
    'copy link': 'लिंक कॉपी करें',
    'invited friends': 'आमंत्रित मित्र',
    'how referral payout works': 'रेफ़रल भुगतान कैसे काम करता है',
    'share your invite link': 'अपना आमंत्रण लिंक साझा करें',
    'friend completes first cashback': 'मित्र पहला कैशबैक प्राप्त करता है',
    'instant admin wallet payout': 'तत्काल एडमिन वॉलेट भुगतान',
    'share invite link & earn': 'आमंत्रण लिंक साझा करें और कमाएं',
    'cashback audits & requests': 'कैशबैक ऑडिट व अनुरोध',
    'all requests': 'सभी अनुरोध',
    'track verification timeline': 'सत्यापन समयसीमा ट्रैक करें',
    'no pending requests found': 'कोई लंबित अनुरोध नहीं मिला',
    'no requests found': 'कोई अनुरोध नहीं मिला',
    'bill receipt': 'बिल रसीद',
    'cash claim': 'नकद दावा',
    'pending audit': 'लंबित ऑडिट',
    'declined': 'अस्वीकृत',
    'held (review)': 'होल्ड (समीक्षाधीन)',

    // User Side: Home Screen
    "let's find you some cashback today": 'आइए आज आपके लिए कैशबैक ढूंढें',
    'view balance': 'बैलेंस देखें',
    'scan & pay': 'स्कैन व भुगतान',
    'upload bill': 'बिल अपलोड',
    'find vendor': 'दुकान खोजें',
    'shop & pay later': 'शॉप व पे लेटर',
    'claim by utr': 'UTR से दावा',
    'mobile recharge': 'मोबाइल रिचार्ज',
    'personal loan': 'पर्सनल लोन',
    'recently visited': 'हाल में देखी गई दुकानें',
    'nearby partner vendors': 'आस-पास के पार्टनर स्टोर्स',
    'see all': 'सभी देखें',
    'no nearby vendors yet': 'अभी कोई नजदीकी दुकान नहीं मिली',
    'explore the full directory to find partner stores near you': 'अपने आस-पास पार्टनर स्टोर खोजने के लिए पूरी सूची देखें',
    'browse explore': 'एक्सप्लोर देखें',
    'km away': 'किमी दूर',
    'nearby': 'आस-पास',
    'flat': 'फ़्लैट',

    // User Side: Wallet & Passbook
    'total cashback reward': 'कुल कैशबैक पुरस्कार',
    'recent wallet activity': 'हालिया वॉलेट गतिविधि',
    'no activity yet': 'अभी कोई गतिविधि नहीं है',
    'your cashback credits and cashouts will show up here': 'आपके कैशबैक क्रेडिट और निकासी यहां दिखाई देंगे',
    'cashback requests': 'कैशबैक अनुरोध',
    'view status of submitted bills & receipts': 'जमा किए गए बिलों व रसीदों की स्थिति देखें',
    'withdrawal': 'पैसे निकालें',
    'rewards': 'रिवार्ड्स',
    'claim upi cashback': 'UPI कैशबैक का दावा करें',
    'verify & claim cashback': 'सत्यापित करें और कैशबैक पाएं',
    'balance & history': 'बैलेंस एवं इतिहास',
    'your accounts': 'आपके खाते',
    'zeebac wallet': 'ZeeBac वॉलेट',
    'check balance': 'बैलेंस चेक करें',
    'missing cashback?': 'कैशबैक नहीं मिला?',
    'upload your receipt to claim it': 'दावा करने के लिए अपनी रसीद अपलोड करें',
    'payment history': 'भुगतान इतिहास',
    'search by name, cashback or tag...': 'नाम, कैशबैक या टैग से खोजें...',
    'all transactions': 'सभी लेन-देन',
    'gained cashback': 'प्राप्त कैशबैक',
    'all activity (cashback, withdrawal, perks)': 'सभी गतिविधियां (कैशबैक, निकासी, लाभ)',
    'current balance': 'वर्तमान बैलेंस',
    'gained cashback only': 'केवल प्राप्त कैशबैक',
    'total cashback earned': 'कुल अर्जित कैशबैक',
    'credited': 'जमा हुआ',
    'debited': 'निकाला गया',
    'no gained cashback found': 'कोई प्राप्त कैशबैक नहीं मिला',
    'no transactions found': 'कोई लेन-देन नहीं मिला',
    'shop at partner stores or scan receipts to earn instant cashback!': 'तत्काल कैशबैक पाने के लिए पार्टनर स्टोर्स पर खरीदारी करें या रसीदें स्कैन करें!',
    'your wallet transactions and withdrawals will show here.': 'आपके वॉलेट लेन-देन और निकासी यहां दिखाई देंगे।',

    // User Side: Explore Screen
    'search local shops and brands...': 'स्थानीय दुकानें और ब्रांड खोजें...',
    'no vendors found': 'कोई स्टोर नहीं मिला',
    'try searching for other categories or names': 'अन्य श्रेणियों या नामों से खोजने का प्रयास करें',
    'tap to view store': 'स्टोर देखने के लिए टैप करें',
    'find deals near you': 'अपने आस-पास के ऑफ़र खोजें',
    'allow location access to see the best cashback offers from stores around you.': 'अपने आस-पास के स्टोर से सर्वोत्तम कैशबैक ऑफ़र देखने के लिए स्थान एक्सेस की अनुमति दें।',

    // User Side: Cashout & Security
    'cashout to bank': 'बैंक में निकासी करें',
    'available for cashout': 'निकासी के लिए उपलब्ध',
    'total wallet balance:': 'कुल वॉलेट बैलेंस:',
    'under 24-hour security lock': '24 घंटे के सुरक्षा लॉक के अंतर्गत',
    'cashback earned from cash requests is locked for 24 hours to prevent fraud or abuse. once 24 hours elapse, it automatically becomes withdrawable.': 'धोखाधड़ी रोकने के लिए नकद अनुरोधों से अर्जित कैशबैक 24 घंटे के लिए लॉक रहता है। 24 घंटे बाद यह स्वतः निकासी योग्य हो जाता है।',
    '100% secure manual processing': '100% सुरक्षित मैन्युअल प्रोसेसिंग',
    'all withdrawals are reviewed by admin (24-48 hrs)': 'सभी निकासी की एडमिन द्वारा समीक्षा की जाती है (24-48 घंटे)',
    'cashout amount': 'निकासी राशि',
    'min ₹50 · auto-approve up to ₹5,000': 'न्यूनतम ₹50 · ₹5,000 तक स्वतः स्वीकृत',
    'cashout breakdown': 'निकासी विवरण',
    'requested amount:': 'अनुरोधित राशि:',
    'withdrawal fee:': 'निकासी शुल्क:',
    'platform fee (2%):': 'प्लेटफ़ॉर्म शुल्क (2%):',
    'total fee deduction:': 'कुल शुल्क कटौती:',
    'net amount to receive:': 'प्राप्त होने वाली शुद्ध राशि:',
    'withdraw to bank': 'बैंक में निकालें',
    'transferring...': 'ट्रांसफ़र हो रहा है...',
    'withdrawal history': 'निकासी इतिहास',
    'no withdrawals yet': 'अभी तक कोई निकासी नहीं हुई',
    'admin review required': 'एडमिन समीक्षा आवश्यक',
    'locked (24-hr)': 'लॉक (24 घंटे)',
    'withdrawable': 'निकासी योग्य',
    'withdrawable:': 'निकासी योग्य:',
    'instant 12-digit upi claim': 'तत्काल 12-अंकीय UPI दावा',
    "if google pay, phonepe, or paytm didn't send your phone number, enter your 12-digit upi reference / utr number from your payment receipt to claim cashback:": "यदि Google Pay, PhonePe या Paytm ने आपका फ़ोन नंबर नहीं भेजा, तो कैशबैक का दावा करने के लिए अपनी भुगतान रसीद से 12-अंकों का UPI संदर्भ / UTR नंबर दर्ज करें:",
    "if google pay or your upi app didn't share your contact number, enter the 12-digit upi reference no. (utr) from your payment receipt to claim your cashback!": "यदि Google Pay या आपकी UPI ऐप ने आपका नंबर साझा नहीं किया है, तो कैशबैक का दावा करने के लिए अपनी रसीद से 12 अंकों का UPI संदर्भ (UTR) दर्ज करें!",
    '12-digit upi ref no. / utr': '12-अंकीय UPI संदर्भ सं. / UTR'
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
  // Accepts either a translation key or raw English text and returns Hindi ONLY if explicitly selected
  t: (textOrKey, fallback = '') => {
    if (!textOrKey) return fallback || '';

    // 1. Admin panel is strictly English only — never translate to Hindi in admin
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      return textOrKey;
    }

    // 2. Default to English: If language is 'en', ALWAYS return the original English text
    const lang = get().language || 'en';
    if (lang === 'en') {
      return textOrKey;
    }

    // 3. User or Vendor explicitly selected Hindi ('hi')
    const dict = translations.hi || {};

    // 3a. Direct key match
    if (dict[textOrKey] !== undefined) {
      return dict[textOrKey];
    }

    // 3b. Normalized lowercase match
    const normalized = String(textOrKey).trim().toLowerCase();
    if (dict[normalized] !== undefined) {
      return dict[normalized];
    }

    return fallback || textOrKey;
  }
}));

export default useLanguageStore;
