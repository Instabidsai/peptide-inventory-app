import { useState } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/CommandPalette';
import { AdminAIChat } from '@/components/ai/AdminAIChat';
import { PartnerAIChat } from '@/components/ai/PartnerAIChat';
import { useTenantTheme } from '@/hooks/use-tenant-theme';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { RouteProgress } from '@/components/ui/route-progress';
import { LayoutDashboard, ShoppingBag, ClipboardList, Users, PackageCheck, X, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

const partnerNav = [
  { name: 'Dashboard', path: '/partner', icon: LayoutDashboard },
  { name: 'Store', path: '/partner/store', icon: ShoppingBag },
  { name: 'Orders', path: '/partner/orders', icon: ClipboardList },
  { name: 'Fulfillment', path: '/fulfillment', icon: PackageCheck },
  { name: 'Customers', path: '/contacts', icon: Users },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isPartnerRoute = location.pathname.startsWith('/partner');
  const { isImpersonating, orgName, stopImpersonation } = useImpersonation();
  // Inject tenant's primary color into CSS variables
  useTenantTheme();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <RouteProgress />
      <div className="fixed inset-0 pointer-events-none noise-overlay z-0 opacity-[0.015]" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
        Skip to main content
      </a>
      <ErrorBoundary fallback={null}>
        <CommandPalette />
      </ErrorBoundary>

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-black px-4 py-1.5 flex items-center justify-center gap-3 text-sm font-medium shadow-lg">
          <Eye className="h-4 w-4" />
          <span>Viewing as <strong>{orgName}</strong></span>
          <button
            onClick={() => { stopImpersonation(); navigate('/vendor/tenants'); }}
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 transition-colors text-xs font-bold"
          >
            <X className="h-3 w-3" /> Exit
          </button>
        </div>
      )}
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 z-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — wrapped in ErrorBoundary so a crash doesn't kill the whole layout */}
      <ErrorBoundary fallback={
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border/30 hidden lg:flex flex-col items-center justify-center p-6">
          <p className="text-sm text-muted-foreground text-center">Menu unavailable — please reload the page.</p>
        </aside>
      }>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </ErrorBoundary>

      {/* Main content */}
      <div className="lg:pl-64">
        <ErrorBoundary fallback={
          <header className="sticky top-0 z-30 flex h-20 items-center border-b border-primary/10 bg-background/40 px-6">
            <p className="text-sm text-muted-foreground">Navigation error — please reload the page.</p>
          </header>
        }>
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
        </ErrorBoundary>
        <main id="main-content" className={cn(
          "p-4 md:p-6 lg:p-8",
          isPartnerRoute && "pb-24 lg:pb-8" // extra bottom padding for mobile nav
        )}>
          <ErrorBoundary>
              <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Admin AI Chat (admin/staff only) — wrapped so a crash doesn't kill layout */}
      <ErrorBoundary fallback={null}>
        <AdminAIChat />
      </ErrorBoundary>
      {/* Partner AI Chat (sales_rep only) */}
      <ErrorBoundary fallback={null}>
        <PartnerAIChat />
      </ErrorBoundary>

      {/* Partner mobile bottom navigation */}
      {isPartnerRoute && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border/30 bg-card/80 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.2)] z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <nav aria-label="Partner navigation" className="flex justify-around items-center h-16">
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
