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
          {/* Mobile: constrained single-column like user app */}
          <div className="md:hidden max-w-[440px] mx-auto w-full px-4 pb-28 space-y-4">
            {children}
          </div>
          {/* Desktop: full-width dashboard */}
          <div className="hidden md:block p-8">
            <div className="max-w-7xl mx-auto space-y-6">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <VendorBottomNav />
    </div>
  );
}
