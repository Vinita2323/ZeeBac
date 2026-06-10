import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const VENDORS_LIST = [
  { id: "ZB-VND-001", name: "Noir Concept Store", cashbackRate: 0.15 },
  { id: "ZB-VND-002", name: "Fresh Foods Organic", cashbackRate: 0.08 },
  { id: "ZB-VND-003", name: "L'Artusi Restaurant", cashbackRate: 0.10 }
];

export default function RequestCashbackScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSuccess, setIsSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Form State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [billAmount, setBillAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [description, setDescription] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFilePreview, setUploadedFilePreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Mock Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState('');
  const [submittedDateTime, setSubmittedDateTime] = useState('');

  const fileInputRef = useRef(null);

  const handleVendorSelect = (vendor) => {
    setSelectedVendor(vendor);
    setSearchQuery(vendor.name);
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

  const triggerMockCamera = () => {
    setIsCameraActive(true);
    setTimeout(() => {
      // Simulate taking a photo of a receipt after 1.5 seconds
      setUploadedFile({ name: 'receipt_camera_capture.jpg', type: 'image/jpeg' });
      setUploadedFilePreview('https://lh3.googleusercontent.com/aida-public/AB6AXuCek6Qqfna9I0EwH5TU1y-WDUo4klPNl2WQ-d-bdDy7I-GqtHDS61K7BrgeDgRhD3ge8p_GN9dJxnxep8XKqjN-CPyGbf9DT9B9WMtJbqyGvdjPWEbQJbLRzgiHPa5y9u2aZhTPhlRoObRoOd6LiaG5Za2ayy-DsNWvSDQNREp-tlP4TfwlIMp1_2Liz0hN1AoiYMj2cCX_KF5wo3yYJmfcqVgDK0zIXptrf-Hsnck4TFfSxW__kbnf7MKIGYvcYkgiLDpMJ285KsZS');
      setIsCameraActive(false);
      setErrorMsg('');
    }, 1500);
  };

  const validateStep = () => {
    if (step === 1) {
      if (!selectedVendor) {
        setErrorMsg('Please select a vendor.');
        return false;
      }
    } else if (step === 2) {
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
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    setStep(step - 1);
  };

  const handleSubmit = () => {
    const reqId = `CR-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateTimeStr = `${formattedDate} • ${formattedTime}`;

    const newRequest = {
      id: reqId,
      vendorName: selectedVendor.name,
      vendorId: selectedVendor.id,
      amount: parseFloat(billAmount).toFixed(2),
      cashbackAmount: (parseFloat(billAmount) * selectedVendor.cashbackRate).toFixed(2),
      date: purchaseDate,
      paymentMethod,
      description,
      status: 'Pending',
      submittedAt: dateTimeStr,
      billImg: uploadedFilePreview === 'pdf-placeholder' ? null : uploadedFilePreview,
      timeline: [
        { name: "Draft", completed: true, date: dateTimeStr },
        { name: "Submitted", completed: true, date: dateTimeStr },
        { name: "Pending Vendor Approval", completed: true, date: dateTimeStr },
        { name: "Under Verification", completed: false },
        { name: "Approved / Rejected", completed: false },
        { name: "Wallet Credited", completed: false }
      ]
    };

    // Save to LocalStorage
    const existing = JSON.parse(localStorage.getItem('cashback_requests')) || [];
    localStorage.setItem('cashback_requests', JSON.stringify([newRequest, ...existing]));

    setSubmittedRequestId(reqId);
    setSubmittedDateTime(dateTimeStr);
    setIsSuccess(true);
  };

  const filteredVendors = VENDORS_LIST.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isSuccess) {
    return (
      <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col items-center justify-center p-container-margin select-none font-body-lg">
        <main className="w-full max-w-[440px] bg-white border border-outline-variant/20 shadow-2xl rounded-3xl p-lg space-y-lg text-center animate-reveal">
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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm justify-between">
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
      </header>

      {/* Main Form container */}
      <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-lg flex flex-col justify-between text-left">
        
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
                  <div className="absolute left-0 right-0 mt-xs bg-white border border-outline-variant/30 rounded-xl shadow-xl z-50 overflow-hidden">
                    {filteredVendors.map(vendor => (
                      <div 
                        key={vendor.id}
                        onClick={() => handleVendorSelect(vendor)}
                        className="px-md py-sm hover:bg-primary/5 cursor-pointer flex items-center justify-between border-b border-outline-variant/10 last:border-none"
                      >
                        <div>
                          <p className="font-title-md text-on-surface text-body-lg font-bold">{vendor.name}</p>
                          <p className="font-caption text-[11px] text-on-surface-variant uppercase tracking-wider">ID: {vendor.id}</p>
                        </div>
                        <span className="bg-primary/10 text-primary font-label-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {vendor.cashbackRate * 100}% BACK
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedVendor && (
                <div className="glass-card rounded-2xl p-md border border-outline-variant/30 text-left space-y-xs animate-reveal">
                  <span className="text-[10px] uppercase font-bold text-primary tracking-widest">SELECTED PARTNER</span>
                  <h3 className="font-display text-title-md font-black text-on-surface pt-1">{selectedVendor.name}</h3>
                  <div className="grid grid-cols-2 gap-sm pt-sm border-t border-outline-variant/10 text-body-sm text-on-surface-variant">
                    <div>
                      <p className="font-caption text-[10px] uppercase">Vendor ID</p>
                      <p className="font-bold text-on-surface">{selectedVendor.id}</p>
                    </div>
                    <div>
                      <p className="font-caption text-[10px] uppercase">Cashback Rate</p>
                      <p className="font-bold text-primary">{(selectedVendor.cashbackRate * 100).toFixed(0)}% Cashback</p>
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
                  <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase mb-xs">Bill Amount ($)</label>
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
                  {isCameraActive ? (
                    <div className="w-full h-[100px] bg-black rounded-xl relative flex flex-col items-center justify-center overflow-hidden animate-pulse">
                      <span className="material-symbols-outlined text-white text-[24px] animate-spin">photo_camera</span>
                      <p className="text-white text-[10px] font-semibold mt-1 tracking-widest">CAPTURING RECEIPT...</p>
                    </div>
                  ) : uploadedFile ? (
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
                        onClick={() => fileInputRef.current.click()}
                        className="flex-1 h-[48px] bg-white border border-outline-variant/40 rounded-xl flex items-center justify-center gap-2 text-primary font-bold text-[13px] hover:bg-surface-container-low transition-colors cursor-pointer shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">image</span>
                        Choose from Gallery
                      </button>
                      <button
                        type="button"
                        onClick={triggerMockCamera}
                        className="h-[48px] px-4 bg-white border border-outline-variant/40 rounded-xl flex items-center justify-center text-secondary hover:bg-surface-container-low transition-colors cursor-pointer shadow-sm"
                        title="Take Camera Photo"
                      >
                        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                      </button>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".jpg,.jpeg,.png,.pdf"
                  />
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
                  <div>
                    <p className="font-caption text-[10px] uppercase">Purchase Date</p>
                    <p className="font-bold text-on-surface">{purchaseDate}</p>
                  </div>
                  <div>
                    <p className="font-caption text-[10px] uppercase">Payment Method</p>
                    <p className="font-bold text-on-surface">{paymentMethod}</p>
                  </div>
                  <div>
                    <p className="font-caption text-[10px] uppercase">Bill Amount</p>
                    <p className="font-bold text-on-surface">${parseFloat(billAmount).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="font-caption text-[10px] uppercase text-secondary font-bold">Estimated Cashback</p>
                    <p className="font-bold text-secondary font-display text-body-lg">
                      +${(parseFloat(billAmount) * selectedVendor.cashbackRate).toFixed(2)}
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
            onClick={step === 3 ? handleSubmit : handleNext}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer"
          >
            <span>{step === 3 ? 'Submit Request' : 'Continue'}</span>
            <span className="material-symbols-outlined text-body-lg">arrow_forward</span>
          </button>
        </div>
      </main>
    </div>
  );
}
