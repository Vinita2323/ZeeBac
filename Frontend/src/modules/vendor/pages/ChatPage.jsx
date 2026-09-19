import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatAPI, API_BASE_URL } from '../../../services/api';
import { connectSocket, disconnectSocket, getSocket } from '../../../services/socket';
import useAuthStore from '../../../store/useAuthStore';
import { useCall } from '../../../context/CallContext';

export default function ChatPage() {
  const navigate = useNavigate();
  const token = useAuthStore(state => state.accessToken);
  const currentUser = useAuthStore(state => state.currentUser);
  const { startCall } = useCall();
  
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
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
                lastMessageIsRead: data.lastMessageIsRead,
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

  // Hide the bottom navigation bar when viewing a specific conversation
  useEffect(() => {
    if (selectedChat) {
      const navElement = document.querySelector('#vendor-bottom-nav');
      if (navElement) {
        navElement.style.display = 'none';
      }
      return () => {
        if (navElement) {
          navElement.style.display = 'flex';
        }
      };
    }
  }, [selectedChat]);

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

        // If customer sent this message, mark as read immediately
        if (newMessage.sender !== 'vendor') {
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
              unreadByVendor: selectedChat === newMessage.conversationId ? 0 : (c.unreadByVendor || 0) + (newMessage.sender !== 'vendor' ? 1 : 0),
              lastMessageIsRead: false,
            };
          }
          return c;
        });
        return [...updated].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
      });
    };

    // Socket messages seen listener (ONLY turns vendor messages to blue when customer reads them)
    const handleMessagesSeen = ({ conversationId, seenBy, readAt }) => {
      // If triggered by the vendor, do NOT turn vendor's messages blue
      if (seenBy !== 'customer') return;

      if (conversationId === selectedChat) {
        setMessages(prev => prev.map(msg => {
          if (msg.sender === 'vendor') {
            return { ...msg, isRead: true, readAt: readAt || msg.readAt || new Date() };
          }
          return msg;
        }));
      }

      // Update conversation in list: customer has seen the last message
      setConversations(prev => prev.map(c => {
        if (c._id === conversationId) {
          return { ...c, unreadByCustomer: 0, lastMessageIsRead: true };
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
    setConversations(prev => prev.map(c => c._id === chatId ? { ...c, unreadByVendor: 0 } : c));
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
    if (!activeChatData?.customerId) return;
    const customer = activeChatData.customerId;
    const customerId = customer._id || customer.id;
    if (!customerId) return;

    startCall({
      targetUserId: customerId,
      targetUserRole: 'customer',
      partnerName: customer.name || 'Customer',
      partnerAvatar: customer.profileImage || null,
      partnerRole: 'Customer',
      conversationId: selectedChat,
    });
  };

  if (selectedChat && activeChatData) {
    return (
      <div className="flex flex-col h-[100dvh] -mx-3 sm:-mx-4 md:mx-0 -my-3 sm:-my-4 md:my-0 bg-slate-50 text-left animate-reveal" style={{ fontFamily: "'Quicksand', sans-serif" }}>
        {/* Chat Room Header */}
        <header className="sticky top-0 z-50 bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-outline-variant/10 shadow-sm flex items-center gap-2.5 sm:gap-3">
          <button 
            onClick={() => setSelectedChat(null)} 
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">arrow_back</span>
          </button>
          
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[16px] bg-primary/10 text-primary uppercase overflow-hidden border border-outline-variant/20">
            {activeChatData.customerId?.profileImage ? (
              <img src={activeChatData.customerId.profileImage} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              activeChatData.customerId?.name?.charAt(0) || 'C'
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[15px] text-on-surface truncate leading-tight">{activeChatData.customerId?.name}</h3>
            <p className="text-[11px] text-green-600 font-semibold flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse"></span>
              Online
            </p>
          </div>
          
          <button 
            onClick={handleCall}
            title="Call Customer"
            className="w-10 h-10 rounded-full bg-primary/5 hover:bg-primary/15 flex items-center justify-center text-primary active:scale-95 cursor-pointer transition-colors shadow-sm ml-2"
          >
            <span className="material-symbols-outlined text-[20px]">call</span>
          </button>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-smooth">
          {messages.map((msg) => {
            const isMe = msg.sender === 'vendor';
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
                          title={`Seen by customer at ${formatTime(msg.readAt || msg.updatedAt)}`}
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
                          title="Sent (Unseen by customer)"
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
        <div className="bg-white border-t border-outline-variant/10">
          {isUploading && (
            <div className="px-4 py-1 text-xs text-primary animate-pulse">Uploading image...</div>
          )}
          <form onSubmit={handleSendMessage} className="p-3 flex gap-2 items-center px-4">
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
    <div className="animate-reveal text-left" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 py-2.5 sm:py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-3 sm:mb-4">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Messages</span>
        </div>
        <button className="text-primary w-10 h-10 rounded-full hover:bg-primary/5 transition-colors flex items-center justify-center active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-[22px]">search</span>
        </button>
      </header>

      <div className="space-y-4 pt-1">
        <div className="divide-y divide-outline-variant/10">
          {conversations.map((chat) => {
            const isUnread = (chat.unreadByVendor || 0) > 0;
            const isSentByMe = chat.lastMessageBy === 'vendor';
            const isLastMessageSeenByCustomer = isSentByMe && (chat.lastMessageIsRead === true);

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
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[18px] uppercase overflow-hidden border border-outline-variant/20">
                    {chat.customerId?.profileImage ? (
                      <img src={chat.customerId.profileImage} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      chat.customerId?.name?.charAt(0) || 'C'
                    )}
                  </div>
                  {isUnread && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full"></span>
                  )}
                </div>
                
                {/* Chat Content */}
                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-[15px] truncate pr-2 ${isUnread ? 'font-black text-on-surface' : 'font-bold text-on-surface/90'}`}>
                      {chat.customerId?.name || 'Customer'}
                    </h3>
                    <span className={`text-[11.5px] whitespace-nowrap ml-2 ${isUnread ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                      {formatListDate(chat.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] truncate flex items-center gap-1 ${
                      isUnread ? 'text-on-surface font-bold' : 'text-on-surface-variant'
                    }`}>
                      {isSentByMe && (
                        <span className="flex items-center flex-shrink-0 mr-0.5">
                          {isLastMessageSeenByCustomer ? (
                            <span className="material-symbols-outlined text-[16px] text-blue-600 font-bold leading-none" title="Seen by customer">
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
                      <div className="min-w-[20px] h-5 px-1.5 bg-primary rounded-full flex items-center justify-center text-white text-[10.5px] font-bold shadow-sm shadow-primary/20 flex-shrink-0">
                        {chat.unreadByVendor}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {conversations.length === 0 && (
          <div className="py-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">forum</span>
            <p className="font-bold text-[16px]">No messages yet</p>
            <p className="text-[14px]">When customers contact you, chats will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
