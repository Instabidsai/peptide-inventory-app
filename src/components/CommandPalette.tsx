import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  FlaskConical,
  Package,
  Pill,
  Users,
  ShoppingBag,
  ClipboardList,
  ArrowLeftRight,
  Settings,
  FileText,
  DollarSign,
  PieChart,
  Briefcase,
  BookOpen,
  MessageSquare,
  Plus,
  Search,
  Network,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

const pages = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Navigate' },
  { name: 'Peptides', href: '/peptides', icon: FlaskConical, group: 'Navigate' },
  { name: 'Sales Orders', href: '/sales', icon: ShoppingBag, group: 'Navigate' },
  { name: 'Orders', href: '/orders', icon: ClipboardList, group: 'Navigate' },
  { name: 'Lots', href: '/lots', icon: Package, group: 'Navigate' },
  { name: 'Bottles', href: '/bottles', icon: Pill, group: 'Navigate' },
  { name: 'Customers', href: '/contacts', icon: Users, group: 'Navigate' },
  { name: 'Movements', href: '/movements', icon: ArrowLeftRight, group: 'Navigate' },
  { name: 'Protocols', href: '/protocols', icon: FileText, group: 'Navigate' },
  { name: 'Financials', href: '/admin/finance', icon: PieChart, group: 'Navigate', adminOnly: true },
  { name: 'Partners', href: '/admin/reps', icon: Briefcase, group: 'Navigate', adminOnly: true },
  { name: 'Commissions', href: '/admin/commissions', icon: DollarSign, group: 'Navigate', adminOnly: true },
  { name: 'Resources', href: '/admin-resources', icon: BookOpen, group: 'Navigate' },
  { name: 'Fulfillment Center', href: '/fulfillment', icon: ClipboardList, group: 'Navigate' },
  { name: 'Feedback', href: '/feedback', icon: MessageSquare, group: 'Navigate' },
  { name: 'Settings', href: '/settings', icon: Settings, group: 'Navigate' },
  { name: 'Partner Portal', href: '/partner', icon: Network, group: 'Navigate' },
];

const actions = [
  { name: 'New Sales Order', href: '/sales/new', icon: Plus, group: 'Actions' },
  { name: 'Record Movement', href: '/movements/new', icon: ArrowLeftRight, group: 'Actions' },
  { name: 'Receive Inventory', href: '/lots', icon: Package, group: 'Actions' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAdmin = userRole?.role === 'admin';

  // Search peptides for live results
  const { data: peptides } = useQuery({
    queryKey: ['cmd_peptides'],
    queryFn: async () => {
      const { data } = await supabase
        .from('peptides')
        .select('id, name, sku')
        .eq('active', true)
        .order('name')
        .limit(50);
      return data || [];
    },
    enabled: open,
    staleTime: 30000,
  });

  // Search contacts for live results
  const { data: contacts } = useQuery({
    queryKey: ['cmd_contacts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, email')
        .order('name')
        .limit(50);
      return data || [];
    },
    enabled: open,
    staleTime: 30000,
  });

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    navigate(href);
  }, [navigate]);

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const filteredPages = pages.filter(p => !p.adminOnly || isAdmin);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, peptides, customers..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          {actions.map(action => (
            <CommandItem key={action.href} onSelect={() => handleSelect(action.href)}>
              <action.icon className="mr-2 h-4 w-4 text-primary" />
              <span>{action.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Pages">
          {filteredPages.map(page => (
            <CommandItem key={page.href} onSelect={() => handleSelect(page.href)}>
              <page.icon className="mr-2 h-4 w-4" />
              <span>{page.name}</span>
              {page.adminOnly && (
                <CommandShortcut>Admin</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {peptides && peptides.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Peptides">
              {peptides.map(p => (
                <CommandItem key={p.id} onSelect={() => handleSelect(`/peptides?search=${encodeURIComponent(p.name)}`)}>
                  <FlaskConical className="mr-2 h-4 w-4 text-primary/60" />
                  <span>{p.name}</span>
                  {p.sku && <CommandShortcut>{p.sku}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {contacts && contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {contacts.map(c => (
                <CommandItem key={c.id} value={`${c.name} ${c.email || ''}`} onSelect={() => handleSelect(`/contacts/${c.id}`)}>
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{c.name}</span>
                  {c.email && <CommandShortcut>{c.email}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Button to show in TopBar
export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search...</span>
      <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
        <span className="text-xs">Ctrl</span>K
      </kbd>
    </button>
  );
}
