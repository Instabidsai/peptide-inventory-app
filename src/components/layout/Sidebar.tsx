import { useState } from 'react';
import { NavLink, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import {
  LayoutDashboard, FlaskConical, Users, FileText, ArrowLeftRight, Settings, X, MessageSquare, Package, Pill, ChevronRight, ChevronDown, BookOpen,
  ClipboardList,
  ShoppingBag,
  PackageCheck,
  Briefcase,
  DollarSign,
  PieChart,
  Network,
  Wand2,
  Leaf,
  Zap,
  Bot,
  ToggleRight,
  Activity,
  ShieldCheck,
  Building2,
  BarChart3,
  CreditCard,
  LifeBuoy,
  Rocket,
  ScrollText,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgFeatures } from '@/hooks/use-org-features';
import { SIDEBAR_FEATURE_MAP } from '@/lib/feature-registry';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { BugReportButton } from '@/components/BugReportButton';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'staff', 'sales_rep', 'fulfillment'] },
  { name: 'AI Assistant', href: '/ai', icon: Bot, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Peptides', href: '/peptides', icon: FlaskConical, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Orders', href: '/orders', icon: ClipboardList, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Sales Orders', href: '/sales', icon: ShoppingBag, roles: ['admin', 'staff', 'sales_rep', 'fulfillment'] },
  { name: 'Fulfillment', href: '/fulfillment', icon: PackageCheck, roles: ['admin', 'staff', 'fulfillment'] },
  { name: 'Partners', href: '/admin/reps', icon: Briefcase, roles: ['admin'] },
  { name: 'Financials', href: '/admin/finance', icon: PieChart, roles: ['admin'] },
  { name: 'Commissions', href: '/admin/commissions', icon: DollarSign, roles: ['admin'] },
  { name: 'Automations', href: '/admin/automations', icon: Zap, roles: ['admin'] },
  { name: 'Lots', href: '/lots', icon: Package, roles: ['admin', 'staff'] },
  { name: 'Bottles', href: '/bottles', icon: Pill, roles: ['admin', 'staff'] },
  { name: 'Supplements', href: '/admin/supplements', icon: Leaf, roles: ['admin', 'staff'] },
  { name: 'Customers', href: '/contacts', icon: Users, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Protocols', href: '/protocols', icon: FileText, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Protocol Builder', href: '/protocol-builder', icon: Wand2, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Resources', href: '/admin-resources', icon: BookOpen, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Requests', href: '/requests', icon: MessageSquare, roles: ['admin', 'staff'] },
  { name: 'Feedback', href: '/feedback', icon: MessageSquare, roles: ['admin', 'staff', 'sales_rep'] },
  { name: 'Movements', href: '/movements', icon: ArrowLeftRight, roles: ['admin', 'staff'] },
  { name: 'Customizations', href: '/customizations', icon: Wand2, roles: ['admin'] },
  { name: 'Features', href: '/admin/features', icon: ToggleRight, roles: ['admin'] },
  { name: 'System Health', href: '/admin/health', icon: Activity, roles: ['admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin', 'staff', 'sales_rep', 'fulfillment'] },
  { name: 'Partner Portal', href: '/partner', icon: Network, roles: ['sales_rep', 'admin'] },
  { name: 'Partner Store', href: '/partner/store', icon: ShoppingBag, roles: ['sales_rep', 'admin'] },
  { name: 'My Orders', href: '/partner/orders', icon: ClipboardList, roles: ['sales_rep', 'admin'] },
];

const vendorNavItems = [
  { name: 'Overview', href: '/vendor', icon: Shield, end: true },
  { name: 'Tenants', href: '/vendor/tenants', icon: Building2 },
  { name: 'Supply Orders', href: '/vendor/supply-orders', icon: Package },
  { name: 'Analytics', href: '/vendor/analytics', icon: BarChart3 },
  { name: 'Billing', href: '/vendor/billing', icon: CreditCard },
  { name: 'Health', href: '/vendor/health', icon: Activity },
  { name: 'Support', href: '/vendor/support', icon: LifeBuoy },
  { name: 'Onboarding', href: '/vendor/onboarding', icon: Rocket },
  { name: 'Messages', href: '/vendor/messages', icon: MessageSquare },
  { name: 'Audit', href: '/vendor/audit', icon: ScrollText },
  { name: 'Settings', href: '/vendor/settings', icon: Settings },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { organization, userRole, user, profile: authProfile } = useAuth();
  const [vendorExpanded, setVendorExpanded] = useState(() => location.pathname.startsWith('/vendor'));
  const { isEnabled } = useOrgFeatures();
  const { brand_name, logo_url, admin_brand_name } = useTenantConfig();
  const [searchParams] = useSearchParams();
  // Only admins can use preview_role to impersonate other roles
  const rawPreviewRole = searchParams.get('preview_role');
  const previewRole = (userRole?.role === 'admin' && rawPreviewRole) ? rawPreviewRole : null;

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
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border/30 transform transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:translate-x-0 flex flex-col',
        open ? 'translate-x-0 shadow-2xl shadow-black/40' : '-translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-20 px-6 border-b border-sidebar-border/20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-tr from-primary/40 to-emerald-400/20 rounded-xl blur-md opacity-60 group-hover:opacity-100 transition duration-500 mix-blend-screen" />
            <div className="relative p-1.5 bg-gradient-to-br from-card to-background rounded-xl ring-1 ring-primary/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)] flex items-center justify-center overflow-hidden">
              <img src={logo_url || "/logo.png"} alt={brand_name || "Logo"} className="h-7 w-7 object-contain group-hover:scale-110 transition-transform duration-500" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-sidebar-foreground truncate max-w-[140px] text-gradient-primary">
              {brand_name || organization?.name || 'Peptide AI'}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">{admin_brand_name || 'Inventory'}</span>

            {/* Sales Rep Wallet */}
            {effectiveRole === 'sales_rep' && (
              <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/20 shadow-glow-success">
                <DollarSign className="h-3 w-3" />
                <span>${Number(balanceData?.credit_balance || 0).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-sidebar-foreground hover:bg-white/5"
          aria-label="Close menu"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* SaaS Admin dropdown — super_admin only */}
      {userRole?.role === 'super_admin' && (
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => setVendorExpanded(prev => !prev)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all',
              vendorExpanded || location.pathname.startsWith('/vendor')
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="flex-1 text-left">SaaS Admin</span>
            {vendorExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {vendorExpanded && (
            <div className="mt-1 ml-2 pl-2 border-l border-border/40 space-y-0.5">
              {vendorNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigation.filter(item => {
          // Feature flag check — hide items whose feature is disabled
          const featureKey = SIDEBAR_FEATURE_MAP[item.name];
          if (featureKey && !isEnabled(featureKey)) return false;

          // super_admin inherits admin access for sidebar visibility
          const roleForNav = effectiveRole === 'super_admin' ? 'admin' : effectiveRole;

          // Standard Role Check
          if (item.roles && !item.roles.includes(organization?.role || roleForNav || '')) {
            // Allow if allowedRoles matches
            if (!roleForNav) return false;
            if (!item.roles.includes(roleForNav)) return false;
          }

          // Special: Sales Rep Restriction
          if (effectiveRole === 'sales_rep') {
            const hiddenForRep = ['Lots', 'Bottles', 'Movements', 'Settings', 'Partners', 'Orders'];

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
                  ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-[0_2px_10px_rgba(0,0,0,0.1)] ring-1 ring-primary/20 scale-[1.02]'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
        {(userRole?.role === 'admin' || userRole?.role === 'super_admin' || userRole?.role === 'sales_rep' || authProfile?.role === 'sales_rep') && (
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
        {effectiveRole !== 'fulfillment' && <div className="mt-2 pt-2 border-t border-sidebar-border px-3">
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
        </div>}
      </nav>

      {/* Bug Report — pinned to bottom */}
      <div className="px-3 py-3 border-t border-sidebar-border/20">
        <BugReportButton />
      </div>
    </aside>
  );
}
