import { useNavigate } from 'react-router-dom';

export default function ChatScreen() {
  const navigate = useNavigate();

  const mockChats = [
    {
      id: 1,
      shop: 'Noir Concept Store',
      message: 'Your order is ready for pickup!',
      time: '2 mins ago',
      unread: 1,
      avatar: 'N'
    },
    {
      id: 2,
      shop: 'Fresh Foods Organic',
      message: 'Thanks for visiting us today.',
      time: 'Yesterday',
      unread: 0,
      avatar: 'F'
    }
  ];

  return (
    <div className="bg-[#f9f9ff] text-on-surface min-h-screen flex flex-col font-body-lg pb-safe">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={() => navigate(-1)} 
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="font-display font-black text-[20px]">Messages</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[440px] mx-auto w-full px-4 py-6 space-y-4 text-left">
        {mockChats.map(chat => (
          <div 
            key={chat.id} 
            className="bg-white rounded-2xl p-4 border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex gap-4 items-center cursor-pointer hover:shadow-md hover:border-primary/20 transition-all active:scale-[0.98]"
            onClick={() => alert(`Chat with ${chat.shop} will open here!`)}
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[18px] flex-shrink-0">
              {chat.avatar}
            </div>
            
            {/* Message Details */}
            <div className="flex-1 min-w-0">
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
      </main>

    </div>
  );
}
