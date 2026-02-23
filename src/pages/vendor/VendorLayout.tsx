import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
    Building2,
    BarChart3,
    CreditCard,
    Activity,
    MessageSquare,
    LifeBuoy,
    Rocket,
    ScrollText,
    Settings,
    Shield,
    ChevronLeft,
    Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const vendorNav = [
    { name: 'Overview', path: '/vendor', icon: Shield, end: true },
    { name: 'Tenants', path: '/vendor/tenants', icon: Building2 },
    { name: 'Supply Orders', path: '/vendor/supply-orders', icon: Package },
    { name: 'Analytics', path: '/vendor/analytics', icon: BarChart3 },
    { name: 'Billing', path: '/vendor/billing', icon: CreditCard },
    { name: 'Health', path: '/vendor/health', icon: Activity },
    { name: 'Support', path: '/vendor/support', icon: LifeBuoy },
    { name: 'Onboarding', path: '/vendor/onboarding', icon: Rocket },
    { name: 'Messages', path: '/vendor/messages', icon: MessageSquare },
    { name: 'Audit', path: '/vendor/audit', icon: ScrollText },
    { name: 'Settings', path: '/vendor/settings', icon: Settings },
];

export default function VendorLayout() {
    const location = useLocation();

    return (
        <div className="flex min-h-[calc(100vh-4rem)]">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-border/40 bg-card/30 hidden md:block">
                <div className="sticky top-0 p-3 space-y-1 overflow-y-auto max-h-screen">
                    <div className="flex items-center gap-2 px-3 py-2 mb-2">
                        <Shield className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-sm">Vendor Panel</span>
                    </div>
                    {vendorNav.map((item) => {
                        const isActive = item.end
                            ? location.pathname === item.path
                            : location.pathname.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                                    isActive
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                )}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.name}
                            </NavLink>
                        );
                    })}
                    <div className="pt-4 px-3">
                        <NavLink to="/">
                            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back to App
                            </Button>
                        </NavLink>
                    </div>
                </div>
            </aside>

            {/* Mobile nav */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur z-40 overflow-x-auto">
                <nav className="flex px-2 py-1.5 gap-1 min-w-max">
                    {vendorNav.map((item) => {
                        const isActive = item.end
                            ? location.pathname === item.path
                            : location.pathname.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    'flex flex-col items-center px-2.5 py-1.5 rounded text-[10px] transition-colors',
                                    isActive ? 'text-primary' : 'text-muted-foreground'
                                )}
                            >
                                <item.icon className="h-4 w-4 mb-0.5" />
                                {item.name}
                            </NavLink>
                        );
                    })}
                </nav>
            </div>

            {/* Main content */}
            <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
                <Outlet />
            </main>
        </div>
    );
}
