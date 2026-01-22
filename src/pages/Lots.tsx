import { useState } from 'react';
import { useLots, useCreateLot, useUpdateLot, useDeleteLot, type Lot } from '@/hooks/use-lots';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Package, Search, Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const lotSchema = z.object({
  peptide_id: z.string().min(1, 'Peptide is required'),
  lot_number: z.string().min(1, 'Lot number is required'),
  quantity_received: z.coerce.number().min(1, 'Must receive at least 1 bottle'),
  cost_per_unit: z.coerce.number().min(0, 'Cost must be positive'),
  received_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

type LotFormData = z.infer<typeof lotSchema>;

export default function Lots() {
  const { userRole } = useAuth();
  const { data: lots, isLoading } = useLots();
  const { data: peptides } = usePeptides();
  const createLot = useCreateLot();
  const updateLot = useUpdateLot();
  const deleteLot = useDeleteLot();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [lotToDelete, setLotToDelete] = useState<string | null>(null);

  const canEdit = userRole?.role === 'admin' || userRole?.role === 'staff';

  const form = useForm<LotFormData>({
    resolver: zodResolver(lotSchema),
    defaultValues: {
      peptide_id: '',
      lot_number: '',
      quantity_received: 1,
      cost_per_unit: 0,
      received_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      notes: '',
    },
  });

  const editForm = useForm<LotFormData>({
    resolver: zodResolver(lotSchema),
  });

  const filteredLots = lots?.filter((l) =>
    l.lot_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.peptides?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenEdit = (lot: Lot) => {
    setEditingLot(lot);
    editForm.reset({
      peptide_id: lot.peptide_id,
      lot_number: lot.lot_number,
      quantity_received: lot.quantity_received,
      cost_per_unit: lot.cost_per_unit,
      received_date: lot.received_date?.split('T')[0] || '',
      expiry_date: lot.expiry_date?.split('T')[0] || '',
      notes: lot.notes || '',
    });
  };

  const handleEditSubmit = async (data: LotFormData) => {
    if (!editingLot) return;
    await updateLot.mutateAsync({
      id: editingLot.id,
      lot_number: data.lot_number,
      cost_per_unit: data.cost_per_unit,
      expiry_date: data.expiry_date || undefined,
      notes: data.notes,
    });
    setEditingLot(null);
  };

  const handleDeleteConfirm = async () => {
    if (lotToDelete) {
      await deleteLot.mutateAsync(lotToDelete);
      setLotToDelete(null);
    }
  };

  const handleCreate = async (data: LotFormData) => {
    await createLot.mutateAsync({
      peptide_id: data.peptide_id,
      lot_number: data.lot_number,
      quantity_received: data.quantity_received,
      cost_per_unit: data.cost_per_unit,
      received_date: data.received_date || undefined,
      expiry_date: data.expiry_date || undefined,
      notes: data.notes,
    });
    setIsCreateOpen(false);
    form.reset();
  };

  const activePeptides = peptides?.filter((p) => p.active) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lots</h1>
          <p className="text-muted-foreground">Manage inventory batches</p>
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Receive Inventory
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Receive New Lot</DialogTitle>
                <DialogDescription>
                  Add a new inventory lot. Bottles will be auto-generated.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="peptide_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Peptide</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select peptide" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activePeptides.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.sku && `(${p.sku})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lot_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lot Number</FormLabel>
                        <FormControl>
                          <Input placeholder="LOT-2026-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="quantity_received"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cost_per_unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost/Unit ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min={0} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="received_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Received Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="expiry_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiry Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional notes..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createLot.isPending}>
                      Receive Lot
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search lots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
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
          ) : filteredLots?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No lots found</p>
              <p className="text-sm">Receive your first inventory lot to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot Number</TableHead>
                  <TableHead>Peptide</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Expiry</TableHead>
                  {canEdit && <TableHead className="w-[70px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLots?.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/bottles?lot_id=${lot.id}`}
                        className="text-primary hover:underline"
                      >
                        {lot.lot_number}
                      </Link>
                    </TableCell>
                    <TableCell>{lot.peptides?.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lot.quantity_received} bottles</Badge>
                    </TableCell>
                    <TableCell>${Number(lot.cost_per_unit).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(lot.received_date), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lot.expiry_date ? (
                        <Badge
                          variant={new Date(lot.expiry_date) < new Date() ? 'destructive' : 'outline'}
                        >
                          {format(new Date(lot.expiry_date), 'MMM d, yyyy')}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canEdit && (
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
                            <DropdownMenuItem onClick={() => handleOpenEdit(lot)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setLotToDelete(lot.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Lot Dialog */}
      <Dialog open={!!editingLot} onOpenChange={(open) => !open && setEditingLot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lot</DialogTitle>
            <DialogDescription>
              Update lot details. Note: Quantity cannot be changed after creation.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="lot_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="cost_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost/Unit ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateLot.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!lotToDelete} onOpenChange={(open) => !open && setLotToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the lot
              and ALL bottles associated with it from your inventory.
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
    </div>
  );
}
