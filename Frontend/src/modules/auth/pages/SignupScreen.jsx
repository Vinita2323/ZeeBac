import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import useUIStore from '../../../store/useUIStore';

// ─── Utility: Mock localStorage Auth ────────────────────────────────────────
function getUsers() {
  return JSON.parse(localStorage.getItem('zeebac_users') || '[]');
}
function saveUsers(users) {
  localStorage.setItem('zeebac_users', JSON.stringify(users));
}
function setCurrentUser(user) {
  localStorage.setItem('zeebac_current_user', JSON.stringify(user));
}
// At the top level (lines 14-17)
function findDuplicateUser(aadhaar, pan, role) {
  const users = getUsers();
  return users.find(u => u.role === role && (u.aadhaar === aadhaar || u.pan === pan));
}
const BUSINESS_CATEGORIES = [
  'Fashion & Apparel',
  'Electronics',
  'Groceries & Supermarkets',
  'Restaurants & Cafes',
  'Health & Pharmacy',
  'Home & Furniture',
  'Beauty & Personal Care',
  'Other'
];

// ... INSIDE SignupScreen component ...
export default function SignupScreen({ role: roleProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Role is determined by the app: passed as prop or via route state
  const role = roleProp || location.state?.role || 'customer';
  const isVendor = role === 'vendor';
  const loginPath = isVendor ? '/vendor-app/login' : '/login';
  const signupPath = isVendor ? '/vendor-app/signup' : '/signup';

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [duplicateUser, setDuplicateUser] = useState(null);

  // Collected Data
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Vendor-specific
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [storePhotos, setStorePhotos] = useState([]);
  const [businessDocs, setBusinessDocs] = useState([]);

  const handleFileChange = (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const fileObj = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: reader.result
        };
        if (type === 'photos') {
          setStorePhotos(prev => [...prev, fileObj]);
        } else {
          setBusinessDocs(prev => [...prev, fileObj]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index, type) => {
    if (type === 'photos') {
      setStorePhotos(prev => prev.filter((_, i) => i !== index));
    } else {
      setBusinessDocs(prev => prev.filter((_, i) => i !== index));
    }
  };

  const totalSteps = isVendor ? 4 : 4;

  // ── Step Navigation ──────────────────────────────────────────────────────
  const goNext = () => { setError(''); setDuplicateUser(null); setStep(s => s + 1); };
  const goBack = () => { setError(''); setDuplicateUser(null); setStep(s => s - 1); };

  // ── Final Submit ─────────────────────────────────────────────────────────
  const handleCreateAccount = () => {
    const aadhaarClean = aadhaar.replace(/\s/g, '');
    const panClean = pan.toUpperCase().trim();

    if (findDuplicateUser(aadhaarClean, panClean, role)) {
      setError(`An account with this Aadhaar or PAN already exists for the ${role} role. Please login instead.`);
      return;
    }

    const newUser = {
      id: `USR-${Date.now()}`,
      zeebacId: role === 'vendor'
        ? `ZBV-${Math.floor(1000 + Math.random() * 9000)}`
        : `ZBC-${Math.floor(1000 + Math.random() * 9000)}`,
      role,
      phone,
      name: name.trim(),
      email: email.trim(),
      aadhaar: aadhaarClean,
      pan: panClean,
      // Vendor extras
      ...(role === 'vendor' && {
        storeName: storeName.trim(),
        category,
        address: address.trim(),
        pincode: pincode.trim(),
        gstNumber: gstNumber.trim(),
        cashbackRate: 10, // Default, admin can change
        storePhotos,
        businessDocs,
      }),
      createdAt: new Date().toISOString(),
    };

    const users = getUsers();
    users.push(newUser);
    saveUsers(users);

    // Set session via global store
    useAuthStore.getState().login(newUser);

    // Show success feedback
    useUIStore.getState().showSnackbar('Account created successfully!', 'success');

    // Also save to legacy profile keys for existing screens
    if (role === 'customer') {
      localStorage.setItem('user_profile', JSON.stringify({ name: newUser.name, phone: `+91 ${newUser.phone}`, email: newUser.email }));
      navigate('/location-permission');
    } else {
      navigate('/vendor');
    }
  };

  // ── Progress Bar ─────────────────────────────────────────────────────────
  const progress = (step / totalSteps) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9ff] text-on-surface font-body-lg relative overflow-hidden">

      {/* Decorative Blobs */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-outline-variant/10 shadow-sm">
        <div className="max-w-[440px] mx-auto w-full flex items-center px-container-margin h-14">
          {step > 1 ? (
            <button
              onClick={goBack}
              className={`w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 transition-all cursor-pointer`}
            >
              <span className={`material-symbols-outlined ${isVendor ? 'text-secondary' : 'text-primary'}`}>arrow_back</span>
            </button>
          ) : (
            <button
              onClick={() => navigate(loginPath)}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 transition-all cursor-pointer"
            >
              <span className={`material-symbols-outlined ${isVendor ? 'text-secondary' : 'text-primary'}`}>close</span>
            </button>
          )}
          <span className={`font-display text-title-md font-bold ml-2 ${isVendor ? 'text-secondary' : 'text-primary'}`}>
            {isVendor ? 'Vendor Registration' : 'Create Account'}
          </span>
          <span className="ml-auto text-[11px] font-bold text-on-surface-variant bg-surface-container-low px-2.5 py-1 rounded-full">
            {step}/{totalSteps}
          </span>
        </div>
        {/* Progress Bar */}
        <div className="h-[3px] bg-outline-variant/15 w-full">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-r-full ${isVendor ? 'bg-secondary' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-[440px] mx-auto w-full px-container-margin py-6">

        {/* ════════ STEP 1: Mobile Number ════════ */}
        {step === 1 && (
          <div className="flex-1 flex flex-col animate-reveal">
            <div className="space-y-1 mb-8">
              <h1 className="text-[24px] font-black tracking-tight text-on-surface leading-tight">
                Enter your mobile number
              </h1>
              <p className="text-[14px] text-on-surface-variant">
                We'll send a 4-digit OTP to verify your number.
              </p>
            </div>

            <div className="space-y-4 flex-1">
              <div className="space-y-1.5 text-left">
                <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase text-[11px]">Mobile Number</label>
                <div className="flex items-center gap-2 h-[56px]">
                  <div className="flex items-center justify-center px-4 h-full bg-surface-container-low rounded-xl">
                    <span className="font-title-md text-on-surface font-bold">+91</span>
                  </div>
                  <input
                    autoFocus
                    className={`flex-1 h-full px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg placeholder:text-outline transition-all font-bold ${
                      phone.length === 10 ? 'border-primary bg-white' : ''
                    }`}
                    maxLength="10"
                    placeholder="9876543210"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  />
                </div>
                {phone.length === 10 && (
                  <p className="text-[12px] text-green-600 font-bold pl-1 pt-1 animate-reveal flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Valid mobile number
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (phone.length !== 10) return;
                // Check if phone already registered
                const existing = getUsers().find(u => u.phone === phone && u.role === role);
                if (existing) {
                  setError('This number is already registered. Please login instead.');
                  return;
                }
                goNext();
              }}
              disabled={phone.length !== 10}
              className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center cursor-pointer mt-4 ${
                phone.length === 10
                  ? (isVendor ? 'bg-secondary text-white hover:bg-secondary/90' : 'btn-primary-gradient text-white hover:opacity-90') + ' active:scale-[0.98]'
                  : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
              }`}
            >
              Send OTP
            </button>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ════════ STEP 2: OTP Verification ════════ */}
        {step === 2 && <OTPStep otp={otp} setOtp={setOtp} phone={phone} onVerified={goNext} />}

        {/* ════════ STEP 3: KYC (Aadhaar + PAN) ════════ */}
        {step === 3 && (
          <div className="flex-1 flex flex-col animate-reveal">
            <div className="space-y-1 mb-6">
              <h1 className="text-[24px] font-black tracking-tight text-on-surface leading-tight">
                Verify your identity
              </h1>
              <p className="text-[14px] text-on-surface-variant">
                Link your government IDs to secure your account. One account per identity.
              </p>
            </div>

            {/* Info Banner */}
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3 mb-6">
              <span className="material-symbols-outlined text-primary text-[20px] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              <div>
                <p className="text-[12px] text-on-surface font-bold">Why do we need this?</p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">
                  Your Aadhaar and PAN are used to ensure one unique account per person and prevent fraud. We only store masked versions.
                </p>
              </div>
            </div>

            <div className="space-y-5 flex-1">
              {/* Aadhaar Input */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Aadhaar Number</label>
                <div className="relative">
                  <input
                    autoFocus
                    className={`w-full h-[56px] px-4 pr-12 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg placeholder:text-outline transition-all font-bold tracking-widest ${
                      aadhaar.replace(/\s/g, '').length === 12 ? 'border-green-500 bg-green-50/30' : ''
                    }`}
                    maxLength="14"
                    placeholder="0000 0000 0000"
                    type="text"
                    inputMode="numeric"
                    value={aadhaar}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
                      setAadhaar(raw.replace(/(.{4})/g, '$1 ').trim());
                      setDuplicateUser(null);
                      setError('');
                    }}
                  />
                  {aadhaar.replace(/\s/g, '').length === 12 && (
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-green-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  )}
                </div>
              </div>

              {/* PAN Input */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">PAN Card Number</label>
                <div className="relative">
                  <input
                    className={`w-full h-[56px] px-4 pr-12 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg placeholder:text-outline transition-all font-bold tracking-widest uppercase ${
                      /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) ? 'border-green-500 bg-green-50/30' : ''
                    }`}
                    maxLength="10"
                    placeholder="ABCDE1234F"
                    type="text"
                    value={pan}
                    onChange={(e) => {
                      setPan(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase());
                      setDuplicateUser(null);
                      setError('');
                    }}
                  />
                  {/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase()) && (
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-green-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  )}
                </div>
              </div>

              {/* Duplicate User Warning & Action */}
              {duplicateUser && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl animate-reveal mt-2">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-orange-500 mt-0.5">warning</span>
                    <div>
                      <h4 className="text-[13px] font-bold text-orange-900">Account Found</h4>
                      <p className="text-[11px] text-orange-800/80 leading-relaxed mt-0.5 mb-3">
                        An account with this Aadhaar or PAN already exists, previously registered with number ending in <strong>{duplicateUser.phone ? duplicateUser.phone.toString().slice(-4) : 'XXXX'}</strong>. 
                      </p>
                      <button 
                        onClick={() => {
                          const users = getUsers();
                          const userIndex = users.findIndex(u => u.id === duplicateUser.id);
                          if (userIndex !== -1) {
                            // Update the phone number
                            users[userIndex].phone = phone;
                            saveUsers(users);
                            setCurrentUser(users[userIndex]);
                            
                            // Navigate
                            if (users[userIndex].role === 'customer') {
                              localStorage.setItem('user_profile', JSON.stringify({ name: users[userIndex].name, phone: `+91 ${phone}`, email: users[userIndex].email }));
                              navigate('/location-permission');
                            } else {
                              navigate('/vendor');
                            }
                          }
                        }}
                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-bold rounded-lg transition-colors active:scale-95 shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">sync</span>
                        Update to +91 {phone} & Login
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!duplicateUser && (
              <button
                onClick={() => {
                  const aadhaarClean = aadhaar.replace(/\s/g, '');
                  const panClean = pan.toUpperCase().trim();
                  const existingUser = findDuplicateUser(aadhaarClean, panClean, role);
                  
                  if (existingUser) {
                    setDuplicateUser(existingUser);
                    setError('');
                    return;
                  }
                  
                  setError('');
                  goNext();
                }}
                disabled={aadhaar.replace(/\s/g, '').length !== 12 || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())}
                className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center cursor-pointer mt-4 ${
                  aadhaar.replace(/\s/g, '').length === 12 && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase())
                    ? 'btn-primary-gradient text-white hover:opacity-90 active:scale-[0.98]'
                    : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
                }`}
              >
                Verify & Continue
              </button>
            )}

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ════════ STEP 4: Profile Setup ════════ */}
        {step === 4 && (
          <div className="flex-1 flex flex-col animate-reveal">
            <div className="space-y-1 mb-6">
              <h1 className="text-[24px] font-black tracking-tight text-on-surface leading-tight">
                {role === 'vendor' ? 'Set up your business' : 'Complete your profile'}
              </h1>
              {role !== 'vendor' && (
                <p className="text-[14px] text-on-surface-variant">
                  Just a few details and you're all set!
                </p>
              )}
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto scroll-hide pb-2">
              {/* Common: Name */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Full Name</label>
                <input
                  autoFocus
                  className="w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium"
                  placeholder="Enter your full name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Common: Email */}
              <div className="space-y-1.5 text-left">
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Email Address <span className="text-on-surface-variant/50">(Optional)</span></label>
                <input
                  className="w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* ─── Vendor-specific Fields ─── */}
              {role === 'vendor' && (
                <>
                  <div className="border-t border-outline-variant/10 pt-4 mt-2">
                    <h3 className="text-[13px] font-black text-primary flex items-center gap-1.5 mb-4">
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                      Business Details
                    </h3>
                  </div>

                  {/* Store Name */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Business / Shop Name</label>
                    <input
                      className="w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium"
                      placeholder="e.g. Noir Concept Store"
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                    />
                  </div>

                  {/* Category Dropdown */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Business Category</label>
                    <div className="relative">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium appearance-none cursor-pointer ${
                          category ? 'text-on-surface' : 'text-outline'
                        }`}
                      >
                        <option value="" disabled>Select a category</option>
                        {BUSINESS_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Shop Address</label>
                    <textarea
                      className="w-full min-h-[72px] px-4 py-3 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium resize-none"
                      placeholder="Full street address, landmark"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Pincode + GST Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 text-left">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Pincode</label>
                      <input
                        className="w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium"
                        placeholder="400001"
                        type="tel"
                        maxLength="6"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">GST No. <span className="text-on-surface-variant/50 normal-case">(Opt.)</span></label>
                      <input
                        className="w-full h-[52px] px-4 bg-surface-container-low rounded-xl outline-none border-2 border-transparent focus:border-primary focus:bg-white text-body-lg transition-all font-medium uppercase"
                        placeholder="22AAAAA0000A1Z5"
                        type="text"
                        maxLength="15"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  {/* Store Image Upload */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Store Photos <span className="text-on-surface-variant/50 normal-case">(Optional)</span></label>
                    <input
                      type="file"
                      id="store-photos-input"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, 'photos')}
                    />
                    <div className="border-2 border-dashed border-outline-variant/30 rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-surface-container-low/50 hover:border-secondary/30 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('store-photos-input').click()}
                    >
                      <span className="material-symbols-outlined text-[32px] text-secondary">add_photo_alternate</span>
                      <p className="text-[12px] text-on-surface-variant font-medium">Tap to upload storefront images</p>
                      <p className="text-[10px] text-on-surface-variant/60">JPG, PNG up to 5MB each</p>
                    </div>

                    {storePhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {storePhotos.map((file, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-outline-variant/30 group">
                            <img src={file.data} alt="Store Preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(idx, 'photos');
                              }}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Business Documents Upload */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Business Documents <span className="text-on-surface-variant/50 normal-case">(Optional)</span></label>
                    <input
                      type="file"
                      id="business-docs-input"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => handleFileChange(e, 'docs')}
                    />
                    <div className="border-2 border-dashed border-outline-variant/30 rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-surface-container-low/50 hover:border-secondary/30 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('business-docs-input').click()}
                    >
                      <span className="material-symbols-outlined text-[32px] text-secondary">upload_file</span>
                      <p className="text-[12px] text-on-surface-variant font-medium">Upload trade license, FSSAI, etc.</p>
                      <p className="text-[10px] text-on-surface-variant/60">PDF, JPG up to 10MB</p>
                    </div>

                    {businessDocs.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {businessDocs.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/20">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-secondary">
                                {file.type.includes('pdf') ? 'picture_as_pdf' : 'description'}
                              </span>
                              <span className="text-[12px] font-medium text-on-surface truncate max-w-[200px]">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-on-surface-variant">
                                ({(file.size / 1024 / 1024).toFixed(2)} MB)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(idx, 'docs');
                              }}
                              className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleCreateAccount}
              disabled={
                !name.trim() ||
                (role === 'vendor' && (!storeName.trim() || !category))
              }
              className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 ${
                name.trim() && (role !== 'vendor' || (storeName.trim() && category))
                  ? 'btn-primary-gradient text-white hover:opacity-90 active:scale-[0.98]'
                  : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
              Create Account
            </button>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[13px] font-medium flex items-center gap-2 animate-reveal">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}


// ─── OTP Step (Inline Sub-Component) ────────────────────────────────────────
function OTPStep({ otp, setOtp, phone, onVerified }) {
  const [timeLeft, setTimeLeft] = useState(45);
  const [isShake, setIsShake] = useState(false);
  const [verified, setVerified] = useState(false);

  // Timer
  useState(() => {
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  });

  const handleChange = (index, value) => {
    const numValue = value.replace(/[^0-9]/g, '');
    if (numValue.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = numValue;
    setOtp(newOtp);
    // Auto-focus next
    if (numValue && index < 3) {
      document.getElementById(`signup-otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`signup-otp-${index - 1}`)?.focus();
    }
  };

  const handleVerify = () => {
    if (otp.join('').length === 4) {
      setVerified(true);
      setTimeout(() => onVerified(), 600);
    } else {
      setIsShake(true);
      setTimeout(() => setIsShake(false), 500);
    }
  };

  return (
    <div className="flex-1 flex flex-col animate-reveal">
      <div className="space-y-1 mb-8">
        <h1 className="text-[24px] font-black tracking-tight text-on-surface leading-tight">Verify your number</h1>
        <p className="text-[14px] text-on-surface-variant">
          Enter the 4-digit code sent to <span className="font-bold text-primary">+91 {phone}</span>
        </p>
      </div>

      <div className="flex-1">
        {/* OTP Inputs */}
        <div className={`flex justify-center gap-4 mb-6 ${isShake ? 'animate-shake' : ''}`}>
          {otp.map((digit, index) => (
            <input
              key={index}
              id={`signup-otp-${index}`}
              className={`w-14 h-16 bg-white border-2 rounded-xl text-center font-display text-headline-lg text-primary focus:border-primary focus:ring-2 focus:ring-primary focus:outline-none transition-all ${
                verified ? 'border-green-500 bg-green-50' : 'border-outline-variant/50'
              }`}
              inputMode="numeric"
              maxLength="1"
              pattern="\d*"
              type="text"
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              autoFocus={index === 0}
            />
          ))}
        </div>

        {/* Resend */}
        <div className="text-center mb-6">
          {timeLeft > 0 ? (
            <p className="text-body-sm text-on-surface-variant">
              Resend code in <span className="text-primary font-bold">{timeLeft}s</span>
            </p>
          ) : (
            <button
              onClick={() => { setTimeLeft(45); setOtp(['', '', '', '']); }}
              className="text-body-sm text-primary font-bold hover:underline cursor-pointer"
            >
              Resend verification code
            </button>
          )}
        </div>
      </div>

      <button
        onClick={handleVerify}
        disabled={verified}
        className={`w-full h-[56px] rounded-xl font-title-md shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
          verified
            ? 'bg-green-500 text-white'
            : 'btn-primary-gradient text-white hover:opacity-90 active:scale-[0.98]'
        }`}
      >
        {verified ? (
          <>
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Verified!
          </>
        ) : (
          'Verify & Continue'
        )}
      </button>
    </div>
  );
}
