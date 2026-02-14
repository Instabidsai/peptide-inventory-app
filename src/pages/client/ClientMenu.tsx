import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { GlassCard, CardContent } from '@/components/ui/glass-card';
import {
    User,
    ListChecks,
    Activity,
    MessageSquare,
    Bell,
    Users,
    LogOut,
    ChevronRight,
} from 'lucide-react';

const menuItems = [
    { label: 'Account & Profile', description: 'Manage your settings', icon: User, path: '/account' },
    { label: 'Full Regimen', description: 'Detailed protocol view', icon: ListChecks, path: '/my-regimen' },
    { label: 'Health Tracking', description: 'Macros, body comp & hydration', icon: Activity, path: '/health' },
    { label: 'Messages & Requests', description: 'Contact your care team', icon: MessageSquare, path: '/messages' },
    { label: 'Notifications', description: 'Updates and alerts', icon: Bell, path: '/notifications' },
    { label: 'Community Forum', description: 'Connect with others', icon: Users, path: '/community' },
];

export default function ClientMenu() {
    const navigate = useNavigate();
    const { signOut } = useAuth();

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Menu</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Access all features and settings
                </p>
            </div>

            <div className="space-y-3">
                {menuItems.map((item) => (
                    <Button
                        key={item.path}
                        variant="secondary"
                        className="w-full justify-between h-auto py-4 hover:border-primary/20 border border-transparent"
                        onClick={() => navigate(item.path)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-background rounded-full">
                                <item.icon className="h-4 w-4" />
                            </div>
                            <div className="text-left">
                                <div className="font-medium">{item.label}</div>
                                <div className="text-xs text-muted-foreground">{item.description}</div>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                ))}
            </div>

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
