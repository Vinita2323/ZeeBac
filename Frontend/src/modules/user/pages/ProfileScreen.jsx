import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI, SupportAPI } from '../../../services/api';
import BottomNavBar from '../components/common/BottomNavBar';
import useAuthStore from '../../../store/useAuthStore';
import { shareContent, downloadImage } from '../../../utils/exportUtils';
import useQrCode from '../../../hooks/useQrCode';
import { isBiometricSupported, registerBiometricCredential } from '../../../utils/biometric.util';
import LoanComingSoonModal from '../components/LoanComingSoonModal';
import useLanguageStore from '../../../store/useLanguageStore';
import LanguageSelectorModal from '../../../components/common/LanguageSelectorModal';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const updateProfileStore = useAuthStore((state) => state.updateProfile);
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const { language, t } = useLanguageStore();
  const [subView, setSubView] = useState(null); // null, 'edit-profile', 'linked-accounts', 'support', 'qr-code', 'refer-earn'
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  
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
    accountHolderName: currentUser?.bankDetails?.accountHolderName || currentUser?.name || '',
    upiId: currentUser?.bankDetails?.upiId || '',
    bankName: currentUser?.bankDetails?.bankName || '',
    accNo: currentUser?.bankDetails?.accountNumber || '',
    ifscCode: currentUser?.bankDetails?.ifscCode || '',
    isVerified: !!currentUser?.bankDetails?.isVerified,
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
          accountHolderName: currentUser.bankDetails.accountHolderName || currentUser.name || '',
          upiId: currentUser.bankDetails.upiId || '',
          bankName: currentUser.bankDetails.bankName || '',
          accNo: currentUser.bankDetails.accountNumber || '',
          ifscCode: currentUser.bankDetails.ifscCode || '',
          isVerified: !!currentUser.bankDetails.isVerified,
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
        const updated = {
          accountHolderName: res.data?.accountHolderName || newDetails.accountHolderName,
          bankName: res.data?.bankName || newDetails.bankName,
          accNo: res.data?.accountNumber || newDetails.accNo,
          upiId: res.data?.upiId || newDetails.upiId,
          ifscCode: res.data?.ifscCode || newDetails.ifscCode,
          isVerified: true,
        };
        setPaymentDetails(updated);
        updateProfileStore({
          bankDetails: res.data || updated,
        });
        return { success: true, message: res.message || 'Bank account verified and linked successfully!' };
      }
      return { success: false, message: res.message || 'Verification failed' };
    } catch (error) {
      console.error("Failed to update linked account", error);
      const msg = error.response?.data?.message || error.message || "Failed to update account. Please try again.";
      return { success: false, message: msg };
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
        userPhone={currentUser?.phone || profile.phone}
        userName={currentUser?.name || profile.name}
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
              onClick={() => setSubView('linked-accounts')}
              className="p-md hover:bg-[#7c3aed]/5 cursor-pointer flex items-center justify-between transition-colors border-b border-outline-variant/10"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">account_balance</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">Withdrawal Accounts</p>
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
                  <p className="font-caption text-[11px] text-on-surface-variant">Check balance status, withdrawal & perks</p>
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
            
            {/* Preference: App Language (English & Hindi) */}
            <div 
              onClick={() => setShowLangModal(true)}
              className="flex items-center justify-between py-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[#7c3aed]">translate</span>
                <div>
                  <p className="font-title-md text-on-surface font-bold text-body-sm">App Language</p>
                  <p className="font-caption text-[10px] text-on-surface-variant">Hindi &amp; English</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-primary">
                <span>{language === 'hi' ? 'हिन्दी' : 'English'}</span>
                <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
              </div>
            </div>

            {/* Toggle 1: Notifications */}
            <div className="flex items-center justify-between py-1 border-t border-outline-variant/10 pt-md">
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
              className="flex items-center justify-between p-3.5 mt-2 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-purple-500/10 border border-emerald-500/30 rounded-2xl cursor-pointer hover:bg-emerald-500/15 active:scale-[0.99] transition-all shadow-xs"
            >
              <div className="flex items-center gap-sm">
                <div className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <span className="material-symbols-outlined text-[20px]">support_agent</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-title-md text-on-surface font-extrabold text-body-sm">Help &amp; FAQ Support</p>
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase">24x7</span>
                  </div>
                  <p className="font-caption text-[11px] text-emerald-800 font-semibold">WhatsApp Chat &amp; Customer Care Helpline</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-emerald-700 font-bold text-[12px]">
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </div>
            </div>

          </div>
        </div>

        {/* Logout */}
        <button 
          onClick={() => {
            logout();
            window.location.replace('/login');
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

      {/* Loan Coming Soon Modal */}
      <LoanComingSoonModal
        isOpen={showLoanModal}
        onClose={() => setShowLoanModal(false)}
      />

      {/* Language Selector Modal */}
      <LanguageSelectorModal
        isOpen={showLangModal}
        onClose={() => setShowLangModal(false)}
      />


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

// SUBPAGE 2: LINKED ACCOUNTS COMPONENT WITH REGISTERED MOBILE OTP VERIFICATION
function LinkedAccountsSubView({ initialPayments, userPhone, userName, onSave, onBack }) {
  const [accountHolderName, setAccountHolderName] = useState(initialPayments.accountHolderName || userName || '');
  const [bankName, setBankName] = useState(initialPayments.bankName || '');
  const [accNo, setAccNo] = useState(initialPayments.accNo || '');
  const [ifscCode, setIfscCode] = useState(initialPayments.ifscCode || '');
  const [upiId, setUpiId] = useState(initialPayments.upiId || '');
  const [isVerified, setIsVerified] = useState(!!initialPayments.isVerified);

  // OTP Modal & Verification States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [toastMessage, setToastMessage] = useState('');

  const otpInputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Resend Countdown Timer
  useEffect(() => {
    let interval = null;
    if (showOtpModal && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showOtpModal, resendTimer]);

  const isValid = bankName.trim().length >= 3 && accNo.trim().length >= 4;

  // Step 1: Initiate OTP send to registered mobile
  const handleInitiateOtp = async (e) => {
    if (e) e.preventDefault();
    if (!isValid) return;

    setOtpError('');
    setIsSendingOtp(true);
    try {
      const res = await UserAPI.sendBankOtp();
      if (res.success) {
        setMaskedPhone(res.maskedPhone || userPhone || 'registered mobile number');
        setOtpDigits(['', '', '', '']);
        setResendTimer(30);
        setShowOtpModal(true);
        setTimeout(() => {
          otpInputRefs[0]?.current?.focus();
        }, 150);
      } else {
        alert(res.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('Failed to send bank OTP:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to send OTP';
      alert(msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isSendingOtp) return;
    setOtpError('');
    setIsSendingOtp(true);
    try {
      const res = await UserAPI.sendBankOtp();
      if (res.success) {
        setResendTimer(30);
        setOtpDigits(['', '', '', '']);
        setToastMessage('New OTP sent successfully!');
        setTimeout(() => setToastMessage(''), 3000);
        otpInputRefs[0]?.current?.focus();
      }
    } catch (err) {
      setOtpError(err.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handle single-digit OTP input with auto-advance & paste support
  const handleOtpChange = (index, value) => {
    // Check if pasted multiple digits
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 4).split('');
      const newOtp = ['', '', '', ''];
      digits.forEach((d, i) => {
        newOtp[i] = d;
      });
      setOtpDigits(newOtp);
      const nextIndex = Math.min(digits.length, 3);
      otpInputRefs[nextIndex]?.current?.focus();
      return;
    }

    const clean = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = clean;
    setOtpDigits(newDigits);
    setOtpError('');

    if (clean && index < 3) {
      otpInputRefs[index + 1]?.current?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1]?.current?.focus();
    }
  };

  // Step 2: Confirm OTP & Link Account
  const handleConfirmOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length < 4) {
      setOtpError('Please enter all 4 digits of the OTP');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    try {
      const payload = {
        accountHolderName: accountHolderName.trim() || userName,
        bankName: bankName.trim(),
        accNo: accNo.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        upiId: upiId.trim(),
        otp,
      };

      const result = await onSave(payload);
      if (result?.success) {
        setIsVerified(true);
        setShowOtpModal(false);
        setToastMessage('✅ Bank account verified and linked successfully!');
        setTimeout(() => setToastMessage(''), 4500);
      } else {
        setOtpError(result?.message || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      setOtpError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[90%] bg-emerald-700 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-semibold animate-in fade-in slide-in-from-top-4">
          <span className="material-symbols-outlined text-emerald-200">verified</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
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
          {isVerified && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              <span className="material-symbols-outlined text-xs">verified_user</span>
              Verified
            </span>
          )}
        </div>
      </header>

      <main className="flex-grow app-container px-container-margin py-xl flex flex-col justify-between text-left pb-8">
        <form onSubmit={handleInitiateOtp} className="space-y-4 flex-grow">
          {/* Card Preview */}
          <div className="bg-gradient-to-br from-[#6000da] via-[#7c3aed] to-[#a855f7] text-white p-5 rounded-3xl shadow-xl shadow-primary/20 relative overflow-hidden mb-5">
            <span className="material-symbols-outlined absolute right-4 -bottom-4 text-white/10 text-[110px] pointer-events-none select-none">
              account_balance
            </span>
            <div className="space-y-2 relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/70 tracking-widest uppercase font-semibold">
                  PRIMARY RECEIVING BANK
                </span>
                {isVerified ? (
                  <span className="bg-emerald-400/90 text-emerald-950 font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                    Verified
                  </span>
                ) : (
                  <span className="bg-amber-400 text-amber-950 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    Unverified
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-title-md font-black tracking-tight">{bankName || 'Your Bank Name'}</h3>
                <p className="text-caption text-white/80 font-medium">{accountHolderName || userName || 'Account Holder'}</p>
              </div>

              <div className="pt-2 border-t border-white/15 flex justify-between items-end text-body-sm">
                <div>
                  <span className="text-[9px] text-white/60 uppercase block tracking-wider">Account Number</span>
                  <p className="font-label-mono tracking-widest font-bold">
                    {accNo ? (accNo.length > 4 ? `•••• •••• ${accNo.slice(-4)}` : accNo) : '•••• •••• ••••'}
                  </p>
                </div>
                {ifscCode && (
                  <div className="text-right">
                    <span className="text-[9px] text-white/60 uppercase block tracking-wider">IFSC</span>
                    <p className="font-label-mono text-xs font-semibold">{ifscCode}</p>
                  </div>
                )}
              </div>

              {upiId && (
                <div className="pt-1.5 border-t border-white/10 text-[11px] text-white/90 flex items-center gap-1">
                  <span className="text-white/60">UPI:</span>
                  <span className="font-mono font-medium">{upiId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3.5 bg-white p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
            <h4 className="text-body-sm font-bold text-on-surface flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-primary text-base">lock</span>
              Bank Account Details
            </h4>

            <div>
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-1">
                Account Holder Name
              </label>
              <input 
                type="text"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as registered with bank"
                className="w-full h-[48px] px-3.5 bg-slate-50 border border-outline-variant/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-1">
                Receiving Bank Name *
              </label>
              <input 
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India, HDFC, ICICI"
                className="w-full h-[48px] px-3.5 bg-slate-50 border border-outline-variant/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-1">
                Bank Account Number *
              </label>
              <input 
                type="text"
                value={accNo}
                onChange={(e) => setAccNo(e.target.value.replace(/\s+/g, ''))}
                placeholder="Enter complete bank account number"
                className="w-full h-[48px] px-3.5 bg-slate-50 border border-outline-variant/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm font-mono transition-all"
              />
            </div>

            <div>
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-1">
                Bank IFSC Code
              </label>
              <input 
                type="text"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                placeholder="e.g. SBIN0001234 / HDFC0000123"
                maxLength={11}
                className="w-full h-[48px] px-3.5 bg-slate-50 border border-outline-variant/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm font-mono uppercase transition-all"
              />
            </div>

            <div>
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-1">
                UPI ID / VPA (Optional)
              </label>
              <input 
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                placeholder="e.g. yourname@okhdfcbank"
                className="w-full h-[48px] px-3.5 bg-slate-50 border border-outline-variant/40 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm transition-all"
              />
            </div>
          </div>

          {/* OTP Security Notice */}
          <div className="bg-purple-50/80 border border-purple-100 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-purple-900">
            <span className="material-symbols-outlined text-purple-600 text-lg flex-shrink-0 mt-0.5">security</span>
            <div>
              <p className="font-bold">Registered Mobile Verification Required</p>
              <p className="text-purple-700/90 mt-0.5">
                To protect your cashout withdrawals, linking or modifying your bank account requires a one-time OTP sent to your registered number ({userPhone || 'account number'}).
              </p>
            </div>
          </div>
        </form>

        {/* Submit Button */}
        <div className="mt-6">
          <button 
            type="button"
            onClick={handleInitiateOtp}
            disabled={!isValid || isSendingOtp}
            className={`w-full h-14 rounded-2xl font-title-md flex items-center justify-center gap-2 shadow-lg transition-all duration-200 ${
              isValid && !isSendingOtp
                ? 'btn-primary-gradient text-white active:scale-98 cursor-pointer shadow-primary/30'
                : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
            }`}
          >
            {isSendingOtp ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Sending OTP...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">phonelink_lock</span>
                <span>Verify with Mobile OTP</span>
              </>
            )}
          </button>
        </div>
      </main>

      {/* ─── OTP VERIFICATION MODAL ─── */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 relative text-center animate-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button 
              onClick={() => {
                setShowOtpModal(false);
                setOtpError('');
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-purple-100 text-primary flex items-center justify-center mx-auto mb-3.5 shadow-inner">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>

            <h3 className="font-display font-black text-lg text-on-surface">
              Verify Bank Linking
            </h3>
            <p className="text-caption text-on-surface-variant mt-1 px-2">
              Enter the 4-digit code sent to your registered mobile number:
            </p>
            <p className="font-mono font-bold text-sm text-primary mt-0.5">
              {maskedPhone}
            </p>

            {/* 4 Digit OTP Input */}
            <div className="flex justify-center gap-3 my-5">
              {otpDigits.map((digit, idx) => (
                <input 
                  key={idx}
                  ref={otpInputRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-12 h-14 text-center font-mono font-black text-2xl bg-slate-50 border-2 border-outline-variant/40 rounded-xl focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              ))}
            </div>

            {/* Error Message */}
            {otpError && (
              <div className="text-rose-600 text-xs font-semibold bg-rose-50 border border-rose-100 py-1.5 px-3 rounded-lg mb-3">
                {otpError}
              </div>
            )}

            {/* Resend OTP */}
            <div className="text-xs text-on-surface-variant mb-5">
              {resendTimer > 0 ? (
                <span>Resend OTP in <span className="font-bold font-mono text-primary">{resendTimer}s</span></span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isSendingOtp}
                  className="text-primary font-bold hover:underline cursor-pointer"
                >
                  {isSendingOtp ? 'Sending...' : 'Resend OTP via SMS'}
                </button>
              )}
            </div>

            {/* Confirm Button */}
            <button
              type="button"
              onClick={handleConfirmOtp}
              disabled={otpDigits.join('').length < 4 || isVerifyingOtp}
              className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                otpDigits.join('').length === 4 && !isVerifyingOtp
                  ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer shadow-primary/25'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isVerifyingOtp ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Verifying...</span>
                </>
              ) : (
                'Confirm & Link Account'
              )}
            </button>
          </div>
        </div>
      )}
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
  const [faqs, setFaqs] = useState([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);
  const [faqCategory, setFaqCategory] = useState('All');
  const [faqSearch, setFaqSearch] = useState('');
  const [activeFaq, setActiveFaq] = useState(null);

  const fetchFaqs = useCallback(async (cat = faqCategory, search = faqSearch) => {
    try {
      setIsLoadingFaqs(true);
      const res = await SupportAPI.getFaqs('customer', cat, search);
      if (res.success) {
        setFaqs(res.data || []);
      }
    } catch (error) {
      console.warn("Failed to load FAQs", error);
    } finally {
      setIsLoadingFaqs(false);
    }
  }, [faqCategory, faqSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFaqs(faqCategory, faqSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [faqCategory, faqSearch, fetchFaqs]);

  const categories = ['All', 'Cashback', 'Wallet', 'Security', 'General'];

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

          {/* Direct WhatsApp Support Card */}
          <a
            href="https://wa.me/919111966732?text=Hello%20Zeebac%20Support,%20I%20need%20help%20with%20my%20account."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-[#25D366] text-white rounded-2xl flex items-center justify-between shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 active:scale-[0.98] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner">
                <svg className="w-7 h-7 fill-white" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.971.53 1.761.815 2.796.815 3.183 0 5.769-2.587 5.77-5.767 0-3.181-2.587-5.767-5.77-5.767zm7.391 5.766c-.001 4.075-3.316 7.39-7.391 7.39-1.287 0-2.496-.334-3.555-.92L4.01 19.5l1.093-3.992c-.675-1.127-1.072-2.428-1.072-3.818 0-4.075 3.316-7.39 7.391-7.39 4.075 0 7.39 3.315 7.391 7.39z"/>
                </svg>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-[15px] leading-tight text-white">Chat on WhatsApp</span>
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                </div>
                <p className="text-[12px] text-white/95 font-medium mt-0.5">+91 91119 66732 · Direct Support</p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-transform shrink-0">
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </div>
          </a>

          {/* Search Bar */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
            <input 
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search help topics or keywords..."
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-outline-variant/30 rounded-xl text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary shadow-sm"
            />
            {faqSearch && (
              <button 
                onClick={() => setFaqSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-[18px]"
              >
                close
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFaqCategory(cat)}
                className={`px-3 py-1 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  faqCategory === cat 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'bg-white border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ Accordions */}
          <div className="space-y-sm">
            {isLoadingFaqs ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 bg-white/60 animate-pulse rounded-2xl border border-outline-variant/20" />
                ))}
              </div>
            ) : faqs.length === 0 ? (
              <div className="text-center py-8 bg-white/50 rounded-2xl border border-dashed border-outline-variant/40">
                <span className="material-symbols-outlined text-outline text-[36px]">help_outline</span>
                <p className="text-body-sm font-bold text-on-surface mt-2">No matching questions found</p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">Try a different search term or select another category.</p>
              </div>
            ) : (
              faqs.map((faq, index) => {
                const isOpen = activeFaq === index;
                const questionText = faq.question || faq.q;
                const answerText = faq.answer || faq.a;
                return (
                  <div 
                    key={faq._id || index} 
                    className="bg-white border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm transition-all"
                  >
                    <button
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                      className="w-full p-md flex justify-between items-center text-left font-bold text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex items-center gap-2 pr-2">
                        {faq.category && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100 shrink-0">
                            {faq.category}
                          </span>
                        )}
                        <span>{questionText}</span>
                      </div>
                      <span className="material-symbols-outlined text-outline transition-transform duration-200 shrink-0" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        keyboard_arrow_down
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-md pb-md text-[13px] text-on-surface-variant leading-relaxed animate-reveal border-t border-outline-variant/10 pt-2.5">
                        {answerText}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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

        <div className="pt-8 space-y-3">
          <a 
            href="https://wa.me/919111966732?text=Hello%20Zeebac%20Support,%20I%20need%20help%20with%20my%20account."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 bg-[#25D366] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
          >
            <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.971.53 1.761.815 2.796.815 3.183 0 5.769-2.587 5.77-5.767 0-3.181-2.587-5.767-5.77-5.767zm7.391 5.766c-.001 4.075-3.316 7.39-7.391 7.39-1.287 0-2.496-.334-3.555-.92L4.01 19.5l1.093-3.992c-.675-1.127-1.072-2.428-1.072-3.818 0-4.075 3.316-7.39 7.391-7.39 4.075 0 7.39 3.315 7.391 7.39z"/>
            </svg>
            <span>WhatsApp Support (+91 91119 66732)</span>
          </a>

          <a 
            href="mailto:support@zeebac.com"
            className="w-full h-12 border border-outline-variant/40 bg-white text-secondary hover:bg-surface-container-low rounded-xl font-title-md flex items-center justify-center gap-sm active:scale-95 transition-transform cursor-pointer"
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
