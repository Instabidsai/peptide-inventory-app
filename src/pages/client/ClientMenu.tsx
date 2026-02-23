import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard, CardContent } from '@/components/ui/glass-card';
import { motion } from 'framer-motion';
import {
    User,
    ListChecks,
    Activity,
    MessageSquare,
    Bell,
    Users,
    Heart,
    LogOut,
    ChevronRight,
} from 'lucide-react';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useHouseholdMembers } from '@/hooks/use-household';

interface MenuItem {
    label: string;
    description: string;
    icon: typeof User;
    path: string;
    badgeKey?: 'messages' | 'notifications';
    staticBadge?: string;
}

const BASE_MENU_ITEMS: MenuItem[] = [
    { label: 'Account & Profile', description: 'Manage your settings', icon: User, path: '/account' },
    { label: 'Full Regimen', description: 'Detailed protocol view', icon: ListChecks, path: '/my-regimen' },
    { label: 'Health Tracking', description: 'Macros, body comp & hydration', icon: Activity, path: '/health' },
    { label: 'Messages & Requests', description: 'Contact your care team', icon: MessageSquare, path: '/messages', badgeKey: 'messages' },
    { label: 'Notifications', description: 'Updates and alerts', icon: Bell, path: '/notifications', badgeKey: 'notifications' },
    { label: 'Community Forum', description: 'Connect with others', icon: Users, path: '/community' },
];

export default function ClientMenu() {
    const navigate = useNavigate();
    const { signOut, user } = useAuth();
    const { data: contact } = useClientProfile();
    const { data: householdMembers } = useHouseholdMembers(contact?.id);
    const memberCount = householdMembers?.length ?? 0;

    // Build menu items, inserting Family after Account if user has/can have household
    const menuItems: MenuItem[] = [
        BASE_MENU_ITEMS[0], // Account & Profile
        {
            label: 'My Family',
            description: memberCount > 1 ? `${memberCount} members sharing your fridge` : 'Add family members to share doses',
            icon: Heart,
            path: '/account?section=family',
            staticBadge: memberCount > 1 ? `${memberCount}` : undefined,
        },
        ...BASE_MENU_ITEMS.slice(1),
    ];

    const { data: unreadNotifications } = useQuery({
        queryKey: ['unread-notifications-menu', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);
            return count || 0;
        },
        enabled: !!user?.id,
    });

    const { data: unreadMessages } = useQuery({
        queryKey: ['unread-messages-menu', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            const { count } = await supabase
                .from('client_requests')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .not('admin_notes', 'is', null)
                .eq('status', 'pending');
            return count || 0;
        },
        enabled: !!user?.id,
    });

    const badgeCounts: Record<string, number> = {
        messages: unreadMessages || 0,
        notifications: unreadNotifications || 0,
        family: memberCount > 1 ? memberCount : 0,
    };

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Menu</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Access all features and settings
                </p>
            </div>

            <motion.div
                className="space-y-3"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
                {menuItems.map((item) => {
                    const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                    return (
                        <motion.div key={item.label} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }} whileTap={{ scale: 0.97 }}>
                        <Button
                            variant="secondary"
                            className="w-full justify-between h-auto py-4 hover:border-primary/20 border border-transparent"
                            onClick={() => navigate(item.path)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-background rounded-full relative">
                                    <item.icon className="h-4 w-4" />
                                    {count > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white leading-none px-0.5">{count > 9 ? '9+' : count}</span>
                                    )}
                                </div>
                                <div className="text-left">
                                    <div className="font-medium flex items-center gap-2">
                                        {item.label}
                                        {count > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-500/10 text-red-400 border-red-500/20">{count} new</Badge>}
                                        {item.staticBadge && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-violet-500/10 text-violet-400 border-violet-500/20">{item.staticBadge} members</Badge>}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{item.description}</div>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Sign Out */}
            <GlassCard className="border-destructive/20">
                <CardContent className="pt-6">
                    <Button
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => signOut()}
                    >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </CardContent>
            </GlassCard>
        </div>
    );
}
