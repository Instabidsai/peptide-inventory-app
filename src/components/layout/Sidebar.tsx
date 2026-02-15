import { NavLink, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import {
  LayoutDashboard, FlaskConical, Users, FileText, ArrowLeftRight, Settings, X, MessageSquare, Package, Pill, ChevronRight, BookOpen,
  ClipboardList,
  ShoppingBag,
  Briefcase,
  DollarSign,
  PieChart,
  Network,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Peptides', href: '/peptides', icon: FlaskConical, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Orders', href: '/orders', icon: ClipboardList, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Sales Orders', href: '/sales', icon: ShoppingBag, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Partners', href: '/admin/reps', icon: Briefcase, roles: ['admin'] },
  { name: 'Financials', href: '/admin/finance', icon: PieChart, roles: ['admin'] },
  { name: 'Commissions', href: '/admin/commissions', icon: DollarSign, roles: ['admin'] },
  { name: 'Lots', href: '/lots', icon: Package, roles: ['admin', 'staff'] },
  { name: 'Bottles', href: '/bottles', icon: Pill, roles: ['admin', 'staff'] },
  { name: 'Supplements', href: '/admin/supplements', icon: FlaskConical, roles: ['admin', 'staff'] },
  { name: 'Contacts', href: '/contacts', icon: Users, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Protocols', href: '/protocols', icon: FileText, roles: ['admin', 'staff'] },
  { name: 'Protocol Builder', href: '/protocol-builder', icon: Wand2, roles: ['admin', 'staff'] },
  { name: 'Resources', href: '/admin-resources', icon: BookOpen, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Requests', href: '/requests', icon: MessageSquare, roles: ['admin', 'staff'] },
  { name: 'Feedback', href: '/feedback', icon: MessageSquare, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Movements', href: '/movements', icon: ArrowLeftRight, roles: ['admin', 'staff'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Partner Portal', href: '/partner', icon: Network, roles: ['sales_rep', 'admin'] },
  { name: 'Partner Store', href: '/partner/store', icon: ShoppingBag, roles: ['sales_rep', 'admin'] },
  { name: 'My Orders', href: '/partner/orders', icon: ClipboardList, roles: ['sales_rep', 'admin'] },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { organization, userRole, user, profile: authProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const previewRole = searchParams.get('preview_role');

  const effectiveRole = previewRole || (
    (userRole?.role === 'sales_rep' || authProfile?.role === 'sales_rep') ? 'sales_rep' : userRole?.role
  );

  // Fetch verified profile data for balance
  const { data: balanceData } = useQuery({
    queryKey: ['my_sidebar_profile'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('credit_balance').eq('user_id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  // Fetch pending request count for badge
  const { data: pendingRequestCount } = useQuery({
    queryKey: ['pending_request_count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('client_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending']);
      return count || 0;
    },
    enabled: effectiveRole === 'admin' || effectiveRole === 'staff',
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border/50 transform transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:translate-x-0',
        open ? 'translate-x-0 shadow-2xl shadow-black/30' : '-translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg ring-1 ring-primary/20 shadow-sm shadow-primary/10">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">
              {organization?.name || 'Inventory'}
            </span>
            <span className="text-[11px] text-muted-foreground -mt-0.5">Tracker</span>

            {/* Sales Rep Wallet */}
            {effectiveRole === 'sales_rep' && (
              <div className="mt-1 flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-emerald-900/60 to-green-900/40 rounded-md text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30 shadow-sm shadow-emerald-500/10">
                <DollarSign className="h-3 w-3" />
                <span>${Number(balanceData?.credit_balance || 0).toFixed(2)}</span>
              </div>
            )}

          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-sidebar-foreground"
          aria-label="Close menu"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.filter(item => {
          // Standard Role Check
          if (item.roles && !item.roles.includes(organization?.role || effectiveRole || '')) {
            // Allow if allowedRoles matches
            if (!effectiveRole) return false;
            if (!item.roles.includes(effectiveRole)) return false;
          }

          // Special: Sales Rep Restriction
          if (effectiveRole === 'sales_rep') {
            const hiddenForRep = ['Lots', 'Bottles', 'Movements', 'Settings', 'Partners', 'Movements', 'Orders'];

            // Only Senior partners can see Peptides
            // Default to 'standard' if undefined
            const tier = authProfile?.partner_tier || 'standard';
            if (tier !== 'senior') {
              hiddenForRep.push('Peptides');
            }

            if (hiddenForRep.includes(item.name)) return false;
          }

          return true;
        }).map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary shadow-sm shadow-primary/10 ring-1 ring-primary/10'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                )}
                <item.icon className={cn('h-4.5 w-4.5 transition-transform duration-200', isActive ? 'text-primary' : 'group-hover:scale-110')} />
                <span className="flex-1">{item.name}</span>
                {item.name === 'Requests' && (pendingRequestCount || 0) > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg shadow-red-500/30 px-1">
                    {pendingRequestCount}
                  </span>
                )}
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary/60" />}
              </>
            )}
          </NavLink>
        ))}


        {/* Partner Portal Switcher */}
        {(userRole?.role === 'admin' || userRole?.role === 'sales_rep' || authProfile?.role === 'sales_rep') && (
          <div className="mt-2 px-3">
            <NavLink
              to="/partner"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group"
            >
              <div className="p-1 bg-emerald-100 dark:bg-emerald-900 rounded-md group-hover:bg-emerald-200">
                <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span>Partner Portal</span>
            </NavLink>
          </div>
        )}

        {/* Family Portal Switcher */}
        <div className="mt-2 pt-2 border-t border-sidebar-border px-3">
          <NavLink
            to="/dashboard?preview_role=customer"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group"
          >
            <div className="p-1 bg-primary/10 rounded-md group-hover:bg-primary/20">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <span>Family Portal</span>
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
