import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';

export default function RequestCashbackScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAutoApproved, setIsAutoApproved] = useState(false);
  const [autoCashbackEarned, setAutoCashbackEarned] = useState(0);
  const [autoTransactionId, setAutoTransactionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [vendorsList, setVendorsList] = useState([]);
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);

  // Form State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [billNumber, setBillNumber] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [description, setDescription] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFilePreview, setUploadedFilePreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // GPS is captured as a fraud-review signal only — it never blocks
  // submission. `locationStatus` just drives a small UI hint.
  const [coords, setCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | requesting | granted | denied

  const [submittedRequestId, setSubmittedRequestId] = useState('');
  const [submittedDateTime, setSubmittedDateTime] = useState('');

  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Fetch vendors for dropdown
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const res = await UserAPI.searchVendors(searchQuery);
        if (res.success) {
          setVendorsList(res.data);
        }
      } catch (err) {
        console.error('Failed to search vendors', err);
      }
    };
    if (searchQuery.length > 0 && showDropdown) {
      const timer = setTimeout(() => fetchVendors(), 300);
      return () => clearTimeout(timer);
    } else if (searchQuery === '' && showDropdown) {
      fetchVendors();
    }
  }, [searchQuery, showDropdown]);

  const handleVendorSelect = (vendor) => {
    setSelectedVendor({
      id: vendor._id,
      zeebacId: vendor.zeebacId,
      name: vendor.storeName,
      category: vendor.category,
      cashbackRate: vendor.cashbackRate / 100 // assuming backend returns percentage like 15
    });
    setSearchQuery(vendor.storeName);
    setShowDropdown(false);
    setErrorMsg('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        setErrorMsg('Allowed formats: JPG, PNG, PDF');
        return;
      }
      setErrorMsg('');
      setUploadedFile(file);
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setUploadedFilePreview(reader.result);
        };
        reader.readAsDataURL(file);
      } else {
        // PDF Placeholder preview
        setUploadedFilePreview('pdf-placeholder');
      }
    }
  };

  // Non-blocking best-effort location capture — used only as a fraud-review
  // signal on the backend, never required to submit a request.
  const requestLocation = () => {
    if (coords || locationStatus === 'requesting' || !navigator.geolocation) return;
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const validateStep = () => {
    if (step === 1) {
      if (!selectedVendor) {
        setErrorMsg('Please select a vendor.');
        return false;
      }
    } else if (step === 2) {
      if (!billNumber || !billNumber.trim()) {
        setErrorMsg('Please enter the unique bill / invoice number.');
        return false;
      }
      if (!billAmount || parseFloat(billAmount) <= 0) {
        setErrorMsg('Please enter a valid bill amount.');
        return false;
      }
      if (!uploadedFile) {
        setErrorMsg('Bill image upload is mandatory.');
        return false;
      }
    }
    setErrorMsg('');
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      const nextStep = step + 1;
      if (nextStep === 2) requestLocation();
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current || isLoadingSubmit) return;
    isSubmittingRef.current = true;
    setIsLoadingSubmit(true);
    try {
      const formData = new FormData();
      formData.append('vendorId', selectedVendor.id);
      formData.append('amount', parseFloat(billAmount));
      formData.append('billNumber', billNumber.trim());
      formData.append('description', description || 'Manual Cashback Request');
      formData.append('paymentMethod', paymentMethod);
      formData.append('purchaseDate', purchaseDate);
      formData.append('billImg', uploadedFile);
      if (coords) {
        formData.append('latitude', coords.latitude);
        formData.append('longitude', coords.longitude);
      }

      const res = await UserAPI.createCashbackRequest(formData);

      if (res.success) {
        const reqId = res.data?._id || res.data?.id;
        const now = new Date(res.data?.createdAt || Date.now());
        const dateTimeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        setSubmittedRequestId(reqId);
        setSubmittedDateTime(dateTimeStr);

        if (res.autoApproved) {
          setIsAutoApproved(true);
          setAutoCashbackEarned(res.cashbackEarned || 0);
          setAutoTransactionId(res.transactionId || '');
          // Sync real-time wallet balance in global store
          try {
            useAuthStore.getState().fetchWalletBalance();
          } catch (_) {}
        } else {
          setIsAutoApproved(false);
        }

        setIsSuccess(true);
      } else {
        setErrorMsg('Failed to submit request.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || 'Error submitting request. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsLoadingSubmit(false);
    }
  };

  const filteredVendors = (() => {
    if (!searchQuery.trim()) return vendorsList;
    const q = searchQuery.trim().toLowerCase();
    
    const matches = vendorsList.filter(v => {
      const sName = (v.storeName || '').toLowerCase();
      const oName = (v.ownerName || '').toLowerCase();
      const zId = (v.zeebacId || '').toLowerCase();
      const id = (v._id || '').toLowerCase();
      const cat = (v.category || '').toLowerCase();
      const subCat = (v.subCategory || '').toLowerCase();
      return sName.includes(q) || oName.includes(q) || zId.includes(q) || id.includes(q) || cat.includes(q) || subCat.includes(q);
    });

    return matches.sort((a, b) => {
      const aName = (a.storeName || '').toLowerCase();
      const bName = (b.storeName || '').toLowerCase();
      const aOwner = (a.ownerName || '').toLowerCase();
      const bOwner = (b.ownerName || '').toLowerCase();
      const aId = (a.zeebacId || '').toLowerCase();
      const bId = (b.zeebacId || '').toLowerCase();

      // 1. Exact match on store name or zeebacId
      const aExact = aName === q || aId === q;
      const bExact = bName === q || bId === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // 2. Store name starts with search query
      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // 3. Store name contains search query
      const aContains = aName.includes(q);
      const bContains = bName.includes(q);
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;

      // 4. Owner name starts with query
      const aOwnerStarts = aOwner.startsWith(q);
      const bOwnerStarts = bOwner.startsWith(q);
      if (aOwnerStarts && !bOwnerStarts) return -1;
      if (!aOwnerStarts && bOwnerStarts) return 1;

      // 5. Owner name contains query
      const aOwnerContains = aOwner.includes(q);
      const bOwnerContains = bOwner.includes(q);
      if (aOwnerContains && !bOwnerContains) return -1;
      if (!aOwnerContains && bOwnerContains) return 1;

      return 0;
    });
  })();

  if (isSuccess) {
    if (isAutoApproved) {
      return (
        <div className="mesh-gradient text-on-surface min-h-screen flex flex-col items-center justify-center p-container-margin select-none font-body-lg">
          <main className="app-container bg-white border border-emerald-200 shadow-2xl rounded-3xl p-lg space-y-lg text-center animate-reveal relative overflow-hidden">
            {/* Top glowing ambient blob */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-60 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />

            {/* Glowing AI Verification Chip */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide uppercase shadow-sm">
              <span className="material-symbols-outlined text-sm animate-pulse text-emerald-600">auto_awesome</span>
              AI Instant Match Verified
            </div>

            <div className="relative w-20 h-20 bg-gradient-to-tr from-emerald-600 to-green-400 rounded-full flex items-center justify-center mx-auto shadow-xl text-white">
              <span className="material-symbols-outlined text-[44px]">verified</span>
            </div>

            <div className="space-y-xs">
              <h1 className="text-headline-lg font-black tracking-tight text-on-surface">Cashback Approved Instantly!</h1>
              <p className="text-body-sm text-on-surface-variant max-w-[320px] mx-auto">
                Bill verified with store billing software. Your cashback has been automatically credited directly to your Zeebac wallet!
              </p>
            </div>

            {/* Big Cashback Amount Card */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent rounded-2xl p-md border-2 border-emerald-400/50 text-center space-y-1">
              <span className="text-[11px] uppercase font-bold text-emerald-800 tracking-wider">Cashback Credited to Wallet</span>
              <div className="text-[38px] font-black text-emerald-600 tracking-tight font-display">
                +₹{parseFloat(autoCashbackEarned || 0).toFixed(2)}
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-3 py-0.5 rounded-full">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                Instant Success • No Vendor Waiting
              </span>
            </div>

            {/* Bill Details */}
            <div className="bg-surface-container-low rounded-2xl p-md border border-outline-variant/20 text-left space-y-sm text-body-sm text-on-surface-variant">
              <div className="flex justify-between items-center">
                <span>Store</span>
                <span className="font-bold text-on-surface">{selectedVendor?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Bill / Invoice No</span>
                <span className="font-label-mono font-bold text-[12px] text-on-surface">{billNumber}</span>
              </div>
              {autoTransactionId && (
                <div className="flex justify-between items-center">
                  <span>Transaction ID</span>
                  <span className="font-label-mono font-bold text-[12px] text-primary">{autoTransactionId}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span>Status</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">done_all</span>
                  Auto-Approved & Paid
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-sm pt-xs">
              <button 
                onClick={() => navigate('/wallet')}
                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined">account_balance_wallet</span>
                View Wallet Balance
              </button>
              <button 
                onClick={() => navigate('/transactions')}
                className="w-full h-12 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-title-md flex items-center justify-center gap-sm active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                View Transaction Receipt
              </button>
              <button 
                onClick={() => navigate('/home')}
                className="w-full h-10 bg-transparent text-secondary font-title-md active:opacity-75 transition-opacity cursor-pointer text-sm"
              >
                Back to Home
              </button>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="mesh-gradient text-on-surface min-h-screen flex flex-col items-center justify-center p-container-margin select-none font-body-lg">
        <main className="app-container bg-white border border-outline-variant/20 shadow-2xl rounded-3xl p-lg space-y-lg text-center animate-reveal">
          <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg text-white">
            <span className="material-symbols-outlined text-[48px]" style={{ fontVariationSettings: "'wght' 600" }}>done</span>
          </div>

          <div className="space-y-xs">
            <h1 className="text-headline-lg font-black tracking-tight text-on-surface">Request Submitted Successfully</h1>
            <p className="text-body-sm text-on-surface-variant max-w-[280px] mx-auto">
              Your cashback request has been sent to the vendor for verification.
            </p>
          </div>

          <div className="bg-surface-container-low rounded-2xl p-md border border-outline-variant/20 text-left space-y-sm text-body-sm text-on-surface-variant">
            <div className="flex justify-between">
              <span>Request ID</span>
              <span className="font-label-mono font-bold text-[12px] text-on-surface">{submittedRequestId}</span>
            </div>
            {billNumber && (
              <div className="flex justify-between">
                <span>Bill Number</span>
                <span className="font-label-mono font-bold text-[12px] text-on-surface">{billNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Submission Date</span>
              <span className="font-bold text-on-surface">{submittedDateTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">
                Pending Vendor Approval
              </span>
            </div>
          </div>

          <div className="space-y-sm pt-sm">
            <button 
              onClick={() => navigate(`/request/${submittedRequestId}`)}
              className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer"
            >
              <span className="material-symbols-outlined">track_changes</span>
              View Request Status
            </button>
            <button 
              onClick={() => navigate('/home')}
              className="w-full h-12 bg-transparent text-secondary font-title-md active:opacity-75 transition-opacity cursor-pointer"
            >
              Back to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-header px-container-margin py-md border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <button
              onClick={() => step > 1 ? handleBack() : navigate(-1)}
              className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <span className="font-display text-title-md text-primary font-bold ml-1">Request Cashback</span>
          </div>
          <span className="text-caption text-outline font-semibold">Step {step} of 3</span>
        </div>
      </header>

      {/* Main Form container */}
      <main className="flex-grow app-container px-container-margin py-lg flex flex-col justify-between text-left">
        
        <div className="space-y-lg flex-1">
          {/* Indicator Timeline line */}
          <div className="flex items-center justify-between px-2 pb-sm">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex items-center flex-1 last:flex-none">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  step === num 
                    ? 'bg-primary text-white shadow-md' 
                    : step > num 
                      ? 'bg-green-500 text-white' 
                      : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {step > num ? <span className="material-symbols-outlined text-sm">done</span> : num}
                </div>
                {num < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-colors ${
                    step > num ? 'bg-green-500' : 'bg-surface-container-high'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-700 text-body-sm p-3 rounded-xl border border-red-200/50 flex items-center gap-sm">
              <span className="material-symbols-outlined text-sm">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: VENDOR SELECTION */}
          {step === 1 && (
            <div className="space-y-md animate-reveal">
              <div className="space-y-1">
                <h2 className="font-display text-title-md text-on-surface font-extrabold">Select Vendor</h2>
                <p className="text-body-sm text-on-surface-variant">Choose the partner shop where you made the purchase.</p>
              </div>

              <div className="relative">
                <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Search Partner Shop</label>
                <div className="flex-grow relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">storefront</span>
                  <input 
                    className="w-full h-[56px] pl-10 pr-10 bg-white border-2 border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-body-lg placeholder:text-outline transition-all"
                    placeholder="Search name..."
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                      setSelectedVendor(null);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedVendor(null);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  )}
                </div>

                {showDropdown && filteredVendors.length > 0 && (
                  <div className="absolute left-0 right-0 mt-xs bg-white border border-outline-variant/30 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
                    {filteredVendors.map(vendor => (
                      <div 
                        key={vendor._id}
                        onClick={() => handleVendorSelect(vendor)}
                        className="px-md py-sm hover:bg-primary/5 cursor-pointer flex items-center justify-between border-b border-outline-variant/10 last:border-none transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-title-md text-on-surface text-body-lg font-bold truncate">{vendor.storeName}</p>
                          <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
                            ID: {vendor.zeebacId || vendor._id} {vendor.ownerName ? `• ${vendor.ownerName}` : ''}
                          </p>
                        </div>
                        <span className="bg-primary/10 text-primary font-label-mono text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0">
                          {vendor.cashbackRate * 100}% BACK
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {showDropdown && searchQuery && filteredVendors.length === 0 && (
                  <div className="absolute left-0 right-0 mt-xs bg-white border border-outline-variant/30 rounded-xl shadow-xl z-50 p-4 text-center text-on-surface-variant text-body-sm">
                    No partner shop found matching "{searchQuery}"
                  </div>
                )}
              </div>

              {selectedVendor && (
                <div className="glass-card rounded-2xl p-4 border border-outline-variant/30 text-left space-y-3 animate-reveal bg-white/90 backdrop-blur-md shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-extrabold text-primary tracking-widest bg-primary/10 px-2.5 py-0.5 rounded-full">
                      Selected Partner
                    </span>
                    {selectedVendor.category && (
                      <span className="text-[11px] font-semibold text-on-surface-variant/80 bg-surface-container-high px-2 py-0.5 rounded-md truncate max-w-[140px]">
                        {selectedVendor.category}
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-title-md font-black text-on-surface truncate">
                    {selectedVendor.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-outline-variant/15">
                    <div className="min-w-0 bg-surface-container-low/70 rounded-xl p-2.5 border border-outline-variant/15 flex flex-col justify-center">
                      <p className="font-caption text-[10px] uppercase font-bold text-on-surface-variant/70 truncate">
                        Vendor ID
                      </p>
                      <p 
                        className="font-bold text-on-surface font-mono text-[12px] truncate mt-0.5" 
                        title={selectedVendor.zeebacId || selectedVendor.id}
                      >
                        {selectedVendor.zeebacId || selectedVendor.id}
                      </p>
                    </div>

                    <div className="min-w-0 bg-emerald-50/80 rounded-xl p-2.5 border border-emerald-200/60 flex flex-col justify-center">
                      <p className="font-caption text-[10px] uppercase font-bold text-emerald-800/80 truncate">
                        Cashback Rate
                      </p>
                      <p className="font-black text-emerald-700 text-[12.5px] truncate mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] shrink-0">percent</span>
                        {(selectedVendor.cashbackRate * 100).toFixed(0)}% Cashback
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PURCHASE DETAILS & BILL UPLOAD */}
          {step === 2 && (
            <div className="space-y-md animate-reveal">
              <div className="space-y-1">
                <h2 className="font-display text-title-md text-on-surface font-extrabold">Purchase & Bill Details</h2>
                <p className="text-body-sm text-on-surface-variant">Provide bill facts and upload the receipt image.</p>
              </div>

              {/* AI Software Auto-Match Feature Card */}
              <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-primary/10 border border-emerald-400/40 rounded-2xl p-3.5 flex items-start gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                </div>
                <div className="text-left space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-on-surface">AI Smart Bill Match Active</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded-full uppercase">Instant Auto-Approval</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    If this bill is generated by the store&apos;s software, AI will automatically match the bill invoice number and receipt photo. Your cashback will succeed immediately without requiring vendor approval!
                  </p>
                </div>
              </div>

              <div className="space-y-sm">
                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Purchase Date</label>
                  <input 
                    type="date"
                    value={purchaseDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full h-[52px] px-md bg-white border-2 border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-body-lg transition-all"
                  />
                </div>

                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">
                    Unique Bill / Invoice Number <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g. INV-2026-0042 or Receipt #98432"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full h-[52px] px-md bg-white border-2 border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-body-lg font-mono transition-all"
                  />
                  <p className="text-[10px] text-on-surface-variant/70 mt-1">
                    Enter the unique bill or receipt number printed on your document.
                  </p>
                </div>

                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Bill Amount (₹)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full h-[52px] px-md bg-white border-2 border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-body-lg transition-all"
                  />
                </div>

                {/* Integrated Gallery / Camera Upload */}
                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Upload Bill Image / Receipt</label>
                  {uploadedFile ? (
                    <div className="relative border border-green-400 rounded-xl p-3 bg-green-50/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {uploadedFilePreview === 'pdf-placeholder' ? (
                          <span className="material-symbols-outlined text-red-500">picture_as_pdf</span>
                        ) : (
                          <img className="w-10 h-10 object-cover rounded-lg border shadow-sm" src={uploadedFilePreview} alt="Bill file" />
                        )}
                        <div className="text-left leading-none">
                          <p className="font-bold text-xs text-on-surface truncate max-w-[180px]">{uploadedFile.name}</p>
                          <span className="text-[10px] text-green-700 font-semibold mt-1 inline-block">Ready to submit</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedFile(null);
                          setUploadedFilePreview(null);
                        }}
                        className="text-red-500 hover:text-red-700 w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current.click()}
                        className="flex-1 h-[48px] bg-white border border-outline-variant/40 rounded-xl flex items-center justify-center gap-2 text-primary font-bold text-[13px] hover:bg-surface-container-low transition-colors cursor-pointer shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">image</span>
                        Choose from Gallery
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current.click()}
                        className="h-[48px] px-4 bg-white border border-outline-variant/40 rounded-xl flex items-center justify-center text-secondary hover:bg-surface-container-low transition-colors cursor-pointer shadow-sm"
                        title="Take Camera Photo"
                      >
                        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                      </button>
                    </div>
                  )}
                  {/* Gallery: any existing image/PDF. Camera: `capture` opens the device's
                      native camera directly on mobile instead of a file picker. */}
                  <input
                    type="file"
                    ref={galleryInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.pdf"
                  />
                  <input
                    type="file"
                    ref={cameraInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                  />
                  <p className="text-[10px] text-on-surface-variant/70 mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">
                      {locationStatus === 'granted' ? 'location_on' : locationStatus === 'denied' ? 'location_off' : 'my_location'}
                    </span>
                    {locationStatus === 'granted' && 'Location captured — helps us verify this claim'}
                    {locationStatus === 'denied' && "Location unavailable — you can still submit, it just won't include a location check"}
                    {(locationStatus === 'idle' || locationStatus === 'requesting') && 'We may ask for your location to help verify this claim'}
                  </p>
                </div>

                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Payment Method</label>
                  <div className="grid grid-cols-4 gap-xs">
                    {['UPI', 'Card', 'Cash', 'Other'].map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`h-[48px] rounded-xl text-[13px] font-bold transition-all border ${
                          paymentMethod === method 
                            ? 'bg-primary text-white border-primary shadow-sm' 
                            : 'bg-white text-on-surface-variant border-outline-variant/40 hover:bg-surface-container-low'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Description (Optional)</label>
                  <textarea 
                    rows="2"
                    placeholder="Enter short description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-md bg-white border-2 border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-body-sm transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & SUBMIT */}
          {step === 3 && (
            <div className="space-y-md animate-reveal">
              <div className="space-y-1">
                <h2 className="font-display text-title-md text-on-surface font-extrabold">Review Cashback Request</h2>
                <p className="text-body-sm text-on-surface-variant">Please confirm the correctness of all details.</p>
              </div>

              <div className="glass-card rounded-2xl p-md border border-outline-variant/30 text-left space-y-md shadow-sm">
                <div className="flex justify-between items-start border-b border-outline-variant/10 pb-sm">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-primary tracking-widest leading-none">PARTNER SHOP</span>
                    <h3 className="font-display text-body-lg font-black text-on-surface pt-1">{selectedVendor.name}</h3>
                  </div>
                  <span className="bg-primary/10 text-primary font-label-mono text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                    {(selectedVendor.cashbackRate * 100).toFixed(0)}% Rate
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-md gap-x-sm text-body-sm text-on-surface-variant">
                  <div className="min-w-0">
                    <p className="font-caption text-[10px] uppercase">Bill Number</p>
                    <p className="font-bold text-on-surface font-mono truncate" title={billNumber}>{billNumber || 'N/A'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-caption text-[10px] uppercase">Purchase Date</p>
                    <p className="font-bold text-on-surface truncate">{purchaseDate}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-caption text-[10px] uppercase">Payment Method</p>
                    <p className="font-bold text-on-surface truncate">{paymentMethod}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-caption text-[10px] uppercase">Bill Amount</p>
                    <p className="font-bold text-on-surface truncate">₹{parseFloat(billAmount || 0).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 min-w-0 bg-secondary/5 border border-secondary/15 rounded-xl p-2.5">
                    <p className="font-caption text-[10px] uppercase text-secondary font-bold">Estimated Cashback</p>
                    <p className="font-bold text-secondary font-display text-body-lg">
                      +₹{((parseFloat(billAmount) || 0) * (selectedVendor?.cashbackRate || 0)).toFixed(2)}
                    </p>
                  </div>
                </div>

                {description && (
                  <div className="border-t border-outline-variant/10 pt-sm">
                    <p className="font-caption text-[10px] uppercase text-on-surface-variant">Description</p>
                    <p className="text-body-sm text-on-surface font-medium leading-relaxed">{description}</p>
                  </div>
                )}

                {uploadedFile && (
                  <div className="border-t border-outline-variant/10 pt-sm flex items-center justify-between">
                    <div>
                      <p className="font-caption text-[10px] uppercase text-on-surface-variant">Invoice Attachment</p>
                      <p className="text-body-sm text-on-surface font-bold truncate max-w-[200px]">{uploadedFile.name}</p>
                    </div>
                    {uploadedFilePreview && uploadedFilePreview !== 'pdf-placeholder' && (
                      <img className="w-10 h-10 object-cover rounded-lg border shadow-sm" src={uploadedFilePreview} alt="Bill file" />
                    )}
                    {uploadedFilePreview === 'pdf-placeholder' && (
                      <span className="material-symbols-outlined text-red-500 text-3xl">picture_as_pdf</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="pt-lg shrink-0">
          <button 
            type="button"
            onClick={step === 3 ? handleSubmit : handleNext}
            disabled={isLoadingSubmit}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {isLoadingSubmit ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Submitting Request...</span>
              </>
            ) : (
              <>
                <span>{step === 3 ? 'Submit Request' : 'Continue'}</span>
                <span className="material-symbols-outlined text-body-lg">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
