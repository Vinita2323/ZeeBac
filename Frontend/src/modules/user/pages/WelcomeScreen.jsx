import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tiltStyle, setTiltStyle] = useState({});

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate('/login');
    }
  };

  const handleSkip = () => {
    navigate('/login');
  };

  // Step 1: Mouse movement tracking for 3D map tilt effect
  const handleMouseMove = (e) => {
    if (currentStep !== 0) return;
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;
    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg)`
    });
  };

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col justify-between text-on-surface bg-[#f9f9ff] relative select-none font-body-lg">
      {/* Top Header */}
      <header className="w-full flex justify-end items-center px-container-margin h-16 shrink-0">
        {currentStep < 2 && (
          <button 
            onClick={handleSkip}
            className="font-title-md text-on-surface-variant hover:opacity-80 transition-opacity cursor-pointer text-caption"
          >
            Skip
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col items-center justify-center px-container-margin py-2 max-w-[440px] mx-auto w-full transition-all duration-700 ease-out overflow-hidden ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        
        {/* Step 1: Discover Nearby Vendors */}
        {currentStep === 0 && (
          <div className="w-full flex flex-col items-center">
            {/* 3D Map Component Container */}
            <div 
              className="relative w-full max-w-[320px] aspect-[4/3] mb-6 flex items-center justify-center cursor-pointer"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Blobs */}
              <div className="absolute w-64 h-64 bg-secondary-fixed/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
              <div className="absolute w-48 h-48 bg-primary-fixed/15 rounded-full blur-3xl -z-10 translate-x-12 -translate-y-8"></div>
              
              {/* Illustration Area */}
              <div className="relative w-full h-full flex items-center justify-center p-2">
                <div 
                  className="relative w-full h-full glass-card rounded-2xl overflow-hidden shadow-xl transition-transform duration-200 ease-out float-animation"
                  style={tiltStyle}
                >
                  <img 
                    className="w-full h-full object-cover opacity-90 scale-110 pointer-events-none" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDR6lU_paT8suC7Y0iuxSdd3IQutJ4oAMJoxi8Hld2bUHqknZu3WDUqoyqEhC_MFk9jyqJul5eZn7HsXPkmdKlzf3x8Z2DukeQBh76A8_-OOA2OyZt3qLNpgMzq_0k2UMiu9tLuKY9MY6ExlYAdno7W8RHZhbnfr0GPMITMoi2zCDxNinsgiECCW1KltHrs5rEK5lS1Q03EqFYvjyg5hlIIJA9TqONZtt7_wYzQ4JLOYhP_ZDOt_1wtkpmouL4orX0YGmaEoaCoUhZb"
                    alt="City Map"
                  />
                  {/* Location pins overlay */}
                  <div className="absolute top-1/4 left-1/3 w-8 h-8 flex items-center justify-center animate-[pulse_2s_infinite_ease-in-out]">
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                  </div>
                  <div className="absolute bottom-1/3 right-1/4 w-8 h-8 flex items-center justify-center animate-[pulse_2s_infinite_ease-in-out]" style={{ animationDelay: '0.5s' }}>
                    <span className="material-symbols-outlined text-secondary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                  </div>
                  <div className="absolute top-1/2 right-1/3 w-8 h-8 flex items-center justify-center animate-[pulse_2s_infinite_ease-in-out]" style={{ animationDelay: '1.2s' }}>
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                  </div>
                  
                  {/* Offer floating card */}
                  <div className="absolute bottom-3 left-3 right-3 p-2.5 glass-card rounded-xl border-white/50 flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container">
                      <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                    </div>
                    <div className="flex-grow text-left">
                      <div className="font-title-md text-body-sm text-on-surface">Premium Fashion</div>
                      <div className="font-caption text-[12px] text-primary font-bold">15% Cashback nearby</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text content */}
            <div className="text-center space-y-md">
              <h1 className="text-headline-lg-mobile text-on-surface font-black tracking-tight">
                Discover Nearby Vendors
              </h1>
            </div>
          </div>
        )}

        {/* Step 2: Earn Cashback */}
        {currentStep === 1 && (
          <div className="w-full flex flex-col items-center">
            {/* Wallet & Coins Illustration Area */}
            <div className="relative w-full max-w-[320px] aspect-[4/3] flex items-center justify-center mb-6">
              <div className="absolute inset-0 bg-secondary/5 rounded-full scale-110 blur-3xl"></div>
              
              {/* Glass container */}
              <div className="relative z-10 w-full h-full rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 shadow-xl flex items-center justify-center overflow-hidden">
                <div className="relative float-animation scale-90">
                  {/* The Wallet */}
                  <div className="relative z-20 w-40 h-28 bg-primary-container rounded-xl shadow-lg flex flex-col items-center justify-center border border-white/20">
                    <span className="material-symbols-outlined text-white text-[56px]" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                    <div className="absolute -top-3 -right-3 bg-secondary text-white w-10 h-10 rounded-full flex items-center justify-center border-2 border-surface shadow-md">
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    </div>
                  </div>
                  
                  {/* Particles */}
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    <div className="absolute -top-12 left-10 text-secondary-fixed-dim animate-[coin-fall_2s_infinite_linear]" style={{ animationDelay: '0.2s' }}>
                      <span className="material-symbols-outlined text-3xl">currency_exchange</span>
                    </div>
                    <div className="absolute -top-20 left-24 text-secondary animate-[coin-fall_2s_infinite_linear]" style={{ animationDelay: '0.7s' }}>
                      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
                    </div>
                    <div className="absolute -top-8 right-8 text-on-primary-container animate-[coin-fall_2s_infinite_linear]" style={{ animationDelay: '1.2s' }}>
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>monetization_on</span>
                    </div>
                  </div>
                </div>
                
                {/* Data grid */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#420093 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              </div>

              {/* Side Accent (Bento metal card) */}
              <div className="absolute -bottom-4 -right-2 w-24 h-24 rounded-2xl overflow-hidden border-2 border-surface shadow-xl z-30">
                <img 
                  className="w-full h-full object-cover" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCek6Qqfna9I0EwH5TU1y-WDUo4klPNl2WQ-d-bdDy7I-GqtHDS61K7BrgeDgRhD3ge8p_GN9dJxnxep8XKqjN-CPyGbf9DT9B9WMtJbqyGvdjPWEbQJbLRzgiHPa5y9u2aZhTPhlRoObRoOd6LiaG5Za2ayy-DsNWvSDQNREp-tlP4TfwlIMp1_2Liz0hN1AoiYMj2cCX_KF5wo3yYJmfcqVgDK0zIXptrf-Hsnck4TFfSxW__kbnf7MKIGYvcYkgiLDpMJ285KsZS" 
                  alt="Metal card"
                />
              </div>
            </div>

            {/* Text Content */}
            <div className="text-center space-y-md">
              <h1 className="text-headline-lg-mobile text-primary font-black tracking-tight">
                Earn Cashback on Every Purchase
              </h1>
            </div>
          </div>
        )}

        {/* Step 3: Refer & Earn */}
        {currentStep === 2 && (
          <div className="w-full flex flex-col items-center animate-reveal">
            {/* Referral Illustration Area */}
            <div className="relative w-full max-w-[320px] aspect-[4/3] flex items-center justify-center mb-6">
              <div className="absolute inset-0 bg-primary/5 rounded-full scale-110 blur-3xl"></div>
              
              {/* Glassmorphism card container */}
              <div className="relative z-10 w-full h-full rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 shadow-xl flex flex-col items-center justify-center overflow-hidden p-4">
                
                {/* Central Gift visual */}
                <div className="relative float-animation mb-3 scale-90">
                  <div className="w-24 h-24 bg-secondary rounded-[1.8rem] flex items-center justify-center shadow-lg border border-white/30 text-white">
                    <span className="material-symbols-outlined text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-primary-container text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-surface shadow-md">
                    <span className="material-symbols-outlined text-sm">share</span>
                  </div>
                </div>

                {/* Promo Code box */}
                <div className="w-full max-w-[200px] bg-white/60 border border-outline-variant/50 rounded-xl py-1.5 px-3 flex items-center justify-between shadow-inner">
                  <div>
                    <p className="font-caption text-[10px] text-on-surface-variant uppercase tracking-widest text-left">Your Invite Code</p>
                    <p className="font-display text-body-lg text-primary tracking-wider font-extrabold text-left">ZEEBAC25</p>
                  </div>
                  <span className="material-symbols-outlined text-secondary hover:scale-105 active:scale-95 transition-transform cursor-pointer">content_copy</span>
                </div>
              </div>
            </div>

            {/* Text Content */}
            <div className="text-center space-y-md">
              <h1 className="text-headline-lg-mobile text-secondary font-black tracking-tight">
                Invite Friends, Earn Bonuses
              </h1>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Footer Actions */}
      <footer className="w-full max-w-[440px] mx-auto p-container-margin flex flex-col items-center gap-md shrink-0 pb-6 z-50">
        {/* Carousel indicators */}
        <div className="flex gap-sm">
          <div className={`h-2 rounded-full transition-all duration-300 ${currentStep === 0 ? 'w-8 bg-primary' : 'w-2 bg-outline-variant'}`}></div>
          <div className={`h-2 rounded-full transition-all duration-300 ${currentStep === 1 ? 'w-8 bg-primary' : 'w-2 bg-outline-variant'}`}></div>
          <div className={`h-2 rounded-full transition-all duration-300 ${currentStep === 2 ? 'w-8 bg-primary' : 'w-2 bg-outline-variant'}`}></div>
        </div>

        {/* Action Button */}
        <div className="w-full flex flex-col gap-sm">
          <button 
            onClick={handleNext}
            className="w-full h-14 btn-primary-gradient text-white rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg active:scale-95 transition-transform duration-100 cursor-pointer"
          >
            {currentStep === 2 ? 'Get Started' : 'Next'}
            <span className="material-symbols-outlined text-body-lg">arrow_forward</span>
          </button>

          {currentStep === 1 && (
            <button 
              onClick={() => alert('Tutorial placeholder')}
              className="w-full h-12 bg-transparent text-secondary border border-secondary/35 rounded-xl font-title-md active:opacity-75 transition-opacity"
            >
              Learn how it works
            </button>
          )}
        </div>
      </footer>

      <style>{`
        @keyframes coin-fall {
          0% { transform: translateY(-40px) scale(0.5); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(120px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
