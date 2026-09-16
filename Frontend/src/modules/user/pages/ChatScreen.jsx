import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatAPI, API_BASE_URL } from '../../../services/api';
import { connectSocket, disconnectSocket, getSocket } from '../../../services/socket';
import useAuthStore from '../../../store/useAuthStore';
import { useCall } from '../../../context/CallContext';

export default function ChatScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore(state => state.accessToken);
  const currentUser = useAuthStore(state => state.currentUser);
  const { startCall } = useCall();
  
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(location.state?.selectedChat || null);
  const [activeChatData, setActiveChatData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize Socket
  useEffect(() => {
    if (token) {
      connectSocket(token);
      const socket = getSocket();
      if (socket) {
        const handleConvUpdated = (data) => {
          setConversations(prev => {
            const index = prev.findIndex(c => c._id === data.conversationId);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                lastMessage: data.lastMessage,
                lastMessageAt: data.lastMessageAt,
                lastMessageBy: data.lastMessageBy,
                unreadByCustomer: data.unreadByCustomer,
                unreadByVendor: data.unreadByVendor,
              };
              return updated.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
            }
            return prev;
          });
        };

        socket.on('conversationUpdated', handleConvUpdated);
        return () => {
          socket.off('conversationUpdated', handleConvUpdated);
        };
      }
    }
  }, [token]);

  // Fetch conversations list
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await ChatAPI.getConversations();
        if (res.success) {
          setConversations(res.data);
        }
      } catch (error) {
        console.error('Failed to fetch conversations', error);
      }
    };
    fetchConversations();
  }, []);

  // Set active chat data when selectedChat changes
  useEffect(() => {
    if (selectedChat && conversations.length > 0) {
      const chat = conversations.find(c => c._id === selectedChat);
      if (chat) setActiveChatData(chat);
    }
  }, [selectedChat, conversations]);

  // Fetch messages for selected chat and join room
  useEffect(() => {
    const socket = getSocket();
    if (!selectedChat || !socket) return;

    const fetchMessages = async () => {
      try {
        const res = await ChatAPI.getMessages(selectedChat);
        if (res.success) {
          setMessages(res.data);
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (error) {
        console.error('Failed to fetch messages', error);
      }
    };

    fetchMessages();
    socket.emit('joinRoom', selectedChat);
    socket.emit('markAsRead', selectedChat);

    // Socket message listener
    const handleNewMessage = (newMessage) => {
      if (newMessage.conversationId === selectedChat) {
        setMessages(prev => [...prev, newMessage]);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        // If someone else sent this message, mark it as read immediately
        if (newMessage.sender !== 'customer') {
          socket.emit('markAsRead', selectedChat);
        }
      }
      
      // Update last message in conversation list
      setConversations(prev => {
        const updated = prev.map(c => {
          if (c._id === newMessage.conversationId) {
            return { 
              ...c, 
              lastMessage: newMessage.text, 
              lastMessageAt: new Date(), 
              lastMessageBy: newMessage.sender,
              unreadByCustomer: selectedChat === newMessage.conversationId ? 0 : (c.unreadByCustomer || 0) + (newMessage.sender !== 'customer' ? 1 : 0),
            };
          }
          return c;
        });
        return [...updated].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
      });
    };

    // Socket messages seen listener (ONLY turns customer messages to blue when the store/vendor reads them)
    const handleMessagesSeen = ({ conversationId, seenBy, readAt }) => {
      // If the event was triggered by the customer themselves, do NOT turn customer's messages blue!
      if (seenBy !== 'vendor') return;

      if (conversationId === selectedChat) {
        setMessages(prev => prev.map(msg => {
          if (msg.sender === 'customer') {
            return { ...msg, isRead: true, readAt: readAt || msg.readAt || new Date() };
          }
          return msg;
        }));
      }

      // Update conversation in list: store has seen the last message
      setConversations(prev => prev.map(c => {
        if (c._id === conversationId) {
          return { ...c, unreadByVendor: 0, lastMessageIsRead: true };
        }
        return c;
      }));
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messagesSeen', handleMessagesSeen);

    return () => {
      socket.emit('leaveRoom', selectedChat);
      socket.off('newMessage', handleNewMessage);
      socket.off('messagesSeen', handleMessagesSeen);
    };
  }, [selectedChat]);

  const handleSelectChat = (chatId) => {
    setSelectedChat(chatId);
    // Instant UI mark as read
    setConversations(prev => prev.map(c => c._id === chatId ? { ...c, unreadByCustomer: 0 } : c));
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChat) return;

    const socket = getSocket();
    if (socket) {
      const messageData = {
        conversationId: selectedChat,
        text: inputText,
      };
      
      socket.emit('sendMessage', messageData, (response) => {
        if (!response.success) {
          console.error('Failed to send message via socket');
        }
      });
      setInputText('');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    try {
      setIsUploading(true);
      const res = await ChatAPI.uploadChatImage(file);
      
      if (res.success && res.data) {
        const socket = getSocket();
        if (socket) {
          const messageData = {
            conversationId: selectedChat,
            text: '📷 Image',
            attachments: [{
              type: 'image',
              url: res.data.url,
              fileName: res.data.fileName
            }]
          };
          
          socket.emit('sendMessage', messageData, (response) => {
            if (!response.success) console.error('Failed to send image message');
          });
        }
      }
    } catch (error) {
      console.error('Image upload failed', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatListDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleCall = () => {
    if (!activeChatData?.vendorId) return;
    const vendor = activeChatData.vendorId;
    const vendorId = vendor._id || vendor.id;
    if (!vendorId) return;

    const avatarUrl = vendor.profilePic 
      ? (vendor.profilePic.startsWith('http') || vendor.profilePic.startsWith('data:') ? vendor.profilePic : `${import.meta.env.VITE_API_URL}${vendor.profilePic}`) 
      : null;

    startCall({
      targetUserId: vendorId,
      targetUserRole: 'vendor',
      partnerName: vendor.storeName || 'Partner Store',
      partnerAvatar: avatarUrl,
      partnerRole: 'Partner Store',
      conversationId: selectedChat,
    });
  };

  if (selectedChat && activeChatData) {
    const avatarUrl = activeChatData.vendorId?.profilePic ? (activeChatData.vendorId.profilePic.startsWith('http') || activeChatData.vendorId.profilePic.startsWith('data:') ? activeChatData.vendorId.profilePic : `${import.meta.env.VITE_API_URL}${activeChatData.vendorId.profilePic}`) : null;

    return (
      <div className="flex flex-col h-screen mesh-gradient text-left animate-reveal" style={{ fontFamily: "'Quicksand', sans-serif" }}>
        {/* Chat Room Header */}
        <header className="sticky top-0 z-50 glass-header px-4 py-3 border-b border-outline-variant/10 shadow-sm">
          <div className="app-container flex items-center gap-3">
            <button
              onClick={() => setSelectedChat(null)}
              className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary text-[22px]">arrow_back</span>
            </button>

            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[16px] uppercase overflow-hidden border border-outline-variant/20">
              {activeChatData.vendorId?.profilePic ? (
                <img src={activeChatData.vendorId.profilePic.startsWith('http') || activeChatData.vendorId.profilePic.startsWith('data:') ? activeChatData.vendorId.profilePic : `${import.meta.env.VITE_API_URL}${activeChatData.vendorId.profilePic}`} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                activeChatData.vendorId?.storeName?.charAt(0) || 'V'
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[15px] text-on-surface truncate leading-tight">{activeChatData.vendorId?.storeName}</h3>
              <p className="text-[11px] text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse"></span>
                Online
              </p>
            </div>

            <button 
              onClick={handleCall}
              title="Call Vendor"
              className="w-10 h-10 rounded-full bg-primary/5 hover:bg-primary/15 flex items-center justify-center text-primary active:scale-95 cursor-pointer transition-colors shadow-sm ml-2"
            >
              <span className="material-symbols-outlined text-[20px]">call</span>
            </button>
          </div>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-smooth app-container w-full">
          {messages.map((msg) => {
            const isMe = msg.sender === 'customer';
            return (
              <div key={msg._id || msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-reveal`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm text-[13.5px] leading-snug transition-all ${
                  isMe 
                    ? 'bg-primary text-white rounded-tr-none shadow-primary/10' 
                    : 'bg-white border border-outline-variant/15 text-on-surface rounded-tl-none'
                }`}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2">
                      <img 
                        src={`${API_BASE_URL.replace('/api', '')}${msg.attachments[0].url}`} 
                        alt="attachment" 
                        className="rounded-xl w-full max-w-[220px] object-cover border border-white/20 shadow-sm"
                      />
                    </div>
                  )}
                  {msg.text?.startsWith('📞') ? (
                    <div className="flex items-center gap-3 py-1 min-w-[180px]">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        msg.text.includes('Missed') || msg.text.includes('Declined')
                          ? (isMe ? 'bg-rose-500/20 text-rose-200' : 'bg-rose-100 text-rose-600')
                          : (isMe ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-700')
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">
                          {msg.text.includes('Missed') || msg.text.includes('Declined')
                            ? 'phone_missed'
                            : (isMe ? 'phone_forwarded' : 'phone_callback')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[13px] leading-tight">
                          {msg.text.includes('Missed') ? 'Missed Voice Call' : msg.text.includes('Declined') ? 'Declined Call' : 'Voice Call'}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${isMe ? 'text-white/80' : 'text-on-surface-variant'}`}>
                          {msg.text.replace('📞', '').trim()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    msg.text !== '📷 Image' && <p className="break-words select-text">{msg.text}</p>
                  )}
                  
                  {/* Status & Time Details */}
                  {isMe ? (
                    <div className="flex items-center justify-end gap-1.5 mt-1.5 text-[10px] select-none">
                      <span className="text-white/80 font-medium">{formatTime(msg.createdAt)}</span>
                      {msg.isRead ? (
                        <span 
                          className="flex items-center gap-0.5 text-sky-200 font-semibold bg-white/15 px-1.5 py-0.5 rounded-full" 
                          title={`Seen by store at ${formatTime(msg.readAt || msg.updatedAt)}`}
                        >
                          <span className="text-[9.5px] text-sky-200 font-bold tracking-tight">
                            Seen {formatTime(msg.readAt || msg.updatedAt)}
                          </span>
                          <span className="material-symbols-outlined text-[15px] text-[#38bdf8] font-bold leading-none">
                            done_all
                          </span>
                        </span>
                      ) : (
                        <span 
                          className="flex items-center gap-0.5 text-slate-300 bg-black/10 px-1.5 py-0.5 rounded-full" 
                          title="Sent (Unseen by store)"
                        >
                          <span className="text-[9.5px] opacity-85">Sent</span>
                          <span className="material-symbols-outlined text-[15px] text-slate-300 font-medium leading-none">
                            done_all
                          </span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-on-surface-variant font-medium select-none">
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="glass-header border-t border-outline-variant/10 pb-safe">
          {isUploading && (
            <div className="app-container px-4 py-1 text-xs text-primary animate-pulse">Uploading image...</div>
          )}
          <form onSubmit={handleSendMessage} className="app-container p-3 flex gap-2 items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-11 h-11 bg-surface-container-low text-on-surface-variant rounded-xl flex items-center justify-center hover:bg-surface-container transition-colors active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              disabled={isUploading}
              className="flex-1 h-11 px-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px] placeholder:text-outline transition-all disabled:opacity-50"
            />
            <button 
              type="submit"
              disabled={!inputText.trim() || isUploading}
              className="w-11 h-11 bg-primary text-white rounded-xl flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer disabled:opacity-50 disabled:bg-outline"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh-gradient text-on-surface min-h-screen flex flex-col font-body-lg pb-safe" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass-header px-4 py-3 border-b border-outline-variant/10 shadow-sm">
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/home')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </button>
            <h1 className="font-display font-black text-[20px]">Messages</h1>
          </div>
          <button className="text-primary w-10 h-10 rounded-full hover:bg-primary/5 transition-colors flex items-center justify-center active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 app-container px-4 py-6 space-y-4 text-left">
        <div className="divide-y divide-outline-variant/10">
          {conversations.length === 0 ? (
             <div className="text-center py-10 text-on-surface-variant text-sm">No conversations yet.</div>
          ) : conversations.map(chat => {
            const isUnread = (chat.unreadByCustomer || 0) > 0;
            const isSentByMe = chat.lastMessageBy === 'customer';
            const isLastMessageSeenByVendor = isSentByMe && (chat.lastMessageIsRead === true);

            return (
              <div 
                key={chat._id} 
                className={`py-3.5 px-3 rounded-2xl flex items-center gap-3.5 cursor-pointer transition-all ${
                  isUnread 
                    ? 'bg-primary/[0.06] border border-primary/20 shadow-sm' 
                    : 'hover:bg-surface-container-low/50 border border-transparent'
                }`}
                onClick={() => handleSelectChat(chat._id)}
              >
                {/* Avatar with unread indicator dot */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[18px] uppercase overflow-hidden border border-outline-variant/20">
                    {chat.vendorId?.profilePic ? (
                      <img 
                        src={chat.vendorId.profilePic.startsWith('http') || chat.vendorId.profilePic.startsWith('data:') ? chat.vendorId.profilePic : `${import.meta.env.VITE_API_URL}${chat.vendorId.profilePic}`} 
                        alt="avatar" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      chat.vendorId?.storeName?.charAt(0) || 'V'
                    )}
                  </div>
                  {isUnread && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full"></span>
                  )}
                </div>
                
                {/* Message Details */}
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className={`text-[15px] truncate pr-2 ${isUnread ? 'font-black text-on-surface' : 'font-bold text-on-surface/90'}`}>
                      {chat.vendorId?.storeName || 'Partner Store'}
                    </h3>
                    <span className={`text-[11.5px] whitespace-nowrap ${isUnread ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                      {formatListDate(chat.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] truncate flex items-center gap-1 ${
                      isUnread ? 'text-on-surface font-bold' : 'text-on-surface-variant'
                    }`}>
                      {isSentByMe && (
                        <span className="flex items-center flex-shrink-0 mr-0.5">
                          {isLastMessageSeenByVendor ? (
                            <span className="material-symbols-outlined text-[16px] text-blue-600 font-bold leading-none" title="Seen by vendor">
                              done_all
                            </span>
                          ) : (
                            <span className="material-symbols-outlined text-[16px] text-gray-400 font-medium leading-none" title="Sent (Unseen)">
                              done_all
                            </span>
                          )}
                          <span className="ml-1 text-[12px] opacity-80">You:</span>
                        </span>
                      )}
                      <span className="truncate">{chat.lastMessage || 'Start a conversation...'}</span>
                    </p>

                    {/* Unread Badge Counter */}
                    {isUnread && (
                      <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary flex items-center justify-center text-white text-[10.5px] font-bold shadow-sm shadow-primary/30 flex-shrink-0">
                        {chat.unreadByCustomer}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

    </div>
  );
}
