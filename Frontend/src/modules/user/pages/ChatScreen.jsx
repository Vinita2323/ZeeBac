import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChatScreen() {
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState(null);
  const [inputText, setInputText] = useState('');

  const mockChats = [
    {
      id: 1,
      shop: 'Noir Concept Store',
      message: 'Your order is ready for pickup!',
      time: '2 mins ago',
      unread: 1,
      avatar: 'N',
      messages: [
        { id: 1, sender: 'vendor', text: 'Hi! Your custom jacket is completed.', time: '10:00 AM' },
        { id: 2, sender: 'customer', text: 'Awesome! Can I collect it today?', time: '10:15 AM' },
        { id: 3, sender: 'vendor', text: 'Your order is ready for pickup!', time: '2 mins ago' },
      ]
    },
    {
      id: 2,
      shop: 'Fresh Foods Organic',
      message: 'Thanks for visiting us today.',
      time: 'Yesterday',
      unread: 0,
      avatar: 'F',
      messages: [
        { id: 1, sender: 'customer', text: 'Do you have organic strawberries in stock?', time: 'Yesterday' },
        { id: 2, sender: 'vendor', text: 'Yes, we just got a fresh batch!', time: 'Yesterday' },
        { id: 3, sender: 'customer', text: 'Great, thanks for visiting us today.', time: 'Yesterday' },
      ]
    }
  ];

  const [chats, setChats] = useState(mockChats);

  const activeChatData = chats.find(c => c.id === selectedChat);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChat) return;

    setChats(prevChats => prevChats.map(chat => {
      if (chat.id === selectedChat) {
        return {
          ...chat,
          message: inputText,
          time: 'Just now',
          unread: 0,
          messages: [
            ...chat.messages,
            {
              id: Date.now(),
              sender: 'customer',
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
      <div className="flex flex-col h-screen bg-[#f9f9ff] text-left animate-reveal" style={{ fontFamily: "'Quicksand', sans-serif" }}>
        {/* Chat Room Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
          <button 
            onClick={() => setSelectedChat(null)} 
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary text-[22px]">arrow_back</span>
          </button>
          
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[16px]">
            {activeChatData.avatar}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[15px] text-on-surface truncate leading-tight">{activeChatData.shop}</h3>
            <p className="text-[11px] text-green-600 font-semibold flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse"></span>
              Online
            </p>
          </div>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
          {activeChatData.messages.map((msg) => {
            const isMe = msg.sender === 'customer';
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
        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-outline-variant/10 flex gap-2 items-center pb-safe">
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
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-safe" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-outline-variant/10 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
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
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className="py-3.5 flex items-center gap-4 cursor-pointer hover:bg-surface-container-low/45 transition-colors"
              onClick={() => setSelectedChat(chat.id)}
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[18px] flex-shrink-0">
                {chat.avatar}
              </div>
              
              {/* Message Details */}
              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-[15px] truncate pr-2">{chat.shop}</h3>
                  <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{chat.time}</span>
                </div>
                <p className={`text-[13px] truncate ${chat.unread > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                  {chat.message}
                </p>
              </div>
              
              {/* Unread Badge */}
              {chat.unread > 0 && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {chat.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

    </div>
  );
}
