import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const res = await AdminAPI.getAllTickets(filter);
      if (res.success) setTickets(res.data);
    } catch (error) {
      console.error("Failed to load tickets", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyMessage.trim()) return;
    try {
      setIsReplying(true);
      const res = await AdminAPI.replyToTicket(selectedTicket._id, replyMessage);
      if (res.success) {
        setReplyMessage('');
        setSelectedTicket(null);
        fetchTickets();
      }
    } catch (error) {
      alert("Failed to send reply");
    } finally {
      setIsReplying(false);
    }
  };

  const handleClose = async (id) => {
    if (!window.confirm('Close this ticket?')) return;
    try {
      await AdminAPI.closeTicket(id);
      fetchTickets();
      if (selectedTicket?._id === id) setSelectedTicket(null);
    } catch (error) {
      alert("Failed to close ticket");
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-title-lg font-display font-extrabold text-[#31006E]">Support Tickets</h1>
            <p className="text-body-sm text-on-surface-variant">Manage customer and vendor support requests</p>
          </div>
          <div className="flex gap-2">
            {['All', 'Open', 'Resolved', 'Closed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                  filter === f ? 'bg-[#420093] text-white' : 'bg-white border border-outline-variant/30 text-on-surface hover:bg-surface-container'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <div className="text-center py-10 text-on-surface-variant">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-outline-variant/20 p-10 text-center text-on-surface-variant">
                No tickets found for filter: {filter}
              </div>
            ) : (
              tickets.map(ticket => (
                <div 
                  key={ticket._id} 
                  onClick={() => setSelectedTicket(ticket)}
                  className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                    selectedTicket?._id === ticket._id ? 'border-primary ring-1 ring-primary/20' : 'border-outline-variant/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-on-surface">{ticket.subject}</h3>
                      <p className="text-[12px] text-on-surface-variant">
                        From: <span className="font-bold text-secondary">{ticket.userId?.name || ticket.userId?.storeName || 'Unknown User'}</span> ({ticket.userType})
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                      ticket.status === 'Resolved' ? 'bg-green-100 text-green-700' :
                      ticket.status === 'Open' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant line-clamp-2">{ticket.message}</p>
                  <p className="text-[10px] text-on-surface/50 mt-3">{formatDate(ticket.createdAt)}</p>
                </div>
              ))
            )}
          </div>

          {/* Ticket Detail Panel */}
          <div className="lg:col-span-1">
            {selectedTicket ? (
              <div className="bg-white rounded-2xl border border-outline-variant/30 p-5 shadow-sm sticky top-6">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-outline-variant/10">
                  <h3 className="font-bold text-title-md">Ticket Details</h3>
                  <button onClick={() => setSelectedTicket(null)} className="text-on-surface-variant hover:text-on-surface material-symbols-outlined">close</button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-on-surface-variant">User Details</p>
                    <p className="text-[13px] text-on-surface font-bold">{selectedTicket.userId?.name || selectedTicket.userId?.storeName || 'Unknown User'}</p>
                    <p className="text-[12px] text-on-surface-variant">{selectedTicket.userId?.email || 'No email'}</p>
                  </div>
                  
                  <div>
                    <p className="text-[11px] font-bold uppercase text-on-surface-variant">Message</p>
                    <p className="text-[13px] text-on-surface bg-surface-container-low p-3 rounded-xl mt-1">{selectedTicket.message}</p>
                  </div>

                  {selectedTicket.adminReply && (
                    <div>
                      <p className="text-[11px] font-bold uppercase text-primary">Admin Reply</p>
                      <p className="text-[13px] text-primary bg-primary/10 p-3 rounded-xl mt-1">{selectedTicket.adminReply}</p>
                    </div>
                  )}

                  {selectedTicket.status !== 'Closed' && selectedTicket.status !== 'Resolved' && (
                    <div className="pt-4 border-t border-outline-variant/10 space-y-3">
                      <p className="text-[11px] font-bold uppercase text-on-surface-variant">Send Reply</p>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        className="w-full h-24 rounded-xl border border-outline-variant/30 p-3 text-body-sm focus:border-primary focus:outline-none resize-none"
                        placeholder="Type your response here..."
                      ></textarea>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleReply}
                          disabled={!replyMessage.trim() || isReplying}
                          className="flex-1 bg-primary text-white font-bold py-2 rounded-xl disabled:opacity-50"
                        >
                          {isReplying ? 'Sending...' : 'Send & Resolve'}
                        </button>
                        <button 
                          onClick={() => handleClose(selectedTicket._id)}
                          className="px-4 bg-error/10 text-error font-bold py-2 rounded-xl"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-10 text-center flex flex-col items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[48px] opacity-50 mb-3">quick_reference_all</span>
                <p>Select a ticket to view details and reply.</p>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
