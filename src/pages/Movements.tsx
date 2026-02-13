import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useMovements, useMovementItems, useDeleteMovement, type Movement, type MovementType } from '@/hooks/use-movements';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ArrowLeftRight, Trash2, Eye, Filter, X, Download } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';
import { Link, useSearchParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
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
  onUpdate: (id: string, updates: any) => Promise<void>;
}) {
  const { data: items, isLoading } = useMovementItems(movement?.id || '');

  if (!movement) return null;

  const totalPrice = items?.reduce((sum, item) => sum + (Number(item.price_at_sale) || 0), 0) || 0;
  const totalCost = items?.reduce((sum, item) => sum + (Number(item.bottles?.lots?.cost_per_unit) || 0), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movement Details</DialogTitle>
          <DialogDescription>
            {typeLabels[movement.type]} on {format(new Date(movement.movement_date), 'MMMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
              <Badge variant={paymentStatusColors[movement.payment_status] || 'outline'} className="capitalize">
                {movement.payment_status}
              </Badge>
            </div>
          </div>

          {movement.notes && (
            <div>
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="text-sm">{movement.notes}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-2">Items ({items?.length || 0})</p>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="border rounded-lg overflow-hidden">
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

          <div className="flex justify-between pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="font-medium">${totalCost.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Price</p>
              <p className="font-medium">${totalPrice.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Margin</p>
              <p className="font-medium text-primary">${(totalPrice - totalCost).toFixed(2)}</p>
            </div>
            {movement.payment_status !== 'paid' && movement.payment_status !== 'refunded' && (
              <div className="flex items-end">
                <Button size="sm" onClick={() => onUpdate(movement.id, { payment_status: 'paid', amount_paid: totalPrice, payment_date: new Date().toISOString() })}>
                  Mark Paid
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Movements() {
  const { userRole } = useAuth();
  const { data: movements, isLoading } = useMovements();
  const deleteMovement = useDeleteMovement();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewingMovement, setViewingMovement] = useState<Movement | null>(null);
  const [deletingMovement, setDeletingMovement] = useState<Movement | null>(null);
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const handleUpdate = async (id: string, updates: any) => {
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
    await deleteMovement.mutateAsync(deletingMovement.id);
    setDeletingMovement(null);
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

    return filtered;
  }, [movements, filterType, dateRange]);

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
    const headers = ['Date', 'Type', 'Contact', 'Items', 'Cost', 'Amount Paid', 'Payment Status', 'Notes'];
    const rows = filteredMovements.map(m => {
      const itemsSummary = m.movement_items?.reduce((acc: Record<string, number>, item: any) => {
        const name = item.bottles?.lots?.peptides?.name || item.description || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});
      const itemsStr = itemsSummary ? Object.entries(itemsSummary).map(([n, c]) => `${n} (${c})`).join('; ') : '';
      const cost = m.movement_items?.reduce((s: number, item: any) => s + (item.bottles?.lots?.cost_per_unit || 0), 0) || 0;
      return [
        format(new Date(m.movement_date), 'yyyy-MM-dd'),
        typeLabels[m.type],
        m.contacts?.name || '',
        `"${itemsStr}"`,
        cost.toFixed(2),
        (m.amount_paid || 0).toFixed(2),
        m.payment_status,
        `"${(m.notes || '').replace(/"/g, '""')}"`,
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
    const moveCost = m.movement_items?.reduce((itemSum, item: any) => {
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
        <div className="flex gap-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Filtered Revenue</p>
            <p className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(2)}</p>
          </div>
          <div className="border-l pl-4">
            <p className="text-sm font-medium text-muted-foreground">Filtered Cost</p>
            <p className="text-2xl font-bold text-orange-600">${totalCost.toFixed(2)}</p>
          </div>
          <div className="border-l pl-4">
            <p className="text-sm font-medium text-muted-foreground">Net</p>
            <p className={`text-2xl font-bold ${totalRevenue - totalCost >= 0 ? 'text-primary' : 'text-destructive'}`}>
              ${(totalRevenue - totalCost).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowLeftRight className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No movements found</p>
              <Button variant="link" onClick={() => updateFilter('all')}>
                Clear Filters
              </Button>
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
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement, index) => {
                  const moveCost = movement.movement_items?.reduce((itemSum, item: any) => {
                    return itemSum + (item.bottles?.lots?.cost_per_unit || 0);
                  }, 0) || 0;

                  // Extract peptide names and counts
                  const itemsSummary = movement.movement_items?.reduce((acc: Record<string, number>, item: any) => {
                    const name = item.bottles?.lots?.peptides?.name || item.description || 'Unknown';
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {});

                  const itemsDisplay = itemsSummary
                    ? Object.entries(itemsSummary).map(([name, count]) => `${name} (${count})`).join(', ')
                    : '-';

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
                      <TableCell className="text-muted-foreground">
                        {movement.contacts?.name || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingMovement(movement)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
