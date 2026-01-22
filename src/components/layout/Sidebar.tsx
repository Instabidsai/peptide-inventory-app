import { NavLink, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Beaker, Archive, FlaskConical, Users, FileText, ArrowLeftRight, Settings, LogOut, X, MessageSquare, Package, Pill, ChevronRight, BookOpen,
  ClipboardList,
  ShoppingBag,
  Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Peptides', href: '/peptides', icon: FlaskConical },
  { name: 'Orders', href: '/orders', icon: ClipboardList },
  { name: 'Sales Orders', href: '/sales', icon: ShoppingBag },
  { name: 'Partners', href: '/admin/reps', icon: Briefcase, roles: ['admin'] },
  { name: 'Lots', href: '/lots', icon: Package },
  { name: 'Bottles', href: '/bottles', icon: Pill }, // Keep this if used, or replace icon if duplicate
  { name: 'Supplements', href: '/admin/supplements', icon: FlaskConical }, // Use FlaskConical or similar if Pill is taken. Or reuse Pill.
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Resources', href: '/admin-resources', icon: BookOpen },
  { name: 'Feedback', href: '/feedback', icon: MessageSquare },
  { name: 'Movements', href: '/movements', icon: ArrowLeftRight },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { organization, userRole, user } = useAuth();
  const [searchParams] = useSearchParams();
  const previewRole = searchParams.get('preview_role');

  const isThompsonOverride = user?.email === 'thompsonfamv@gmail.com';
  const effectiveRole = previewRole || (isThompsonOverride ? 'sales_rep' : userRole?.role);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">
              {organization?.name || 'Inventory'}
            </span>
            <span className="text-xs text-muted-foreground">Tracker</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-sidebar-foreground"
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
            const hiddenForRep = ['Lots', 'Bottles', 'Movements', 'Settings', 'Partners', 'Movements'];
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="flex-1">{item.name}</span>
                {isActive && <ChevronRight className="h-4 w-4 text-primary" />}
              </>
            )}
          </NavLink>
        ))}


        {/* Partner Portal Switcher (Admin Only) */}
        {userRole?.role === 'admin' && (
          <div className="mt-2 px-3">
            <NavLink
              to="/?preview_role=sales_rep"
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
            to="/dashboard"
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
