import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import VendorSidebar from './VendorSidebar';
import VendorTopBar from './VendorTopBar';
import VendorBottomNav from './VendorBottomNav';

export default function VendorLayout({ children }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const location = useLocation();
  
  // Only show the logo top bar on the dashboard home page (like user app's HomeScreen)
  const isDashboard = location.pathname === '/vendor' || location.pathname === '/vendor/';

  return (
    <div className="h-[100dvh] bg-[#f9f9ff] text-on-surface font-body-lg flex overflow-hidden">
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
          <div className="w-full max-w-[480px] md:max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-8 pb-28 md:pb-8 space-y-4 md:space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <VendorBottomNav />
    </div>
  );
}

