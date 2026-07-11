import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserAPI } from '../../../services/api';

export default function CreateTransactionScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState(location.state?.vendor || null);

  const [recentContacts, setRecentContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    UserAPI.getRecentVendors()
      .then(res => {
        if (res.success) {
          const formatted = res.data.map(v => ({
            id: v._id,
            name: v.storeName,
            cashback: `UP TO ${v.cashbackRate}% CASHBACK`,
            img: (v.storeLogo || v.profilePic)
              ? ((v.storeLogo || v.profilePic).startsWith('http') || (v.storeLogo || v.profilePic).startsWith('data:') 
                  ? (v.storeLogo || v.profilePic) 
                  : `${import.meta.env.VITE_API_URL}${v.storeLogo || v.profilePic}`)
              : "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=150&h=150&q=80",
            zeebacId: v.zeebacId,
            originalVendor: v
          }));
          setRecentContacts(formatted);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSelectRecipient = (contact) => {
    navigate('/pay-vendor', { state: { vendor: contact.originalVendor } });
  };

  const isRecipientValid = recipientInput.trim().length >= 3;

  const handleRecipientSubmit = async (e) => {
    e.preventDefault();
    if (!isRecipientValid) return;
    
    // In a real app, we would search the DB for the ZeebacID/Mobile
    // For now, if they type an ID manually, we fetch a vendor details
    setIsSubmitting(true);
    try {
      const res = await UserAPI.getVendorDetails(recipientInput);
      if (res.success && res.data) {
        navigate('/pay-vendor', { state: { vendor: res.data } });
      } else {
        alert("Vendor not found with this ID.");
      }
    } catch (err) {
      alert("Error finding vendor");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9ff] text-on-surface font-body-lg">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-transform active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary ml-4">Enter Mobile / ID</span>
        </header>

        {/* Content Form Body */}
        <main className="flex-grow max-w-[440px] mx-auto w-full px-container-margin py-xl flex flex-col justify-between text-left">
          <div className="space-y-lg flex-grow">
            <div className="space-y-xs text-left">
              <label className="block text-caption text-on-surface-variant font-bold tracking-wider uppercase">RECIPIENT MOBILE OR ID</label>
              <div className="h-[56px] relative">
                <input 
                  autoFocus
                  className="w-full h-full px-md bg-[#F3F4F6] rounded-xl border border-transparent outline-none focus:border-[#420093] focus:bg-white text-body-lg placeholder:text-outline transition-all"
                  placeholder="Enter 10-digit number or ID" 
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                />
              </div>
            </div>

            {/* Recent list */}
            <div className="space-y-md">
              <h3 className="font-display text-body-sm font-extrabold text-on-surface-variant uppercase tracking-wider">Recent Contacts</h3>
              
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-outline-variant/10 animate-pulse rounded-2xl w-full" />
                  ))}
                </div>
              ) : recentContacts.length > 0 ? (
                <div className="grid grid-cols-1 gap-md">
                  {recentContacts.map((contact) => (
                    <div 
                      key={contact.id}
                      onClick={() => handleSelectRecipient(contact)}
                      className="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center p-sm border border-outline-variant/30 gap-md active:scale-[0.98]"
                    >
                      <img 
                        alt={contact.name} 
                        className="w-10 h-10 rounded-full object-cover animate-reveal" 
                        src={contact.img}
                      />
                      <div className="flex-grow text-left">
                        <h4 className="font-title-md text-on-surface font-bold text-body-lg">{contact.name}</h4>
                        <p className="text-caption text-primary font-bold text-[11px]">{contact.cashback}</p>
                      </div>
                      <span className="material-symbols-outlined text-primary text-[20px]">chevron_right</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">contact_page</span>
                  <p className="text-body-sm">No recent contacts found</p>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleRecipientSubmit} className="w-full pt-lg">
            <button 
              type="submit"
              disabled={!isRecipientValid || isSubmitting}
              className={`w-full h-14 rounded-xl font-title-md flex items-center justify-center gap-sm shadow-lg transition-transform duration-100 ${
                isRecipientValid && !isSubmitting
                  ? 'btn-primary-gradient text-white active:scale-95 cursor-pointer'
                  : 'bg-outline-variant/60 text-on-surface/40 cursor-not-allowed opacity-50'
              }`}
            >
              {isSubmitting ? 'Searching...' : 'Continue'}
            </button>
          </form>
        </main>
      </div>
  );
}


