import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI, SupportAPI } from '../../../services/api';

export default function SupportPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [faqs, setFaqs] = useState([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    fetchTickets();
    fetchFaqs();
  }, []);

  const fetchFaqs = async () => {
    try {
      setIsLoadingFaqs(true);
      const res = await SupportAPI.getFaqs('vendor');
      if (res.success) {
        setFaqs(res.data || []);
      }
    } catch (err) {
      console.warn("Failed to load vendor FAQs", err);
    } finally {
      setIsLoadingFaqs(false);
    }
  };

  const fetchTickets = async () => {
    try {
      setIsLoadingTickets(true);
      const res = await VendorAPI.getMySupportTickets();
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
      const res = await VendorAPI.createSupportTicket(subject, message);
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

  return (
    <div className="animate-reveal pb-[100px] text-left">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Help & Support</span>
      </header>

      <div className="space-y-6 pt-1">
        <div className="text-center space-y-2 pb-4 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-primary text-[48px] animate-bounce">contact_support</span>
          <h2 className="text-[20px] font-black text-on-surface font-display">Vendor Support</h2>
          <p className="text-[13px] text-on-surface-variant">We are here to help you grow your business.</p>
        </div>

        {/* Quick Contact Channels (WhatsApp & Call) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://wa.me/919111966732?text=Hello%20Zeebac%20Support,%20I%20am%20a%20partner%20store%20and%20need%20assistance."
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-[#25D366] text-white rounded-2xl flex items-center justify-between shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 active:scale-[0.98] transition-all cursor-pointer group"
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
                <p className="text-[12px] text-white/95 font-medium mt-0.5">+91 91119 66732 · Merchant Help</p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-transform shrink-0">
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </div>
          </a>

          <a
            href="tel:+919111966732"
            className="p-4 bg-white border border-outline-variant/20 hover:border-primary/30 text-on-surface rounded-2xl flex items-center justify-between shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">phone_in_talk</span>
              </div>
              <div className="text-left">
                <span className="font-bold text-[14.5px] leading-tight block text-on-surface">Call Helpline</span>
                <p className="text-[12px] text-on-surface-variant font-medium mt-0.5">+91 91119 66732 · Toll-Free</p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center group-hover:translate-x-1 transition-transform shrink-0 text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">call</span>
            </div>
          </a>
        </div>

        {/* FAQs */}
        <div className="space-y-3">
          <h3 className="font-bold text-[15px] text-on-surface">Frequently Asked Questions</h3>
          {isLoadingFaqs ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-12 bg-white/70 animate-pulse rounded-2xl border border-outline-variant/10" />
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-6 bg-white/60 rounded-2xl border border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-outline text-[32px]">help_outline</span>
              <p className="text-[13px] font-bold text-on-surface mt-1">No FAQs available</p>
            </div>
          ) : (
            faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              const questionText = faq.question || faq.q;
              const answerText = faq.answer || faq.a;
              return (
                <div 
                  key={faq._id || index} 
                  className="bg-white border border-outline-variant/10 rounded-2xl overflow-hidden shadow-sm"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full p-4 flex justify-between items-center text-left font-bold text-[13px] text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 pr-2">
                      {faq.category && (
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100 shrink-0">
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
                    <div className="px-4 pb-4 text-[12px] text-on-surface-variant leading-relaxed animate-reveal border-t border-outline-variant/10 pt-2.5">
                      {answerText}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Support Tickets */}
        <div className="pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-[15px] text-on-surface">My Support Tickets</h3>
            <button 
              onClick={() => setShowForm(!showForm)}
              className="text-primary font-bold text-[12px] bg-primary/10 px-3 py-1 rounded-full cursor-pointer hover:bg-primary/20 active:scale-95 transition-transform"
            >
              {showForm ? 'Cancel' : '+ New Ticket'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmitTicket} className="bg-white p-4 rounded-2xl shadow-sm border border-outline-variant/10 mb-6 space-y-4 animate-reveal">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-[13px] text-on-surface focus:border-primary focus:outline-none"
                  placeholder="E.g., Issue with Wallet withdrawal"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows="3"
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-[13px] text-on-surface focus:border-primary focus:outline-none resize-none"
                  placeholder="Describe your issue..."
                ></textarea>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !subject || !message}
                className={`w-full h-12 rounded-xl font-bold flex items-center justify-center transition-all ${
                  isSubmitting || !subject || !message ? 'bg-outline-variant/40 text-on-surface/40 cursor-not-allowed' : 'bg-primary text-white cursor-pointer active:scale-95 shadow-md'
                }`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </form>
          )}

          {isLoadingTickets ? (
            <div className="text-center py-6 text-[13px] font-bold text-on-surface-variant">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl shadow-sm border border-outline-variant/10 text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px] opacity-50 mb-2 block">inbox</span>
              <span className="text-[13px] font-bold">No tickets yet</span>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map(ticket => (
                <div key={ticket._id} className="bg-white p-4 rounded-2xl shadow-sm border border-outline-variant/10 text-[13px]">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-[14px] text-on-surface">{ticket.subject}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      ticket.status === 'Resolved' ? 'bg-green-100 text-green-700' :
                      ticket.status === 'Open' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-on-surface-variant mb-2 leading-relaxed">{ticket.message}</p>
                  {ticket.adminReply && (
                    <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 mt-3 relative">
                      <div className="absolute -left-3 top-4 w-3 h-[1px] bg-primary/20"></div>
                      <span className="text-[10px] font-black text-primary block mb-1 uppercase tracking-widest flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">support_agent</span> Zeebac Support
                      </span>
                      <p className="text-[12px] text-on-surface-variant font-medium">{ticket.adminReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
