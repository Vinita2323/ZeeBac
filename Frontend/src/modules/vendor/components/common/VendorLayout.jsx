import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import VendorSidebar from './VendorSidebar';
import VendorTopBar from './VendorTopBar';
import VendorBottomNav from './VendorBottomNav';
import { getSocket } from '../../../../services/socket';
import { playStoreNewOrderAlarm } from '../../../../utils/voiceUtils';

export default function VendorLayout({ children }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Only show the logo top bar on the dashboard home page (like user app's HomeScreen)
  const isDashboard = location.pathname === '/vendor' || location.pathname === '/vendor/';

  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch (_) {}

    if (socket) {
      const handleGlobalNewOrder = (data) => {
        // If merchant is not on requests page, sound alarm and show notification pill
        if (location.pathname !== '/vendor/requests') {
          const order = data?.order || data;
          playStoreNewOrderAlarm({
            orderId: order?.orderId,
            amount: order?.finalPayableAmount || order?.totalAmount,
            customerName: order?.customerName,
          });
          setNewOrderAlert(order);
        }
      };

      socket.on('order:new', handleGlobalNewOrder);
      return () => {
        socket.off('order:new', handleGlobalNewOrder);
      };
    }
  }, [location.pathname]);

  return (
    <div className="h-[100dvh] bg-[#f9f9ff] text-on-surface font-body-lg flex overflow-hidden">
      {/* Global New Order Incoming Floating Banner */}
      {newOrderAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-purple-500/30 flex items-center justify-between gap-3 animate-reveal">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-purple-400 flex items-center justify-center shrink-0 animate-pulse">
              <span className="material-symbols-outlined text-[24px]">notifications_active</span>
            </div>
            <div className="min-w-0">
              <p className="font-display font-black text-[13.5px] truncate">
                New Order #{newOrderAlert.orderId || ''}!
              </p>
              <p className="text-[11px] text-slate-300">
                Amount: ₹{newOrderAlert.finalPayableAmount || newOrderAlert.totalAmount || 0} • {newOrderAlert.customerName || 'Customer'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setNewOrderAlert(null);
                navigate('/vendor/requests');
              }}
              className="px-3.5 py-2 rounded-xl btn-primary-gradient text-white text-[11.5px] font-bold shadow-xs cursor-pointer active:scale-95"
            >
              View Order
            </button>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (Hidden on mobile) */}
      <div className={`hidden md:block flex-shrink-0 transition-all duration-300 relative z-20 ${isDesktopCollapsed ? 'w-[88px]' : 'w-[260px]'}`}>
        <VendorSidebar 
          isCollapsed={isDesktopCollapsed} 
          onToggleCollapse={() => setIsDesktopCollapsed(!isDesktopCollapsed)} 
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10 md:mesh-gradient">
        {/* Top Bar — only on dashboard for mobile, always for desktop */}
        <div className={isDashboard ? '' : 'hidden md:block'}>
          <VendorTopBar />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scroll-smooth bg-[#f8f9fc]">
          <div className="w-full max-w-full sm:max-w-2xl md:max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-8 pb-28 md:pb-8 space-y-4 md:space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <VendorBottomNav />
    </div>
  );
}

