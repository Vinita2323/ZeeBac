import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChatPage() {
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState(null);
  const [inputText, setInputText] = useState('');

  const mockChats = [
    {
      id: 'c1',
      customer: 'Rahul Sharma',
      lastMessage: 'Sure, I will visit tomorrow.',
      time: '10:42 AM',
      unread: 2,
      avatarColor: 'bg-primary/10 text-primary',
      messages: [
        { id: 1, sender: 'customer', text: 'Hi, is the cashback offer still active?', time: '10:38 AM' },
        { id: 2, sender: 'vendor', text: 'Yes! It is active until the end of this month.', time: '10:40 AM' },
        { id: 3, sender: 'customer', text: 'Sure, I will visit tomorrow.', time: '10:42 AM' },
      ]
    },
    {
      id: 'c2',
      customer: 'Sneha Patel',
      lastMessage: 'Is the new collection available?',
      time: 'Yesterday',
      unread: 0,
      avatarColor: 'bg-green-500/10 text-green-600',
      messages: [
        { id: 1, sender: 'customer', text: 'Hello, when do you restock?', time: 'Yesterday' },
        { id: 2, sender: 'vendor', text: 'We just restocked this morning!', time: 'Yesterday' },
        { id: 3, sender: 'customer', text: 'Is the new collection available?', time: 'Yesterday' },
      ]
    },
    {
      id: 'c3',
      customer: 'Amit Kumar',
      lastMessage: 'Thanks for the quick response!',
      time: 'Mon',
      unread: 0,
      avatarColor: 'bg-orange-500/10 text-orange-600',
      messages: [
        { id: 1, sender: 'vendor', text: 'Your refund has been initiated.', time: 'Mon' },
        { id: 2, sender: 'customer', text: 'Thanks for the quick response!', time: 'Mon' },
      ]
    },
  ];

  const [chats, setChats] = useState(mockChats);

  const activeChatData = chats.find(c => c.id === selectedChat);

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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChat) return;

    setChats(prevChats => prevChats.map(chat => {
      if (chat.id === selectedChat) {
        return {
          ...chat,
          lastMessage: inputText,
          time: 'Just now',
          unread: 0,
          messages: [
            ...chat.messages,
            {
              id: Date.now(),
              sender: 'vendor',
              text: inputText,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]
        };
      }
      return chat;
    }));
    setInputText('');
  };

  if (selectedChat && activeChatData) {
    return (
      <div 
        className="fixed inset-y-0 left-0 right-0 max-w-[440px] mx-auto w-full md:relative md:inset-auto md:max-w-none md:h-[calc(100vh-120px)] bg-[#f9f9ff] text-left animate-reveal flex flex-col z-40" 
        style={{ fontFamily: "'Quicksand', sans-serif" }}
      >
        {/* Chat Room Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
          <button 
            onClick={() => setSelectedChat(null)} 
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">arrow_back</span>
          </button>
          
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[16px] ${activeChatData.avatarColor}`}>
            {activeChatData.customer.charAt(0)}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[15px] text-on-surface truncate leading-tight">{activeChatData.customer}</h3>
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
          {activeChatData.messages.map((msg) => {
            const isMe = msg.sender === 'vendor';
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-reveal`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-[13.5px] leading-snug ${
                  isMe 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-white border border-outline-variant/10 text-on-surface rounded-tl-none'
                }`}>
                  <p>{msg.text}</p>
                  <span className={`text-[9px] block text-right mt-1.5 ${isMe ? 'text-white/70' : 'text-on-surface-variant'}`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-outline-variant/10 flex gap-2 items-center px-4">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 h-11 px-4 bg-[#F3F4F6] rounded-xl border-none focus:ring-2 focus:ring-primary focus:bg-white text-[13.5px] placeholder:text-outline transition-all"
          />
          <button 
            type="submit"
            className="w-11 h-11 bg-primary text-white rounded-xl flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-reveal text-left" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-2">
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
          {chats.map((chat) => (
            <div 
              key={chat.id} 
              className="py-3.5 flex items-center gap-4 cursor-pointer hover:bg-surface-container-low/45 transition-colors"
              onClick={() => setSelectedChat(chat.id)}
            >
              {/* Avatar */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[18px] flex-shrink-0 ${chat.avatarColor}`}>
                {chat.customer.charAt(0)}
              </div>
              
              {/* Chat Content */}
              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-[15px] text-on-surface truncate">{chat.customer}</h3>
                  <span className={`text-[11px] whitespace-nowrap ml-2 ${chat.unread > 0 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                    {chat.time}
                  </span>
                </div>
                <p className={`text-[13px] truncate ${chat.unread > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                  {chat.lastMessage}
                </p>
              </div>

              {/* Unread Badge */}
              {chat.unread > 0 && (
                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm shadow-primary/20 flex-shrink-0">
                  {chat.unread}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {chats.length === 0 && (
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
