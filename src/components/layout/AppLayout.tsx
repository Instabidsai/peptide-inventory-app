import { useState } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/CommandPalette';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, ShoppingBag, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const partnerNav = [
  { name: 'Dashboard', path: '/partner', icon: LayoutDashboard },
  { name: 'Store', path: '/partner/store', icon: ShoppingBag },
  { name: 'Orders', path: '/partner/orders', icon: ClipboardList },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isPartnerRoute = location.pathname.startsWith('/partner');

  return (
    <div className="min-h-screen bg-background">
      <CommandPalette />
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className={cn(
          "p-4 md:p-6 lg:p-8",
          isPartnerRoute && "pb-24 lg:pb-8" // extra bottom padding for mobile nav
        )}>
          <ErrorBoundary name="Page">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

      {/* Partner mobile bottom navigation */}
      {isPartnerRoute && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border/50 bg-card/95 backdrop-blur-xl z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <nav className="flex justify-around items-center h-14">
            {partnerNav.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="flex flex-col items-center justify-center w-full h-full gap-1 transition-colors"
                >
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
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
