import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useBottles, useDeleteBottle, type BottleStatus, type Bottle } from '@/hooks/use-bottles';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill, Search, Filter, MoreHorizontal, Trash2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
const statusColors: Record<BottleStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  in_stock: 'default',
  sold: 'secondary',
  given_away: 'secondary',
  internal_use: 'outline',
  lost: 'destructive',
  returned: 'outline',
  expired: 'destructive',
};

const statusLabels: Record<BottleStatus, string> = {
  in_stock: 'In Stock',
  sold: 'Sold',
  given_away: 'Given Away',
  internal_use: 'Internal Use',
  lost: 'Lost',
  returned: 'Returned',
  expired: 'Expired',
};

export default function Bottles() {
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();
  const isMobile = useIsMobile();
  const { data: peptides } = usePeptides();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BottleStatus | 'all'>('all');
  const [peptideFilter, setPeptideFilter] = useState<string>('all');

  const { data: bottles, isLoading } = useBottles({
    status: statusFilter === 'all' ? undefined : statusFilter,
    peptide_id: peptideFilter === 'all' ? undefined : peptideFilter,
  });

  const deleteBottle = useDeleteBottle();
  const { toast } = useToast();
  const [bottleToDelete, setBottleToDelete] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (bottleToDelete) {
      try {
        await deleteBottle.mutateAsync(bottleToDelete);
        toast({ title: 'Bottle deleted' });
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Delete failed', description: err.message });
      }
      setBottleToDelete(null);
    }
  };

  const filteredBottles = bottles?.filter((b) =>
    b.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.lots?.lot_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exportBottlesCSV = () => {
    if (!filteredBottles || filteredBottles.length === 0) return;
    const headers = ['UID', 'Peptide', 'Lot', 'Status', 'Cost', 'Created'];
    const rows = filteredBottles.map(b => [
      b.uid,
      b.lots?.peptides?.name || '',
      b.lots?.lot_number || '',
      statusLabels[b.status] || b.status,
      Number(b.lots?.cost_per_unit || 0).toFixed(2),
      format(new Date(b.created_at), 'yyyy-MM-dd'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bottles-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bottles</h1>
          <p className="text-muted-foreground">Track individual inventory units</p>
        </div>
        {filteredBottles && filteredBottles.length > 0 && (
          <Button variant="outline" onClick={exportBottlesCSV}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by UID or lot number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BottleStatus | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={peptideFilter} onValueChange={setPeptideFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Peptides" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Peptides</SelectItem>
                  {peptides?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredBottles?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Pill className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No bottles found</p>
              <p className="text-sm">Bottles are auto-created when you receive lots</p>
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {filteredBottles?.map((bottle, index) => (
                <motion.div
                  key={bottle.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                >
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-mono text-sm font-medium">{bottle.uid}</p>
                          <p className="text-sm font-medium">{bottle.lots?.peptides?.name || 'Unknown'}</p>
                        </div>
                        <Badge variant={statusColors[bottle.status]} className="text-xs">
                          {statusLabels[bottle.status]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Lot: {bottle.lots?.lot_number || '-'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>Peptide</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBottles?.map((bottle, index) => (
                    <motion.tr key={bottle.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <TableCell className="font-mono text-sm font-medium">
                        {bottle.uid}
                      </TableCell>
                      <TableCell>{bottle.lots?.peptides?.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {bottle.lots?.lot_number || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[bottle.status]}>
                          {statusLabels[bottle.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        ${Number(bottle.lots?.cost_per_unit || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(bottle.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(bottle.uid)}>
                              Copy UID
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setBottleToDelete(bottle.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredBottles && filteredBottles.length > 0 && !isMobile && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Showing {filteredBottles.length} bottles</span>
              <span className="text-muted-foreground/50">|</span>
              {Object.entries(
                filteredBottles.reduce((acc, b) => {
                  acc[b.status] = (acc[b.status] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([status, count]) => (
                <Badge key={status} variant={statusColors[status as BottleStatus] || 'outline'} className="text-xs">
                  {statusLabels[status as BottleStatus] || status}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!bottleToDelete} onOpenChange={(open) => !open && setBottleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the bottle
              and remove it from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteBottle.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBottle.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
