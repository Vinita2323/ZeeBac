import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ScanQRScreen() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState('1.5X');

  useEffect(() => {
    // Request back-facing camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { exact: 'environment' } } 
      })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      })
      .catch((err) => {
        // Fallback to any camera if environment camera is not available
        navigator.mediaDevices.getUserMedia({ video: true })
          .then((mediaStream) => {
            setStream(mediaStream);
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
          })
          .catch((e) => {
            console.log("No camera available:", e);
            setCameraError(true);
          });
      });
    } else {
      setCameraError(true);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleTorch = () => {
    const nextTorch = !torchOn;
    setTorchOn(nextTorch);
    
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.torch) {
            track.applyConstraints({
              advanced: [{ torch: nextTorch }]
            });
          }
        } catch (e) {
          console.log("Torch constraint not supported in browser:", e);
        }
      }
    }
  };

  const handleZoomToggle = () => {
    setZoom(prev => {
      if (prev === '1.0X') return '1.5X';
      if (prev === '1.5X') return '2.0X';
      return '1.0X';
    });
  };

  const handleGalleryClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      alert("QR Code image uploaded! Processing transaction...");
      // Simulate successful scan redirecting to transaction
      navigate('/create-transaction', {
        state: {
          vendor: {
            id: 99,
            name: "Uploaded Merchant QR",
            cashback: "FLAT 10% CASHBACK",
            img: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&h=300&q=80"
          }
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative font-body-lg select-none">
      
      {/* Hidden File Input for Gallery */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Viewfinder Layer */}
      <div className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center">
        {!cameraError ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="text-center p-md space-y-sm z-10 text-neutral-500 select-none">
            <span className="material-symbols-outlined text-[48px] animate-pulse">videocam_off</span>
            <p className="text-body-sm font-semibold">Camera Access Unavailable</p>
            <p className="text-[10px] text-neutral-600 max-w-[240px] mx-auto leading-relaxed">
              We'll use a simulated scanning interface. Point your device to scan a merchant QR code.
            </p>
          </div>
        )}

        {/* Pulsing Scanning Guideline box */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-64 h-64 border-2 border-dashed border-[#a67cff]/60 rounded-3xl relative flex items-center justify-center">
            {/* Corner Bracket styling */}
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>

            {/* Laser Line */}
            <div className="absolute left-1 right-1 h-0.5 bg-[#a67cff] shadow-[0_0_10px_#a67cff] animate-[laser_2.5s_infinite_ease-in-out]"></div>
          </div>
        </div>
      </div>

      {/* Top Header Controls */}
      <div className="absolute top-6 left-0 right-0 px-container-margin flex items-center justify-between z-20">
        <button 
          onClick={() => navigate('/home')}
          className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        
        <button 
          onClick={handleZoomToggle}
          className="px-4 py-1.5 rounded-full bg-black/40 text-white text-[12px] font-bold border border-white/10 hover:bg-black/60 transition-colors active:scale-95 cursor-pointer uppercase tracking-wider"
        >
          {zoom} Zoom
        </button>
        
        <div className="w-10 h-10" /> {/* Spacer */}
      </div>

      {/* Bottom controls: Flashlight & Gallery */}
      <div className="absolute bottom-24 left-0 right-0 px-8 flex justify-between items-center z-20">
        <button 
          onClick={toggleTorch}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer ${
            torchOn ? 'bg-yellow-400 text-black' : 'bg-white text-black'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: `'FILL' ${torchOn ? 1 : 0}` }}>
            flashlight_on
          </span>
        </button>

        <button 
          onClick={handleGalleryClick}
          className="w-12 h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 shadow-lg active:scale-95 transition-all cursor-pointer border border-white/10"
        >
          <span className="material-symbols-outlined text-[24px]">image</span>
        </button>
      </div>

      {/* Bottom Search & Recents Bar */}
      <div 
        onClick={() => navigate('/create-transaction')}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[400px] h-14 bg-white text-black rounded-full shadow-2xl flex items-center px-4 justify-between cursor-pointer border border-gray-100 z-20 hover:scale-[1.01] transition-transform"
      >
        <div className="flex items-center gap-2 flex-grow">
          <span className="material-symbols-outlined text-gray-500 text-[20px]">search</span>
          <span className="text-[13px] text-gray-500 font-bold">Enter Mob. Number or ID</span>
        </div>
        
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="flex -space-x-1.5">
            <div className="w-6 h-6 rounded-full bg-green-500 text-white font-black text-[9px] flex items-center justify-center border border-white">M</div>
            <div className="w-6 h-6 rounded-full bg-[#420093] text-white font-black text-[9px] flex items-center justify-center border border-white">Z</div>
          </div>
          <span className="text-[11px] text-gray-600 font-bold">Recents</span>
        </div>
      </div>

      {/* Embedded styles for laser sweep */}
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
