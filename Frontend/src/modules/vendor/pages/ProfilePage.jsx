import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import useAuthStore from '../../../store/useAuthStore';
import { VendorAPI, API_BASE_URL } from '../../../services/api';
import { downloadImage, shareContent } from '../../../utils/exportUtils';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const logout = useAuthStore((state) => state.logout);
  const updateProfileStore = useAuthStore((state) => state.updateProfile);

  const [vendorData, setVendorData] = useState(null);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    totalCashbackGiven: 0
  });
  
  const storeName = vendorData?.storeName || currentUser.storeName || 'Vini Business';
  const category = vendorData?.category || currentUser.category || 'Fashion & Apparel';
  const phone = vendorData?.phone || currentUser.phone || '+91 9111966732';
  const email = vendorData?.ownerName || currentUser.email || 'Vendor'; // Just mock fallback for email since we don't save email in vendor schema
  const zeebacId = vendorData?.zeebacId || currentUser.zeebacId || 'ZBV-XXXX';
  
  const rawAddress = vendorData?.address || currentUser.address;
  const address = typeof rawAddress === 'object' 
    ? (rawAddress?.city || rawAddress?.fullAddress || 'Indore, India')
    : (rawAddress || 'Indore, India');
  const firstLetter = storeName.charAt(0).toUpperCase();

  const [profilePic, setProfilePic] = useState(currentUser.profilePic || null);
  const fileInputRef = useRef(null);
  const chequeInputRef = useRef(null);

  const [previewDoc, setPreviewDoc] = useState(null); // 'gst', 'pan', 'cheque', or null
  const [chequeUploaded, setChequeUploaded] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  const handleShareStore = () => {
    const link = `https://zeebac.com/store/${storeName.toLowerCase().replace(/\s+/g, '-')}`;
    navigator.clipboard.writeText(link).then(() => {
      setToastMessage('Store link copied to clipboard!');
      setTimeout(() => setToastMessage(null), 2500);
    }).catch(() => {
      alert(`Store Link: ${link}`);
    });
  };

  const handleChequeUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setChequeUploaded(true);
      alert('Bank Cheque uploaded successfully!');
    }
  };

  const [formData, setFormData] = useState({
    storeName,
    category,
    phone,
    email,
    address,
    description: '',
    operatingHours: '',
    upiId: ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await VendorAPI.getProfile();
        setVendorData(res.data);
        setFormData({
          storeName: res.data.storeName || storeName,
          category: res.data.category || category,
          phone: res.data.phone || phone,
          email: res.data.ownerName || email,
          address: typeof res.data.address === 'object' ? (res.data.address?.city || res.data.address?.fullAddress) : (res.data.address || address),
          description: res.data.description || '',
          operatingHours: res.data.operatingHours || 'Open Daily: 09:00 AM - 10:00 PM',
          upiId: res.data.bankDetails?.upiId || ''
        });

        try {
          const statsRes = await VendorAPI.getDashboardStats();
          if (statsRes.success && statsRes.data) {
            setStats(statsRes.data);
          }
        } catch (e) {
          console.error('Failed to fetch dashboard stats', e);
        }
      } catch (error) {
        console.error('Failed to fetch profile', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        setProfilePic(base64String);
        updateProfileStore({ profilePic: base64String });
        
        // Save to backend
        try {
          await VendorAPI.updateProfile({ profilePic: base64String });
          setToastMessage('Profile photo updated!');
          setTimeout(() => setToastMessage(null), 2500);
        } catch (error) {
          console.error("Failed to update profile photo on backend", error);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditSave = async () => {
    if (isEditing) {
      try {
        await VendorAPI.updateProfile({
          address: { fullAddress: formData.address },
          description: formData.description,
          operatingHours: formData.operatingHours,
          bankDetails: {
            upiId: formData.upiId
          }
        });
        setToastMessage('Profile updated successfully!');
        setTimeout(() => setToastMessage(null), 2500);
      } catch (error) {
        console.error('Failed to update profile', error);
      }
    }
    setIsEditing(!isEditing);
  };

  return (
    <div className="animate-reveal text-left" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      
      {/* Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-0">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Profile</span>
        </div>
        <button 
          onClick={handleEditSave}
          className="flex items-center gap-1.5 px-4 py-1.5 border border-primary text-primary rounded-full font-bold text-[13px] hover:bg-primary/5 transition-all active:scale-[0.97] cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">{isEditing ? 'save' : 'edit'}</span>
          {isEditing ? 'Save Profile' : 'Edit Profile'}
        </button>
      </header>

      <div className="space-y-5 pt-0 pb-6">

        {/* Profile Card Banner */}
        <div className="relative overflow-hidden -mx-container-margin px-container-margin py-6 text-white shadow-md bg-gradient-to-br from-[#2a007a] via-[#3700a1] to-[#5113d7] flex flex-col justify-between rounded-b-3xl">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/20 rounded-full blur-xl -mb-10 -ml-10 pointer-events-none" />
          
           <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handleImageUpload}
          />

          <div className="flex items-center gap-4 relative z-10">
            {/* White Square rounded Avatar with bottom-right camera badge (visible only in edit mode) */}
            <div className="relative flex-shrink-0">
              <div 
                onClick={() => isEditing && fileInputRef.current?.click()}
                className={`w-20 h-20 bg-white rounded-[20px] shadow-md flex items-center justify-center text-primary text-3xl font-black relative overflow-hidden ${isEditing ? 'cursor-pointer' : ''}`}
              >
                {profilePic ? (
                  <img src={profilePic.startsWith('http') || profilePic.startsWith('data:') ? profilePic : `${API_BASE_URL}${profilePic}`} alt="Store" className="w-full h-full object-cover" />
                ) : (
                  <span>{firstLetter}</span>
                )}
              </div>
              {isEditing && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 translate-x-1 translate-y-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center border-2 border-white shadow-md active:scale-95 transition-transform cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                </button>
              )}
            </div>
            
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[18px] font-black tracking-tight truncate">{storeName}</h2>
                <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0" title="Verified">
                  <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'wght' 900" }}>check</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono font-bold bg-white/20 text-white px-2 py-0.5 rounded-md shadow-sm border border-white/10 flex items-center gap-1 cursor-pointer hover:bg-white/30 transition-colors" onClick={() => { navigator.clipboard.writeText(zeebacId); setToastMessage('ID Copied!'); setTimeout(() => setToastMessage(null), 2500); }}>
                  {zeebacId}
                  <span className="material-symbols-outlined text-[10px]">content_copy</span>
                </span>
              </div>
              <div className="flex items-center gap-1 font-medium mt-1">
                <span className="text-[10px] text-white/80 font-medium">Verified</span>
              </div>

              {/* Tag Category */}
              <div className="inline-flex items-center gap-1 bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                <span className="material-symbols-outlined text-[11px]">sell</span>
                {category}
              </div>

              <p className="text-[11px] text-white/80 italic font-medium pt-0.5">Quality fashion, trusted by you.</p>
            </div>
          </div>
        </div>

        {/* Business Information Section */}
        <div className="space-y-4 px-1">
          <h3 className="font-display text-[15px] font-black text-on-surface">Business Information</h3>
          
          <div className="divide-y divide-outline-variant/10">
            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">storefront</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Business Name</span>
              </div>
              <span className="text-[12.5px] font-extrabold text-on-surface">{storeName}</span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">sell</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Category</span>
              </div>
              <span className="text-[12.5px] font-extrabold text-on-surface">{category}</span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">call</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Contact Number</span>
              </div>
              <span className="text-[12.5px] font-extrabold text-on-surface">{phone}</span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">mail</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Business Email</span>
              </div>
              <span className="text-[12.5px] font-extrabold text-on-surface truncate max-w-[180px]">{email}</span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Store Address</span>
              </div>
              <span className="text-[12.5px] font-extrabold text-on-surface">{address}</span>
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">description</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Description</span>
              </div>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="text-[12.5px] font-extrabold text-on-surface text-right border-b border-primary/40 focus:border-primary focus:outline-none bg-transparent py-0.5 max-w-[180px] truncate"
                  placeholder="Short description"
                />
              ) : (
                <span className="text-[12.5px] font-extrabold text-on-surface max-w-[180px] truncate">{formData.description || 'No description'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">Store Hours</span>
              </div>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.operatingHours} 
                  onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                  className="text-[12.5px] font-extrabold text-on-surface text-right border-b border-primary/40 focus:border-primary focus:outline-none bg-transparent py-0.5 max-w-[180px] truncate"
                  placeholder="e.g. 09:00 AM - 10:00 PM"
                />
              ) : (
                <span className="text-[12.5px] font-extrabold text-on-surface max-w-[180px] truncate">{formData.operatingHours || 'Open Daily: 09:00 AM - 10:00 PM'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-primary/5 text-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">account_balance</span>
                </div>
                <span className="text-[12.5px] font-bold text-on-surface-variant">UPI ID</span>
              </div>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.upiId} 
                  onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                  className="text-[12.5px] font-extrabold text-on-surface text-right border-b border-primary/40 focus:border-primary focus:outline-none bg-transparent py-0.5"
                  placeholder="example@upi"
                />
              ) : (
                <span className="text-[12.5px] font-extrabold text-on-surface">{formData.upiId || 'Not provided'}</span>
              )}
            </div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* My Store QR Card */}
        {(() => {
          const zeebacId = currentUser.zeebacId || 'ZBV-0000';
          const qrData = `zeebac://vendor/${zeebacId}`;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0-128-128&data=${encodeURIComponent(qrData)}`;
          return (
            <div className="flex items-center gap-4 py-3 px-1">
              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-display text-[15px] font-black text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_2</span>
                    My Store QR
                  </h3>
                  <p className="text-[11px] text-on-surface-variant leading-tight">Show this to customers for instant cashback</p>
                </div>
                
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => downloadImage(qrUrl, `Zeebac_QR_${zeebacId}.png`)}
                    className="flex-1 py-1.5 px-1 bg-primary text-white rounded-lg font-bold text-[10px] flex items-center justify-center gap-0.5 shadow-sm active:scale-95 transition-transform cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">download</span>
                    Download
                  </button>
                  <button 
                    onClick={() => shareContent(qrUrl, 'Scan & Pay via ZeeBac', 'Scan this QR at my store to pay and earn instant cashback!')}
                    className="flex-1 py-1.5 px-1 bg-white text-primary border border-primary rounded-lg font-bold text-[10px] flex items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">share</span>
                    Share
                  </button>
                </div>
              </div>

              {/* QR Image */}
              <div className="bg-[#fcfaff] border border-outline-variant/15 rounded-2xl p-1.5 w-[92px] h-[92px] flex items-center justify-center shadow-inner flex-shrink-0">
                <img src={qrUrl} alt="Store QR" className="w-full h-full object-contain" />
              </div>
            </div>
          );
        })()}

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* Store Performance Section */}
        <div className="space-y-3 px-1">
          <div className="flex justify-between items-center">
            <h3 className="font-display text-[15px] font-black text-on-surface">Store Performance</h3>
            <div className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant bg-surface-container-low px-2.5 py-1 rounded-full cursor-pointer">
              All Time
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-5.5 h-5.5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[11px]">trending_up</span>
                </div>
                <span className="text-[10px] text-on-surface-variant font-bold">Revenue</span>
              </div>
              <p className="text-[14px] font-black text-on-surface">₹{stats.totalRevenue.toLocaleString()}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-5.5 h-5.5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[11px]">shopping_bag</span>
                </div>
                <span className="text-[10px] text-on-surface-variant font-bold">Orders</span>
              </div>
              <p className="text-[14px] font-black text-on-surface">{stats.totalTransactions}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-5.5 h-5.5 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[11px]">payments</span>
                </div>
                <span className="text-[10px] text-on-surface-variant font-bold">Cashback</span>
              </div>
              <p className="text-[14px] font-black text-on-surface">₹{stats.totalCashbackGiven.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* Documents Section */}
        <div className="space-y-4 px-1">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#f3efff] flex items-center justify-center text-[#4f27e3] flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">folder</span>
            </div>
            <div className="flex flex-col">
              <h4 className="font-display text-[15px] font-black text-on-surface">Documents</h4>
              <span className="text-[11px] text-on-surface-variant font-bold">KYC & business proofs</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="bg-white border border-outline-variant/10 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined font-bold text-[20px] ${vendorData?.documents?.gstCertificate?.fileUrl ? 'text-green-600' : 'text-orange-500'}`}>
                  {vendorData?.documents?.gstCertificate?.fileUrl ? 'check_circle' : 'pending'}
                </span>
                <span className="text-[12.5px] font-bold text-on-surface">GST Certificate</span>
              </div>
              <button onClick={() => setPreviewDoc('gst')} className="text-[12.5px] font-extrabold text-[#4f27e3] hover:underline cursor-pointer">
                {vendorData?.documents?.gstCertificate?.fileUrl ? 'View' : 'Upload'}
              </button>
            </div>

            <div className="bg-white border border-outline-variant/10 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined font-bold text-[20px] ${vendorData?.documents?.aadhaarPan?.fileUrl ? 'text-green-600' : 'text-orange-500'}`}>
                  {vendorData?.documents?.aadhaarPan?.fileUrl ? 'check_circle' : 'pending'}
                </span>
                <span className="text-[12.5px] font-bold text-on-surface">Owner PAN Card</span>
              </div>
              <button onClick={() => setPreviewDoc('pan')} className="text-[12.5px] font-extrabold text-[#4f27e3] hover:underline cursor-pointer">
                {vendorData?.documents?.aadhaarPan?.fileUrl ? 'View' : 'Upload'}
              </button>
            </div>

            <div className="bg-white border border-outline-variant/10 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined font-bold text-[20px] ${chequeUploaded ? 'text-green-600' : 'text-orange-500'}`}>
                  {chequeUploaded ? 'check_circle' : 'pending'}
                </span>
                <span className="text-[12.5px] font-bold text-on-surface">Bank Cheque</span>
              </div>
              <button 
                onClick={() => chequeUploaded ? setPreviewDoc('cheque') : chequeInputRef.current?.click()} 
                className="text-[12.5px] font-extrabold text-[#4f27e3] hover:underline cursor-pointer"
              >
                {chequeUploaded ? 'View' : 'Upload'}
              </button>
              <input 
                type="file" 
                ref={chequeInputRef} 
                className="hidden" 
                accept="image/*,.pdf"
                onChange={handleChequeUpload}
              />
            </div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* Location Section */}
        <div className="space-y-4 px-1">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">pin_drop</span>
            </div>
            <div className="flex flex-col">
              <h4 className="font-display text-[15px] font-black text-on-surface">Location</h4>
              <span className="text-[11px] text-on-surface-variant font-bold">Pinned for customers</span>
            </div>
          </div>

          <div className="relative w-full h-[180px] bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center border border-outline-variant/10 shadow-inner">
            {/* Subtle mock map roads using SVG/CSS grid patterns */}
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
            <div className="absolute top-[20%] left-0 w-full h-2 bg-white/60 blur-[1px]" />
            <div className="absolute top-0 left-[40%] w-2 h-full bg-white/60 blur-[1px]" />
            <div className="absolute bottom-[30%] left-0 w-full h-3 bg-white/60 blur-[1px] rotate-12" />
            
            <div className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center relative z-10 transition-transform hover:scale-105">
              <span className="material-symbols-outlined text-red-500 text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
            </div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* Owner Identity Section */}
        <div className="space-y-4 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#f3efff] flex items-center justify-center text-[#4f27e3] flex-shrink-0">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <div className="flex flex-col">
                <h4 className="font-display text-[15px] font-black text-on-surface">Owner Identity</h4>
                <span className="text-[11px] text-on-surface-variant font-bold">KYC verified documents</span>
              </div>
            </div>
            <span className="bg-[#e8f5e9] text-[#2e7d32] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
              Verified
            </span>
          </div>

          <hr className="border-t border-outline-variant/10" />

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-on-surface-variant/70 tracking-widest uppercase">Aadhaar / PAN</span>
              {vendorData?.documents?.aadhaarPan?.fileUrl ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[14px] text-green-600">check_circle</span>
                  <p className="text-[12px] font-black text-on-surface">Uploaded</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[14px] text-orange-500">pending</span>
                  <p className="text-[12px] font-black text-on-surface text-orange-600">Not Uploaded</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-on-surface-variant/70 tracking-widest uppercase">GST Certificate</span>
              {vendorData?.documents?.gstCertificate?.fileUrl ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[14px] text-green-600">check_circle</span>
                  <p className="text-[12px] font-black text-on-surface">Uploaded</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="material-symbols-outlined text-[14px] text-orange-500">pending</span>
                  <p className="text-[12px] font-black text-on-surface text-orange-600">Not Uploaded</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <hr className="border-t-2 border-blue-100/60 my-1.5" />

        {/* Footer Actions Grid */}
        <div className="grid grid-cols-2 gap-2 text-center pt-2">
          <button 
            onClick={handleShareStore} 
            className="flex flex-col items-center justify-center py-2.5 bg-white rounded-xl border border-outline-variant/10 shadow-sm hover:bg-surface-container-low active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">share</span>
            <span className="text-[9px] font-bold text-on-surface-variant mt-1">Share Store</span>
          </button>
          <button 
            onClick={() => navigate('/vendor/support')} 
            className="flex flex-col items-center justify-center py-2.5 bg-white rounded-xl border border-outline-variant/10 shadow-sm hover:bg-surface-container-low active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">support_agent</span>
            <span className="text-[9px] font-bold text-on-surface-variant mt-1">Support</span>
          </button>
        </div>

        {/* Logout Account Button */}
        <button 
          onClick={() => {
            logout();
            navigate('/vendor-app/login');
          }} 
          className="w-full py-4 bg-[#fff5f5] hover:bg-[#ffebeb] text-red-600 border border-red-100 rounded-2xl font-black text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer shadow-sm mt-3"
        >
          <span className="material-symbols-outlined text-[18px] text-red-600" style={{ fontVariationSettings: "'wght' 700" }}>logout</span>
          Logout Account
        </button>

      </div>

      {/* Premium Document Preview Modal */}
      {previewDoc && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-2xl relative border border-gray-150 flex flex-col max-h-[85vh] animate-reveal">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-surface-container-low">
              <span className="font-display font-black text-[13px] text-on-surface">
                {previewDoc === 'gst' && 'GST Registration Certificate'}
                {previewDoc === 'pan' && 'Owner PAN Card'}
                {previewDoc === 'cheque' && 'Bank Cheque Preview'}
              </span>
              <button 
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-200/60 active:scale-95 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-gray-50">
              
              {/* GST Certificate Preview */}
              {previewDoc === 'gst' && (
                <div className="w-full flex items-center justify-center p-2 h-[400px]">
                  {vendorData?.documents?.gstCertificate?.fileUrl ? (
                    <img 
                      src={`${API_BASE_URL}${vendorData.documents.gstCertificate.fileUrl}`} 
                      alt="GST Certificate" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="w-full bg-white border-[4px] border-double border-amber-850/25 p-3 rounded-xl shadow-md text-[9px] space-y-2.5 font-serif relative overflow-hidden select-none">
                      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                        <span className="material-symbols-outlined text-[120px]">gavel</span>
                      </div>
                      
                      <div className="text-center border-b pb-1.5 space-y-0.5">
                        <h5 className="font-bold text-[10px] uppercase tracking-wide">Government of India</h5>
                        <p className="text-[8px] font-bold text-gray-600">Form GST REG-06</p>
                        <p className="text-[7.5px] text-gray-500 italic">Registration Certificate</p>
                      </div>

                      <div className="space-y-1 font-sans text-left text-gray-800">
                        <div className="grid grid-cols-3 gap-0.5">
                          <span className="font-bold text-gray-500">GSTIN</span>
                          <span className="col-span-2 font-mono font-black text-gray-950">27AAAAA1111A1Z1</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <span className="font-bold text-gray-500">Legal Name</span>
                          <span className="col-span-2 font-bold text-gray-900 uppercase text-[8px] truncate">{storeName} PRIVATE LIMITED</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <span className="font-bold text-gray-500">Trade Name</span>
                          <span className="col-span-2 font-semibold text-gray-900 truncate">{storeName}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <span className="font-bold text-gray-500">Address</span>
                          <span className="col-span-2 text-gray-950 text-[8px] line-clamp-2">{address}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5">
                          <span className="font-bold text-gray-500">Date of Issue</span>
                          <span className="col-span-2 text-gray-900">12/04/2024</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t flex justify-between items-center font-sans">
                        <div className="text-left">
                          <p className="text-[6.5px] text-gray-500">Designation</p>
                          <p className="font-bold text-[7.5px] text-gray-800">Superintendent</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[6.5px] text-gray-500">Jurisdiction</p>
                          <p className="font-bold text-[7.5px] text-gray-800">Ward 42, Zone 5</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PAN Card Preview */}
              {previewDoc === 'pan' && (
                <div className="w-full flex items-center justify-center p-2 h-[400px]">
                  {vendorData?.documents?.aadhaarPan?.fileUrl ? (
                    <img 
                      src={`${API_BASE_URL}${vendorData.documents.aadhaarPan.fileUrl}`} 
                      alt="PAN Card" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="w-full bg-gradient-to-br from-[#103a5c] to-[#1e5d90] p-3.5 rounded-2xl shadow-lg text-white space-y-3.5 relative overflow-hidden font-sans border-2 border-white/20 select-none">
                      <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />
                      
                      <div className="flex justify-between items-start border-b border-white/10 pb-1.5">
                        <div className="text-left space-y-0.5">
                          <h5 className="text-[8px] font-black uppercase tracking-wider text-sky-200">Income Tax Department</h5>
                          <p className="text-[7px] font-medium text-white/80">GOVT. OF INDIA</p>
                        </div>
                        <span className="material-symbols-outlined text-[20px] text-sky-200">shield</span>
                      </div>

                      <div className="flex gap-3">
                        <div className="w-14 h-18 bg-white/95 rounded-lg border border-white/20 flex flex-col items-center justify-center text-[#103a5c] relative overflow-hidden flex-shrink-0">
                          <span className="material-symbols-outlined text-[28px] text-gray-400">person</span>
                          <div className="absolute bottom-0 w-full bg-black/40 py-0.5 text-[5px] text-center text-white font-mono">PHOTO</div>
                        </div>

                        <div className="flex-1 space-y-1.5 text-left">
                          <div>
                            <span className="text-[6.5px] text-sky-200 uppercase block font-medium">Permanent Account Number</span>
                            <span className="text-[11px] font-mono font-black tracking-widest text-amber-300">ABVPZ9444F</span>
                          </div>

                          <div className="space-y-0.5 text-[8px]">
                            <div>
                              <span className="text-[5.5px] text-sky-200 uppercase block">Name</span>
                              <span className="font-bold uppercase truncate max-w-[120px] block">{currentUser.storeName || 'Vinita Businesses'}</span>
                            </div>
                            <div>
                              <span className="text-[5.5px] text-sky-200 uppercase block">Father's Name</span>
                              <span className="font-bold uppercase truncate max-w-[120px] block">S. Jinodiya</span>
                            </div>
                            <div>
                              <span className="text-[5.5px] text-sky-200 uppercase block">Date of Birth</span>
                              <span className="font-bold font-mono">20/08/1995</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-white/10 flex justify-between items-center text-[6px] text-white/60">
                        <span>Signature of Cardholder</span>
                        <span className="font-serif italic font-bold text-white text-[9px] tracking-wider opacity-85">Vinita</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cancelled Cheque Preview */}
              {previewDoc === 'cheque' && (
                <div className="w-full flex items-center justify-center p-2 h-[400px]">
                  {vendorData?.documents?.cancelledCheque?.fileUrl ? (
                    <img 
                      src={`${API_BASE_URL}${vendorData.documents.cancelledCheque.fileUrl}`} 
                      alt="Cancelled Cheque" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                    />
                  ) : (
                    <div className="w-full bg-[#f4faff] border border-blue-200 p-4 rounded-xl shadow-md space-y-3 font-sans relative overflow-hidden select-none">
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                        <div className="border-y-2 border-red-500/25 text-red-500/25 font-black text-[24px] tracking-[10px] uppercase rotate-[-15deg] px-6 py-1 border-double">
                          Cancelled
                        </div>
                      </div>

                      <div className="flex justify-between items-start text-[7px] text-blue-900/70">
                        <div className="space-y-0.5 text-left">
                          <h5 className="font-black text-[8.5px] text-blue-900">ZEEBAC CO-OPERATIVE BANK</h5>
                          <p>Branch: Main Square Road, Indore</p>
                          <p>IFSC: ZBBC0000213</p>
                        </div>
                        <div className="text-right font-mono font-bold text-[8px] border border-blue-300 px-1 py-0.5 bg-white">
                          Date: 2 0 0 6 2 0 2 6
                        </div>
                      </div>

                      <div className="space-y-1.5 text-[8px] text-blue-955 font-medium">
                        <div className="flex items-center gap-1 border-b border-blue-200 pb-0.5">
                          <span>Pay:</span>
                          <span className="font-mono flex-1 text-left tracking-widest text-blue-900/60">-----------------------------------------------</span>
                        </div>

                        <div className="flex items-center gap-1 border-b border-blue-200 pb-0.5">
                          <span>Rupees:</span>
                          <span className="font-mono flex-1 text-left tracking-widest text-blue-900/60">-----------------------------------------------</span>
                          <div className="border border-blue-300 bg-white px-1.5 py-0.2 font-bold text-[8.5px]">
                            ₹ **0.00
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="text-left space-y-0.5">
                          <span className="text-[6px] text-blue-900/50 block">Account No.</span>
                          <span className="font-mono font-bold text-[9.5px] text-blue-950 bg-white border border-blue-100 px-1.5 py-0.2 rounded">
                            5010049281938
                          </span>
                        </div>
                        <div className="text-right flex flex-col justify-end items-end space-y-0.5">
                          <span className="text-[6px] text-blue-900/50 block">Authorized Signature</span>
                          <span className="w-16 h-3 border-b border-blue-300 border-dashed" />
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-blue-100 text-center font-mono text-[7px] text-blue-900/60 tracking-[3px]">
                        ⑈ 452240002 ⑈ 501004928 ⑈ 22
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button 
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 bg-primary text-white rounded-full font-black text-[11px] hover:bg-primary-container hover:scale-102 active:scale-98 transition-all cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Support Options Modal */}
      {supportModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl w-full max-w-[320px] overflow-hidden shadow-2xl relative border border-gray-150 flex flex-col max-h-[80vh] animate-reveal">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-surface-container-low">
              <span className="font-display font-black text-[14px] text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[18px]">support_agent</span>
                Customer Support
              </span>
              <button 
                onClick={() => setSupportModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-200/60 active:scale-95 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3 bg-gray-50">
              <p className="text-[11px] text-on-surface-variant leading-tight mb-2">Need help? Choose a support channel to connect with our team instantly.</p>

              <button 
                onClick={() => {
                  setSupportModalOpen(false);
                  navigate('/vendor/chat');
                }}
                className="w-full p-3.5 bg-white border border-outline-variant/15 hover:bg-surface-container-low active:scale-[0.98] transition-all rounded-2xl flex items-center gap-3 cursor-pointer text-left shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">chat</span>
                </div>
                <div>
                  <p className="text-[12.5px] font-black text-on-surface">In-App Chat Support</p>
                  <p className="text-[10px] text-on-surface-variant/70">Chat with support agents now</p>
                </div>
              </button>

              <a 
                href="https://wa.me/919111966732"
                target="_blank"
                rel="noreferrer"
                onClick={() => setSupportModalOpen(false)}
                className="w-full p-3.5 bg-white border border-outline-variant/15 hover:bg-surface-container-low active:scale-[0.98] transition-all rounded-2xl flex items-center gap-3 cursor-pointer text-left shadow-sm block"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>call</span>
                </div>
                <div>
                  <p className="text-[12.5px] font-black text-on-surface">WhatsApp Support</p>
                  <p className="text-[10px] text-on-surface-variant/70">Connect with us on WhatsApp</p>
                </div>
              </a>

              <a 
                href="tel:+919111966732"
                onClick={() => setSupportModalOpen(false)}
                className="w-full p-3.5 bg-white border border-outline-variant/15 hover:bg-surface-container-low active:scale-[0.98] transition-all rounded-2xl flex items-center gap-3 cursor-pointer text-left shadow-sm block"
              >
                <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">phone_iphone</span>
                </div>
                <div>
                  <p className="text-[12.5px] font-black text-on-surface">Call Helpline</p>
                  <p className="text-[10px] text-on-surface-variant/70">Toll-free 1800-ZEEBAC</p>
                </div>
              </a>

              <a 
                href="mailto:support@zeebac.com"
                onClick={() => setSupportModalOpen(false)}
                className="w-full p-3.5 bg-white border border-outline-variant/15 hover:bg-surface-container-low active:scale-[0.98] transition-all rounded-2xl flex items-center gap-3 cursor-pointer text-left shadow-sm block"
              >
                <div className="w-9 h-9 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <div>
                  <p className="text-[12.5px] font-black text-on-surface">Email Support</p>
                  <p className="text-[10px] text-on-surface-variant/70">Write us at support@zeebac.com</p>
                </div>
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Toast Notification */}
      {toastMessage && createPortal(
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[300] bg-on-surface-variant/90 backdrop-blur-md text-white px-5 py-3 rounded-full shadow-lg text-[12px] font-bold animate-reveal whitespace-nowrap">
          {toastMessage}
        </div>,
        document.body
      )}

    </div>
  );
}
