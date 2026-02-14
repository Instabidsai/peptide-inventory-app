import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, BookOpen, Bell, LayoutDashboard, ShoppingBag, Package, ArrowLeft, Briefcase, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

import { ErrorBoundary } from '@/components/ErrorBoundary';

export function ClientLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { userRole, user, profile } = useAuth();
    const isAdmin = userRole?.role === 'admin' || userRole?.role === 'staff';
    const isSalesRep = profile?.role === 'sales_rep' || userRole?.role === 'sales_rep';
    const canGoBack = isAdmin || isSalesRep;

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

    const navItems: Array<{ label: string; icon: typeof Home; path: string; hasBadge?: boolean }> = [
        { label: 'Today', icon: Home, path: '/dashboard', hasBadge: !!(unreadFeedback && unreadFeedback > 0) },
        { label: 'Store', icon: ShoppingBag, path: '/store' },
        { label: 'Learn', icon: BookOpen, path: '/resources' },
        { label: 'Orders', icon: Package, path: '/my-orders' },
        { label: 'Menu', icon: Menu, path: '/menu' },
    ];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Top Bar */}
            <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/30 bg-card/80 backdrop-blur-md px-4 justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                        <Home className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-semibold text-lg text-foreground">Family Hub</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Notification Bell */}
                    <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" onClick={() => navigate('/notifications')}>
                        <Bell className="h-5 w-5" />
                        {unreadNotifications && unreadNotifications > 0 && (
                            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-red-600 border border-background animate-pulse" />
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
            <main className="flex-1 p-4 pb-24 overflow-x-hidden"> {/* Padding bottom for mobile nav */}
                <ErrorBoundary name="Page">
                    <Outlet />
                </ErrorBoundary>
            </main>

            {/* Bottom Navigation (Mobile First) */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-border/30 bg-card/80 backdrop-blur-md z-40 pb-safe">
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
                                <div className={cn("relative p-1.5 rounded-xl transition-colors", isActive && "bg-primary/10")}>
                                    <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                                    {item.hasBadge && (
                                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-600 border border-background animate-pulse" />
                                    )}
                                </div>
                                <span className="text-xs font-medium">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
