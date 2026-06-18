import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function ChatPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const mockChats = [
    {
      id: 'c1',
      customer: 'Rahul Sharma',
      lastMessage: 'Sure, I will visit tomorrow.',
      time: '10:42 AM',
      unread: 2,
      avatarColor: 'bg-primary/10 text-primary',
    },
    {
      id: 'c2',
      customer: 'Sneha Patel',
      lastMessage: 'Is the new collection available?',
      time: 'Yesterday',
      unread: 0,
      avatarColor: 'bg-green-500/10 text-green-600',
    },
    {
      id: 'c3',
      customer: 'Amit Kumar',
      lastMessage: 'Thanks for the quick response!',
      time: 'Mon',
      unread: 0,
      avatarColor: 'bg-orange-500/10 text-orange-600',
    },
  ];

  if (isLoading) {
    return <SkeletonLoader type="list" count={4} />;
  }

  return (
    <div className="animate-reveal text-left">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center border-b border-outline-variant/10 shadow-sm mb-lg">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <span className="font-display text-title-md text-primary font-bold ml-1">Messages</span>
      </header>

      <div className="space-y-4 pt-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-display text-[20px] font-black text-on-surface">Chats</h2>
          <button className="text-primary p-2 bg-primary/5 rounded-full hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
        </div>

        <div className="bg-white rounded-[24px] border border-outline-variant/10 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden">
          {mockChats.map((chat, index) => (
            <div 
              key={chat.id} 
              className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-surface-container-low transition-colors ${
                index !== mockChats.length - 1 ? 'border-b border-outline-variant/5' : ''
              }`}
              onClick={() => alert(`Opening chat with ${chat.customer}`)}
            >
              {/* Avatar */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[18px] flex-shrink-0 ${chat.avatarColor}`}>
                {chat.customer.charAt(0)}
              </div>
              
              {/* Chat Content */}
              <div className="flex-1 min-w-0">
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
        
        {mockChats.length === 0 && (
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
