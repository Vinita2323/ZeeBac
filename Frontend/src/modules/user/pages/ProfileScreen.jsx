import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [subView, setSubView] = useState(null); // null, 'edit-profile', 'linked-accounts', 'support', 'qr-code', 'refer-earn'
  
  // Profile state
  const [profile, setProfile] = useState({
    name: currentUser.name || 'Guest User',
    phone: currentUser.phone || '+91 9999999999',
    email: currentUser.email || 'guest@zeebac.com',
    profileImage: null
  });

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showImageOptions, setShowImageOptions] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        const updatedProfile = { ...profile, profileImage: base64String };
        setProfile(updatedProfile);
        UserAPI.updateProfile({ name: updatedProfile.name, email: updatedProfile.email }); // Note: Profile image upload not implemented in API yet
        setShowImageOptions(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Linked Accounts State
  const [paymentDetails, setPaymentDetails] = useState({
    upiId: 'user@okaxis',
    bankName: 'State Bank of India',
    accNo: '•••• •••• 5493'
  });

  // Local Storage integration for persistence
  useEffect(() => {
    if (currentUser) {
      setProfile({
        name: currentUser.name || 'Guest User',
        phone: currentUser.phone || '+91 9999999999',
        email: currentUser.email || 'guest@zeebac.com',
        profileImage: null
      });
    }
    const storedPayments = localStorage.getItem('payment_details');
    if (storedPayments) {
      setPaymentDetails(JSON.parse(storedPayments));
    }
  }, [currentUser]);

  // Settings Toggles
  const [notifications, setNotifications] = useState(true);
  const [biometrics, setBiometrics] = useState(false);

  // Stats summary (dynamically read from localStorage)
  const [stats, setStats] = useState({
    totalEarned: '1,284.50',
    pendingRequests: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [walletRes, requestsRes] = await Promise.all([
          UserAPI.getMyWallet(),
          UserAPI.getMyCashbackRequests()
        ]);
        
        let pendingCount = 0;
        let totalEarned = 0;

        if (requestsRes.success) {
          pendingCount = requestsRes.data.filter(r => r.status === 'Pending').length;
        }
        if (walletRes.success) {
          totalEarned = walletRes.data.wallet?.totalEarned || 0;
        }

        setStats({
          totalEarned: totalEarned.toFixed(2),
          pendingRequests: pendingCount
        });
      } catch (err) {
        console.error('Failed to fetch stats', err);
      }
    };
    fetchStats();
  }, [subView]);

  const handleProfileSave = async (updatedProfile) => {
    try {
      await UserAPI.updateProfile({ name: updatedProfile.name, email: updatedProfile.email });
      setProfile(updatedProfile);
      setSubView(null);
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  const handlePaymentsSave = (updatedPayments) => {
    localStorage.setItem('payment_details', JSON.stringify(updatedPayments));
    setPaymentDetails(updatedPayments);
    setSubView(null);
  };

  // SUBVIEW 1: EDIT PROFILE
  if (subView === 'edit-profile') {
    return (
      <EditProfileSubView 
        initialProfile={profile} 
        onSave={handleProfileSave} 
        onBack={() => setSubView(null)} 
      />
    );
  }

  // SUBVIEW 2: LINKED ACCOUNTS
  if (subView === 'linked-accounts') {
    return (
      <LinkedAccountsSubView 
        initialPayments={paymentDetails} 
        onSave={handlePaymentsSave} 
        onBack={() => setSubView(null)} 
      />
    );
  }

  // SUBVIEW 3: HELP & SUPPORT
  if (subView === 'support') {
    return (
      <SupportSubView 
        onBack={() => setSubView(null)} 
      />
    );
  }

  // SUBVIEW 4: MY QR CODE
  if (subView === 'qr-code') {
    return (
      <QRCodeSubView 
        profile={profile}
        onBack={() => setSubView(null)} 
      />
    );
  }

  // SUBVIEW 5: REFER & EARN
  if (subView === 'refer-earn') {
    return (
      <ReferEarnSubView 
        profile={profile}
        onBack={() => setSubView(null)} 
      />
    );
  }

  // MAIN PROFILE SCREEN VIEW
  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 flex items-center border-b border-outline-variant/10 shadow-sm">
        <span className="font-display text-title-md text-primary font-black">My Profile</span>
      </header>

      {/* Main Body */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg space-y-lg text-left">
        
        {/* User Card */}
        <div className="glass-card rounded-[2rem] border border-outline-variant/30 p-md flex items-center gap-md shadow-sm relative bg-white">
          <div 
            className="relative cursor-pointer group"
            onClick={() => setShowImageOptions(true)}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              className="hidden" 
              accept="image/*"
              capture="user"
              onChange={handleImageUpload}
            />
            <div className="w-18 h-18 rounded-full bg-[#420093]/10 flex items-center justify-center text-[#420093] border border-[#420093]/20 overflow-hidden relative">
              {profile.profileImage ? (
                <img src={profile.profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[36px]">person</span>
              )}
              {/* Overlay on hover/click */}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-white text-[20px]">photo_camera</span>
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center z-10">
              <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>
            </div>
          </div>
          <div className="flex-grow">
            <h2 className="text-body-lg font-extrabold text-on-surface leading-tight">{profile.name}</h2>
            <p className="text-[12px] text-on-surface-variant font-medium mt-1">{profile.phone}</p>
            <p className="text-[11px] text-on-surface-variant/75 truncate max-w-[200px]">{profile.email}</p>
          </div>
          <button 
            onClick={() => setSubView('edit-profile')}
            className="w-9 h-9 rounded-full bg-[#420093]/10 hover:bg-[#420093]/20 flex items-center justify-center text-[#420093] cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
        </div>

        {/* KYC Identity Info */}
        {(() => {
          if (!currentUser?.aadhaar) return null;
          const maskedAadhaar = `•••• •••• ${currentUser.aadhaar.slice(-4)}`;
          const maskedPan = currentUser.pan ? `${currentUser.pan.slice(0, 2)}••••••${currentUser.pan.slice(-2)}` : '';
          return (
            <div className="bg-white border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-outline-variant/10 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                <span className="text-[12px] font-bold text-on-surface uppercase tracking-wider">Identity Verified</span>
                <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">KYC Done</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">Aadhaar</p>
                  <p className="text-[13px] font-bold text-on-surface font-label-mono tracking-wider">{maskedAadhaar}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-0.5">PAN Card</p>
                  <p className="text-[13px] font-bold text-on-surface font-label-mono tracking-wider uppercase">{maskedPan}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#D4E9FC]/40 border border-[#D4E9FC]/60 rounded-xl p-3 flex flex-col justify-between text-left h-[76px]">
            <span className="font-caption text-[9px] text-[#0F4C81] uppercase tracking-wider font-bold">Total Cashback</span>
            <div>
              <h3 className="font-display text-base font-black text-[#0f4c81] leading-none">₹{stats.totalEarned}</h3>
              <p className="text-[8px] text-[#0F4C81]/80 font-medium mt-0.5">In your wallet</p>
            </div>
          </div>
          <div className="bg-[#E6F7EB]/40 border border-[#E6F7EB]/60 rounded-xl p-3 flex flex-col justify-between text-left h-[76px]">
            <span className="font-caption text-[9px] text-[#1B5E20] uppercase tracking-wider font-bold">Pending Audits</span>
            <div>
              <h3 className="font-display text-base font-black text-[#1b5e20]">{stats.pendingRequests} Request{stats.pendingRequests !== 1 && 's'}</h3>
              <p className="text-[8px] text-[#1B5E20]/80 font-medium mt-0.5">Awaiting review</p>
            </div>
          </div>
        </div>

        {/* Settings Group 1: General Options */}
        <div className="space-y-sm">
          <h3 className="font-display text-body-sm font-extrabold text-on-surface-variant uppercase tracking-wider pl-1">Accounts & History</h3>
          <div className="bg-white border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
            <div 
              onClick={() => navigate('/passbook')}
              className="p-md hover:bg-[#420093]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">history</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Cashback History</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">View details and check receipt audits</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => setSubView('linked-accounts')}
              className="p-md hover:bg-[#420093]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">account_balance</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Cashout Accounts</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Manage linked bank details & UPI</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => navigate('/wallet')}
              className="p-md hover:bg-[#420093]/5 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">wallet</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Rewards Wallet</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Check balance status & perks list</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>
          </div>
        </div>

        {/* Settings Group 1.5: Rewards & Invites */}
        <div className="space-y-sm">
          <h3 className="font-display text-body-sm font-extrabold text-on-surface-variant uppercase tracking-wider pl-1">Rewards & Invites</h3>
          <div className="bg-white border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
            <div 
              onClick={() => setSubView('qr-code')}
              className="p-md hover:bg-[#420093]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">qr_code_2</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">My QR Code</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Receive cashback or payments instantly</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => setSubView('refer-earn')}
              className="p-md hover:bg-[#420093]/5 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">card_giftcard</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Refer & Earn</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Get ₹150 reward for each friend you invite</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>
          </div>
        </div>

        {/* Settings Group 2: Preferences & Support */}
        <div className="space-y-sm">
          <h3 className="font-display text-body-sm font-extrabold text-on-surface-variant uppercase tracking-wider pl-1">Preferences</h3>
          <div className="bg-white border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm p-sm space-y-md">
            
            {/* Toggle 1: Notifications */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">notifications_active</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Push Notifications</p>
                  <p className="font-caption text-[10px] text-on-surface-variant">Alerts on cashback audits and rewards</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={notifications} 
                  onChange={(e) => setNotifications(e.target.checked)} 
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#420093]"></div>
              </label>
            </div>

            {/* Toggle 2: Biometrics */}
            <div className="flex items-center justify-between py-1 border-t border-outline-variant/10 pt-md">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">fingerprint</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Biometric Security</p>
                  <p className="font-caption text-[10px] text-on-surface-variant">Protect cashouts with biometric validation</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={biometrics} 
                  onChange={(e) => setBiometrics(e.target.checked)} 
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#420093]"></div>
              </label>
            </div>

            {/* Direct Support link */}
            <div 
              onClick={() => setSubView('support')}
              className="flex items-center justify-between py-1 border-t border-outline-variant/10 pt-md cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#420093]">contact_support</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Help & FAQ Support</p>
                  <p className="font-caption text-[10px] text-on-surface-variant">Ask questions or chat with support assistants</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

          </div>
        </div>

        {/* Logout */}
        <button 
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="w-full h-13 rounded-xl bg-red-50 hover:bg-red-100/60 text-red-600 font-bold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-sm shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Logout Account
        </button>

      </main>

      {/* Profile Picture Source Modal */}
      {showImageOptions && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center animate-reveal">
          <div className="bg-white w-full max-w-[440px] rounded-t-3xl p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowImageOptions(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-outline-variant/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
            </button>
            <h3 className="font-display text-title-md font-bold mb-6 text-on-surface">Change Profile Photo</h3>
            
            <div className="flex justify-around gap-4 mb-6">
              <button 
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-[#420093]/5 hover:bg-[#420093]/10 border border-[#420093]/10 transition-colors cursor-pointer active:scale-95"
              >
                <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-[#420093]">
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>photo_camera</span>
                </div>
                <span className="text-[12px] font-bold text-[#420093]">Take Photo</span>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-secondary/5 hover:bg-secondary/10 border border-secondary/10 transition-colors cursor-pointer active:scale-95"
              >
                <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>photo_library</span>
                </div>
                <span className="text-[12px] font-bold text-secondary">Choose Gallery</span>
              </button>
            </div>
            {profile.profileImage && (
              <button 
                onClick={async () => {
                  const updatedProfile = { ...profile, profileImage: null };
                  setProfile(updatedProfile);
                  await onSave(updatedProfile);
                  setShowImageOptions(false);
                }}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-red-500 font-bold bg-red-50 hover:bg-red-100 transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">delete</span>
                Remove Photo
              </button>
            )}
          </div>
        </div>
      )}

      <BottomNavBar />
    </div>
  );
}

// SUBPAGE 1: EDIT PROFILE COMPONENT
function EditProfileSubView({ initialProfile, onSave, onBack }) {
  const [name, setName] = useState(initialProfile.name);
  const [email, setEmail] = useState(initialProfile.email);
  const [phone, setPhone] = useState(initialProfile.phone);

  const isValid = name.trim().length >= 3 && email.includes('@');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onSave({ ...initialProfile, name, email, phone });
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Edit Profile</span>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
        <form onSubmit={handleSubmit} className="space-y-md flex-grow">
          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Full Name</label>
            <input 
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#420093] focus:border-[#420093] outline-none text-body-lg transition-all"
            />
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Phone Number</label>
            <input 
              disabled
              type="text"
              value={phone}
              className="w-full h-[52px] px-md bg-gray-100 border border-outline-variant/20 rounded-xl text-on-surface-variant/80 outline-none text-body-lg cursor-not-allowed"
            />
            <p className="text-[10px] text-on-surface-variant/60 mt-1 pl-1">Phone number cannot be modified.</p>
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Email Address</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#420093] focus:border-[#420093] outline-none text-body-lg transition-all"
            />
          </div>
        </form>

        <button 
          onClick={handleSubmit}
          disabled={!isValid}
          className={`w-full h-14 rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg transition-transform duration-100 ${
            isValid
              ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer'
              : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
          }`}
        >
          Save Changes
        </button>
      </main>
    </div>
  );
}

// SUBPAGE 2: LINKED ACCOUNTS COMPONENT
function LinkedAccountsSubView({ initialPayments, onSave, onBack }) {
  const [upiId, setUpiId] = useState(initialPayments.upiId);
  const [bankName, setBankName] = useState(initialPayments.bankName);
  const [accNo, setAccNo] = useState(initialPayments.accNo);

  const isValid = upiId.trim().includes('@') && bankName.trim().length > 3 && accNo.trim().length >= 4;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;
    onSave({ upiId, bankName, accNo });
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Linked Accounts</span>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
        <form onSubmit={handleSubmit} className="space-y-md flex-grow">
          <div className="bg-gradient-to-br from-[#420093] to-[#250058] text-white p-5 rounded-3xl shadow-lg relative overflow-hidden mb-lg">
            <span className="material-symbols-outlined absolute right-6 top-6 text-white/10 text-[80px] pointer-events-none select-none">account_balance_wallet</span>
            <div className="space-y-sm">
              <span className="text-[10px] text-white/60 tracking-widest uppercase">DEFAULT RECEIVING BANK</span>
              <h3 className="text-body-lg font-black">{bankName}</h3>
              <p className="font-label-mono text-body-sm tracking-widest pt-1">{accNo.startsWith('•') ? accNo : `•••• •••• ${accNo.slice(-4)}`}</p>
              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px] text-white/80">
                <span>UPI ID: {upiId}</span>
                <span className="bg-green-500 text-white font-bold px-2 py-0.5 rounded-full uppercase scale-90">Linked</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">UPI Address (VPA)</label>
            <input 
              autoFocus
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#420093] focus:border-[#420093] outline-none text-body-lg transition-all"
            />
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Receiving Bank Name</label>
            <input 
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#420093] focus:border-[#420093] outline-none text-body-lg transition-all"
            />
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Bank Account Number</label>
            <input 
              type="text"
              value={accNo}
              onChange={(e) => setAccNo(e.target.value)}
              placeholder="Enter last 4 digits or full account"
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#420093] focus:border-[#420093] outline-none text-body-lg transition-all"
            />
          </div>
        </form>

        <button 
          onClick={handleSubmit}
          disabled={!isValid}
          className={`w-full h-14 rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg transition-transform duration-100 ${
            isValid
              ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer'
              : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
          }`}
        >
          Update Linked Account
        </button>
      </main>
    </div>
  );
}

// SUBPAGE 3: HELP & SUPPORT COMPONENT
function SupportSubView({ onBack }) {
  const faqs = [
    {
      q: "How does Zeebac Cashback audit work?",
      a: "When you upload a bill receipt, it is sent to the respective partner merchant for verification. Once audited (usually in 2-4 hours), the calculated cashback reward is instantly credited to your Zeebac Wallet balance."
    },
    {
      q: "When can I cash out my rewards?",
      a: "You can cash out your reward balance directly to your linked bank account or UPI ID. Go to Wallet -> Cashout, choose your transfer method, and verify with your biometric or PIN. Deposits typically take 5-10 minutes."
    },
    {
      q: "Why was my cashback request rejected?",
      a: "Rejections generally happen if: (1) The receipt is blurry or unreadable, (2) The payment method does not match, (3) The invoice has already been claimed. You can resubmit requests with better images directly."
    },
    {
      q: "What is the maximum cashback rate?",
      a: "Each merchant has a specific cashback rate (e.g. up to 15% at Noir Concept Store). You can review all current partner stores, their rates, and distance under the 'Explore' tab."
    }
  ];

  const [activeFaq, setActiveFaq] = useState(null);

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Help & FAQ Support</span>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
        <div className="space-y-lg flex-grow">
          <div className="text-center space-y-xs pb-2 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[#420093] text-[48px] animate-bounce">contact_support</span>
            <h2 className="text-headline-sm font-extrabold text-on-surface">Frequently Asked Questions</h2>
            <p className="text-body-sm text-on-surface-variant">Quick answers to common questions about Zeebac rewards.</p>
          </div>

          <div className="space-y-sm">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div 
                  key={index} 
                  className="bg-white border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full p-md flex justify-between items-center text-left font-bold text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <span>{faq.q}</span>
                    <span className="material-symbols-outlined text-outline transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      keyboard_arrow_down
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-md pb-md text-[13px] text-on-surface-variant leading-relaxed animate-reveal">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-xl space-y-sm">
          <button 
            onClick={() => alert('Support Representative chat placeholder')}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined">chat</span>
            Chat with Customer Care
          </button>
          <a 
            href="mailto:support@zeebac.com"
            className="w-full h-12 border border-outline-variant/40 bg-white text-secondary rounded-xl font-title-md flex items-center justify-center gap-sm active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined">mail</span>
            Email Support (24/7)
          </a>
        </div>
      </main>
    </div>
  );
}

// SUBPAGE 4: MY QR CODE COMPONENT
function QRCodeSubView({ profile, onBack }) {
  const [copied, setCopied] = useState(false);
  const currentUser = useAuthStore(state => state.currentUser) || {};
  const zeebacId = currentUser.zeebacId || 'ZBC-0000';
  const qrData = `zeebac://customer/${zeebacId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=66-0-147&data=${encodeURIComponent(qrData)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(zeebacId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = `My Zeebac ID: ${zeebacId} — Scan my QR or enter this ID in the Zeebac app to transact with me!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Zeebac QR', text, url: window.location.href });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(text);
      alert('Zeebac ID copied to clipboard!');
    }
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-2 flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">My Zeebac QR</span>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-3 flex flex-col justify-between items-center text-center">
        <div className="w-full space-y-3 flex-grow flex flex-col justify-center items-center">
          {/* QR Container Card */}
          <div className="bg-white border border-outline-variant/30 rounded-2xl p-4 shadow-md w-full max-w-[280px] flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#420093]"></div>

            {/* Profile Info Header */}
            <div className="flex flex-col items-center mt-1 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#420093]/10 flex items-center justify-center text-[#420093] font-bold border border-[#420093]/20 mb-1 overflow-hidden">
                {profile.profileImage ? (
                  <img src={profile.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">{profile.name.charAt(0)}</span>
                )}
              </div>
              <h3 className="font-display text-sm font-extrabold text-on-surface">{profile.name}</h3>
              <p className="text-[10px] text-on-surface-variant font-medium">{profile.phone}</p>
            </div>

            {/* Actual QR Image */}
            <div className="bg-[#fcfcff] border border-outline-variant/20 rounded-xl p-3 w-40 h-40 flex items-center justify-center shadow-inner">
              <img 
                src={qrUrl} 
                alt="Zeebac QR Code" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f3f4f6"/><text x="50" y="55" font-size="8" text-anchor="middle" fill="%239ca3af">QR Code</text></svg>';
                }}
              />
            </div>

            <div className="mt-2.5 flex items-center gap-1">
              <span className="text-[9px] text-on-surface-variant font-bold tracking-widest uppercase">POWERED BY</span>
              <span className="text-[11px] font-black text-[#420093] tracking-tight">zeebac</span>
            </div>
          </div>

          {/* Zeebac ID Box */}
          <div className="w-full max-w-[280px] bg-white border border-outline-variant/20 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
            <div className="text-left">
              <p className="text-[8px] text-on-surface-variant uppercase tracking-wider font-bold">Zeebac ID</p>
              <p className="text-xs font-mono font-bold text-on-surface select-all mt-0.5">{zeebacId}</p>
            </div>
            <button 
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-[#420093]/10 hover:bg-[#420093]/20 text-[#420093] text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">{copied ? 'done' : 'content_copy'}</span>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <p className="text-[9px] text-on-surface-variant/85 max-w-[260px] leading-snug mt-1">
            Show this QR to vendors for instant wallet cashback transactions. No receipt needed!
          </p>
        </div>

        <div className="w-full pt-3">
          <button 
            onClick={handleShare}
            className="w-full h-11 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-xs shadow-md active:scale-95 transition-transform cursor-pointer text-sm"
          >
            <span className="material-symbols-outlined text-base">share</span>
            Share My Zeebac ID
          </button>
        </div>
      </main>
    </div>
  );
}



// SUBPAGE 5: REFER & EARN COMPONENT
function ReferEarnSubView({ profile, onBack }) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ invited: 0, earned: 0, code: 'ZEEBAC150' });
  
  useEffect(() => {
    const fetchReferralStats = async () => {
      try {
        const res = await UserAPI.getMyReferrals();
        if (res.success && res.data) {
          setStats({
            invited: res.data.stats?.totalInvited || 0,
            earned: res.data.stats?.totalEarned || 0,
            code: res.data.referralCode || profile?.referralCode || 'ZEEBAC150'
          });
        }
      } catch (err) {
        console.error("Failed to fetch referral stats:", err);
      }
    };
    fetchReferralStats();
  }, [profile?.referralCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(stats.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = `Join Zeebac and earn cashback on all your shopping! Use my code: ${stats.code} to sign up and get rewards.`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Zeebac Referral Invite',
          text: text,
          url: window.location.origin,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(`${text} ${window.location.origin}`);
      alert('Referral link and code copied to clipboard!');
    }
  };

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Refer & Earn</span>
      </header>

      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
        <div className="space-y-lg flex-grow">
          {/* Promotional Banner Card */}
          <div className="bg-gradient-to-br from-[#420093] to-[#6b00f2] text-white p-5 rounded-3xl shadow-lg relative overflow-hidden flex items-center gap-md">
            <span className="material-symbols-outlined absolute right-[-10px] bottom-[-10px] text-white/10 text-[110px] pointer-events-none select-none">card_giftcard</span>
            <div className="flex-grow z-10">
              <span className="text-[10px] text-yellow-300 font-extrabold tracking-wider uppercase bg-yellow-500/20 px-2.5 py-1 rounded-full">LIMITED OFFER</span>
              <h2 className="text-title-md font-black mt-2 leading-tight">Invite Friends &amp; Earn ₹150!</h2>
              <p className="text-[11px] text-white/85 mt-1 leading-relaxed">Get cashback in your wallet as soon as your friend completes their first receipt audit.</p>
            </div>
          </div>

          {/* Referral Stats Summary */}
          <div className="grid grid-cols-2 gap-md">
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-md flex flex-col text-left shadow-sm">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Friends Invited</span>
              <h3 className="font-display text-title-md font-black text-[#420093] mt-1">{stats.invited}</h3>
            </div>
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-md flex flex-col text-left shadow-sm">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total Earned</span>
              <h3 className="font-display text-title-md font-black text-green-600 mt-1">₹{stats.earned}</h3>
            </div>
          </div>

          {/* Referral Code Box */}
          <div className="space-y-xs">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold pl-1">Your Referral Code</span>
            <div className="bg-white border-2 border-dashed border-[#420093]/30 rounded-2xl p-md flex items-center justify-between shadow-sm">
              <div className="flex-grow">
                <span className="font-display text-title-sm font-black tracking-widest text-[#420093] uppercase select-all">{stats.code}</span>
              </div>
              <button 
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-[#420093]/10 hover:bg-[#420093]/20 text-[#420093] text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">{copied ? 'done' : 'content_copy'}</span>
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* How It Works Timeline */}
          <div className="space-y-sm">
            <h3 className="font-display text-body-sm font-extrabold text-on-surface uppercase tracking-wider pl-1">How it works</h3>
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-md space-y-md shadow-sm">
              <div className="flex gap-md">
                <div className="w-6 h-6 rounded-full bg-[#420093]/10 text-[#420093] flex items-center justify-center font-bold text-xs flex-shrink-0">1</div>
                <div>
                  <h4 className="text-body-sm font-bold text-on-surface">Share your link</h4>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Send your custom referral invite to your friends.</p>
                </div>
              </div>

              <div className="flex gap-md border-t border-outline-variant/10 pt-md">
                <div className="w-6 h-6 rounded-full bg-[#420093]/10 text-[#420093] flex items-center justify-center font-bold text-xs flex-shrink-0">2</div>
                <div>
                  <h4 className="text-body-sm font-bold text-on-surface">Friend does receipt audit</h4>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">They sign up with your code and get cashback on their first upload.</p>
                </div>
              </div>

              <div className="flex gap-md border-t border-outline-variant/10 pt-md">
                <div className="w-6 h-6 rounded-full bg-[#420093]/10 text-[#420093] flex items-center justify-center font-bold text-xs flex-shrink-0">3</div>
                <div>
                  <h4 className="text-body-sm font-bold text-on-surface">Get your cash reward</h4>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">₹150 will be instantly deposited into your rewards wallet.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-xl">
          <button 
            onClick={handleShare}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined">share</span>
            Invite Friends
          </button>
        </div>
      </main>
    </div>
  );
}
