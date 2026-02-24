import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useMovements, useMovementItems, useDeleteMovement, type Movement, type MovementType } from '@/hooks/use-movements';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ArrowLeftRight, Trash2, Eye, Filter, X, Download, Search } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const typeLabels: Record<MovementType, string> = {
  sale: 'Sale',
  giveaway: 'Giveaway',
  internal_use: 'Internal Use',
  loss: 'Loss',
  return: 'Return',
};

const typeColors: Record<MovementType, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sale: 'default',
  giveaway: 'secondary',
  internal_use: 'outline',
  loss: 'destructive',
  return: 'outline',
};

const paymentStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  paid: 'success',
  unpaid: 'destructive',
  partial: 'secondary',
  refunded: 'outline',
  commission_offset: 'secondary',
};

const paymentStatusLabel: Record<string, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Partial',
  refunded: 'Refunded',
  commission_offset: 'Product Offset',
};

function MovementDetailsDialog({
  movement,
  open,
  onClose,
  onUpdate
}: {
  movement: Movement | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
}) {
  const { data: items, isLoading } = useMovementItems(movement?.id || '');

  // Extract linked sales order ID from notes (e.g., "Sales Order #93ac1fad")
  const orderShortId = movement?.notes?.match(/(?:Sales Order|Fulfilled Sales Order)\s*#([a-f0-9]{8})/i)?.[1] || '';

  // Fetch commissions linked to the sales order
  const { data: commissions } = useQuery({
    queryKey: ['movement_commissions', orderShortId],
    queryFn: async () => {
      if (!orderShortId) return [];
      // Find the sales order by ID prefix
      const { data: orders } = await supabase
        .from('sales_orders')
        .select('id')
        .ilike('id', `${orderShortId}%`)
        .limit(1);
      if (!orders?.length) return [];
      const { data: comms, error } = await supabase
        .from('commissions')
        .select('id, amount, commission_rate, type, partner_id, profiles:partner_id(full_name)')
        .eq('sale_id', orders[0].id);
      if (error) return [];
      return comms || [];
    },
    enabled: !!orderShortId,
  });

  const totalCommission = commissions?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0;

  // Editable state — initialized from the movement when it changes
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountDollars, setDiscountDollars] = useState(0);
  const [paymentInput, setPaymentInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset local state when a different movement is opened
  useEffect(() => {
    if (movement) {
      setDiscountPercent(Number(movement.discount_percent) || 0);
      setDiscountDollars(Number(movement.discount_amount) || 0);
      setPaymentInput('');
      setPaymentMethod(movement.payment_method || '');
      setNotes(movement.notes || '');
    }
  }, [movement?.id]);

  if (!movement) return null;

  const subtotal = items?.reduce((sum, item) => sum + (Number(item.price_at_sale) || 0), 0) || 0;
  const totalCost = items?.reduce((sum, item) => sum + (Number(item.bottles?.lots?.cost_per_unit) || 0), 0) || 0;

  const discountAmt = discountDollars;
  const finalTotal = Math.max(0, subtotal - discountAmt);
  const previouslyPaid = Number(movement.amount_paid) || 0;
  const newPayment = Number(paymentInput) || 0;
  const totalPaid = previouslyPaid + newPayment;
  const balanceDue = Math.max(0, finalTotal - totalPaid);

  const handleSave = async () => {
    setSaving(true);
    const updates: Record<string, unknown> = {
      discount_percent: Math.round(discountPercent * 100) / 100,
      discount_amount: Math.round(discountDollars * 100) / 100,
      notes: notes || null,
    };

    // If a new payment was entered, add it to the running total
    if (newPayment > 0) {
      updates.amount_paid = Math.round(totalPaid * 100) / 100;
      updates.payment_date = new Date().toISOString();
      if (paymentMethod) updates.payment_method = paymentMethod;
    }

    // Auto-set payment status based on amounts
    if (totalPaid >= finalTotal && finalTotal > 0) {
      updates.payment_status = 'paid';
    } else if (totalPaid > 0 && totalPaid < finalTotal) {
      updates.payment_status = 'partial';
    }

    await onUpdate(movement.id, updates);
    setSaving(false);
  };

  const isPaid = movement.payment_status === 'paid';
  const isRefunded = movement.payment_status === 'refunded';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movement Details</DialogTitle>
          <DialogDescription>
            {typeLabels[movement.type]} on {format(new Date(movement.movement_date), 'MMMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Info row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <Badge variant={typeColors[movement.type]}>{typeLabels[movement.type]}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contact</p>
              <p className="font-medium">{movement.contacts?.name || 'No contact'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{format(new Date(movement.movement_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created By</p>
              <p className="font-medium">{movement.profiles?.full_name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Status</p>
              <Badge variant={paymentStatusColors[movement.payment_status] || 'outline'} className={movement.payment_status === 'commission_offset' ? 'text-violet-600' : 'capitalize'}>
                {paymentStatusLabel[movement.payment_status] || movement.payment_status}
              </Badge>
            </div>
          </div>

          {/* Items table */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Items ({items?.length || 0})</p>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="border border-border/60 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UID</TableHead>
                      <TableHead>Peptide</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.bottles?.uid || '-'}</TableCell>
                        <TableCell>{item.bottles?.lots?.peptides?.name || item.description || 'Unknown'}</TableCell>
                        <TableCell>${Number(item.bottles?.lots?.cost_per_unit || 0).toFixed(2)}</TableCell>
                        <TableCell>${Number(item.price_at_sale || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Financial summary */}
          <div className="border border-border/60 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>

            {/* Discount inputs — % and $ stay in sync */}
            <div className="flex justify-between items-center text-sm gap-3">
              <span className="text-muted-foreground shrink-0">Discount</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent || ''}
                  onChange={(e) => {
                    const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setDiscountPercent(pct);
                    setDiscountDollars(Math.round(subtotal * pct) / 100);
                  }}
                  className="w-20 h-7 text-sm"
                  placeholder="0"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <span className="text-muted-foreground">or</span>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discountDollars || ''}
                  onChange={(e) => {
                    const amt = Math.max(0, Number(e.target.value) || 0);
                    setDiscountDollars(amt);
                    setDiscountPercent(subtotal > 0 ? Math.round((amt / subtotal) * 10000) / 100 : 0);
                  }}
                  className="w-24 h-7 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>Total</span>
              <span>${finalTotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost (COGS)</span>
              <span>${totalCost.toFixed(2)}</span>
            </div>
            {totalCommission > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commissions</span>
                  <span className="text-orange-600">${totalCommission.toFixed(2)}</span>
                </div>
                {commissions?.map((c) => (
                  <div key={c.id} className="flex justify-between text-xs text-muted-foreground pl-3">
                    <span>{c.profiles?.full_name || 'Unknown'} ({c.type === 'direct' ? 'Direct' : 'Override'} {((c.commission_rate || 0) * 100).toFixed(0)}%)</span>
                    <span>${Number(c.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>Net Profit</span>
              <span className={(finalTotal - totalCost - totalCommission) >= 0 ? 'text-green-600' : 'text-red-500'}>
                ${(finalTotal - totalCost - totalCommission).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Payment section */}
          {!isRefunded && (
            <div className="border border-border/60 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold">Payment</p>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Previously Paid</span>
                <span className="font-medium">${previouslyPaid.toFixed(2)}</span>
              </div>

              {!isPaid && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground w-28 shrink-0">Add Payment</label>
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={paymentInput}
                      onChange={(e) => setPaymentInput(e.target.value)}
                      placeholder={balanceDue.toFixed(2)}
                      className="h-8 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => setPaymentInput(balanceDue.toFixed(2))}
                    >
                      Pay Full
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground w-28 shrink-0">Method</label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="zelle">Zelle</SelectItem>
                        <SelectItem value="venmo">Venmo</SelectItem>
                        <SelectItem value="wire">Wire</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="credit">Store Credit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Balance Due</span>
                <span className={balanceDue > 0 ? 'text-red-500' : 'text-green-600'}>
                  ${(newPayment > 0 ? Math.max(0, finalTotal - totalPaid) : Math.max(0, finalTotal - previouslyPaid)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm text-muted-foreground">Notes</label>
            <textarea
              className="w-full mt-1 rounded-lg border border-input bg-card/50 px-4 py-2.5 text-sm shadow-inset ring-offset-background placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Movements() {
  usePageTitle('Movements');
  const { userRole, profile, user, authError, session } = useAuth();
  const isMobile = useIsMobile();
  const { data: movements, isLoading, isError, error: queryError, refetch } = useMovements();
  const deleteMovement = useDeleteMovement();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewingMovement, setViewingMovement] = useState<Movement | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<Movement | null>(null);
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const { error } = await supabase
      .from('movements')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
      return;
    }

    toast({ title: 'Movement updated' });
    queryClient.invalidateQueries({ queryKey: ['movements'] });
    setViewingMovement(null);
  };

  const canDelete = userRole?.role === 'admin';

  const handleDelete = async () => {
    if (!deletingMovement) return;
    try {
      await deleteMovement.mutateAsync(deletingMovement.id);
      setDeletingMovement(null);
    } catch { /* onError in hook shows toast */ }
  };

  // Filter Logic
  const filterType = searchParams.get('type') || 'all';

  const filteredMovements = useMemo(() => {
    if (!movements) return [];
    let filtered = movements;

    // Type filter
    if (filterType !== 'all') {
      if (filterType === 'overhead') {
        filtered = filtered.filter(m => ['internal_use', 'giveaway', 'loss'].includes(m.type));
      } else {
        filtered = filtered.filter(m => m.type === filterType);
      }
    }

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let cutoff: Date;
      if (dateRange === 'today') cutoff = startOfDay(now);
      else if (dateRange === 'week') cutoff = startOfWeek(now, { weekStartsOn: 1 });
      else cutoff = startOfMonth(now);
      filtered = filtered.filter(m => isAfter(new Date(m.movement_date), cutoff));
    }

    // Search filter — matches contact name, notes, or peptide names
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => {
        const contactName = m.contacts?.name?.toLowerCase() || '';
        const notes = m.notes?.toLowerCase() || '';
        const peptideNames = m.movement_items?.map(item =>
          item.bottles?.lots?.peptides?.name?.toLowerCase() || ''
        ).join(' ') || '';
        return contactName.includes(q) || notes.includes(q) || peptideNames.includes(q);
      });
    }

    return filtered;
  }, [movements, filterType, dateRange, searchQuery]);

  const updateFilter = (val: string) => {
    if (val === 'all') {
      searchParams.delete('type');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ type: val });
    }
  };

  const exportMovementsCSV = () => {
    if (filteredMovements.length === 0) return;
    const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v.replace(/"/g, '""')}"` : v;
    const headers = ['Date', 'Type', 'Contact', 'Items', 'Cost', 'Amount Paid', 'Payment Status', 'Notes'];
    const rows = filteredMovements.map(m => {
      const itemsSummary = m.movement_items?.reduce((acc: Record<string, number>, item) => {
        const name = item.bottles?.lots?.peptides?.name || item.description || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});
      const itemsStr = itemsSummary ? Object.entries(itemsSummary).map(([n, c]) => `${n} (${c})`).join('; ') : '';
      const cost = m.movement_items?.reduce((s: number, item) => s + (item.bottles?.lots?.cost_per_unit || 0), 0) || 0;
      return [
        m.movement_date ? format(new Date(m.movement_date), 'yyyy-MM-dd') : '',
        esc(typeLabels[m.type]),
        esc(m.contacts?.name || ''),
        esc(itemsStr),
        cost.toFixed(2),
        (m.amount_paid || 0).toFixed(2),
        esc(m.payment_status),
        esc(m.notes || ''),
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movements-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculating totals for the filtered list for quick view
  const totalRevenue = filteredMovements.reduce((sum, m) => sum + (m.amount_paid || 0), 0);
  const totalCost = filteredMovements.reduce((sum, m) => {
    const moveCost = m.movement_items?.reduce((itemSum, item) => {
      return itemSum + (item.bottles?.lots?.cost_per_unit || 0);
    }, 0) || 0;
    return sum + moveCost;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movements</h1>
          <p className="text-muted-foreground">Track inventory transactions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={updateFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Movements</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="overhead">Overhead/Loss</SelectItem>
              <SelectItem value="giveaway">Giveaways</SelectItem>
              <SelectItem value="internal_use">Internal Use</SelectItem>
            </SelectContent>
          </Select>
          {filteredMovements.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportMovementsCSV}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button asChild>
            <Link to="/movements/new">
              <Plus className="mr-2 h-4 w-4" />
              Record Movement
            </Link>
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search movements"
          placeholder="Search by customer, peptide, or notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 max-w-md"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Date range quick filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'today', 'week', 'month'] as const).map((range) => (
          <Button
            key={range}
            variant={dateRange === range ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange(range)}
          >
            {range === 'all' ? 'All Time' : range === 'today' ? 'Today' : range === 'week' ? 'This Week' : 'This Month'}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground self-center ml-2">
          {filteredMovements.length} movement{filteredMovements.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filterType !== 'all' && (
        <div className="flex gap-4 p-4 border border-border/60 rounded-lg bg-card/50">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Filtered Revenue</p>
            <p className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(2)}</p>
          </div>
          <div className="border-l pl-4">
            <p className="text-sm font-semibold text-muted-foreground">Filtered Cost</p>
            <p className="text-2xl font-bold text-orange-600">${totalCost.toFixed(2)}</p>
          </div>
          <div className="border-l pl-4">
            <p className="text-sm font-semibold text-muted-foreground">Net</p>
            <p className={`text-2xl font-bold ${totalRevenue - totalCost >= 0 ? 'text-primary' : 'text-destructive'}`}>
              ${(totalRevenue - totalCost).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Diagnostic banner — shows when data is unexpectedly missing */}
      {!isLoading && !movements && (
        <Card className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">Data Loading Issue Detected</p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 font-mono">
              <li>Session: {session ? 'active' : 'MISSING'}</li>
              <li>User: {user ? user.id.slice(0,8) + '...' : 'MISSING'}</li>
              <li>Profile: {profile ? 'loaded' : 'MISSING'}</li>
              <li>Org ID: {profile?.org_id ? profile.org_id.slice(0,8) + '...' : 'MISSING'}</li>
              <li>Query enabled: {profile?.org_id ? 'yes' : 'NO — org_id is null, all queries disabled'}</li>
              <li>Auth error: {authError || 'none'}</li>
              <li>Query error: {queryError ? String(queryError) : 'none'}</li>
            </ul>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Try: Sign out → clear browser cache → sign back in. If this persists, screenshot this box.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border/60">
        <CardContent className="pt-6">
          {isError ? (
            <QueryError message={`Failed to load movements. ${queryError ? String(queryError) : ''}`} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-semibold text-muted-foreground">No movements found</p>
              <Button variant="link" onClick={() => updateFilter('all')}>
                Clear Filters
              </Button>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredMovements.map((movement, index) => {
                const moveCost = movement.movement_items?.reduce((itemSum, item) => {
                  return itemSum + (item.bottles?.lots?.cost_per_unit || 0);
                }, 0) || 0;

                const itemsSummary = movement.movement_items?.reduce((acc: Record<string, number>, item) => {
                  const name = item.bottles?.lots?.peptides?.name || item.description || 'Unknown';
                  acc[name] = (acc[name] || 0) + 1;
                  return acc;
                }, {});

                const itemsDisplay = itemsSummary
                  ? Object.entries(itemsSummary).map(([name, count]) => `${name} (${count})`).join(', ')
                  : '-';

                const mobileSubtotal = movement.movement_items?.reduce((s, item) => s + (Number(item.price_at_sale) || 0), 0) || 0;
                const mobileDiscount = Number(movement.discount_amount) || 0;
                const mobileOwed = Math.max(0, mobileSubtotal - mobileDiscount - (Number(movement.amount_paid) || 0));

                return (
                  <motion.div
                    key={movement.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04 }}
                  >
                    <Card
                      className="cursor-pointer hover:bg-accent/30 hover:shadow-card hover:border-border/80 transition-all"
                      onClick={() => setViewingMovement(movement)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <Badge variant={typeColors[movement.type]} className="text-xs mb-1">
                              {typeLabels[movement.type]}
                            </Badge>
                            <p className="text-sm font-medium">{movement.contacts?.name || 'No contact'}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(movement.movement_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">${(movement.amount_paid || 0).toFixed(2)}</p>
                            {mobileOwed > 0 && (
                              <p className="text-xs text-red-500">Owes ${mobileOwed.toFixed(2)}</p>
                            )}
                            <Badge variant={paymentStatusColors[movement.payment_status] || 'outline'} className={`text-xs mt-1 ${movement.payment_status === 'commission_offset' ? 'text-violet-600' : 'capitalize'}`}>
                              {paymentStatusLabel[movement.payment_status] || movement.payment_status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 truncate" title={itemsDisplay}>
                          {itemsDisplay}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Owed</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement, index) => {
                  const moveCost = movement.movement_items?.reduce((itemSum, item) => {
                    return itemSum + (item.bottles?.lots?.cost_per_unit || 0);
                  }, 0) || 0;

                  // Extract peptide names and counts
                  const itemsSummary = movement.movement_items?.reduce((acc: Record<string, number>, item) => {
                    const name = item.bottles?.lots?.peptides?.name || item.description || 'Unknown';
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {});

                  const itemsDisplay = itemsSummary
                    ? Object.entries(itemsSummary).map(([name, count]) => `${name} (${count})`).join(', ')
                    : '-';

                  const moveSubtotal = movement.movement_items?.reduce((s, item) => s + (Number(item.price_at_sale) || 0), 0) || 0;
                  const moveDiscount = Number(movement.discount_amount) || 0;
                  const moveTotal = moveSubtotal - moveDiscount;
                  const moveOwed = Math.max(0, moveTotal - (Number(movement.amount_paid) || 0));

                  return (
                    <motion.tr key={movement.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <TableCell className="font-medium">
                        {format(new Date(movement.movement_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeColors[movement.type]}>
                          {typeLabels[movement.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={itemsDisplay}>
                        {itemsDisplay}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentStatusColors[movement.payment_status] || 'outline'} className="capitalize">
                          {movement.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          ${moveCost.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          ${(movement.amount_paid || 0).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {moveOwed > 0 ? (
                          <span className="font-medium text-red-500">${moveOwed.toFixed(2)}</span>
                        ) : (
                          <span className="text-green-600">$0.00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.contacts?.name || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="View movement details"
                            onClick={() => setViewingMovement(movement)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              aria-label="Delete movement"
                              onClick={() => setDeletingMovement(movement)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MovementDetailsDialog
        movement={viewingMovement}
        open={!!viewingMovement}
        onClose={() => setViewingMovement(null)}
        onUpdate={handleUpdate}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingMovement} onOpenChange={() => setDeletingMovement(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Movement?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this movement?
              All associated bottles will be restored to "In Stock" status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMovement.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMovement.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
