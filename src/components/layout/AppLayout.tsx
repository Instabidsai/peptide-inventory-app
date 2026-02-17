import { useState } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/CommandPalette';
import { AdminAIChat } from '@/components/ai/AdminAIChat';
// Note: framer-motion transitions removed — opacity exit + backdrop-blur caused fuzzy screen on mobile
import { LayoutDashboard, ShoppingBag, ClipboardList, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const partnerNav = [
  { name: 'Dashboard', path: '/partner', icon: LayoutDashboard },
  { name: 'Store', path: '/partner/store', icon: ShoppingBag },
  { name: 'Orders', path: '/partner/orders', icon: ClipboardList },
  { name: 'People', path: '/contacts', icon: Users },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isPartnerRoute = location.pathname.startsWith('/partner');

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
        Skip to main content
      </a>
      <CommandPalette />
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 z-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className={cn(
          "p-4 md:p-6 lg:p-8",
          isPartnerRoute && "pb-24 lg:pb-8" // extra bottom padding for mobile nav
        )}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Admin AI Chat */}
      <AdminAIChat />

      {/* Partner mobile bottom navigation */}
      {isPartnerRoute && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border/50 bg-card z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <nav className="flex justify-around items-center h-16">
            {partnerNav.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex flex-col items-center justify-center w-full h-full gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <item.icon className={cn("h-6 w-6", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                    {item.name}
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
