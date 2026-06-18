import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function ProfilePage() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <SkeletonLoader type="profile" />;
  }

  const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || '{}');
  const storeName = currentUser.storeName || 'Noir Concept Store';
  const category = currentUser.category || 'Premium Fashion';
  const phone = currentUser.phone ? `+91 ${currentUser.phone}` : '+91 98765 43210';
  const email = currentUser.email || 'hello@noirconcept.in';
  const address = currentUser.address || '124, High Street Avenue, Kormangala, Bangalore - 560034';
  const firstLetter = storeName.charAt(0).toUpperCase();

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-lg">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Profile</span>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-[13px] transition-all active:scale-[0.97] shadow-sm ${
            isEditing 
              ? 'bg-green-500 text-white' 
              : 'bg-white border border-outline-variant/20 text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">{isEditing ? 'save' : 'edit'}</span>
          {isEditing ? 'Save' : 'Edit'}
        </button>
      </header>

      <div className="space-y-6 pt-4">

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Banner */}
        <div className="h-28 bg-gradient-to-r from-primary to-secondary relative">
          <button className="absolute top-4 right-4 p-2 bg-black/30 text-white rounded-xl backdrop-blur-md active:scale-[0.95] transition-transform">
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
          </button>
        </div>
        
        {/* Profile Info */}
        <div className="px-5 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-5">
            <div className="w-24 h-24 bg-white rounded-[24px] shadow-md border-[6px] border-white flex items-center justify-center text-primary text-4xl font-black relative group">
              <span className="absolute inset-0 bg-primary/5 rounded-[18px]"></span>
              {firstLetter}
              {isEditing && (
                <div className="absolute inset-0 bg-black/40 rounded-[18px] flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </div>
              )}
            </div>
            <div className="pb-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[20px] font-black text-on-surface truncate">{storeName}</h2>
                <span className="px-1.5 py-0.5 bg-green-500/10 text-green-600 text-[9px] font-bold uppercase rounded flex items-center gap-0.5 flex-shrink-0">
                  <span className="material-symbols-outlined text-[10px]">verified</span>
                  Verified
                </span>
              </div>
              <p className="text-on-surface-variant text-[13px] font-medium mt-0.5 truncate">{category} • Est. 2021</p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Business Name</label>
              <input 
                type="text" 
                defaultValue={storeName}
                disabled={!isEditing}
                className="w-full px-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all disabled:opacity-70 text-[14px]"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Category</label>
              <select 
                disabled={!isEditing}
                defaultValue={category}
                className="w-full px-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all disabled:opacity-70 text-[14px] appearance-none"
              >
                {!['Premium Fashion', 'Electronics', 'Groceries', 'Food & Beverage'].includes(category) && (
                  <option>{category}</option>
                )}
                <option>Premium Fashion</option>
                <option>Electronics</option>
                <option>Groceries</option>
                <option>Food & Beverage</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Contact Number</label>
              <input 
                type="text" 
                defaultValue={phone}
                disabled={!isEditing}
                className="w-full px-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all disabled:opacity-70 text-[14px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Business Email</label>
              <input 
                type="email" 
                defaultValue={email}
                disabled={!isEditing}
                className="w-full px-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all disabled:opacity-70 text-[14px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider pl-1">Store Address</label>
              <textarea 
                rows="2"
                defaultValue={address}
                disabled={!isEditing}
                className="w-full px-4 py-3 bg-surface-container-low border border-transparent focus:border-primary focus:bg-white rounded-2xl outline-none transition-all disabled:opacity-70 text-[14px] resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Verification Documents */}
      <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center gap-4 border-b border-outline-variant/5 pb-4">
          <div className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[22px]">folder_open</span>
          </div>
          <div>
            <h3 className="font-bold text-[15px] text-on-surface">Documents</h3>
            <p className="text-[12px] text-on-surface-variant mt-0.5">KYC & business proofs</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/5 bg-surface-container-low/50 active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-green-500 text-[20px]">check_circle</span>
              <span className="font-medium text-[14px]">GST Certificate</span>
            </div>
            <button onClick={() => alert('Viewing GST Certificate')} className="text-primary text-[13px] font-bold">View</button>
          </div>
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/5 bg-surface-container-low/50 active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-green-500 text-[20px]">check_circle</span>
              <span className="font-medium text-[14px]">Owner PAN Card</span>
            </div>
            <button onClick={() => alert('Viewing PAN Card')} className="text-primary text-[13px] font-bold">View</button>
          </div>
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-outline-variant/5 bg-surface-container-low/50 active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-orange-500 text-[20px]">pending</span>
              <span className="font-medium text-[14px]">Bank Cheque</span>
            </div>
            <button onClick={() => alert('Upload prompt')} className="text-primary text-[13px] font-bold">Upload</button>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant/5 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
              <span className="material-symbols-outlined text-[22px]">pin_drop</span>
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-on-surface">Location</h3>
              <p className="text-[12px] text-on-surface-variant mt-0.5">Pinned for customers</p>
            </div>
          </div>
          {isEditing && (
            <button 
              onClick={() => alert('Pin update')}
              className="text-primary text-[13px] font-bold px-3 py-1.5 rounded-xl bg-primary/10 active:scale-[0.97] transition-transform"
            >
              Update
            </button>
          )}
        </div>
        
        <div className="h-40 bg-surface-container rounded-2xl overflow-hidden relative border border-outline-variant/5 flex items-center justify-center">
          <div className="absolute w-full h-full bg-[#f8f9fe]/50" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-red-500 animate-bounce">
              <span className="material-symbols-outlined text-[28px]" style={{fontVariationSettings: "'FILL' 1"}}>location_on</span>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-full shadow text-[11px] font-bold text-on-surface">
              12.9345° N, 77.6266° E
            </div>
          </div>
        </div>
      </div>

      {/* KYC Identity Info */}
      {(() => {
        const currentUser = JSON.parse(localStorage.getItem('zeebac_current_user') || 'null');
        if (!currentUser?.aadhaar) return null;
        const maskedAadhaar = `•••• •••• ${currentUser.aadhaar.slice(-4)}`;
        const maskedPan = currentUser.pan ? `${currentUser.pan.slice(0, 2)}••••••${currentUser.pan.slice(-2)}` : '';
        return (
          <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              </div>
              <div>
                <h3 className="font-bold text-[15px] text-on-surface">Owner Identity</h3>
                <p className="text-[12px] text-on-surface-variant mt-0.5">KYC verified documents</p>
              </div>
              <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Verified</span>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Aadhaar</p>
                <p className="text-[13px] font-bold text-on-surface font-label-mono tracking-wider">{maskedAadhaar}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">PAN Card</p>
                <p className="text-[13px] font-bold text-on-surface font-label-mono tracking-wider uppercase">{maskedPan}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Logout */}
      <button 
        onClick={() => {
          localStorage.removeItem('zeebac_current_user');
          localStorage.removeItem('vendor_transactions');
          localStorage.removeItem('vendor_balance');
          navigate('/login');
        }}
        className="w-full py-3.5 rounded-xl bg-red-50 hover:bg-red-100/60 text-red-600 font-bold text-[14px] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm border border-red-100"
      >
        <span className="material-symbols-outlined text-[18px]">logout</span>
        Logout Account
      </button>

      </div>

    </div>
  );
}
