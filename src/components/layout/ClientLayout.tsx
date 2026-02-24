import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, BookOpen, Bell, LayoutDashboard, ShoppingBag, Package, Briefcase, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useTenantConfig } from '@/hooks/use-tenant-config';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FloatingHelpWidget } from '@/components/client/FloatingHelpWidget';
import { BugReportButton } from '@/components/BugReportButton';

export function ClientLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { userRole, user, profile } = useAuth();
    const { brand_name: brandName } = useTenantConfig();
    const isAdmin = userRole?.role === 'admin' || userRole?.role === 'staff';
    const isSalesRep = profile?.role === 'sales_rep' || userRole?.role === 'sales_rep';

    const { data: unreadFeedback } = useQuery({
        queryKey: ['unread-feedback', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            const { count, error } = await supabase
                .from('protocol_feedback')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read_by_client', false)
                .not('admin_response', 'is', null);
            if (error) return 0;
            return count || 0;
        },
        enabled: !!user?.id,
        refetchInterval: 30000,
    });

    const { data: unreadNotifications } = useQuery({
        queryKey: ['unread-notifications', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            try {
                const { count, error } = await supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false);

                if (error) return 0;
                return count || 0;
            } catch (e) {
                return 0;
            }
        },
        enabled: !!user?.id,
        refetchInterval: 15000,
    });

    const totalUnread = (unreadFeedback || 0) + (unreadNotifications || 0);

    const navItems: Array<{ label: string; icon: typeof Home; path: string; hasBadge?: boolean; badgeCount?: number }> = [
        { label: 'Today', icon: Home, path: '/dashboard', hasBadge: !!(unreadFeedback && unreadFeedback > 0) },
        { label: 'Store', icon: ShoppingBag, path: '/store' },
        { label: 'Learn', icon: BookOpen, path: '/resources' },
        { label: 'Orders', icon: Package, path: '/my-orders' },
        { label: 'Menu', icon: Menu, path: '/menu', hasBadge: totalUnread > 0, badgeCount: totalUnread },
    ];

    return (
        <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
            <div className="fixed inset-0 pointer-events-none noise-overlay z-0 opacity-[0.012]" />
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
                Skip to main content
            </a>
            {/* Top Bar */}
            <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-primary/10 bg-background/40 backdrop-blur-2xl px-4 justify-between shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-2.5 relative group cursor-pointer" onClick={() => navigate('/dashboard')}>
                    <div className="absolute -inset-2 bg-gradient-to-tr from-primary/40 to-emerald-400/20 rounded-xl blur-md opacity-60 group-hover:opacity-100 transition duration-500" />
                    <div className="relative p-1 bg-gradient-to-br from-card to-background rounded-xl ring-1 ring-primary/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)] overflow-hidden flex items-center justify-center">
                        <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <span className="font-bold text-lg tracking-tight text-gradient-primary relative z-10">{brandName}</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Notification Bell */}
                    <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" onClick={() => navigate('/notifications')}>
                        <Bell className="h-5 w-5" />
                        {unreadNotifications && unreadNotifications > 0 && (
                            <>
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 border-2 border-card text-[10px] font-bold text-white leading-none px-1 z-10">
                                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                                </span>
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 animate-ping opacity-75" />
                            </>
                        )}
                    </Button>

                    {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-primary/20 hover:bg-primary/10 hover:text-primary">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Admin
                        </Button>
                    )}
                    {isSalesRep && !isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => navigate('/partner')} className="border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400">
                            <Briefcase className="mr-2 h-4 w-4" />
                            Partner Portal
                        </Button>
                    )}
                </div>
            </header>

            {/* Content */}
            <main id="main-content" className="flex-1 p-4 pb-24 overflow-x-hidden">
                <ErrorBoundary>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </ErrorBoundary>
            </main>

            {/* Floating Help Widget */}
            <FloatingHelpWidget />
            {/* Bug report floating button */}
            <BugReportButton />

            {/* Bottom Navigation (Mobile First) */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-primary/10 bg-background/60 backdrop-blur-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <nav className="flex justify-around items-center h-16">
                    {navItems.map((item) => {
                        const isActive = item.path === '/menu'
                            ? ['/menu', '/account', '/health', '/messages', '/community', '/my-regimen', '/macro-tracker', '/body-composition', '/notifications'].includes(location.pathname)
                            : location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                                    isActive ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"
                                )}
                            >
                                <div className="relative p-1.5 rounded-xl">
                                    {isActive && (
                                        <motion.div
                                            layoutId="nav-pill"
                                            className="absolute inset-0 bg-primary/10 rounded-xl shadow-[0_2px_12px_rgba(16,185,129,0.25)]"
                                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <item.icon className={cn("h-5 w-5 relative z-10", isActive && "fill-current")} />
                                    {item.hasBadge && (
                                        item.badgeCount && item.badgeCount > 0
                                            ? <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-600 border-2 border-background text-[10px] font-bold text-white leading-none px-1">{item.badgeCount > 9 ? '9+' : item.badgeCount}</span>
                                            : <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-600 border border-background animate-pulse" />
                                    )}
                                </div>
                                <span className={cn("text-[11px] transition-all duration-200", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
