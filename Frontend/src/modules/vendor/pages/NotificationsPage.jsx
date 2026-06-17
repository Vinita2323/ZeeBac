import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  const notificationsGroups = [
    {
      date: 'Today',
      items: [
        { id: 1, type: 'approval', title: 'New Approval Request', message: 'Rahul Sharma requested approval for ₹850.', time: '2 mins ago', read: false, icon: 'pending_actions', color: 'orange' },
        { id: 2, type: 'credit', title: 'Settlement Successful', message: '₹15,000 settled to your HDFC Bank account.', time: '10:30 AM', read: false, icon: 'account_balance', color: 'green' },
      ]
    },
    {
      date: 'Yesterday',
      items: [
        { id: 3, type: 'referral', title: 'Referral Bonus Credited!', message: 'You earned ₹500 for referring Fresh Foods Organic.', time: '4:15 PM', read: true, icon: 'redeem', color: 'primary' },
        { id: 4, type: 'system', title: 'System Maintenance', message: 'Scheduled maintenance on Oct 25, 2AM–4AM.', time: '9:00 AM', read: true, icon: 'info', color: 'gray' },
        { id: 5, type: 'approval', title: 'Transaction Approved', message: 'Priya Singh\'s bill of ₹2,100 approved. ₹210 cashback deducted.', time: '11:30 AM', read: true, icon: 'check_circle', color: 'green' },
      ]
    }
  ];

  const getColorClasses = (color, read) => {
    switch(color) {
      case 'orange': return `bg-orange-500/10 text-orange-500`;
      case 'green': return `bg-green-500/10 text-green-600`;
      case 'primary': return `bg-primary/10 text-primary`;
      default: return `bg-surface-container-high text-on-surface-variant`;
    }
  };

  if (isLoading) {
    return <SkeletonLoader type="list" count={4} />;
  }

  return (
    <div className="animate-reveal text-left">
      
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-white/70 backdrop-blur-md -mx-container-margin px-container-margin py-md flex items-center justify-between border-b border-outline-variant/10 shadow-sm mb-lg">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant active:scale-95 cursor-pointer">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <span className="font-display text-title-md text-primary font-bold ml-1">Notifications</span>
        </div>
        <button 
          onClick={() => alert('Marked all as read')}
          className="text-primary text-[12px] font-bold"
        >
          Mark all read
        </button>
      </header>

      <div className="space-y-6 pt-4">
        {notificationsGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-3">
            <h3 className="text-on-surface-variant font-bold text-[12px] uppercase tracking-wider pl-1">{group.date}</h3>
            
            <div className="space-y-3">
              {group.items.map(notif => (
                <div key={notif.id} className={`bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 active:scale-[0.98] transition-transform flex gap-3 ${!notif.read ? 'border-l-4 border-l-primary' : ''}`}>
                  
                  <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center ${getColorClasses(notif.color, notif.read)}`}>
                    <span className="material-symbols-outlined text-[22px]">{notif.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`font-bold text-[14px] ${notif.read ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                        {notif.title}
                      </h4>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {!notif.read && (
                          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(55,0,161,0.4)]"></div>
                        )}
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                          {notif.time}
                        </span>
                      </div>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${notif.read ? 'text-on-surface-variant/70' : 'text-on-surface-variant'}`}>
                      {notif.message}
                    </p>
                    
                    {notif.type === 'approval' && !notif.read && (
                      <div className="flex gap-2 pt-3">
                        <button 
                          onClick={() => alert('Rejected')}
                          className="flex-1 py-2 rounded-xl border border-red-500/30 text-red-600 bg-red-50 hover:bg-red-100 text-[12px] font-bold active:scale-[0.97] transition-colors"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => alert('Approved')}
                          className="flex-1 py-2 rounded-xl bg-primary text-white hover:bg-primary-fixed-variant text-[12px] font-bold shadow-sm active:scale-[0.97] transition-colors shadow-primary/20"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
