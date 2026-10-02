import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function SupportPage() {
  const [pageTab, setPageTab] = useState('tickets'); // 'tickets' | 'faqs'

  // ─── Support Tickets State ───
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ all: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  
  // Ticket Filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [userTypeFilter, setUserTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active selected ticket & reply state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyStatus, setReplyStatus] = useState('Resolved');
  const [isReplying, setIsReplying] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  // New Ticket (admin-logged, e.g. a phone-in complaint) modal state
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({ userType: 'User', userId: '', userLabel: '', subject: '', message: '' });
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerSearchResults, setOwnerSearchResults] = useState([]);
  const [isSearchingOwners, setIsSearchingOwners] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);

  // ─── FAQ Management State ───
  const [faqs, setFaqs] = useState([]);
  const [faqCounts, setFaqCounts] = useState({ total: 0, customer: 0, vendor: 0, allAudience: 0, active: 0, inactive: 0 });
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(false);
  const [faqTargetFilter, setFaqTargetFilter] = useState('all');
  const [faqCategoryFilter, setFaqCategoryFilter] = useState('All');
  const [faqStatusFilter, setFaqStatusFilter] = useState('all');
  const [faqSearch, setFaqSearch] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState(null);

  // FAQ Modal state
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    category: 'General',
    target: 'all',
    order: 1,
    isActive: true,
  });
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // ─── Support Contact Settings State (WhatsApp, Phone, Email) ───
  const [supportConfig, setSupportConfig] = useState({
    supportWhatsapp: '+91 91119 66732',
    supportPhone: '+91 91119 66732',
    supportEmail: 'support@zeebac.com'
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const fetchSupportConfig = async () => {
    try {
      setIsLoadingConfig(true);
      const res = await AdminAPI.getSupportConfig();
      if (res.success && res.data) {
        setSupportConfig({
          supportWhatsapp: res.data.supportWhatsapp || '+91 91119 66732',
          supportPhone: res.data.supportPhone || '+91 91119 66732',
          supportEmail: res.data.supportEmail || 'support@zeebac.com'
        });
      }
    } catch (err) {
      console.error("Failed to load support config", err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleSaveSupportConfig = async (e) => {
    if (e) e.preventDefault();
    try {
      setIsSavingConfig(true);
      const res = await AdminAPI.updateSupportConfig(supportConfig);
      if (res.success) {
        showToast("WhatsApp support & helpline saved successfully!");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update support contact details");
    } finally {
      setIsSavingConfig(false);
    }
  };

  useEffect(() => {
    fetchSupportConfig();
  }, []);

  // ─── Ticket Fetching ───
  useEffect(() => {
    fetchTickets();
  }, [statusFilter, userTypeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTickets();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const res = await AdminAPI.getAllTickets(statusFilter, userTypeFilter, searchQuery);
      if (res.success) {
        setTickets(res.data || []);
        if (res.counts) setCounts(res.counts);
        if (selectedTicket) {
          const fresh = (res.data || []).find((t) => t._id === selectedTicket._id);
          if (fresh) setSelectedTicket(fresh);
        }
      }
    } catch (error) {
      console.error("Failed to load tickets", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── New Ticket: owner search (debounced) ───
  useEffect(() => {
    if (!isNewTicketModalOpen || !ownerSearchQuery.trim()) {
      setOwnerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearchingOwners(true);
        const res = newTicketForm.userType === 'Vendor'
          ? await AdminAPI.getVendors('', 1, ownerSearchQuery.trim())
          : await AdminAPI.getUsers(1, ownerSearchQuery.trim());
        if (res.success) setOwnerSearchResults(res.data || []);
      } catch (err) {
        console.error('Owner search failed', err);
      } finally {
        setIsSearchingOwners(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [ownerSearchQuery, newTicketForm.userType, isNewTicketModalOpen]);

  const openNewTicketModal = () => {
    setNewTicketForm({ userType: 'User', userId: '', userLabel: '', subject: '', message: '' });
    setOwnerSearchQuery('');
    setOwnerSearchResults([]);
    setIsNewTicketModalOpen(true);
  };

  const selectTicketOwner = (owner) => {
    setNewTicketForm((prev) => ({
      ...prev,
      userId: owner._id,
      userLabel: `${owner.name || owner.storeName || owner.ownerName || 'Unknown'} · ${owner.phone || 'No phone'}`,
    }));
    setOwnerSearchQuery('');
    setOwnerSearchResults([]);
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicketForm.userId || !newTicketForm.subject.trim() || !newTicketForm.message.trim()) return;
    try {
      setIsCreatingTicket(true);
      const res = await AdminAPI.createTicket({
        userId: newTicketForm.userId,
        userType: newTicketForm.userType,
        subject: newTicketForm.subject.trim(),
        message: newTicketForm.message.trim(),
      });
      if (res.success) {
        showToast('Ticket logged successfully');
        setIsNewTicketModalOpen(false);
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to create ticket', err);
      showToast(err.response?.data?.message || 'Failed to log ticket');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  // ─── FAQ Fetching ───
  const fetchFaqs = async () => {
    try {
      setIsLoadingFaqs(true);
      const res = await AdminAPI.getFaqs(faqTargetFilter, faqCategoryFilter, faqStatusFilter, faqSearch);
      if (res.success) {
        setFaqs(res.data || []);
        if (res.counts) setFaqCounts(res.counts);
      }
    } catch (err) {
      console.error("Failed to load admin FAQs", err);
    } finally {
      setIsLoadingFaqs(false);
    }
  };

  useEffect(() => {
    if (pageTab === 'faqs') {
      fetchFaqs();
    }
  }, [pageTab, faqTargetFilter, faqCategoryFilter, faqStatusFilter]);

  useEffect(() => {
    if (pageTab === 'faqs') {
      const timer = setTimeout(() => fetchFaqs(), 300);
      return () => clearTimeout(timer);
    }
  }, [faqSearch]);

  const handleOpenAddFaq = () => {
    setEditingFaq(null);
    setFaqForm({
      question: '',
      answer: '',
      category: 'General',
      target: faqTargetFilter !== 'all' ? faqTargetFilter : 'all',
      order: faqs.length + 1,
      isActive: true,
    });
    setIsFaqModalOpen(true);
  };

  const handleOpenEditFaq = (faq) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category || 'General',
      target: faq.target || 'all',
      order: faq.order ?? 0,
      isActive: faq.isActive ?? true,
    });
    setIsFaqModalOpen(true);
  };

  const handleSaveFaq = async (e) => {
    e.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      alert("Please fill in both the Question and Answer fields.");
      return;
    }
    try {
      setIsSavingFaq(true);
      if (editingFaq) {
        const res = await AdminAPI.updateFaq(editingFaq._id, faqForm);
        if (res.success) {
          showToast("FAQ updated successfully!");
          setIsFaqModalOpen(false);
          fetchFaqs();
        }
      } else {
        const res = await AdminAPI.createFaq(faqForm);
        if (res.success) {
          showToast("FAQ created successfully!");
          setIsFaqModalOpen(false);
          fetchFaqs();
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save FAQ");
    } finally {
      setIsSavingFaq(false);
    }
  };

  const handleToggleFaqStatus = async (faq) => {
    try {
      const res = await AdminAPI.toggleFaq(faq._id);
      if (res.success) {
        setFaqs(prev => prev.map(f => f._id === faq._id ? { ...f, isActive: !f.isActive } : f));
        showToast(`FAQ marked ${!faq.isActive ? 'Active' : 'Inactive'}`);
        setFaqCounts(c => ({
          ...c,
          active: !faq.isActive ? c.active + 1 : c.active - 1,
          inactive: !faq.isActive ? c.inactive - 1 : c.inactive + 1,
        }));
      }
    } catch (err) {
      alert("Failed to toggle status");
    }
  };

  const handleDeleteFaq = async (faq) => {
    if (!window.confirm(`Are you sure you want to delete this FAQ?\n\n"${faq.question}"`)) return;
    try {
      const res = await AdminAPI.deleteFaq(faq._id);
      if (res.success) {
        showToast("FAQ deleted successfully");
        fetchFaqs();
      }
    } catch (err) {
      alert("Failed to delete FAQ");
    }
  };

  // ─── Ticket Actions ───
  const handleReply = async (chosenStatus = replyStatus) => {
    if (!replyMessage.trim() || !selectedTicket) return;
    try {
      setIsReplying(true);
      const res = await AdminAPI.replyToTicket(selectedTicket._id, replyMessage.trim(), chosenStatus);
      if (res.success) {
        setReplyMessage('');
        fetchTickets();
        setSelectedTicket(res.data);
        showToast("Reply sent to user");
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to send reply");
    } finally {
      setIsReplying(false);
    }
  };

  const handleClose = async (id) => {
    if (!window.confirm('Are you sure you want to close this ticket?')) return;
    try {
      await AdminAPI.closeTicket(id);
      fetchTickets();
      if (selectedTicket?._id === id) {
        setSelectedTicket(prev => prev ? { ...prev, status: 'Closed' } : null);
      }
      showToast("Ticket marked as Closed");
    } catch (error) {
      alert("Failed to close ticket");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = new Date() - new Date(dateStr);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(label);
    setTimeout(() => setCopySuccess(''), 2000);
  };

  const quickSnippets = [
    "Your cashback request has been reviewed and verified.",
    "We have credited the bonus balance directly to your wallet.",
    "Please upload a clearer image of your bill invoice.",
    "Our merchant support team is looking into your inquiry."
  ];

  const faqCategories = ['All', 'General', 'Cashback', 'Wallet', 'Security', 'Account', 'Orders', 'Subscription'];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-reveal text-left">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-bounce text-[13px] font-bold">
          <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-title-lg font-display font-extrabold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">support_agent</span>
            Customer & Merchant Support
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Resolve user tickets, reply to inquiries, and manage dynamic Help FAQs in real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pageTab === 'faqs' && (
            <button
              onClick={handleOpenAddFaq}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-[13px] font-bold hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add New FAQ
            </button>
          )}
          <button
            onClick={pageTab === 'tickets' ? fetchTickets : fetchFaqs}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-outline-variant/30 rounded-xl text-[13px] font-bold text-on-surface hover:bg-surface-container transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Top Tab Switcher */}
      <div className="flex border-b border-outline-variant/20 gap-2">
        <button
          onClick={() => setPageTab('tickets')}
          className={`pb-3 px-4 text-[14px] font-bold transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
            pageTab === 'tickets'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">mark_email_unread</span>
          Support Tickets
          {counts.open > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500 text-white">
              {counts.open}
            </span>
          )}
        </button>

        <button
          onClick={() => setPageTab('faqs')}
          className={`pb-3 px-4 text-[14px] font-bold transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
            pageTab === 'faqs'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">quiz</span>
          FAQ Management
          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-primary/10 text-primary">
            {faqCounts.total}
          </span>
        </button>

        <button
          onClick={() => { setPageTab('contact'); fetchSupportConfig(); }}
          className={`pb-3 px-4 text-[14px] font-bold transition-colors flex items-center gap-2 border-b-2 cursor-pointer ${
            pageTab === 'contact'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">chat</span>
          WhatsApp & Helpline Settings
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: SUPPORT TICKETS
      ───────────────────────────────────────────────────────────── */}
      {pageTab === 'tickets' && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div 
              onClick={() => setStatusFilter('All')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'All' ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Tickets</p>
              <h3 className="font-display text-[26px] font-black text-on-surface mt-1">{counts.all}</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">All time queries</span>
            </div>

            <div 
              onClick={() => setStatusFilter('Open')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'Open' ? 'bg-amber-500/10 border-amber-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Open / Pending</p>
                {counts.open > 0 && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>}
              </div>
              <h3 className="font-display text-[26px] font-black text-amber-600 mt-1">{counts.open}</h3>
              <span className="text-[11px] text-amber-700/80 font-medium">Needs response</span>
            </div>

            <div 
              onClick={() => setStatusFilter('In Progress')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'In Progress' ? 'bg-blue-500/10 border-blue-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">In Progress</p>
              <h3 className="font-display text-[26px] font-black text-blue-600 mt-1">{counts.inProgress}</h3>
              <span className="text-[11px] text-blue-700/80 font-medium">Under investigation</span>
            </div>

            <div 
              onClick={() => setStatusFilter('Resolved')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'Resolved' ? 'bg-green-500/10 border-green-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Resolved</p>
              <h3 className="font-display text-[26px] font-black text-green-600 mt-1">{counts.resolved}</h3>
              <span className="text-[11px] text-green-700/80 font-medium">Replies dispatched</span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by subject, customer name, mobile, Zeebac ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant/30 text-body-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-surface-container-lowest"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface material-symbols-outlined text-[16px]"
                >
                  close
                </button>
              )}
            </div>

            {/* Filters Group */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20">
                {['All', 'User', 'Vendor'].map(t => (
                  <button
                    key={t}
                    onClick={() => setUserTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      userTypeFilter === t ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {t === 'All' ? 'All Roles' : t === 'User' ? 'Customers' : 'Merchants'}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/20 text-on-surface text-[12px] font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="All">All Statuses ({counts.all})</option>
                <option value="Open">Open ({counts.open})</option>
                <option value="In Progress">In Progress ({counts.inProgress})</option>
                <option value="Resolved">Resolved ({counts.resolved})</option>
                <option value="Closed">Closed ({counts.closed})</option>
              </select>

              <button
                onClick={openNewTicketModal}
                className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-[12px] font-bold transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Ticket
              </button>
            </div>
          </div>

          {/* Tickets Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Ticket List */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              <div className="p-4 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center">
                <span className="font-bold text-[13px] text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-primary">inbox</span>
                  Incoming Queue ({tickets.length})
                </span>
                <span className="text-[11px] text-on-surface-variant font-medium">Sorted by latest</span>
              </div>

              <div className="divide-y divide-outline-variant/10 overflow-y-auto max-h-[640px]">
                {isLoading ? (
                  <div className="p-8 text-center space-y-2">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-[12px] text-on-surface-variant font-medium">Loading tickets...</p>
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="p-12 text-center text-on-surface-variant space-y-2">
                    <span className="material-symbols-outlined text-[36px] text-outline">mark_email_read</span>
                    <p className="font-bold text-[13px] text-on-surface">No tickets found</p>
                    <p className="text-[12px] text-on-surface-variant">No support queries match your current filter criteria.</p>
                  </div>
                ) : (
                  tickets.map((ticket) => {
                    const isSelected = selectedTicket?._id === ticket._id;
                    const isUser = ticket.userType === 'User';
                    const user = ticket.userId || {};
                    const displayName = isUser ? (user.name || 'Anonymous Customer') : (user.storeName || user.ownerName || 'Merchant Partner');
                    
                    const statusColors = {
                      'Open': 'bg-amber-50 text-amber-700 border-amber-200',
                      'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
                      'Resolved': 'bg-green-50 text-green-700 border-green-200',
                      'Closed': 'bg-gray-100 text-gray-600 border-gray-200',
                    };

                    return (
                      <div
                        key={ticket._id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`p-4 transition-colors cursor-pointer text-left hover:bg-surface-container-lowest ${
                          isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                              isUser ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {isUser ? 'Customer' : 'Vendor'}
                            </span>
                            <span className="text-[11px] text-on-surface-variant font-medium">
                              {getTimeAgo(ticket.createdAt)}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
                            {ticket.status}
                          </span>
                        </div>

                        <h4 className="font-bold text-[13px] text-on-surface line-clamp-1 mb-1">{ticket.subject}</h4>
                        <p className="text-[12px] text-on-surface-variant line-clamp-2 leading-relaxed mb-2">{ticket.message}</p>

                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-2 border-t border-outline-variant/10">
                          <span className="font-bold text-on-surface truncate max-w-[160px]">{displayName}</span>
                          {user.phone && <span className="text-outline font-mono text-[10px]">{user.phone}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Ticket Detail & Reply Panel */}
            <div className="lg:col-span-7">
              {selectedTicket ? (
                <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 space-y-6">
                  {/* Ticket Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-outline-variant/10">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border ${
                          selectedTicket.userType === 'User' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {selectedTicket.userType === 'User' ? 'Customer Inquiry' : 'Merchant Inquiry'}
                        </span>
                        <span className="text-[12px] text-on-surface-variant">Ticket ID: #{selectedTicket._id.slice(-6).toUpperCase()}</span>
                      </div>
                      <h2 className="text-title-md font-bold text-on-surface">{selectedTicket.subject}</h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-on-surface-variant">{formatDate(selectedTicket.createdAt)}</span>
                    </div>
                  </div>

                  {/* Customer / Merchant Card */}
                  {selectedTicket.userId && (
                    <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center text-[16px]">
                          {(selectedTicket.userId.name || selectedTicket.userId.storeName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[13px] text-on-surface">
                            {selectedTicket.userId.name || selectedTicket.userId.storeName || 'Registered User'}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            {selectedTicket.userId.phone || 'No phone'} • Zeebac ID: <span className="font-mono font-bold">{selectedTicket.userId.zeebacId || 'N/A'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedTicket.userId.phone && (
                          <button
                            onClick={() => handleCopy(selectedTicket.userId.phone, 'phone')}
                            className="px-2.5 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-[11px] font-bold text-on-surface hover:bg-surface-container flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            {copySuccess === 'phone' ? 'Copied!' : 'Copy Phone'}
                          </button>
                        )}
                        {selectedTicket.userId.email && (
                          <a
                            href={`mailto:${selectedTicket.userId.email}`}
                            className="px-2.5 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-[11px] font-bold text-on-surface hover:bg-surface-container flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">mail</span>
                            Email
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Original Customer Message */}
                  <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/20 space-y-2">
                    <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">User's Message</p>
                    <p className="text-[13px] text-on-surface leading-relaxed whitespace-pre-wrap">{selectedTicket.message}</p>
                  </div>

                  {/* Existing Admin Response (if any) */}
                  {selectedTicket.adminReply && (
                    <div className="bg-emerald-50/60 p-5 rounded-xl border border-emerald-200/60 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                          Previous Admin Response
                        </span>
                        {selectedTicket.repliedAt && (
                          <span className="text-[11px] text-emerald-700">{formatDate(selectedTicket.repliedAt)}</span>
                        )}
                      </div>
                      <p className="text-[13px] text-emerald-950 leading-relaxed whitespace-pre-wrap">{selectedTicket.adminReply}</p>
                    </div>
                  )}

                  {/* Quick Snippets */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Quick Reply Templates</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quickSnippets.map((snippet, idx) => (
                        <button
                          key={idx}
                          onClick={() => setReplyMessage(snippet)}
                          className="text-[11px] bg-surface-container-low hover:bg-surface-container border border-outline-variant/20 text-on-surface px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-left"
                        >
                          "{snippet.slice(0, 38)}..."
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reply Form */}
                  <div className="space-y-3 pt-2">
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Send Reply to User (Dispatched via In-App Notification & Ticket Update)
                    </label>
                    <textarea
                      rows={4}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your official support response here..."
                      className="w-full p-4 rounded-xl border border-outline-variant/30 text-[13px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-surface-container-lowest"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-on-surface-variant">Update Status to:</span>
                        <select
                          value={replyStatus}
                          onChange={(e) => setReplyStatus(e.target.value)}
                          className="bg-surface-container-low border border-outline-variant/20 text-on-surface text-[12px] font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="Resolved">Resolved</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedTicket.status !== 'Closed' && (
                          <button
                            onClick={() => handleClose(selectedTicket._id)}
                            className="px-3 py-2 bg-error/10 text-error hover:bg-error/20 rounded-xl text-[12px] font-bold transition-colors cursor-pointer"
                          >
                            Close Ticket
                          </button>
                        )}
                        <button
                          onClick={() => handleReply(replyStatus)}
                          disabled={isReplying || !replyMessage.trim()}
                          className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-[12px] font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                        >
                          {isReplying ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Sending...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">send</span>
                              Send Reply & Update Status
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-outline-variant/20 p-12 text-center flex flex-col items-center justify-center text-on-surface-variant space-y-2 min-h-[400px]">
                  <span className="material-symbols-outlined text-[48px] text-outline">support_agent</span>
                  <p className="font-bold text-[14px] text-on-surface">Select a Support Ticket</p>
                  <p className="text-[12px] text-on-surface-variant max-w-xs">
                    Click on any customer or merchant ticket on the left to view customer contact info, issue details, and send a reply.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: FAQ MANAGEMENT
      ───────────────────────────────────────────────────────────── */}
      {pageTab === 'faqs' && (
        <div className="space-y-6">
          {/* FAQ Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div 
              onClick={() => setFaqTargetFilter('all')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                faqTargetFilter === 'all' ? 'bg-primary/5 border-primary shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total FAQs</p>
              <h3 className="font-display text-[26px] font-black text-on-surface mt-1">{faqCounts.total}</h3>
              <span className="text-[11px] text-on-surface-variant font-medium">Customer & Vendor FAQs</span>
            </div>

            <div 
              onClick={() => setFaqTargetFilter('customer')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                faqTargetFilter === 'customer' ? 'bg-blue-500/10 border-blue-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Customer FAQs</p>
              <h3 className="font-display text-[26px] font-black text-blue-600 mt-1">{faqCounts.customer}</h3>
              <span className="text-[11px] text-blue-700/80 font-medium">Shown on User Profile</span>
            </div>

            <div 
              onClick={() => setFaqTargetFilter('vendor')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                faqTargetFilter === 'vendor' ? 'bg-purple-500/10 border-purple-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Vendor FAQs</p>
              <h3 className="font-display text-[26px] font-black text-purple-600 mt-1">{faqCounts.vendor}</h3>
              <span className="text-[11px] text-purple-700/80 font-medium">Shown on Merchant Portal</span>
            </div>

            <div 
              onClick={() => setFaqStatusFilter(faqStatusFilter === 'active' ? 'all' : 'active')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                faqStatusFilter === 'active' ? 'bg-emerald-500/10 border-emerald-500 shadow-sm' : 'bg-white border-outline-variant/20 hover:border-outline-variant/40'
              }`}
            >
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active Published</p>
              <h3 className="font-display text-[26px] font-black text-emerald-600 mt-1">{faqCounts.active}</h3>
              <span className="text-[11px] text-emerald-700/80 font-medium">{faqCounts.inactive} inactive draft(s)</span>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
              <input 
                type="text"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search FAQ question or answer text..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant/30 text-body-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-surface-container-lowest"
              />
              {faqSearch && (
                <button 
                  onClick={() => setFaqSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface material-symbols-outlined text-[16px]"
                >
                  close
                </button>
              )}
            </div>

            {/* Target Audience Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20">
                {[
                  { id: 'all', label: 'All Audiences' },
                  { id: 'customer', label: 'Customer' },
                  { id: 'vendor', label: 'Vendor' },
                ].map(aud => (
                  <button
                    key={aud.id}
                    onClick={() => setFaqTargetFilter(aud.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      faqTargetFilter === aud.id ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {aud.label}
                  </button>
                ))}
              </div>

              {/* Category Filter */}
              <select
                value={faqCategoryFilter}
                onChange={(e) => setFaqCategoryFilter(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/20 text-on-surface text-[12px] font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary cursor-pointer"
              >
                {faqCategories.map(cat => (
                  <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={faqStatusFilter}
                onChange={(e) => setFaqStatusFilter(e.target.value)}
                className="bg-surface-container-low border border-outline-variant/20 text-on-surface text-[12px] font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Published</option>
                <option value="inactive">Inactive / Draft</option>
              </select>
            </div>
          </div>

          {/* FAQ List */}
          <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center">
              <span className="font-bold text-[13px] text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary">format_list_bulleted</span>
                Configured FAQ Entries ({faqs.length})
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium">Sorted by priority order</span>
            </div>

            {isLoadingFaqs ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-[12px] text-on-surface-variant font-medium">Loading FAQs from database...</p>
              </div>
            ) : faqs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <span className="material-symbols-outlined text-[48px] text-outline">help_center</span>
                <p className="font-bold text-[14px] text-on-surface">No FAQs Found</p>
                <p className="text-[12px] text-on-surface-variant max-w-sm mx-auto">
                  There are no FAQs matching your selected filters. Click "Add New FAQ" above to create one.
                </p>
                <button
                  onClick={handleOpenAddFaq}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-[12px] font-bold hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
                >
                  Create First FAQ
                </button>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {faqs.map((faq, idx) => {
                  const isExpanded = expandedFaqId === faq._id;
                  
                  const targetBadges = {
                    customer: 'bg-blue-50 text-blue-700 border-blue-200',
                    vendor: 'bg-purple-50 text-purple-700 border-purple-200',
                    all: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  };

                  return (
                    <div key={faq._id} className="p-5 hover:bg-surface-container-lowest/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        
                        {/* Question & Meta */}
                        <div className="flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-extrabold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-md">
                              #{faq.order || idx + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${targetBadges[faq.target] || targetBadges.all}`}>
                              {faq.target === 'all' ? 'All Audiences' : faq.target}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-700 bg-gray-100 border border-gray-200">
                              {faq.category || 'General'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              faq.isActive 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {faq.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <h3 className="font-bold text-[14px] text-on-surface">
                            {faq.question}
                          </h3>

                          <div className="text-[13px] text-on-surface-variant leading-relaxed">
                            {isExpanded ? (
                              <p className="whitespace-pre-wrap">{faq.answer}</p>
                            ) : (
                              <p className="line-clamp-2">{faq.answer}</p>
                            )}
                          </div>

                          {faq.answer.length > 140 && (
                            <button
                              onClick={() => setExpandedFaqId(isExpanded ? null : faq._id)}
                              className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              {isExpanded ? 'Show Less' : 'Read Full Answer'}
                              <span className="material-symbols-outlined text-[14px]">
                                {isExpanded ? 'expand_less' : 'expand_more'}
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-start">
                          {/* Active Toggle Switch */}
                          <button
                            onClick={() => handleToggleFaqStatus(faq)}
                            title={faq.isActive ? 'Deactivate FAQ' : 'Activate FAQ'}
                            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              faq.isActive 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {faq.isActive ? 'toggle_on' : 'toggle_off'}
                            </span>
                            {faq.isActive ? 'Active' : 'Draft'}
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditFaq(faq)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors cursor-pointer"
                            title="Edit FAQ"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteFaq(faq)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Delete FAQ"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: WHATSAPP & SUPPORT HELPLINE SETTINGS
      ───────────────────────────────────────────────────────────── */}
      {pageTab === 'contact' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Configuration Form */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/15">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]">chat</span>
                </div>
                <div>
                  <h2 className="text-title-md font-display font-bold text-on-surface">
                    WhatsApp & Helpline Configuration
                  </h2>
                  <p className="text-[12px] text-on-surface-variant font-medium">
                    Update the contact numbers used across user app and merchant support screens.
                  </p>
                </div>
              </div>

              {isLoadingConfig ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-[13px] text-on-surface-variant">Loading current configuration...</p>
                </div>
              ) : (
                <form onSubmit={handleSaveSupportConfig} className="space-y-5">
                  {/* WhatsApp Number Field */}
                  <div>
                    <label className="block text-[12px] font-bold text-on-surface uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Support WhatsApp Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={supportConfig.supportWhatsapp}
                        onChange={(e) => setSupportConfig({ ...supportConfig, supportWhatsapp: e.target.value })}
                        placeholder="+91 91119 66732"
                        className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[14px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                      />
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Powers the 1-click "Chat on WhatsApp" buttons on user profile and vendor support screens. Can include country code (+91).
                    </p>
                  </div>

                  {/* Helpline Phone Field */}
                  <div>
                    <label className="block text-[12px] font-bold text-on-surface uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Helpline / Calling Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={supportConfig.supportPhone}
                      onChange={(e) => setSupportConfig({ ...supportConfig, supportPhone: e.target.value })}
                      placeholder="+91 91119 66732"
                      className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[14px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                    />
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Target number when customer or merchant taps "Call Helpline".
                    </p>
                  </div>

                  {/* Support Email Field */}
                  <div>
                    <label className="block text-[12px] font-bold text-on-surface uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      Support Email Address
                    </label>
                    <input
                      type="email"
                      value={supportConfig.supportEmail}
                      onChange={(e) => setSupportConfig({ ...supportConfig, supportEmail: e.target.value })}
                      placeholder="support@zeebac.com"
                      className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[14px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-3 border-t border-outline-variant/15">
                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-[13px] font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {isSavingConfig ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Saving Changes...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">save</span>
                          Save Support Settings
                        </>
                      )}
                    </button>

                    <a
                      href={`https://wa.me/${(supportConfig.supportWhatsapp || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello Zeebac Support, testing WhatsApp connection.')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      Test WhatsApp Link
                    </a>
                  </div>
                </form>
              )}
            </div>

            {/* Right: Live Preview in Mobile Apps */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                    Customer App Live Preview
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                    Live Sync
                  </span>
                </div>
                <p className="text-[12px] text-on-surface-variant">
                  This is how the WhatsApp direct chat card appears in the customer Help & Support screen:
                </p>

                {/* Direct WhatsApp Support Card Preview */}
                <div className="w-full p-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-[#25D366] text-white rounded-2xl flex items-center justify-between shadow-md shadow-emerald-500/20">
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
                      <p className="text-[12px] text-white/95 font-medium mt-0.5">
                        {supportConfig.supportWhatsapp || '+91 91119 66732'} · Direct Support
                      </p>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </div>
                </div>

                {/* Secondary Preview: Vendor Support Card */}
                <div className="p-3 bg-white border border-outline-variant/20 rounded-xl flex items-center justify-between text-on-surface">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">phone_in_talk</span>
                    </div>
                    <div>
                      <span className="text-[12px] font-bold block text-on-surface">Helpline Dialing</span>
                      <p className="text-[11px] text-on-surface-variant font-medium">
                        {supportConfig.supportPhone || '+91 91119 66732'}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">call</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADD / EDIT FAQ
      ───────────────────────────────────────────────────────────── */}
      {isFaqModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-reveal">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-outline-variant/15 flex justify-between items-center bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">quiz</span>
                <h3 className="font-display font-bold text-[16px] text-on-surface">
                  {editingFaq ? 'Edit FAQ' : 'Add New FAQ'}
                </h3>
              </div>
              <button
                onClick={() => setIsFaqModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveFaq} className="p-6 space-y-4">
              {/* Question */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Question <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="E.g., How does Zeebac Cashback audit work?"
                  className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Answer <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="Provide a clear, helpful answer for customers or merchants..."
                  className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Row: Target Audience & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Target Audience
                  </label>
                  <select
                    value={faqForm.target}
                    onChange={(e) => setFaqForm({ ...faqForm, target: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[12px] font-bold text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="all">All (Customer & Vendor)</option>
                    <option value="customer">Customer Only</option>
                    <option value="vendor">Vendor Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={faqForm.category}
                    onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[12px] font-bold text-on-surface focus:outline-none focus:border-primary cursor-pointer"
                  >
                    {faqCategories.filter(c => c !== 'All').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row: Order Priority & Status Toggle */}
              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Display Priority Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={faqForm.order}
                    onChange={(e) => setFaqForm({ ...faqForm, order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[12px] font-bold text-on-surface focus:outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-on-surface-variant">Lower numbers appear first</span>
                </div>

                <div className="pt-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={faqForm.isActive}
                      onChange={(e) => setFaqForm({ ...faqForm, isActive: e.target.checked })}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                    <span className="text-[12px] font-bold text-on-surface">Publish Immediately (Active)</span>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => setIsFaqModalOpen(false)}
                  className="px-4 py-2 bg-surface-container hover:bg-surface-container-high rounded-xl text-[12px] font-bold text-on-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingFaq}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-[12px] font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingFaq ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      {editingFaq ? 'Save Changes' : 'Create FAQ'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Ticket Modal (admin-logged, e.g. a phone-in complaint) */}
      {isNewTicketModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-reveal">

            {/* Modal Header */}
            <div className="p-5 border-b border-outline-variant/15 flex justify-between items-center bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">support_agent</span>
                <h3 className="font-display font-bold text-[16px] text-on-surface">Log a New Ticket</h3>
              </div>
              <button
                onClick={() => setIsNewTicketModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              {/* Role toggle */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Raised By
                </label>
                <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/20 w-fit">
                  {['User', 'Vendor'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewTicketForm({ ...newTicketForm, userType: t, userId: '', userLabel: '' })}
                      className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                        newTicketForm.userType === t ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {t === 'User' ? 'Customer' : 'Merchant'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Owner search-select */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  {newTicketForm.userType === 'User' ? 'Customer' : 'Merchant'} <span className="text-rose-500">*</span>
                </label>
                {newTicketForm.userId ? (
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-primary/5 border border-primary/30 rounded-xl text-[13px] font-bold text-on-surface">
                    <span>{newTicketForm.userLabel}</span>
                    <button
                      type="button"
                      onClick={() => setNewTicketForm({ ...newTicketForm, userId: '', userLabel: '' })}
                      className="text-outline hover:text-rose-500 material-symbols-outlined text-[16px] cursor-pointer"
                    >
                      close
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      placeholder="Search by name, phone, or Zeebac ID..."
                      className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                    />
                    {ownerSearchQuery.trim() && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-outline-variant/30 rounded-xl shadow-lg">
                        {isSearchingOwners ? (
                          <div className="p-3 text-center text-[12px] text-on-surface-variant">Searching...</div>
                        ) : ownerSearchResults.length === 0 ? (
                          <div className="p-3 text-center text-[12px] text-on-surface-variant">No match found</div>
                        ) : (
                          ownerSearchResults.map((owner) => (
                            <button
                              key={owner._id}
                              type="button"
                              onClick={() => selectTicketOwner(owner)}
                              className="w-full text-left px-3.5 py-2 hover:bg-surface-container-low text-[12.5px] cursor-pointer border-b border-outline-variant/10 last:border-0"
                            >
                              <span className="font-bold text-on-surface">{owner.name || owner.storeName || owner.ownerName}</span>
                              <span className="text-on-surface-variant ml-1.5">· {owner.phone} · {owner.zeebacId}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTicketForm.subject}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                  placeholder="E.g., Cashback not credited for bill #1234"
                  className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Message <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={newTicketForm.message}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, message: e.target.value })}
                  placeholder="Describe what the customer/merchant reported over the call..."
                  className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="px-4 py-2 bg-surface-container hover:bg-surface-container-high rounded-xl text-[12px] font-bold text-on-surface transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTicket || !newTicketForm.userId || !newTicketForm.subject.trim() || !newTicketForm.message.trim()}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-[12px] font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isCreatingTicket ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Logging...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      Log Ticket
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
