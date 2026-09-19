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
