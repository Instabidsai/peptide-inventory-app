import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBottles, type BottleStatus, type Bottle } from '@/hooks/use-bottles';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill, Search, Filter, MoreHorizontal, Trash2 } from 'lucide-react';
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
import { useDeleteBottle } from '@/hooks/use-bottles';

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
  const { data: peptides } = usePeptides();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BottleStatus | 'all'>('all');
  const [peptideFilter, setPeptideFilter] = useState<string>('all');

  const { data: bottles, isLoading } = useBottles({
    status: statusFilter === 'all' ? undefined : statusFilter,
    peptide_id: peptideFilter === 'all' ? undefined : peptideFilter,
  });

  const deleteBottle = useDeleteBottle();
  const [bottleToDelete, setBottleToDelete] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (bottleToDelete) {
      await deleteBottle.mutateAsync(bottleToDelete);
      setBottleToDelete(null);
    }
  };

  const filteredBottles = bottles?.filter((b) =>
    b.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.lots?.lot_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bottles</h1>
          <p className="text-muted-foreground">Track individual inventory units</p>
        </div>
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
                    <TableHead>Cost</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBottles?.map((bottle) => (
                    <TableRow key={bottle.id}>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredBottles && filteredBottles.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredBottles.length} bottles
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
