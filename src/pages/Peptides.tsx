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
import { PeptideSuggestions } from '@/components/peptides/PeptideSuggestions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/sb_client/client';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

const peptideSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
  retail_price: z.coerce.number().min(0).optional(), // New field
});

type PeptideFormData = z.infer<typeof peptideSchema>;

export default function Peptides() {
  const { userRole, user } = useAuth(); // Destructure user
  const { data: peptides, isLoading } = usePeptides();
  const { data: pendingByPeptide } = usePendingOrdersByPeptide();
  const createPeptide = useCreatePeptide();
  const updatePeptide = useUpdatePeptide();
  const deletePeptide = useDeletePeptide();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPeptide, setEditingPeptide] = useState<Peptide | null>(null);
  const [deletingPeptide, setDeletingPeptide] = useState<Peptide | null>(null);

  const isThompsonOverride = user?.email === 'thompsonfamv@gmail.com';
  // Use URL search param for preview if needed, or just strict override for now for verify
  // But let's keep it consistent.
  const isPartner = userRole?.role === 'sales_rep' || isThompsonOverride;

  const canEdit = (userRole?.role === 'admin' || userRole?.role === 'staff') && !isThompsonOverride;
  const canDelete = userRole?.role === 'admin' && !isThompsonOverride;

  const form = useForm<PeptideFormData>({
    resolver: zodResolver(peptideSchema),
    defaultValues: { name: '', description: '', sku: '', retail_price: 0 },
  });

  const filteredPeptides = peptides?.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = async (data: PeptideFormData) => {
    // @ts-ignore - retail_price might not exist in type yet but we'll send it
    await createPeptide.mutateAsync({ name: data.name, description: data.description, sku: data.sku, retail_price: data.retail_price });
    setIsCreateOpen(false);
    form.reset();
  };

  const handleEdit = async (data: PeptideFormData) => {
    if (!editingPeptide) return;
    // @ts-ignore
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
      retail_price: (peptide as any).retail_price || 0,
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
                  <div className="grid grid-cols-2 gap-4">
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
                      name="retail_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>MSRP (Retail Price)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
                  {isPartner ? (
                    <TableHead>Cost</TableHead>
                  ) : (
                    <TableHead>Avg Cost</TableHead>
                  )}
                  {!isPartner && <TableHead>MSRP</TableHead>}
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
                    {isPartner ? (
                      <TableCell>
                        {/* Partner sees AvgCost + 4.00 overhead generally, or we could just show the $4 overhead if base is 0. 
                                User said: "cost is the additional $4 without seeing the up cost" - wait.
                                "base price should be the cost plus $4 as base".
                                Let's assume (AvgCost + 4). 
                            */}
                        ${((peptide.avg_cost || 0) + 4.00).toFixed(2)}
                      </TableCell>
                    ) : (
                      <TableCell>
                        ${(peptide.avg_cost || 0).toFixed(2)}
                      </TableCell>
                    )}
                    {!isPartner && (
                      <TableCell>
                        ${((peptide as any).retail_price || 0).toFixed(2)}
                      </TableCell>
                    )}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Peptide</DialogTitle>
            <DialogDescription>Update peptide details</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="suggestions">Suggested Supplements</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="pt-4">
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
            </TabsContent>

            <TabsContent value="suggestions" className="pt-4">
              {editingPeptide && <PeptideSuggestions peptideId={editingPeptide.id} />}
            </TabsContent>
          </Tabs>
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
