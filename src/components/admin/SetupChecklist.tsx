import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, FlaskConical, Users, FileText, ShoppingBag, Settings, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Step {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof FlaskConical;
  done: boolean;
}

export function SetupChecklist() {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('setup_checklist_dismissed') === '1'
  );
  const [collapsed, setCollapsed] = useState(false);

  // Query completion data
  const { data: counts, isLoading } = useQuery({
    queryKey: ['setup_checklist', orgId],
    queryFn: async () => {
      const [peptides, contacts, protocols, orders, members] = await Promise.all([
        supabase.from('peptides').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
        supabase.from('protocols').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
        supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
      ]);
      return {
        peptides: peptides.count || 0,
        contacts: contacts.count || 0,
        protocols: protocols.count || 0,
        orders: orders.count || 0,
        members: members.count || 0,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !counts || dismissed) return null;

  const steps: Step[] = [
    { key: 'peptide', label: 'Add your first peptide', description: 'Set up your product catalog', href: '/peptides', icon: FlaskConical, done: counts.peptides > 0 },
    { key: 'customer', label: 'Add a customer', description: 'Import or create your first contact', href: '/contacts', icon: Users, done: counts.contacts > 0 },
    { key: 'protocol', label: 'Create a protocol', description: 'Build a dosing regimen for clients', href: '/protocol-builder', icon: FileText, done: counts.protocols > 0 },
    { key: 'order', label: 'Create an order', description: 'Record your first sale', href: '/sales', icon: ShoppingBag, done: counts.orders > 0 },
    { key: 'team', label: 'Invite team members', description: 'Add staff or sales reps', href: '/settings', icon: UserPlus, done: counts.members > 1 },
    { key: 'settings', label: 'Configure settings', description: 'Set up payments and branding', href: '/settings', icon: Settings, done: false }, // Manual — no easy auto-detect
  ];

  const completedCount = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const allDone = completedCount === totalSteps;
  const progress = (completedCount / totalSteps) * 100;

  // If all done, auto-dismiss after first view
  if (allDone) {
    if (!localStorage.getItem('setup_checklist_dismissed')) {
      localStorage.setItem('setup_checklist_dismissed', '1');
    }
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('setup_checklist_dismissed', '1');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Setup Progress</span>
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  {completedCount}/{totalSteps}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setCollapsed(!collapsed)}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={handleDismiss}
              >
                Dismiss
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden mb-3">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>

          {/* Steps */}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="grid gap-1.5">
                  {steps.map((step) => (
                    <Link
                      key={step.key}
                      to={step.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm group',
                        step.done
                          ? 'bg-green-500/5 text-muted-foreground'
                          : 'bg-background/60 hover:bg-background border border-border/30 hover:border-primary/20'
                      )}
                    >
                      <div className={cn(
                        'flex items-center justify-center h-7 w-7 rounded-full shrink-0 transition-colors',
                        step.done
                          ? 'bg-green-500/15 text-green-500'
                          : 'bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                      )}>
                        {step.done ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <step.icon className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('font-medium text-sm', step.done && 'line-through text-muted-foreground/60')}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground/60 truncate">{step.description}</p>
                      </div>
                      {!step.done && (
                        <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          Start &rarr;
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
