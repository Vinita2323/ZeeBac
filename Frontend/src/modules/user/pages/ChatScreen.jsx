import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatAPI, API_BASE_URL } from '../../../services/api';
import { connectSocket, disconnectSocket, getSocket } from '../../../services/socket';
import useAuthStore from '../../../store/useAuthStore';

export default function ChatScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore(state => state.accessToken);
  const currentUser = useAuthStore(state => state.currentUser);
  
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(location.state?.selectedChat || null);
  const [activeChatData, setActiveChatData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize Socket
  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
    return () => {
      disconnectSocket();
    };
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
      }
      
      // Update last message in conversation list
      setConversations(prev => prev.map(c => {
        if (c._id === newMessage.conversationId) {
          return { ...c, lastMessage: newMessage.text, lastMessageAt: new Date(), lastMessageBy: newMessage.sender };
        }
        return c;
      }));
    };

    socket.on('newMessage', handleNewMessage);

    return () => {
      socket.emit('leaveRoom', selectedChat);
      socket.off('newMessage', handleNewMessage);
    };
  }, [selectedChat]);

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
            text: '📷 Image', // placeholder text
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
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (selectedChat && activeChatData) {
    return (
      <div className="flex flex-col h-screen bg-[#f9f9ff] text-left animate-reveal" style={{ fontFamily: "'Quicksand', sans-serif" }}>
        {/* Chat Room Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
          <button 
            onClick={() => setSelectedChat(null)} 
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">arrow_back</span>
          </button>
          
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[16px] uppercase overflow-hidden">
            {activeChatData.vendorId?.profilePic ? (
              <img src={activeChatData.vendorId.profilePic} alt="avatar" className="w-full h-full object-cover" />
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
          
          <button className="w-10 h-10 rounded-full bg-primary/5 hover:bg-primary/15 flex items-center justify-center text-primary active:scale-95 cursor-pointer transition-colors shadow-sm ml-2">
            <span className="material-symbols-outlined text-[20px]">call</span>
          </button>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
          {messages.map((msg) => {
            const isMe = msg.sender === 'customer';
            return (
              <div key={msg._id || msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-reveal`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-[13.5px] leading-snug ${
                  isMe 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-white border border-outline-variant/10 text-on-surface rounded-tl-none'
                }`}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2">
                      <img 
                        src={`${API_BASE_URL.replace('/api', '')}${msg.attachments[0].url}`} 
                        alt="attachment" 
                        className="rounded-xl w-full max-w-[200px] object-cover border border-white/20"
                      />
                    </div>
                  )}
                  {msg.text !== '📷 Image' && <p>{msg.text}</p>}
                  <span className={`text-[9px] block text-right mt-1.5 ${isMe ? 'text-white/70' : 'text-on-surface-variant'}`}>
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-white border-t border-outline-variant/10 pb-safe">
          {isUploading && (
            <div className="px-4 py-1 text-xs text-primary animate-pulse">Uploading image...</div>
          )}
          <form onSubmit={handleSendMessage} className="p-3 flex gap-2 items-center">
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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-safe" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
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
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[440px] mx-auto w-full px-4 py-6 space-y-4 text-left">
        <div className="divide-y divide-outline-variant/10">
          {conversations.length === 0 ? (
             <div className="text-center py-10 text-on-surface-variant text-sm">No conversations yet.</div>
          ) : conversations.map(chat => (
            <div 
              key={chat._id} 
              className="py-3.5 flex items-center gap-4 cursor-pointer hover:bg-surface-container-low/45 transition-colors"
              onClick={() => setSelectedChat(chat._id)}
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[18px] flex-shrink-0 uppercase overflow-hidden">
                {chat.vendorId?.profilePic ? (
                  <img src={chat.vendorId.profilePic} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  chat.vendorId?.storeName?.charAt(0) || 'V'
                )}
              </div>
              
              {/* Message Details */}
              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-[15px] truncate pr-2">{chat.vendorId?.storeName}</h3>
                  <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{formatTime(chat.lastMessageAt)}</span>
                </div>
                <p className={`text-[13px] truncate ${chat.unreadByCustomer > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                  {chat.lastMessageBy === 'customer' ? 'You: ' : ''}{chat.lastMessage || 'Start a conversation...'}
                </p>
              </div>
              
              {/* Unread Badge */}
              {chat.unreadByCustomer > 0 && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {chat.unreadByCustomer}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

    </div>
  );
}
