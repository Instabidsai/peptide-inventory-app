import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, ListChecks, BookOpen, Settings, Utensils, Scale, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/ui/PageTransition';

export function ClientLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { userRole } = useAuth();
    const isAdmin = userRole?.role === 'admin' || userRole?.role === 'staff';

    const { data: unreadCount } = useQuery({
        queryKey: ['unread-feedback'],
        queryFn: async () => {
            const { count, error } = await supabase
                .from('protocol_feedback')
                .select('*', { count: 'exact', head: true })
                .eq('is_read_by_client', false)
                .not('admin_response', 'is', null);

            if (error) return 0;
            return count || 0;
        },
        refetchInterval: 30000, // Poll every 30s
    });

    const navItems = [
        { label: 'Home', icon: Home, path: '/dashboard' },
        { label: 'Regimen', icon: ListChecks, path: '/my-regimen', hasBadge: unreadCount && unreadCount > 0 },
        { label: 'Macros', icon: Utensils, path: '/macro-tracker' },
        { label: 'Body', icon: Scale, path: '/body-composition' },
        { label: 'Resources', icon: BookOpen, path: '/resources' },
        { label: 'Messages', icon: MessageSquare, path: '/messages' },
        { label: 'Settings', icon: Settings, path: '/account' },
    ];

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-50 via-background to-background dark:from-slate-950 dark:via-background dark:to-background flex flex-col">
            {/* Top Bar (Simplified) */}
            <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 justify-between">
                <div className="font-semibold text-lg">Family Hub</div>
                {isAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Admin View
                    </Button>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 p-4 pb-24 overflow-x-hidden"> {/* Padding bottom for mobile nav */}
                <AnimatePresence mode="wait">
                    <PageTransition key={location.pathname} className="h-full">
                        <Outlet />
                    </PageTransition>
                </AnimatePresence>
            </main>

            {/* Bottom Navigation (Mobile First) */}
            <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 pb-safe">
                <nav className="flex justify-around items-center h-16">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={cn(
                                    "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative",
                                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <div className="relative">
                                    <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                                    {/* @ts-ignore */}
                                    {item.hasBadge && (
                                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-600 border border-background animate-pulse" />
                                    )}
                                </div>
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
