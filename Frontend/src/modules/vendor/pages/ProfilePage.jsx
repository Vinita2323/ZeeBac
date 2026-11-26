import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/useAuthStore';
import useLanguageStore from '../../../store/useLanguageStore';
import { VendorAPI, getMediaUrl } from '../../../services/api';
import { toast } from 'react-hot-toast';
import { safeNavigateBack } from '../../../utils/navigationUtils';
import { isFoodSector, isManufacturerOrWholesaler } from '../../../utils/vendorSectorUtils';
import StoreStoriesModal from '../components/StoreStoriesModal';
import VendorLoanModal from '../components/VendorLoanModal';
import VendorPayLaterModal from '../components/VendorPayLaterModal';
import {
  getBiometricSupportStatus,
  describeBiometricUnsupportedReason,
  registerBiometricCredential,
} from '../../../utils/biometric.util';
import { playNotificationChime, speakVoice } from '../../../utils/voiceUtils';
import useSupportConfig, { toTelHref } from '../../../hooks/useSupportConfig';
import {
  getStoreTimingStatus,
  formatOperatingHours,
  formatTo24Hour,
  ALL_DAYS,
} from '../../../utils/storeTiming';

export default function ProfilePage({ openDocs = false }) {
  const { supportPhone: helplinePhone } = useSupportConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguageStore();

  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const logout = useAuthStore((state) => state.logout);
  const updateProfileStore = useAuthStore((state) => state.updateProfile);

  const searchParams = new URLSearchParams(location.search);
  const shouldOpenDocs = openDocs || searchParams.get('tab') === 'docs' || searchParams.get('tab') === 'documents' || location.pathname.includes('/documents') || location.pathname.includes('/kyc') || location.pathname.includes('/verification');

  // Loading & Data States
  const [isLoading, setIsLoading] = useState(true);
  const [vendorData, setVendorData] = useState(null);
  const [stats, setStats] = useState({ walletBalance: 0, totalRevenue: 0, todaySales: 0 });
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  // Profile Image State
  const [profilePic, setProfilePic] = useState(currentUser.profilePic || null);
  const fileInputRef = useRef(null);

  // Document Upload States
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const docInputRefs = useRef({});

  // Modal Visibility States
  const [showStoriesModal, setShowStoriesModal] = useState(false);
  const [showOpeningHoursModal, setShowOpeningHoursModal] = useState(false);
  const [showBusinessDetailsModal, setShowBusinessDetailsModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(shouldOpenDocs);

  useEffect(() => {
    if (shouldOpenDocs) {
      setShowDocsModal(true);
    }
  }, [shouldOpenDocs]);

  const handleDocumentUpload = async (fieldKey, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadingDoc(fieldKey);
    try {
      const formData = new FormData();
      formData.append(fieldKey, file);

      const res = await VendorAPI.updateProfile(formData);
      if (res.success && res.data) {
        setVendorData((prev) => ({
          ...prev,
          ...res.data,
          documents: {
            ...(prev?.documents || {}),
            ...(res.data.documents || {}),
          },
        }));
        updateProfileStore(res.data);
        toast.success('Document uploaded successfully!');
      } else {
        toast.error(res.message || 'Failed to upload document');
      }
    } catch (err) {
      console.error('Doc upload error:', err);
      toast.error(err.response?.data?.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(null);
    }
  };
  const [showBankModal, setShowBankModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showPayLaterModal, setShowPayLaterModal] = useState(false);

  // Biometrics & PIN States
  const [biometrics, setBiometrics] = useState(currentUser?.security?.biometricEnabled || false);
  const [biometricSupport, setBiometricSupport] = useState({ checked: false, supported: true });
  const [securityToast, setSecurityToast] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Notification sound settings (stored in localStorage)
  const [soundSettings, setSoundSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('zeebac_vendor_sound_settings');
      return saved ? JSON.parse(saved) : { chimesEnabled: true, voiceEnabled: true, claimsEnabled: true };
    } catch {
      return { chimesEnabled: true, voiceEnabled: true, claimsEnabled: true };
    }
  });

  // Business & Timing Form State
  const [businessForm, setBusinessForm] = useState({
    storeName: '',
    category: '',
    phone: '',
    email: '',
    fullAddress: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    description: '',
    gstNumber: '',
    fssaiNumber: '',
  });

  const [timingForm, setTimingForm] = useState(() => {
    const initial = getStoreTimingStatus(currentUser);
    return {
      openingTime: formatTo24Hour(initial.openTimeStr),
      closingTime: formatTo24Hour(initial.closeTimeStr),
      workingDays: Array.isArray(initial.workingDays) && initial.workingDays.length > 0 ? initial.workingDays : [...ALL_DAYS],
    };
  });

  const [bankForm, setBankForm] = useState({
    upiId: '',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
  });

  // Derived Display Values
  const storeName = vendorData?.storeName || currentUser.storeName || 'My Store';
  const category = vendorData?.category || currentUser.category || 'Retail Store';
  const phone = vendorData?.phone || currentUser.phone || '+91 9876543210';
  const email = vendorData?.email || currentUser.email || '';
  const zeebacId = vendorData?.zeebacId || currentUser.zeebacId || 'ZBV-5706';
  const isB2B = isManufacturerOrWholesaler(vendorData?.businessType || currentUser.businessType);
  const isFood = isFoodSector(businessForm.category || vendorData?.category || currentUser.category);

  const locationDisplay = useMemo(() => {
    const city = vendorData?.address?.city || currentUser.address?.city;
    const state = vendorData?.address?.state || currentUser.address?.state;
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    return 'India';
  }, [vendorData, currentUser]);

  // Active store timing calculation using shared rock-solid evaluator
  const activeStoreTiming = useMemo(() => {
    return getStoreTimingStatus({
      businessHours: {
        openingTime: timingForm.openingTime,
        closingTime: timingForm.closingTime,
        workingDays: timingForm.workingDays,
      },
      operatingHours: vendorData?.operatingHours || currentUser?.operatingHours,
    });
  }, [timingForm, vendorData?.operatingHours, currentUser?.operatingHours]);

  const openingHoursText = activeStoreTiming.timingDisplay;
  const isStoreOpenNow = activeStoreTiming.isOpen;

  // Fetch full vendor profile & dashboard stats on mount
  useEffect(() => {
    let isMounted = true;
    const loadProfileData = async () => {
      setIsLoading(true);
      try {
        const [profileRes, statsRes, subRes] = await Promise.allSettled([
          VendorAPI.getProfile(),
          VendorAPI.getDashboardStats(),
          VendorAPI.getSubscriptionStatus(),
        ]);

        if (isMounted && profileRes.status === 'fulfilled' && profileRes.value?.success) {
          const v = profileRes.value.data;
          setVendorData(v);
          if (v.profilePic) setProfilePic(v.profilePic);

          setBusinessForm({
            storeName: v.storeName || '',
            category: v.category || '',
            phone: v.phone || '',
            email: v.email || '',
            fullAddress: v.address?.fullAddress || '',
            landmark: v.address?.landmark || '',
            city: v.address?.city || '',
            state: v.address?.state || '',
            pincode: v.address?.pincode || '',
            description: v.description || '',
            gstNumber: v.gstNumber || '',
            fssaiNumber: v.fssaiNumber || '',
          });

          const parsedTiming = getStoreTimingStatus(v);
          setTimingForm({
            openingTime: formatTo24Hour(parsedTiming.openTimeStr),
            closingTime: formatTo24Hour(parsedTiming.closeTimeStr),
            workingDays: Array.isArray(parsedTiming.workingDays) && parsedTiming.workingDays.length > 0
              ? parsedTiming.workingDays
              : [...ALL_DAYS],
          });

          if (v.bankDetails) {
            setBankForm({
              upiId: v.bankDetails.upiId || '',
              accountHolderName: v.bankDetails.accountHolderName || '',
              bankName: v.bankDetails.bankName || '',
              accountNumber: v.bankDetails.accountNumber || '',
              ifscCode: v.bankDetails.ifscCode || '',
            });
          }
        }

        if (isMounted && statsRes.status === 'fulfilled' && statsRes.value?.success) {
          setStats(statsRes.value.data || {});
        }

        if (isMounted && subRes.status === 'fulfilled' && subRes.value?.success) {
          setSubscriptionInfo(subRes.value.data || null);
        }
      } catch (err) {
        console.error('Failed to load vendor profile', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadProfileData();

    // Check biometric device capabilities
    getBiometricSupportStatus().then((status) => {
      if (isMounted) setBiometricSupport({ checked: true, ...status });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Profile Avatar Upload
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result;
      setProfilePic(base64String);
      updateProfileStore({ profilePic: base64String });

      try {
        await VendorAPI.updateProfile({ profilePic: base64String });
        toast.success('Store photo updated successfully!');
      } catch (err) {
        console.error('Failed to update store photo', err);
        toast.error('Failed to save photo');
      }
    };
    reader.readAsDataURL(file);
  };

  // Copy Store Zeebac ID to clipboard
  const handleCopyId = () => {
    navigator.clipboard.writeText(zeebacId);
    toast.success(`Store ID ${zeebacId} copied!`);
  };

  // Save Business Details
  const handleSaveBusinessDetails = async (e) => {
    e.preventDefault();
    try {
      const res = await VendorAPI.updateProfile({
        storeName: businessForm.storeName,
        email: businessForm.email,
        description: businessForm.description,
        address: {
          fullAddress: businessForm.fullAddress,
          landmark: businessForm.landmark,
          city: businessForm.city,
          state: businessForm.state,
          pincode: businessForm.pincode,
        },
      });

      if (res.success) {
        toast.success('Business details saved!');
        setVendorData((prev) => ({ ...prev, ...res.data }));
        setShowBusinessDetailsModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save business details');
    }
  };

  // Save Shop Opening Hours
  const handleSaveOpeningHours = async (e) => {
    e.preventDefault();
    try {
      const operatingHours = formatOperatingHours(timingForm.openingTime, timingForm.closingTime, timingForm.workingDays);
      const businessHours = {
        openingTime: timingForm.openingTime,
        closingTime: timingForm.closingTime,
        workingDays: timingForm.workingDays,
      };

      const res = await VendorAPI.updateProfile({
        operatingHours,
        businessHours,
      });

      if (res.success) {
        toast.success('Shop opening hours updated!');
        const updatedVendor = {
          operatingHours,
          businessHours,
        };
        setVendorData((prev) => ({
          ...prev,
          ...updatedVendor,
        }));
        // Update persistent session in useAuthStore so vendor changes immediately react across the app
        updateProfileStore(updatedVendor);
        setShowOpeningHoursModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update store hours');
    }
  };

  // Save Bank Details
  const handleSaveBankDetails = async (e) => {
    e.preventDefault();
    try {
      const res = await VendorAPI.updateProfile({
        bankDetails: bankForm,
      });

      if (res.success) {
        toast.success('Settlement bank details updated!');
        setVendorData((prev) => ({ ...prev, bankDetails: bankForm }));
        setShowBankModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update bank details');
    }
  };

  // Toggle Day in Opening Hours
  const handleToggleDay = (day) => {
    setTimingForm((prev) => {
      const exists = prev.workingDays.includes(day);
      const updated = exists ? prev.workingDays.filter((d) => d !== day) : [...prev.workingDays, day];
      return { ...prev, workingDays: updated.length ? updated : [day] };
    });
  };

  // Toggle Sound Settings
  const handleToggleSound = (key) => {
    setSoundSettings((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem('zeebac_vendor_sound_settings', JSON.stringify(updated));
      return updated;
    });
  };

  // Test Notification Sounds
  const handleTestSound = () => {
    playNotificationChime('incoming');
    speakVoice('Zeebac order notification test sound');
    toast.success('Playing test order alert!');
  };

  // Biometric Enrollment
  const handleToggleBiometrics = async (e) => {
    const shouldEnable = e.target.checked;
    setSecurityToast('');

    if (shouldEnable) {
      try {
        const status = await getBiometricSupportStatus();
        if (!status.supported) {
          setBiometrics(false);
          toast.error(`⚠️ ${describeBiometricUnsupportedReason(status.reason, status.detail)}`);
          return;
        }

        const bioRes = await registerBiometricCredential(currentUser);
        if (bioRes.success) {
          await VendorAPI.toggleBiometricSecurity(true, bioRes.credentialId);
          updateProfileStore({
            security: {
              ...useAuthStore.getState().currentUser?.security,
              biometricEnabled: true,
              biometricCredentialId: bioRes.credentialId,
            },
          });
          setBiometrics(true);
          toast.success('Fingerprint / Biometric lock enabled!');
        } else {
          toast.error(bioRes.error || 'Biometric setup cancelled');
          setBiometrics(false);
        }
      } catch (err) {
        toast.error('Failed to setup biometrics');
        setBiometrics(false);
      }
    } else {
      try {
        const res = await VendorAPI.toggleBiometricSecurity(false);
        if (res.success) {
          updateProfileStore({
            security: { ...useAuthStore.getState().currentUser?.security, biometricEnabled: false },
          });
          setBiometrics(false);
          toast.success('Biometric lock disabled');
        }
      } catch (err) {
        toast.error('Failed to disable biometrics');
      }
    }
  };

  // Save 4-Digit Security PIN
  const handleSavePin = async (e) => {
    e.preventDefault();
    if (pinInput.length !== 4) {
      toast.error('PIN must be 4 digits');
      return;
    }
    setIsSavingPin(true);
    try {
      const res = await VendorAPI.setupSecurityPin(pinInput);
      if (res.success) {
        updateProfileStore({
          security: { ...useAuthStore.getState().currentUser?.security, hasPin: true },
        });
        toast.success('4-Digit Security PIN set successfully!');
        setPinInput('');
        setShowSecurityModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to set PIN');
    } finally {
      setIsSavingPin(false);
    }
  };

  // Confirm and Execute Logout
  const handleConfirmLogout = () => {
    logout('vendor');
    localStorage.removeItem('zeebac_vendor_user');
    localStorage.removeItem('zeebac_vendor_token');
    localStorage.removeItem('zeebac_vendor_refresh_token');
    localStorage.removeItem('vendor_balance');
    localStorage.removeItem('vendor_transactions');
    try {
      const cur = localStorage.getItem('zeebac_current_user');
      if (cur && (cur.includes('"vendor"') || cur.includes('storeName') || cur.includes('ownerName'))) {
        localStorage.removeItem('zeebac_current_user');
        localStorage.removeItem('zeebac_access_token');
        localStorage.removeItem('zeebac_refresh_token');
      }
    } catch {}
    window.location.replace('/vendor-app/login');
  };

  return (
    <div className="animate-reveal text-left max-w-xl mx-auto pb-12">
      {/* Hidden File Input for Avatar Photo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP PURPLE HERO HEADER (Matching Reference Screen 5) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-purple-800 via-purple-900 to-indigo-950 text-white rounded-b-3xl px-4 pt-3 pb-8 -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 md:mx-0 md:mt-0 shadow-md text-center relative">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between max-w-md mx-auto mb-3">
          <button
            type="button"
            onClick={() => safeNavigateBack(navigate, '/vendor')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 cursor-pointer transition-colors"
            title="Back to Dashboard"
          >
            <span className="material-symbols-outlined text-[19px]">arrow_back</span>
          </button>
          <h1 className="font-display font-black text-[17px] sm:text-[18px] text-white tracking-tight">
            {t('Profile')}
          </h1>
          <button
            type="button"
            onClick={() => setShowBusinessDetailsModal(true)}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 cursor-pointer transition-colors"
            title="Store Settings"
          >
            <span className="material-symbols-outlined text-[19px]">settings</span>
          </button>
        </div>

        {/* Store Avatar & Edit Badge */}
        <div className="relative inline-block mx-auto">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-white/15 p-1 ring-4 ring-white/30 shadow-lg flex items-center justify-center relative overflow-hidden cursor-pointer active:scale-95 transition-transform"
          >
            {profilePic ? (
              <img
                src={getMediaUrl(profilePic)}
                alt={storeName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-purple-100 flex items-center justify-center text-purple-800">
                <span className="material-symbols-outlined text-[36px]">storefront</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-md border-2 border-purple-900 active:scale-90 transition-transform cursor-pointer"
            title="Change Store Photo"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
          </button>
        </div>

        {/* Store ID Pill Badge (e.g. ZBV-5706) */}
        <div className="mt-1.5">
          <button
            type="button"
            onClick={handleCopyId}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-purple-200 text-[11px] font-mono font-bold tracking-wider cursor-pointer active:scale-95 transition-transform"
            title="Click to copy Store ID"
          >
            <span>{zeebacId}</span>
            <span className="material-symbols-outlined text-[11px]">content_copy</span>
          </button>
        </div>

        {/* Store Name & Location */}
        <div className="mt-1 space-y-0.5">
          <h2 className="font-display font-black text-[18px] sm:text-[20px] text-white leading-tight">
            {storeName}
          </h2>
          <p className="text-[12px] text-purple-200 font-medium flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-purple-300">location_on</span>
            <span>{locationDisplay}</span>
          </p>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. FLOATING WALLET BALANCE CARD (Matching Reference Screen 5) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-4 space-y-3">
        <div className="-mt-6 max-w-md mx-auto bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-100 shadow-md hover:shadow-lg transition-all flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-100/80">
              <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
            </div>
            <div>
              <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                {t('Wallet Balance')}
              </p>
              <p className="font-display font-black text-[22px] text-slate-900 leading-tight">
                ₹{Number(stats.walletBalance ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/vendor/wallet')}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-purple-800 text-white font-bold text-[12.5px] shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            {t('Claim')} &gt;
          </button>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. COMPACT MENU LIST (Clean, modern single-line rows) */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100 overflow-hidden text-left">
          {/* 1. My Business Details */}
          <button
            type="button"
            onClick={() => setShowBusinessDetailsModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">storefront</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {isB2B ? t('My Company Details') : t('My Business Details')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 2. Shop Opening Time */}
          <button
            type="button"
            onClick={() => setShowOpeningHoursModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">schedule</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                  {t('Shop Opening Time')}
                </span>
                <span className="text-[11px] text-slate-400 font-medium truncate">
                  {activeStoreTiming.timingDisplay} • {activeStoreTiming.workingDaysText}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeStoreTiming.isOpen ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {activeStoreTiming.badgeText}
              </span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
                chevron_right
              </span>
            </div>
          </button>

          {/* KYC & Verification Documents */}
          <button
            type="button"
            onClick={() => setShowDocsModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                  {isB2B ? t('Business & Verification Documents') : t('KYC & Verification Documents')}
                </span>
                <span className="text-[11px] text-slate-400 font-medium truncate">
                  {vendorData?.status === 'Verified' ? 'Store Verified • All Documents Active' : 'Store Verification & KYC'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                vendorData?.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {vendorData?.status === 'Verified' ? 'Verified' : 'Under Review'}
              </span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
                chevron_right
              </span>
            </div>
          </button>

          {/* 3. Shop Stories & Deals */}
          <button
            type="button"
            onClick={() => setShowStoriesModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">auto_stories</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Shop Stories & 24h Deals')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 4. Subscription Plan */}
          <button
            type="button"
            onClick={() => navigate('/vendor/subscription')}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Subscription Plan')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                {subscriptionInfo?.effectiveStatus === 'EXPIRED' ? 'Expired' : 'Active'}
              </span>
              <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
                chevron_right
              </span>
            </div>
          </button>

          {/* 5. Bank Account & Payouts */}
          <button
            type="button"
            onClick={() => setShowBankModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">account_balance</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Bank Account & Payouts')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 6. Notification Settings */}
          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">notifications</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Notification Settings')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 7. Security & Biometrics */}
          <button
            type="button"
            onClick={() => setShowSecurityModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">security</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Security & Biometrics')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 8. Help & Support */}
          <button
            type="button"
            onClick={() => setShowSupportModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">help</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Help & Support')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 9. Terms & Conditions */}
          <button
            type="button"
            onClick={() => navigate('/terms')}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">description</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('Terms & Conditions')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 10. About Zeebac */}
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            className="w-full px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer group active:bg-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">info</span>
              </div>
              <span className="text-[13px] font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                {t('About Zeebac')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>

          {/* 11. Logout */}
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full px-3.5 py-3 hover:bg-rose-50/80 flex items-center justify-between transition-colors cursor-pointer group active:bg-rose-100/60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </div>
              <span className="text-[13px] font-bold text-rose-600 truncate">
                {t('Logout')}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-rose-400 group-hover:translate-x-0.5 transition-transform">
              chevron_right
            </span>
          </button>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 4. BOTTOM 24/7 HELPLINE (Matching Reference Screen 5) */}
        {/* ───────────────────────────────────────────────────────────── */}
        <a
          href={toTelHref(helplinePhone)}
          className="max-w-md mx-auto bg-purple-50 hover:bg-purple-100/80 border border-purple-200/80 rounded-2xl p-3 flex items-center justify-between transition-colors cursor-pointer shadow-2xs group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[19px]">headset_mic</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 leading-none">Need Help?</p>
              <p className="font-display font-black text-[13.5px] text-purple-900 mt-0.5 leading-tight">
                Call {helplinePhone}
              </p>
            </div>
          </div>
          <span className="text-[10.5px] font-bold text-purple-700 bg-white px-2.5 py-1 rounded-lg border border-purple-200 shadow-2xs">
            24/7 Helpline
          </span>
        </a>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: MY BUSINESS DETAILS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showBusinessDetailsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">storefront</span>
                <h3 className="font-display font-black text-[16px] text-slate-900">
                  Business Details
                </h3>
              </div>
              <button
                onClick={() => setShowBusinessDetailsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveBusinessDetails} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">{isB2B ? 'Company / Enterprise Name *' : 'Store / Business Name *'}</label>
                <input
                  type="text"
                  required
                  value={businessForm.storeName}
                  onChange={(e) => setBusinessForm({ ...businessForm, storeName: e.target.value })}
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Category</label>
                  <input
                    type="text"
                    value={businessForm.category}
                    onChange={(e) => setBusinessForm({ ...businessForm, category: e.target.value })}
                    className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Mobile Number</label>
                  <input
                    type="text"
                    disabled
                    value={phone}
                    className="w-full h-11 px-3.5 bg-slate-100 border border-slate-200 rounded-xl text-[13px] text-slate-500 cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Contact Email</label>
                <input
                  type="email"
                  value={businessForm.email}
                  onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })}
                  placeholder="store@example.com"
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Shop Address</label>
                <textarea
                  rows={2}
                  value={businessForm.fullAddress}
                  onChange={(e) => setBusinessForm({ ...businessForm, fullAddress: e.target.value })}
                  placeholder="Street / Shop Number / Area"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={businessForm.city}
                    onChange={(e) => setBusinessForm({ ...businessForm, city: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">State</label>
                  <input
                    type="text"
                    value={businessForm.state}
                    onChange={(e) => setBusinessForm({ ...businessForm, state: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Pincode</label>
                  <input
                    type="text"
                    value={businessForm.pincode}
                    onChange={(e) => setBusinessForm({ ...businessForm, pincode: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBusinessDetailsModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12px] shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: SHOP OPENING HOURS (User request: shop opening time) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showOpeningHoursModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[22px]">schedule</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Shop Opening Hours
                </h3>
              </div>
              <button
                onClick={() => setShowOpeningHoursModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-[11.5px] text-slate-500 leading-snug">
              Set the exact times when your store is open to receive customer orders & counter visits.
            </p>

            <form onSubmit={handleSaveOpeningHours} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Opening Time</label>
                  <input
                    type="time"
                    required
                    value={timingForm.openingTime}
                    onChange={(e) => setTimingForm({ ...timingForm, openingTime: e.target.value })}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Closing Time</label>
                  <input
                    type="time"
                    required
                    value={timingForm.closingTime}
                    onChange={(e) => setTimingForm({ ...timingForm, closingTime: e.target.value })}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Open Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                    const isSelected = timingForm.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleDay(day)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 font-medium flex items-center justify-between">
                <span>Preview:</span>
                <span className="font-bold">{formatOperatingHours(timingForm.openingTime, timingForm.closingTime, timingForm.workingDays)}</span>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpeningHoursModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[12px] shadow-sm cursor-pointer"
                >
                  Save Hours
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: BANK DETAILS & PAYOUTS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-[22px]">account_balance</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Bank Settlement Details
                </h3>
              </div>
              <button
                onClick={() => setShowBankModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveBankDetails} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Merchant UPI ID (Instant Payouts)</label>
                <input
                  type="text"
                  value={bankForm.upiId}
                  onChange={(e) => setBankForm({ ...bankForm, upiId: e.target.value })}
                  placeholder="e.g. yourstore@upi"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={bankForm.accountHolderName}
                  onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })}
                  placeholder="Name as per Bank Passbook"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Bank Name</label>
                <input
                  type="text"
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  placeholder="e.g. HDFC Bank, SBI, ICICI"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] outline-none focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Account Number</label>
                  <input
                    type="password"
                    value={bankForm.accountNumber}
                    onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                    placeholder="Acc Number"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={bankForm.ifscCode}
                    onChange={(e) => setBankForm({ ...bankForm, ifscCode: e.target.value.toUpperCase() })}
                    placeholder="HDFC0001234"
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] outline-none focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] shadow-sm cursor-pointer"
                >
                  Save Bank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 4: NOTIFICATION SETTINGS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[22px]">notifications_active</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Notification Settings
                </h3>
              </div>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">Loud Incoming Order Ring</p>
                  <p className="text-[10.5px] text-slate-500">Play ringing chime when new order arrives</p>
                </div>
                <input
                  type="checkbox"
                  checked={soundSettings.chimesEnabled}
                  onChange={() => handleToggleSound('chimesEnabled')}
                  className="w-4.5 h-4.5 accent-primary cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">Voice Speech Announcements</p>
                  <p className="text-[10.5px] text-slate-500">Speak order amounts and customer names</p>
                </div>
                <input
                  type="checkbox"
                  checked={soundSettings.voiceEnabled}
                  onChange={() => handleToggleSound('voiceEnabled')}
                  className="w-4.5 h-4.5 accent-primary cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">Cashback Claim Sound</p>
                  <p className="text-[10.5px] text-slate-500">Alert on instant in-store customer claim</p>
                </div>
                <input
                  type="checkbox"
                  checked={soundSettings.claimsEnabled}
                  onChange={() => handleToggleSound('claimsEnabled')}
                  className="w-4.5 h-4.5 accent-primary cursor-pointer"
                />
              </label>

              <button
                type="button"
                onClick={handleTestSound}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-[12px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[17px]">volume_up</span>
                <span>Test Alert Sound & Voice</span>
              </button>
            </div>

            <button
              onClick={() => setShowNotificationsModal(false)}
              className="w-full py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12.5px] cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 5: SECURITY & BIOMETRICS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-violet-600 text-[22px]">fingerprint</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Security & App Lock
                </h3>
              </div>
              <button
                onClick={() => setShowSecurityModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <label className="flex items-center justify-between p-3.5 rounded-2xl bg-violet-50/70 border border-violet-200/80 cursor-pointer">
              <div className="pr-2">
                <p className="text-[12.5px] font-bold text-slate-900">Biometric / Fingerprint</p>
                <p className="text-[10.5px] text-slate-500">Fast authentication for payouts & refunds</p>
              </div>
              <input
                type="checkbox"
                checked={biometrics}
                onChange={handleToggleBiometrics}
                className="w-5 h-5 accent-primary cursor-pointer"
              />
            </label>

            <form onSubmit={handleSavePin} className="space-y-3 pt-1 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Set 4-Digit Security PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full h-11 px-3 text-center tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-xl text-[18px] font-mono outline-none focus:bg-white focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={pinInput.length !== 4 || isSavingPin}
                className="w-full py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12px] shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSavingPin ? 'Saving PIN...' : 'Save 4-Digit PIN'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 6: SUPPORT OPTIONS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3.5 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-600 text-[22px]">support_agent</span>
                <h3 className="font-display font-black text-[15px] text-slate-900">
                  Zeebac Partner Support
                </h3>
              </div>
              <button
                onClick={() => setShowSupportModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-2">
              <a
                href={toTelHref(helplinePhone)}
                className="p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">call</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Partner Helpline</p>
                  <p className="text-[11px] text-primary font-bold">{helplinePhone}</p>
                </div>
              </a>

              <a
                href="https://wa.me/919111966732?text=Hello%20Zeebac%20Support"
                target="_blank"
                rel="noreferrer"
                className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">chat</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900">WhatsApp Support</p>
                  <p className="text-[11px] text-emerald-700 font-bold">+91 9111966732</p>
                </div>
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowSupportModal(false);
                  navigate('/vendor/support');
                }}
                className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center gap-3 transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">confirmation_number</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Support Ticket & Disputes</p>
                  <p className="text-[11px] text-slate-500">Track open queries and payouts</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 7: ABOUT ZEEBAC */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-3.5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-purple-700 to-indigo-800 text-white flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-[28px]">store</span>
            </div>

            <div>
              <h3 className="font-display font-black text-[18px] text-slate-900">
                Zeebac Partner
              </h3>
              <p className="text-[11px] text-slate-400 font-bold tracking-wider uppercase mt-0.5">
                Version 2.4.0 • Build 2026
              </p>
            </div>

            <p className="text-[12px] text-slate-600 leading-relaxed">
              India's smart retail and customer cashback ecosystem. Empowering local stores, grocers, and brands with digital orders, radius riders, and guaranteed customer loyalty.
            </p>

            <div className="pt-2">
              <button
                onClick={() => setShowAboutModal(false)}
                className="w-full py-2.5 rounded-xl btn-primary-gradient text-white font-bold text-[12.5px] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 8: LOGOUT CONFIRMATION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-xs w-full p-5 shadow-2xl space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[24px]">logout</span>
            </div>

            <h3 className="font-display font-black text-[16px] text-slate-900">
              Sign Out of Store?
            </h3>
            <p className="text-[12px] text-slate-500 leading-snug">
              Are you sure you want to log out? You can sign back in anytime with your mobile number.
            </p>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-[12px] hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] shadow-sm cursor-pointer"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* COMPANION MODALS (Stories, Language, Loans, BNPL) */}
      {/* ───────────────────────────────────────────────────────────── */}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: VERIFICATION & KYC DOCUMENTS (INTERACTIVE MANAGER) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-reveal">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 text-left">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-[15.5px] text-slate-900 leading-tight">
                    {isB2B ? 'Business & Verification Documents' : 'KYC & Verification Documents'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Store ID: <span className="font-mono font-bold text-purple-700">{zeebacId}</span> • Status: <span className="font-bold text-emerald-700">{vendorData?.status === 'Verified' ? 'Store Verified' : 'Under Review'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDocsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Explanatory Banner */}
            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-start gap-2.5 text-[11px] text-purple-900">
              <span className="material-symbols-outlined text-purple-700 text-[18px] shrink-0 mt-0.5">info</span>
              <div>
                <p className="font-bold text-slate-900">Store KYC & Document Management</p>
                <p className="text-slate-600 mt-0.5 leading-relaxed">
                  View uploaded certificates, check real-time verification status, or upload updated and replacement files directly without leaving your store account.
                </p>
              </div>
            </div>

            {/* Document Cards List */}
            <div className="space-y-3">
              {[
                {
                  key: 'aadhaarPan',
                  label: 'Owner KYC (Aadhaar / PAN Card)',
                  desc: 'Government photo identification proof of store proprietor or director',
                  required: true,
                },
                {
                  key: 'shopLicense',
                  label: 'Shop License / Registration Certificate',
                  desc: 'Trade license, Gumasta, Municipal certificate, or incorporation deed',
                  required: true,
                },
                {
                  key: 'gstCertificate',
                  label: 'GST Registration Certificate',
                  desc: 'Goods & Services Tax registration with 15-digit GSTIN (Mandatory for B2B/GST filing)',
                  required: isB2B,
                },
                {
                  key: 'cancelledCheque',
                  label: 'Settlement Bank Account Proof',
                  desc: 'Cancelled cheque leaf, bank passbook front page, or account statement',
                  required: true,
                },
                ...(isFood ? [{
                  key: 'fssaiCertificate',
                  label: 'FSSAI Food Safety License',
                  desc: 'FSSAI certificate for food, beverage, grocery, and restaurant businesses',
                  required: true,
                }] : []),
                ...(isB2B ? [{
                  key: 'udyamCertificate',
                  label: 'Udyam / MSME Certificate',
                  desc: 'Government of India MSME / Udyam registration number and certificate',
                  required: true,
                }, {
                  key: 'trademarkCertificate',
                  label: 'Brand Trademark / Authorization',
                  desc: 'Trademark certificate or brand distribution authorization letter',
                  required: false,
                }] : []),
                {
                  key: 'additionalDoc',
                  label: 'Additional Store Document (Optional)',
                  desc: 'Store electricity bill, rent agreement, or other supporting document',
                  required: false,
                },
              ].map(({ key, label, desc, required }) => {
                const doc = vendorData?.documents?.[key];
                const fileUrl = doc?.fileUrl;
                const fileName = doc?.fileName;
                const isUploaded = !!fileUrl;
                const isVerified = (doc?.status === 'Verified') || (vendorData?.status === 'Verified' && doc?.status !== 'Rejected' && isUploaded);
                const isRejected = doc?.status === 'Rejected';
                const isUnderReview = isUploaded && !isVerified && !isRejected;
                const isUploadingThis = uploadingDoc === key;

                return (
                  <div
                    key={key}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-200 transition-all space-y-2.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[13px] font-bold text-slate-900 leading-snug">{label}</p>
                          {required && (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{desc}</p>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            <span>Verified</span>
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="material-symbols-outlined text-[13px]">cancel</span>
                            <span>Rejected</span>
                          </span>
                        ) : isUnderReview ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="material-symbols-outlined text-[13px]">schedule</span>
                            <span>Under Review</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="material-symbols-outlined text-[13px]">radio_button_unchecked</span>
                            <span>Not Uploaded</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* File info if uploaded */}
                    {isUploaded && (
                      <div className="text-[11px] text-slate-700 flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-100 font-medium">
                        <span className="material-symbols-outlined text-[16px] text-purple-600 shrink-0">description</span>
                        <span className="truncate flex-1 font-mono text-[11px]">{fileName || 'Document File'}</span>
                        {doc?.uploadedAt && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    {isRejected && doc?.rejectionReason && (
                      <p className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-xl border border-rose-200">
                        <span className="font-bold">Rejection note:</span> {doc.rejectionReason}
                      </p>
                    )}

                    {/* Action Buttons: View, Upload / Replace */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
                      {/* Hidden file input */}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        ref={(el) => { if (docInputRefs.current) docInputRefs.current[key] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDocumentUpload(key, file);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />

                      {isUploaded && (
                        <a
                          href={getMediaUrl(fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          <span>View</span>
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={isUploadingThis}
                        onClick={() => docInputRefs.current?.[key]?.click()}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 ${
                          isUploaded
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                            : 'bg-primary hover:bg-purple-800 text-white'
                        }`}
                      >
                        {isUploadingThis ? (
                          <>
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[14px]">
                              {isUploaded ? 'sync' : 'upload_file'}
                            </span>
                            <span>{isUploaded ? 'Replace Document' : 'Upload Document'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDocsModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <StoreStoriesModal
        isOpen={showStoriesModal}
        onClose={() => setShowStoriesModal(false)}
        onStoryUpdated={() => {
          toast.success('Story updated!');
        }}
      />

      <VendorLoanModal
        isOpen={showLoanModal}
        onClose={() => setShowLoanModal(false)}
      />

      <VendorPayLaterModal
        isOpen={showPayLaterModal}
        onClose={() => setShowPayLaterModal(false)}
      />
    </div>
  );
}
