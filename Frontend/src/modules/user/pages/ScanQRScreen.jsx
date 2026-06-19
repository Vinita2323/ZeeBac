import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ScanQRScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [vendorId, setVendorId] = useState('');
  const [showIdInput, setShowIdInput] = useState(false);
  const [error, setError] = useState('');

  const lookupVendor = (query) => {
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const clean = query.trim().toUpperCase();
    return users.find(u =>
      u.role === 'vendor' && (
        (u.zeebacId && u.zeebacId.toUpperCase() === clean) ||
        u.phone === query.trim()
      )
    );
  };

  const handleManualSearch = () => {
    if (!vendorId.trim()) return;
    setError('');
    const vendor = lookupVendor(vendorId);
    if (vendor) {
      navigate('/pay-vendor', { state: { vendor } });
    } else {
      setError('No vendor found. Check the ID and try again.');
    }
  };

  const handleSimulateScan = () => {
    // Find any registered vendor to simulate scanning their QR
    const users = JSON.parse(localStorage.getItem('zeebac_users') || '[]');
    const vendors = users.filter(u => u.role === 'vendor');
    if (vendors.length > 0) {
      const randomVendor = vendors[Math.floor(Math.random() * vendors.length)];
      navigate('/pay-vendor', { state: { vendor: randomVendor } });
    } else {
      setError('No vendors registered yet. Ask a vendor to sign up first!');
    }
  };

  const handleGalleryClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      // Simulate QR from image — treat as simulated scan
      handleSimulateScan();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative font-body-lg select-none">
      
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      {/* Viewfinder Layer */}
      <div className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center">
        <div className="text-center p-md space-y-sm z-10 text-neutral-500 select-none">
          <span className="material-symbols-outlined text-[48px] animate-pulse">qr_code_scanner</span>
          <p className="text-body-sm font-semibold text-neutral-400">Point camera at vendor's QR code</p>
          <p className="text-[10px] text-neutral-600 max-w-[240px] mx-auto leading-relaxed">
            Or use the options below to enter vendor details manually
          </p>
        </div>

        {/* Scanning Guideline box */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-64 h-64 border-2 border-dashed border-[#a67cff]/60 rounded-3xl relative flex items-center justify-center">
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>
            <div className="absolute left-1 right-1 h-0.5 bg-[#a67cff] shadow-[0_0_10px_#a67cff] animate-[laser_2.5s_infinite_ease-in-out]"></div>
          </div>
        </div>
      </div>

      {/* Top Header */}
      <div className="absolute top-6 left-0 right-0 px-5 flex items-center justify-between z-20">
        <button 
          onClick={() => navigate('/home')}
          className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        
        <button 
          onClick={handleSimulateScan}
          className="px-4 py-2 rounded-full bg-[#a67cff] text-white text-[12px] font-bold hover:bg-[#9062e8] transition-colors active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-lg"
        >
          <span className="material-symbols-outlined text-[16px]">flash_on</span>
          Simulate Scan
        </button>
        
        <div className="w-10 h-10" />
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-24 left-0 right-0 px-8 flex justify-between items-center z-20">
        <button 
          onClick={handleGalleryClick}
          className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">image</span>
        </button>

        <button 
          onClick={() => setShowIdInput(!showIdInput)}
          className={`px-5 py-3 rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer text-[13px] font-bold ${
            showIdInput 
              ? 'bg-[#a67cff] text-white' 
              : 'bg-white/90 text-black'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dialpad</span>
          Enter ID
        </button>

        <button 
          onClick={() => navigate('/find-vendor')}
          className="w-12 h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 shadow-lg active:scale-95 transition-all cursor-pointer border border-white/10"
        >
          <span className="material-symbols-outlined text-[24px]">search</span>
        </button>
      </div>

      {/* Manual ID Input Panel */}
      {showIdInput && (
        <div className="absolute bottom-44 left-4 right-4 z-30 animate-reveal">
          <div className="bg-white rounded-2xl p-4 shadow-2xl max-w-[400px] mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
              <span className="text-[13px] font-bold text-on-surface">Enter Vendor's Zeebac ID</span>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={vendorId}
                onChange={(e) => { setVendorId(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="ZBV-1234"
                className="flex-1 h-12 px-4 bg-[#f3f4f6] rounded-xl outline-none border-2 border-transparent focus:border-primary text-[15px] font-bold text-on-surface uppercase transition-all"
              />
              <button
                onClick={handleManualSearch}
                disabled={!vendorId.trim()}
                className="h-12 px-5 bg-primary text-white rounded-xl font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
            {error && (
              <p className="text-red-500 text-[11px] font-medium mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Laser animation */}
      <style>{`
        @keyframes laser {
          0% { top: 4%; }
          50% { top: 96%; }
          100% { top: 4%; }
        }
      `}</style>
    </div>
  );
}
