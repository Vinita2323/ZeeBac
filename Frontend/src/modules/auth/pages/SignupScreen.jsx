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

export default function SignupScreen({ role: roleProp }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = roleProp || location.state?.role || 'customer';
  const isVendor = role === 'vendor';
  const loginPath = isVendor ? '/vendor-app/login' : '/login';

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  
  // OTP State for Steps 1 & 2
  const [otp, setOtp] = useState(['', '', '', '']);

  // Global Form State
  const [formData, setFormData] = useState({
    phone: '',
    // Customer specifics
    name: '',
    email: '',
    // Vendor specifics
    storeLogo: null,
    storeName: '',
    category: '',
    description: '',
    gstNumber: '',
    registrationNumber: '',
    address: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    aadhaarPan: null,
    gstCertificate: null,
    shopLicense: null,
    cancelledCheque: null,
    website: '',
    instagram: '',
    facebook: '',
    whatsapp: ''
  });

  const totalSteps = 3;

  const updateForm = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (e, key) => {
    const file = e.target.files[0];
    if (file) {
      // Avoid reading as DataURL to prevent QuotaExceededError in localStorage
      updateForm(key, { name: file.name, type: file.type, size: file.size });
    }
  };

  const goNext = () => { setError(''); setStep(s => s + 1); };
  const goBack = () => { setError(''); setStep(s => s - 1); };

  const handleCreateAccount = () => {
    const newUser = {
      id: `USR-${Date.now()}`,
      zeebacId: isVendor ? `ZBV-${Math.floor(1000 + Math.random() * 9000)}` : `ZBC-${Math.floor(1000 + Math.random() * 9000)}`,
      role,
      ...formData,
      createdAt: new Date().toISOString(),
    };
    const users = getUsers();
    users.push(newUser);
    saveUsers(users);

    useAuthStore.getState().login(newUser);
    useUIStore.getState().showSnackbar('Account created successfully!', 'success');

    if (role === 'customer') {
      localStorage.setItem('user_profile', JSON.stringify({ name: newUser.name, phone: `+91 ${newUser.phone}`, email: newUser.email }));
      navigate('/location-permission');
    } else {
      navigate('/vendor');
    }
  };

  const canProceedVendor = () => {
    const d = formData;
    return d.name && d.storeName && d.category && d.description && d.address && d.city && d.state && d.pincode && 
           d.accountHolderName && d.bankName && d.accountNumber && d.ifscCode;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-body-lg">
      
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md">
        <div className="max-w-[600px] mx-auto w-full flex items-center px-4 h-16">
          {step > 1 ? (
            <button onClick={goBack} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          ) : (
            <button onClick={() => navigate(loginPath)} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 active:scale-95 transition-all cursor-pointer">
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
          <span className="font-display text-lg font-black ml-3 text-gray-900">
            {isVendor && step === 3 ? 'Vendor Profile' : (isVendor ? 'Vendor Registration' : 'Create Account')}
          </span>
          <span className="ml-auto text-[13px] font-bold text-[#5B21B6] bg-[#5B21B6]/10 px-3 py-1 rounded-full">
            {step}/{totalSteps}
          </span>
        </div>
        <div className="h-[2px] bg-gray-100 w-full">
          <div className="h-full bg-[#5B21B6] transition-all duration-500 ease-out" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-[600px] mx-auto w-full">
        
        {/* ================= STEP 1: MOBILE NUMBER ================= */}
        {step === 1 && (
          <div className="flex-1 flex flex-col px-6 py-8 animate-reveal">
            <h1 className="text-[28px] font-black tracking-tight text-gray-900 leading-tight mb-2">Enter your mobile number</h1>
            <p className="text-[15px] text-gray-500 mb-5">We'll send a 4-digit OTP to verify your number.</p>
            
            <div className="flex-1">
              <FloatingInput 
                label="Mobile Number" 
                icon="phone_iphone" 
                type="tel" 
                value={formData.phone} 
                onChange={(e) => updateForm('phone', e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              />
            </div>
            
            <button onClick={goNext} disabled={formData.phone.length !== 10}
              className={`w-full h-12 rounded-lg font-bold text-[16px] shadow-lg flex items-center justify-center mt-6 transition-all ${
                formData.phone.length === 10 ? 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}>
              Send OTP
            </button>
          </div>
        )}

        {/* ================= STEP 2: OTP VERIFICATION ================= */}
        {step === 2 && (
          <div className="flex-1 flex flex-col px-6 py-8 animate-reveal">
            <h1 className="text-[28px] font-black tracking-tight text-gray-900 leading-tight mb-2">Verify your number</h1>
            <p className="text-[15px] text-gray-500 mb-5">Enter the 4-digit code sent to <span className="font-bold text-gray-900">+91 {formData.phone}</span></p>
            
            <div className="flex-1">
              <div className="flex justify-center gap-4 mb-5">
                {otp.map((digit, index) => (
                  <input key={index} id={`otp-${index}`} 
                    className="w-16 h-20 border-2 border-gray-200 rounded-lg text-center text-[28px] font-black focus:border-[#5B21B6] focus:shadow-[0_0_0_4px_rgba(91,33,182,0.1)] outline-none transition-all text-gray-800"
                    value={digit} maxLength="1" type="tel"
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if(val.length > 1) return;
                      const newOtp = [...otp]; newOtp[index] = val; setOtp(newOtp);
                      if(val && index<3) document.getElementById(`otp-${index+1}`)?.focus();
                    }}
                    onKeyDown={e => { if (e.key === 'Backspace' && !otp[index] && index > 0) document.getElementById(`otp-${index-1}`)?.focus(); }}
                  />
                ))}
              </div>
            </div>
            
            <button onClick={goNext} disabled={otp.join('').length !== 4} 
              className={`w-full h-12 rounded-lg font-bold text-[16px] shadow-lg flex items-center justify-center mt-6 transition-all ${
                otp.join('').length === 4 ? 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}>
              Verify
            </button>
          </div>
        )}

        {/* ================= STEP 3: CUSTOMER PROFILE ================= */}
        {!isVendor && step === 3 && (
          <div className="flex-1 flex flex-col px-6 py-8 animate-reveal">
            <h1 className="text-[28px] font-black tracking-tight text-gray-900 leading-tight mb-5">Complete your profile</h1>
            <div className="flex-1 space-y-3">
              <FloatingInput label="Full Name" icon="person" value={formData.name} onChange={e => updateForm('name', e.target.value)} />
              <FloatingInput label="Email Address (Optional)" type="email" icon="mail" value={formData.email} onChange={e => updateForm('email', e.target.value)} />
            </div>
            <button onClick={handleCreateAccount} disabled={!formData.name.trim()}
              className={`w-full h-12 rounded-lg font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 mt-6 transition-all ${
                formData.name.trim() ? 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}>
              Create Account
            </button>
          </div>
        )}

        {/* ================= STEP 3: VENDOR PROFILE (PREMIUM) ================= */}
        {isVendor && step === 3 && (
          <div className="flex-1 flex flex-col animate-reveal bg-gray-50 pb-28">
            <div className="px-6 py-8 bg-white mb-4 shadow-sm border-b border-gray-100">
              <h1 className="text-[28px] font-black tracking-tight text-gray-900 leading-tight mb-2">Complete your business profile</h1>
              <p className="text-[15px] text-gray-500">Add your business details to start selling on the platform.</p>
            </div>

            <div className="px-4 space-y-3">
              
              {/* 1. Basic Information */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">1</span>
                  Basic Information
                </h2>
                
                <div className="flex justify-center mb-5">
                  <div className="relative">
                    <input type="file" id="logo" className="hidden" accept="image/*" onChange={e => handleFileChange(e, 'storeLogo')} />
                    <div onClick={() => document.getElementById('logo').click()} className="w-24 h-24 rounded-full border-2 border-dashed border-[#5B21B6]/40 flex items-center justify-center bg-gray-50 cursor-pointer overflow-hidden group hover:border-[#5B21B6] transition-colors">
                      {formData.storeLogo ? (
                        <img src={formData.storeLogo.data} className="w-full h-full object-cover" alt="Logo" />
                      ) : (
                        <span className="material-symbols-outlined text-[32px] text-gray-400 group-hover:text-[#5B21B6]">add_a_photo</span>
                      )}
                    </div>
                    {formData.storeLogo && (
                      <button onClick={(e) => { e.stopPropagation(); updateForm('storeLogo', null); }} className="absolute -bottom-1 -right-1 w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center text-red-500 shadow-sm">
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <FloatingInput label="Owner Full Name" icon="person" value={formData.name} onChange={e => updateForm('name', e.target.value)} />
                  <FloatingInput label="Shop/Business Name" icon="storefront" value={formData.storeName} onChange={e => updateForm('storeName', e.target.value)} />
                  <FloatingInput label="Mobile Number" icon="phone_iphone" value={formData.phone} readOnly={true} />
                  <FloatingInput label="Email Address (Optional)" icon="mail" type="email" value={formData.email} onChange={e => updateForm('email', e.target.value)} />
                </div>
              </div>

              {/* 2. Business Information */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">2</span>
                  Business Information
                </h2>
                
                <div className="space-y-3">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">category</span>
                    <select value={formData.category} onChange={e => updateForm('category', e.target.value)} 
                      className={`w-full h-[60px] pl-12 pr-12 bg-white border-2 rounded-lg outline-none appearance-none font-medium transition-all text-[15px] ${
                        formData.category ? 'border-gray-200 text-gray-800' : 'border-gray-200 text-gray-500'
                      } focus:border-[#5B21B6] focus:shadow-[0_0_0_4px_rgba(91,33,182,0.1)]`}>
                      <option value="" disabled>Select Business Category</option>
                      {BUSINESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">expand_more</span>
                  </div>
                  <FloatingInput label="Business Description" icon="notes" multiline value={formData.description} onChange={e => updateForm('description', e.target.value)} />
                  <FloatingInput label="GST Number (Optional)" icon="receipt_long" value={formData.gstNumber} onChange={e => updateForm('gstNumber', e.target.value.toUpperCase())} />
                  <FloatingInput label="Registration Number (Optional)" icon="app_registration" value={formData.registrationNumber} onChange={e => updateForm('registrationNumber', e.target.value)} />
                </div>
              </div>

              {/* 3. Shop Address */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">3</span>
                  Shop Address
                </h2>
                
                <div className="space-y-3">
                  <FloatingInput label="Full Address" icon="home" multiline value={formData.address} onChange={e => updateForm('address', e.target.value)} />
                  <FloatingInput label="Landmark" icon="pin_drop" value={formData.landmark} onChange={e => updateForm('landmark', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <FloatingInput label="City" value={formData.city} onChange={e => updateForm('city', e.target.value)} />
                    <FloatingInput label="State" value={formData.state} onChange={e => updateForm('state', e.target.value)} />
                  </div>
                  <FloatingInput label="PIN Code" icon="local_post_office" type="tel" value={formData.pincode} onChange={e => updateForm('pincode', e.target.value.replace(/[^0-9]/g, ''))} />
                  
                  <button className="w-full h-[60px] rounded-lg border-2 border-[#5B21B6]/20 bg-[#5B21B6]/5 text-[#5B21B6] font-bold flex items-center justify-center gap-2 hover:bg-[#5B21B6]/10 transition-colors">
                    <span className="material-symbols-outlined">map</span> Pick Location on Map
                  </button>
                </div>
              </div>

              {/* 4. Bank Details */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">4</span>
                  Bank Details
                </h2>
                
                <div className="space-y-3">
                  <FloatingInput label="Account Holder Name" icon="badge" value={formData.accountHolderName} onChange={e => updateForm('accountHolderName', e.target.value)} />
                  <FloatingInput label="Bank Name" icon="account_balance" value={formData.bankName} onChange={e => updateForm('bankName', e.target.value)} />
                  <FloatingInput label="Account Number" icon="money" type="password" value={formData.accountNumber} onChange={e => updateForm('accountNumber', e.target.value.replace(/[^0-9]/g, ''))} />
                  <FloatingInput label="IFSC Code" icon="tag" value={formData.ifscCode} onChange={e => updateForm('ifscCode', e.target.value.toUpperCase())} />
                  <FloatingInput label="UPI ID (Optional)" icon="qr_code" value={formData.upiId} onChange={e => updateForm('upiId', e.target.value)} />
                </div>
              </div>

              {/* 5. Documents */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">5</span>
                  Documents
                </h2>
                
                <div className="grid gap-4">
                  <UploadCard label="Aadhaar / PAN Card (Optional)" file={formData.aadhaarPan} onUpload={e => handleFileChange(e, 'aadhaarPan')} onRemove={() => updateForm('aadhaarPan', null)} />
                  <UploadCard label="GST Certificate (Optional)" file={formData.gstCertificate} onUpload={e => handleFileChange(e, 'gstCertificate')} onRemove={() => updateForm('gstCertificate', null)} />
                  <UploadCard label="Shop License (Optional)" file={formData.shopLicense} onUpload={e => handleFileChange(e, 'shopLicense')} onRemove={() => updateForm('shopLicense', null)} />
                  <UploadCard label="Cancelled Cheque (Optional)" file={formData.cancelledCheque} onUpload={e => handleFileChange(e, 'cancelledCheque')} onRemove={() => updateForm('cancelledCheque', null)} />
                </div>
              </div>

              {/* 6. Social Links */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-5">
                <h2 className="text-[18px] font-black text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#5B21B6]/10 flex items-center justify-center text-[#5B21B6] text-[18px] font-bold">6</span>
                  Social Links <span className="text-[13px] font-medium text-gray-400 ml-1">(Optional)</span>
                </h2>
                
                <div className="space-y-3">
                  <FloatingInput label="Website URL" icon="language" value={formData.website} onChange={e => updateForm('website', e.target.value)} />
                  <FloatingInput label="Instagram" icon="camera_alt" value={formData.instagram} onChange={e => updateForm('instagram', e.target.value)} />
                  <FloatingInput label="Facebook" icon="thumb_up" value={formData.facebook} onChange={e => updateForm('facebook', e.target.value)} />
                  <FloatingInput label="WhatsApp Business" icon="chat" value={formData.whatsapp} onChange={e => updateForm('whatsapp', e.target.value)} />
                </div>
              </div>

            </div>
            
            {/* Sticky Bottom Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
              <div className="max-w-[600px] mx-auto">
                <button onClick={handleCreateAccount} disabled={!canProceedVendor()} 
                  className={`w-full h-12 rounded-lg font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 transition-all ${
                    canProceedVendor() ? 'bg-[#5B21B6] text-white hover:bg-[#4C1D95]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  Save & Continue
                </button>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

// ─── Shared Premium Components ──────────────────────────────────────────────

function FloatingInput({ label, icon, type = 'text', value, onChange, readOnly, placeholder, multiline }) {
  const [focused, setFocused] = useState(false);
  const isFilled = value && value.length > 0;
  const InputEl = multiline ? 'textarea' : 'input';

  return (
    <div className={`relative flex ${multiline ? 'items-start pt-4' : 'items-center'} bg-white border-2 rounded-lg transition-all duration-300 ${
      focused ? 'border-[#5B21B6] shadow-[0_0_0_4px_rgba(91,33,182,0.08)]' : 'border-gray-200 hover:border-gray-300'
    } ${readOnly ? 'bg-gray-50 border-gray-200' : ''}`}>
      
      {icon && (
        <span className={`material-symbols-outlined absolute left-4 transition-colors ${
          focused ? 'text-[#5B21B6]' : 'text-gray-400'
        } ${multiline ? 'top-5' : ''}`}>{icon}</span>
      )}
      
      <InputEl
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused || readOnly ? placeholder : ''}
        rows={multiline ? 3 : undefined}
        className={`w-full bg-transparent outline-none px-4 pt-[18px] pb-[10px] text-[15px] font-bold text-gray-900 ${
          icon ? 'pl-12' : ''
        } ${multiline ? 'resize-none' : ''}`}
      />
      
      <label className={`absolute transition-all duration-200 pointer-events-none ${icon ? 'left-12' : 'left-4'} ${
        focused || isFilled || placeholder 
          ? 'top-2 text-[11px] font-bold text-[#5B21B6]' 
          : `text-[15px] text-gray-500 ${multiline ? 'top-5' : 'top-1/2 -translate-y-1/2'}`
      }`}>
        {label}
      </label>
    </div>
  );
}

function UploadCard({ label, file, onUpload, onRemove }) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  
  return (
    <div className="relative overflow-hidden bg-white border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-[#5B21B6]/50 transition-colors">
      <input type="file" id={id} className="hidden" onChange={onUpload} accept="image/*,.pdf" />
      
      {!file ? (
        <div onClick={() => document.getElementById(id).click()} className="flex items-center gap-3 cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-[#5B21B6]/5 flex items-center justify-center text-[#5B21B6]">
            <span className="material-symbols-outlined">cloud_upload</span>
          </div>
          <div>
            <h4 className="font-bold text-[14px] text-gray-900">{label}</h4>
            <p className="text-[12px] text-gray-500">Tap to upload file</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <span className="material-symbols-outlined">task</span>
            </div>
            <div>
              <h4 className="font-bold text-[14px] text-gray-900 truncate max-w-[180px]">{file.name}</h4>
              <p className="text-[12px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button onClick={onRemove} className="text-red-500 px-3 py-1.5 rounded-lg bg-red-50 text-[12px] font-bold hover:bg-red-100 transition-colors">
            Replace
          </button>
        </div>
      )}
    </div>
  );
}
