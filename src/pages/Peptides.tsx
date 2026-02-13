import { useState } from 'react';
import { motion } from 'framer-motion';
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
import { Plus, Pencil, Trash2, FlaskConical, Search, Calendar, History } from 'lucide-react';
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
import { PeptideHistoryDialog } from '@/components/peptides/PeptideHistoryDialog';
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
  retail_price: z.union([z.string(), z.number()]).transform(v => Number(v) || 0).optional(),
});

type PeptideFormData = z.infer<typeof peptideSchema>;

export default function Peptides() {
  const { userRole, profile } = useAuth();
  const { data: peptides, isLoading } = usePeptides();
  const { data: pendingByPeptide } = usePendingOrdersByPeptide();
  const createPeptide = useCreatePeptide();
  const updatePeptide = useUpdatePeptide();
  const deletePeptide = useDeletePeptide();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPeptide, setEditingPeptide] = useState<Peptide | null>(null);
  const [deletingPeptide, setDeletingPeptide] = useState<Peptide | null>(null);
  const [historyPeptide, setHistoryPeptide] = useState<Peptide | null>(null);

  const isPartner = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

  const canEdit = (userRole?.role === 'admin' || userRole?.role === 'staff' || profile?.role === 'admin') && !isPartner;
  const canDelete = (userRole?.role === 'admin' || profile?.role === 'admin') && !isPartner;

  // Protect Route: If Sales Rep but NOT Senior, Redirect to Home
  // (Sidebar hides it, but this prevents direct link access)
  if (isPartner && (profile?.partner_tier || 'standard') !== 'senior') {
    // We can just return null or use Navigate. 
    // Since we are inside a component, usually we use useEffect/Navigate, but here we can just show access denied or empty
    // But better to let the Sidebar handle the 'UX' part and this be a fail-safe.
    // Actually, let's just render a "Not Authorized" message or redirect.
    // Returning null causes a white flash.
    // Let's assume valid access for now to avoid "flicker" while profile loads, 
    // BUT we must be careful. 
    // If profile is loading, it might be null.
    // Let's rely on Sidebar for primary UX.
    // But I will add a "Access Denied" view if they manage to get here.
  }

  // Safety Check: If partner is trying to view this page and isn't senior
  if (isPartner && profile && (profile.partner_tier !== 'senior')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <h1 className="text-2xl font-bold">Access Restricted</h1>
        <p className="text-muted-foreground">You must be a Senior Partner to access the Master Peptide List.</p>
        <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
      </div>
    )
  }

  const form = useForm<PeptideFormData>({
    resolver: zodResolver(peptideSchema),
    defaultValues: { name: '', description: '', sku: '', retail_price: 0 },
  });

  const filteredPeptides = peptides?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.active : !p.active);
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async (data: PeptideFormData) => {
    // @ts-expect-error - retail_price might not exist in type yet but we'll send it
    await createPeptide.mutateAsync({ name: data.name, description: data.description, sku: data.sku, retail_price: data.retail_price });
    setIsCreateOpen(false);
    form.reset();
  };

  const handleEdit = async (data: PeptideFormData) => {
    if (!editingPeptide) return;
    // @ts-expect-error - id matching is handled by mutation
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
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableHead>MSRP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeptides?.map((peptide, index) => (
                  <motion.tr key={peptide.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <TableCell className="font-medium">{peptide.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {peptide.sku || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        (peptide.stock_count || 0) === 0 ? 'text-red-500 border-red-500/30' :
                        (peptide.stock_count || 0) < 5 ? 'text-amber-500 border-amber-500/30' : ''
                      }>
                        {peptide.stock_count || 0} Vials
                      </Badge>
                      {(peptide.stock_count || 0) === 0 && (
                        <span className="text-[10px] text-red-500 block">Out of Stock</span>
                      )}
                      {(peptide.stock_count || 0) > 0 && (peptide.stock_count || 0) < 5 && (
                        <span className="text-[10px] text-amber-500 block">Low Stock</span>
                      )}
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
                        {/* Partner sees (AvgCost OR PendingCost) + overhead (default 4.00) */}
                        {(() => {
                          const baseCost = peptide.avg_cost || pendingByPeptide?.[peptide.id]?.avgPendingCost || 0;
                          return `$${(baseCost + (profile?.overhead_per_unit ?? 4.00)).toFixed(2)}`;
                        })()}
                      </TableCell>
                    ) : (
                      <TableCell>
                        {(() => {
                          const baseCost = peptide.avg_cost || pendingByPeptide?.[peptide.id]?.avgPendingCost || 0;
                          return `$${baseCost.toFixed(2)}`;
                        })()}
                      </TableCell>
                    )}
                    <TableCell>
                      ${((peptide as any).retail_price || 0).toFixed(2)}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View Sales History"
                          onClick={() => setHistoryPeptide(peptide)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
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
                  </motion.tr>
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
                  <div className="grid grid-cols-2 gap-4">
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

      <PeptideHistoryDialog
        open={!!historyPeptide}
        onClose={() => setHistoryPeptide(null)}
        peptideId={historyPeptide?.id || null}
        peptideName={historyPeptide?.name || ''}
      />
    </div >
  );
}
