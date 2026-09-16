import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import { shareContent, downloadImage } from '../../../utils/exportUtils';
import useQrCode from '../../../hooks/useQrCode';
import { isBiometricSupported, registerBiometricCredential } from '../../../utils/biometric.util';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const updateProfileStore = useAuthStore((state) => state.updateProfile);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [subView, setSubView] = useState(null); // null, 'edit-profile', 'linked-accounts', 'support', 'qr-code', 'refer-earn'
  
  // Profile state
  const [profile, setProfile] = useState({
    name: currentUser.name || 'Guest User',
    phone: currentUser.phone || '+91 9999999999',
    email: currentUser.email || 'guest@zeebac.com',
    profileImage: currentUser.profileImage || null
  });

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showImageOptions, setShowImageOptions] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        const updatedProfile = { ...profile, profileImage: base64String };
        setProfile(updatedProfile);
        
        // Update globally and in backend
        updateProfileStore({ profileImage: base64String });
        try {
          await UserAPI.updateProfile({ profileImage: base64String });
        } catch (error) {
          console.error("Failed to update profile image on backend", error);
        }
        setShowImageOptions(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Linked Accounts State
  const [paymentDetails, setPaymentDetails] = useState({
    upiId: currentUser?.bankDetails?.upiId || '',
    bankName: currentUser?.bankDetails?.bankName || '',
    accNo: currentUser?.bankDetails?.accountNumber || ''
  });

  // Local Storage integration for persistence
  useEffect(() => {
    if (currentUser) {
      setProfile({
        name: currentUser.name || 'Guest User',
        phone: currentUser.phone || '+91 9999999999',
        email: currentUser.email || 'guest@zeebac.com',
        profileImage: currentUser.profileImage || null
      });
      if (currentUser.bankDetails) {
        setPaymentDetails({
          upiId: currentUser.bankDetails.upiId || '',
          bankName: currentUser.bankDetails.bankName || '',
          accNo: currentUser.bankDetails.accountNumber || ''
        });
      }
    }
  }, [currentUser]);

  // Settings Toggles
  const [notifications, setNotifications] = useState(true);
  const [biometrics, setBiometrics] = useState(currentUser?.security?.biometricEnabled || false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinMode, setPinMode] = useState('setup'); // 'setup' | 'change'
  const [pinForm, setPinForm] = useState({ pin: '', confirmPin: '', currentPin: '' });
  const [pinError, setPinError] = useState('');
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [securityToast, setSecurityToast] = useState('');

  useEffect(() => {
    if (currentUser?.security) {
      setBiometrics(!!currentUser.security.biometricEnabled);
    }
  }, [currentUser]);

  const enrollBiometrics = async () => {
    try {
      const supported = await isBiometricSupported();
      if (!supported) {
        await UserAPI.toggleBiometricSecurity(true);
        updateProfileStore({ security: { ...currentUser?.security, biometricEnabled: true } });
        setBiometrics(true);
        setSecurityToast('Device does not have biometric hardware. Protected with your Security PIN.');
        setTimeout(() => setSecurityToast(''), 4500);
        return;
      }

      const bioRes = await registerBiometricCredential(currentUser);
      if (bioRes.success) {
        await UserAPI.toggleBiometricSecurity(true, bioRes.credentialId);
        updateProfileStore({
          security: {
            ...currentUser?.security,
            biometricEnabled: true,
            biometricCredentialId: bioRes.credentialId,
          }
        });
        setBiometrics(true);
        setSecurityToast('✅ Biometric security enabled! Cashouts are now protected.');
        setTimeout(() => setSecurityToast(''), 4000);
      } else {
        setSecurityToast(bioRes.error || 'Biometric registration cancelled.');
        setBiometrics(false);
        setTimeout(() => setSecurityToast(''), 4000);
      }
    } catch (err) {
      console.error(err);
      setSecurityToast('Failed to setup biometrics.');
      setBiometrics(false);
      setTimeout(() => setSecurityToast(''), 4000);
    }
  };

  const handleToggleBiometrics = async (e) => {
    const shouldEnable = e.target.checked;
    setSecurityToast('');

    if (shouldEnable) {
      // If user hasn't configured a backup PIN yet, prompt PIN setup first
      if (!currentUser?.security?.hasPin) {
        setPinMode('setup');
        setPinForm({ pin: '', confirmPin: '', currentPin: '' });
        setPinError('');
        setShowPinModal(true);
        return;
      }
      await enrollBiometrics();
    } else {
      try {
        const res = await UserAPI.toggleBiometricSecurity(false);
        if (res.success) {
          updateProfileStore({ security: { ...currentUser?.security, biometricEnabled: false } });
          setBiometrics(false);
          setSecurityToast('Biometric security disabled.');
          setTimeout(() => setSecurityToast(''), 3500);
        }
      } catch (err) {
        console.error('Failed to disable biometrics', err);
      }
    }
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    setPinError('');
    if (!pinForm.pin || pinForm.pin.length < 4 || pinForm.pin.length > 8) {
      setPinError('PIN must be 4 to 8 digits.');
      return;
    }
    if (pinForm.pin !== pinForm.confirmPin) {
      setPinError('PINs do not match.');
      return;
    }
    if (pinMode === 'change' && !pinForm.currentPin) {
      setPinError('Current PIN is required.');
      return;
    }

    setIsSubmittingPin(true);
    try {
      const res = await UserAPI.setupSecurityPin(pinForm.pin, pinForm.currentPin || null);
      if (res.success) {
        updateProfileStore({
          security: {
            ...currentUser?.security,
            hasPin: true,
          }
        });
        setShowPinModal(false);
        setPinForm({ pin: '', confirmPin: '', currentPin: '' });

        if (pinMode === 'setup') {
          await enrollBiometrics();
        } else {
          setSecurityToast('✅ Security PIN updated successfully.');
          setTimeout(() => setSecurityToast(''), 3500);
        }
      }
    } catch (err) {
      setPinError(err.response?.data?.message || err.message || 'Failed to set PIN.');
    } finally {
      setIsSubmittingPin(false);
    }
  };

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
      updateProfileStore({ name: updatedProfile.name, email: updatedProfile.email });
      setSubView(null);
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  const handleSavePaymentDetails = async (newDetails) => {
    try {
      const res = await UserAPI.updateLinkedAccount(newDetails);
      if (res.success) {
        setPaymentDetails(newDetails);
        setSubView(null);
      }
    } catch (error) {
      console.error("Failed to update linked account", error);
      alert("Failed to update account. Please try again.");
    }
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
        onSave={handleSavePaymentDetails} 
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
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-3 border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <span className="font-display text-title-md text-primary font-black">My Profile</span>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-grow app-container px-container-margin py-lg space-y-lg text-left">
        
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
            <div className="w-18 h-18 rounded-full bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] border border-[#7c3aed]/20 overflow-hidden relative">
              {profile.profileImage ? (
                <img src={profile.profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-black text-[32px]">{profile.name.charAt(0).toUpperCase()}</span>
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
            className="w-9 h-9 rounded-full bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 flex items-center justify-center text-[#7c3aed] cursor-pointer transition-colors"
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
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">history</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Cashback History</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">View details and check receipt audits</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => setSubView('linked-accounts')}
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">account_balance</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Cashout Accounts</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Manage linked bank details & UPI</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => navigate('/wallet')}
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">wallet</span>
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
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">qr_code_2</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">My QR Code</p>
                  <p className="font-caption text-[11px] text-on-surface-variant">Receive cashback or payments instantly</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>

            <div 
              onClick={() => setSubView('refer-earn')}
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">card_giftcard</span>
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
                <span className="material-symbols-outlined text-[#7c3aed]">notifications_active</span>
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
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7c3aed]"></div>
              </label>
            </div>

            {/* Toggle 2: Biometrics */}
            <div className="py-2 border-t border-outline-variant/10 pt-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${biometrics ? 'bg-purple-100 text-[#7c3aed]' : 'bg-gray-100 text-gray-400'}`}>
                    <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                  </div>
                  <div>
                    <p className="font-title-md text-on-surface font-bold text-body-sm flex items-center gap-1.5">
                      Biometric Security
                      {biometrics && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                      )}
                    </p>
                    <p className="font-caption text-[10px] text-on-surface-variant">Protect cashouts with Fingerprint, Face ID or PIN</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={biometrics} 
                    onChange={handleToggleBiometrics} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7c3aed]"></div>
                </label>
              </div>

              {/* Security Toast */}
              {securityToast && (
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200/60 text-[11px] font-medium text-purple-900 flex items-center gap-2 animate-reveal">
                  <span className="material-symbols-outlined text-[16px] text-primary shrink-0">info</span>
                  <span>{securityToast}</span>
                </div>
              )}

              {/* Backup PIN Manager */}
              <div className="flex items-center justify-between pl-11 pr-1 text-[11px]">
                <span className="text-on-surface-variant font-medium">
                  Backup PIN: <strong className="text-on-surface">{currentUser?.security?.hasPin ? 'Configured ✅' : 'Not Set'}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPinMode(currentUser?.security?.hasPin ? 'change' : 'setup');
                    setPinForm({ pin: '', confirmPin: '', currentPin: '' });
                    setPinError('');
                    setShowPinModal(true);
                  }}
                  className="text-primary font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[14px]">key</span>
                  {currentUser?.security?.hasPin ? 'Change PIN' : 'Set PIN'}
                </button>
              </div>
            </div>

            {/* Direct Support link */}
            <div 
              onClick={() => setSubView('support')}
              className="flex items-center justify-between py-1 border-t border-outline-variant/10 pt-md cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">contact_support</span>
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
                className="flex-1 flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-[#7c3aed]/5 hover:bg-[#7c3aed]/10 border border-[#7c3aed]/10 transition-colors cursor-pointer active:scale-95"
              >
                <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-[#7c3aed]">
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>photo_camera</span>
                </div>
                <span className="text-[12px] font-bold text-[#7c3aed]">Take Photo</span>
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

      {/* Security PIN Setup / Change Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-reveal">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">key</span>
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-[17px] text-on-surface">
                    {pinMode === 'setup' ? 'Set Security PIN' : 'Change Security PIN'}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant">Backup for Biometrics & Cashouts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowPinModal(false); setPinError(''); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[12px] text-on-surface-variant leading-relaxed">
              {pinMode === 'setup'
                ? 'Create a 4 to 8 digit Security PIN. You can use this PIN to withdraw cash if your fingerprint or Face ID is unavailable.'
                : 'Enter your current PIN and choose a new 4 to 8 digit Security PIN.'}
            </p>

            <form onSubmit={handleSavePin} className="space-y-3">
              {pinMode === 'change' && (
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Current PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    required
                    value={pinForm.currentPin}
                    onChange={(e) => setPinForm({ ...pinForm, currentPin: e.target.value.replace(/\D/g, '') })}
                    placeholder="Enter current PIN"
                    className="w-full h-11 px-3.5 bg-gray-50 rounded-xl border border-outline-variant/30 focus:border-primary outline-none text-[15px] font-bold tracking-widest text-on-surface"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                  {pinMode === 'setup' ? 'Create PIN (4-8 digits)' : 'New PIN (4-8 digits)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required
                  value={pinForm.pin}
                  onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 1234"
                  className="w-full h-11 px-3.5 bg-gray-50 rounded-xl border border-outline-variant/30 focus:border-primary outline-none text-[15px] font-bold tracking-widest text-on-surface"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required
                  value={pinForm.confirmPin}
                  onChange={(e) => setPinForm({ ...pinForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="Re-enter PIN"
                  className="w-full h-11 px-3.5 bg-gray-50 rounded-xl border border-outline-variant/30 focus:border-primary outline-none text-[15px] font-bold tracking-widest text-on-surface"
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 h-11 rounded-xl border border-outline-variant/30 font-bold text-[13px] text-on-surface-variant hover:bg-gray-50 active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPin || !pinForm.pin || !pinForm.confirmPin}
                  className="flex-1 h-11 bg-primary text-white rounded-xl font-bold text-[13px] shadow-md hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  {isSubmittingPin ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    pinMode === 'setup' ? 'Save & Continue' : 'Update PIN'
                  )}
                </button>
              </div>
            </form>
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
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary ml-2">Edit Profile</span>
          </div>
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-xl flex flex-col justify-between text-left">
        <form onSubmit={handleSubmit} className="space-y-md flex-grow">
          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Full Name</label>
            <input 
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#7c3aed] focus:border-[#7c3aed] outline-none text-body-lg transition-all"
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
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#7c3aed] focus:border-[#7c3aed] outline-none text-body-lg transition-all"
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
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary ml-2">Linked Accounts</span>
          </div>
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-xl flex flex-col justify-between text-left">
        <form onSubmit={handleSubmit} className="space-y-md flex-grow">
          <div className="bg-gradient-to-br from-[#7c3aed] to-[#a855f7] text-white p-5 rounded-3xl shadow-lg shadow-primary/25 relative overflow-hidden mb-lg">
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
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#7c3aed] focus:border-[#7c3aed] outline-none text-body-lg transition-all"
            />
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Receiving Bank Name</label>
            <input 
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#7c3aed] focus:border-[#7c3aed] outline-none text-body-lg transition-all"
            />
          </div>

          <div>
            <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Bank Account Number</label>
            <input 
              type="text"
              value={accNo}
              onChange={(e) => setAccNo(e.target.value)}
              placeholder="Enter last 4 digits or full account"
              className="w-full h-[52px] px-md bg-white border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-[#7c3aed] focus:border-[#7c3aed] outline-none text-body-lg transition-all"
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
  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setIsLoadingTickets(true);
      const res = await UserAPI.getMySupportTickets();
      if (res.success) {
        setTickets(res.data);
      }
    } catch (error) {
      console.error("Failed to load tickets", error);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!subject || !message) return;
    try {
      setIsSubmitting(true);
      const res = await UserAPI.createSupportTicket(subject, message);
      if (res.success) {
        setSubject('');
        setMessage('');
        setShowForm(false);
        fetchTickets(); // Refresh list
      }
    } catch (error) {
      alert("Failed to submit ticket");
    } finally {
      setIsSubmitting(false);
    }
  };
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
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
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
            <span className="material-symbols-outlined text-[#7c3aed] text-[48px] animate-bounce">contact_support</span>
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

          <div className="pt-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-title-md font-bold text-on-surface">My Support Tickets</h3>
              <button 
                onClick={() => setShowForm(!showForm)}
                className="text-primary font-bold text-body-sm bg-primary/10 px-3 py-1 rounded-full cursor-pointer hover:bg-primary/20"
              >
                {showForm ? 'Cancel' : '+ New Ticket'}
              </button>
            </div>

            {showForm && (
              <form onSubmit={handleSubmitTicket} className="bg-white p-4 rounded-2xl border border-outline-variant/30 mb-6 space-y-4 animate-reveal">
                <div>
                  <label className="block text-[12px] font-bold text-on-surface-variant mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    className="w-full mesh-gradient border border-outline-variant/30 rounded-xl px-4 py-3 text-body-sm focus:border-primary focus:outline-none"
                    placeholder="E.g., Cashback not received"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-on-surface-variant mb-1">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows="3"
                    className="w-full mesh-gradient border border-outline-variant/30 rounded-xl px-4 py-3 text-body-sm focus:border-primary focus:outline-none resize-none"
                    placeholder="Describe your issue..."
                  ></textarea>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !subject || !message}
                  className={`w-full h-12 rounded-xl font-bold flex items-center justify-center transition-all ${
                    isSubmitting || !subject || !message ? 'bg-outline-variant/40 text-on-surface/40' : 'btn-primary-gradient text-white cursor-pointer'
                  }`}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </form>
            )}

            {isLoadingTickets ? (
              <div className="text-center py-4 text-outline">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-6 text-outline bg-white rounded-2xl border border-outline-variant/30">
                No tickets yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map(ticket => (
                  <div key={ticket._id} className="bg-white p-4 rounded-2xl border border-outline-variant/30 text-[13px]">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-on-surface">{ticket.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ticket.status === 'Resolved' ? 'bg-green-100 text-green-700' :
                        ticket.status === 'Open' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-on-surface-variant mb-2">{ticket.message}</p>
                    {ticket.adminReply && (
                      <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 mt-3">
                        <span className="text-[11px] font-bold text-primary block mb-1">Zeebac Support Reply:</span>
                        <p className="text-on-surface-variant italic">{ticket.adminReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-8 space-y-sm">
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

  // Signed + short-lived (15 min) — refreshes itself automatically while
  // this screen stays open. Rendered locally, never sent to a third party.
  const fetchToken = useCallback(() => UserAPI.getQrToken(), []);
  const { qrImageUrl, isLoading, error, refresh } = useQrCode(fetchToken);

  const handleCopy = () => {
    navigator.clipboard.writeText(zeebacId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = `My Zeebac ID: ${zeebacId} — Scan my QR or enter this ID in the Zeebac app to transact with me!`;
    if (qrImageUrl) await shareContent(qrImageUrl, 'My Zeebac QR', text);
  };

  const handleDownload = () => {
    if (qrImageUrl) downloadImage(qrImageUrl, `Zeebac_QR_${zeebacId}.png`);
  };

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
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
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#7c3aed]"></div>

            {/* Profile Info Header */}
            <div className="flex flex-col items-center mt-1 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#7c3aed]/10 flex items-center justify-center text-[#7c3aed] font-bold border border-[#7c3aed]/20 mb-1 overflow-hidden">
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
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="Zeebac QR Code" className="w-full h-full object-contain" />
              ) : isLoading ? (
                <div className="w-6 h-6 border-2 border-[#7c3aed]/30 border-t-[#7c3aed] rounded-full animate-spin" />
              ) : (
                <button onClick={refresh} className="text-[11px] text-red-500 font-bold underline cursor-pointer">
                  {error ? 'Failed to load — tap to retry' : 'Tap to load QR'}
                </button>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-1">
              <span className="text-[9px] text-on-surface-variant font-bold tracking-widest uppercase">POWERED BY</span>
              <span className="text-[11px] font-black text-[#7c3aed] tracking-tight">zeebac</span>
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
              className="px-2.5 py-1 rounded-lg bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#7c3aed] text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">{copied ? 'done' : 'content_copy'}</span>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <p className="text-[9px] text-on-surface-variant/85 max-w-[260px] leading-snug mt-1">
            Show this QR to vendors for instant wallet cashback transactions. No receipt needed!
          </p>
        </div>

        <div className="w-full pt-3 flex gap-2">
          <button 
            onClick={handleDownload}
            className="flex-1 h-11 bg-white text-primary border border-primary/30 rounded-xl font-title-md flex items-center justify-center gap-xs shadow-sm active:scale-95 transition-transform cursor-pointer text-sm"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Download
          </button>
          <button 
            onClick={handleShare}
            className="flex-1 h-11 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-xs shadow-md active:scale-95 transition-transform cursor-pointer text-sm"
          >
            <span className="material-symbols-outlined text-base">share</span>
            Share
          </button>
        </div>
      </main>
    </div>
  );
}



// SUBPAGE 5: REFER & EARN COMPONENT
function ReferEarnSubView({ profile, onBack }) {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [stats, setStats] = useState({
    invited: 0,
    earned: 0,
    code: profile?.referralCode || '',
    rewardAmount: 150,
    history: []
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchReferralStats = async () => {
      try {
        setLoading(true);
        const res = await UserAPI.getMyReferrals();
        if (res.success && res.data) {
          setStats({
            invited: res.data.stats?.totalInvited || 0,
            earned: res.data.stats?.totalEarned || 0,
            code: res.data.referralCode || profile?.referralCode || 'ZEEBAC',
            rewardAmount: res.data.rewardAmount || 150,
            history: res.data.history || []
          });
        }
      } catch (err) {
        console.error("Failed to fetch referral stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReferralStats();
  }, [profile?.referralCode]);

  const inviteLink = `${window.location.origin}/signup?ref=${stats.code}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(stats.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    const text = `Join me on Zeebac and earn cashback on all your shopping! Sign up using my referral link: ${inviteLink} (Code: ${stats.code}) to unlock rewards!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Zeebac Referral Invite',
          text: text,
          url: inviteLink,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.log('Error sharing:', err);
        }
      }
    } else {
      navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      alert('Referral link copied to clipboard!');
    }
  };

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary ml-4">Refer & Earn</span>
      </header>

      <main className="flex-grow max-w-[460px] mx-auto w-full px-container-margin py-lg flex flex-col justify-between text-left space-y-6">
        <div className="space-y-5 flex-grow">
          {/* Promotional Banner Card */}
          <div className="bg-gradient-to-br from-[#7c3aed] via-[#9333ea] to-[#c026d3] text-white p-5 rounded-3xl shadow-lg shadow-purple-600/20 relative overflow-hidden flex items-center gap-md">
            <span className="material-symbols-outlined absolute right-[-12px] bottom-[-14px] text-white/10 text-[115px] pointer-events-none select-none">card_giftcard</span>
            <div className="flex-grow z-10">
              <span className="text-[10px] text-amber-300 font-extrabold tracking-wider uppercase bg-amber-400/20 border border-amber-300/30 px-2.5 py-1 rounded-full">
                INSTANT CASH REWARD
              </span>
              <h2 className="text-title-md font-black mt-2 leading-tight">
                Invite Friends &amp; Earn ₹{stats.rewardAmount}!
              </h2>
              <p className="text-[11px] text-white/90 mt-1 leading-relaxed">
                When your friend signs up and completes their first bill cashback or QR payment, ₹{stats.rewardAmount} is directly deposited from Zeebac Admin into your rewards wallet.
              </p>
            </div>
          </div>

          {/* Referral Stats Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-4 flex flex-col text-left shadow-xs">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Friends Invited</span>
              <h3 className="font-display text-title-md font-black text-[#7c3aed] mt-1">{stats.invited}</h3>
              <span className="text-[10px] text-slate-400 mt-0.5">Total successful joins</span>
            </div>
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-4 flex flex-col text-left shadow-xs">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Bonus Earned</span>
              <h3 className="font-display text-title-md font-black text-emerald-600 mt-1">₹{stats.earned}</h3>
              <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">verified</span> Credited to wallet
              </span>
            </div>
          </div>

          {/* Referral Code & Invite Link Box */}
          <div className="bg-white border border-outline-variant/25 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                  Your Unique Referral Code
                </span>
                <span className="font-display text-lg font-black tracking-widest text-[#7c3aed] uppercase select-all">
                  {stats.code || 'GENERATING...'}
                </span>
              </div>
              <button 
                onClick={handleCopyCode}
                className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/60 text-[#7c3aed] text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs"
              >
                <span className="material-symbols-outlined text-[16px]">{copied ? 'done' : 'content_copy'}</span>
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Direct Link */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Invite Link (Auto-Applies Code)</span>
                <p className="text-[11px] text-slate-600 truncate font-mono bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/60 mt-0.5 select-all">
                  {inviteLink}
                </p>
              </div>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[14px]">{copiedLink ? 'check' : 'link'}</span>
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Invited Friends List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-display text-xs font-black text-slate-800 uppercase tracking-wider">
                Invited Friends ({stats.history.length})
              </h3>
              <span className="text-[10px] text-purple-600 font-bold">Auto-updates</span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200/60">
                Loading referral status...
              </div>
            ) : stats.history.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5 text-center text-slate-400 space-y-1">
                <span className="material-symbols-outlined text-[32px] text-purple-300">group_add</span>
                <p className="text-xs font-bold text-slate-700">No friends invited yet</p>
                <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto">
                  Share your invite link below. When friends join and do their first transaction, you get ₹{stats.rewardAmount} each!
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-2xs max-h-[220px] overflow-y-auto">
                {stats.history.map((item, idx) => (
                  <div key={item._id || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
                        {(item.friendName || 'F').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {item.friendName || 'Friend'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {item.friendPhone || 'Customer'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {item.rewardStatus === 'Credited' ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                          <span className="material-symbols-outlined text-[12px]">check_circle</span>
                          +₹{item.rewardAmount} Credited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          Pending 1st Bill
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How It Works Timeline */}
          <div className="space-y-2">
            <h3 className="font-display text-xs font-black text-slate-800 uppercase tracking-wider pl-1">
              How Referral Payout Works
            </h3>
            <div className="bg-white border border-outline-variant/20 rounded-2xl p-4 space-y-3.5 shadow-2xs">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-100 text-[#7c3aed] flex items-center justify-center font-bold text-xs flex-shrink-0">1</div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Share your invite link</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Send your link to friends. The code auto-fills when they tap it.</p>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-3">
                <div className="w-6 h-6 rounded-full bg-purple-100 text-[#7c3aed] flex items-center justify-center font-bold text-xs flex-shrink-0">2</div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Friend completes first cashback</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">They do their first POS/bill scan or QR payment and get cashback.</p>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-3">
                <div className="w-6 h-6 rounded-full bg-purple-100 text-[#7c3aed] flex items-center justify-center font-bold text-xs flex-shrink-0">3</div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Instant Admin Wallet Payout</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">₹{stats.rewardAmount} is debited from Zeebac Admin pool and credited to your Rewards Wallet.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3">
          <button 
            onClick={handleShare}
            className="w-full h-13 bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-98 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
            Share Invite Link &amp; Earn ₹{stats.rewardAmount}
          </button>
        </div>
      </main>
    </div>
  );
}
