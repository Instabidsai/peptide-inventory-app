import { useState } from 'react';
import { usePeptides, useCreatePeptide, useUpdatePeptide, useDeletePeptide, type Peptide } from '@/hooks/use-peptides';
import { usePendingOrdersByPeptide } from '@/hooks/use-orders';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, FlaskConical, Search, Calendar } from 'lucide-react';
import { format } from 'date-fns';
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

const peptideSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
});

type PeptideFormData = z.infer<typeof peptideSchema>;

export default function Peptides() {
  const { userRole } = useAuth();
  const { data: peptides, isLoading } = usePeptides();
  const { data: pendingByPeptide } = usePendingOrdersByPeptide();
  const createPeptide = useCreatePeptide();
  const updatePeptide = useUpdatePeptide();
  const deletePeptide = useDeletePeptide();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPeptide, setEditingPeptide] = useState<Peptide | null>(null);
  const [deletingPeptide, setDeletingPeptide] = useState<Peptide | null>(null);

  const canEdit = userRole?.role === 'admin' || userRole?.role === 'staff';
  const canDelete = userRole?.role === 'admin';

  const form = useForm<PeptideFormData>({
    resolver: zodResolver(peptideSchema),
    defaultValues: { name: '', description: '', sku: '' },
  });

  const filteredPeptides = peptides?.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async (data: PeptideFormData) => {
    await createPeptide.mutateAsync({ name: data.name, description: data.description, sku: data.sku });
    setIsCreateOpen(false);
    form.reset();
  };

  const handleEdit = async (data: PeptideFormData) => {
    if (!editingPeptide) return;
    await updatePeptide.mutateAsync({ id: editingPeptide.id, ...data });
    setEditingPeptide(null);
    form.reset();
  };

  const handleDelete = async () => {
    if (!deletingPeptide) return;
    await deletePeptide.mutateAsync(deletingPeptide.id);
    setDeletingPeptide(null);
  };

  const handleToggleActive = async (peptide: Peptide) => {
    await updatePeptide.mutateAsync({ id: peptide.id, active: !peptide.active });
  };

  const openEditDialog = (peptide: Peptide) => {
    setEditingPeptide(peptide);
    form.reset({
      name: peptide.name,
      description: peptide.description || '',
      sku: peptide.sku || '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Peptides</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        {canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Peptide
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Peptide</DialogTitle>
                <DialogDescription>Create a new peptide product</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="BPC-157" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="BPC-5MG" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Product description..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createPeptide.isPending}>
                      Create Peptide
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
                placeholder="Search peptides..."
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
          ) : filteredPeptides?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FlaskConical className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No peptides found</p>
              <p className="text-sm">Get started by adding your first peptide</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>In Stock</TableHead>
                  <TableHead>On Order</TableHead>
                  <TableHead>Next Delivery</TableHead>
                  <TableHead>Avg Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeptides?.map((peptide) => (
                  <TableRow key={peptide.id}>
                    <TableCell className="font-medium">{peptide.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {peptide.sku || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{peptide.stock_count || 0} Vials</Badge>
                    </TableCell>
                    <TableCell>
                      {pendingByPeptide?.[peptide.id]?.totalOrdered ? (
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
                          {pendingByPeptide[peptide.id].totalOrdered} ordered
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pendingByPeptide?.[peptide.id]?.nextDelivery ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(pendingByPeptide[peptide.id].nextDelivery!), 'MMM d')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      ${(peptide.avg_cost || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={peptide.active}
                          onCheckedChange={() => handleToggleActive(peptide)}
                          disabled={!canEdit}
                        />
                        <Badge variant={peptide.active ? 'default' : 'secondary'}>
                          {peptide.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(peptide)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingPeptide(peptide)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingPeptide} onOpenChange={() => setEditingPeptide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Peptide</DialogTitle>
            <DialogDescription>Update peptide details</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updatePeptide.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPeptide} onOpenChange={() => setDeletingPeptide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Peptide?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPeptide?.name}"? This action cannot be undone.
              You cannot delete peptides that have associated lots.
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
