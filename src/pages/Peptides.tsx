import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/use-page-title';
import { motion } from 'framer-motion';
import { usePeptides, useCreatePeptide, useUpdatePeptide, useDeletePeptide, type Peptide } from '@/hooks/use-peptides';
import { usePendingOrdersByPeptide } from '@/hooks/use-orders';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableTableHead } from '@/components/ui/table';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, FlaskConical, Search, Calendar, History, Download, Globe, Warehouse, ShoppingCart, Check } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { exportToCSV } from '@/utils/export-csv';
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
import { QueryError } from '@/components/ui/query-error';
import { PeptideHistoryDialog } from '@/components/peptides/PeptideHistoryDialog';
import SupplierOrderDialog from '@/components/merchant/SupplierOrderDialog';
import MarginCalculator from '@/components/wholesale/MarginCalculator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrgFeatures } from '@/hooks/use-org-features';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useOrgWholesaleTier, calculateWholesalePrice } from '@/hooks/use-wholesale-pricing';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const peptideSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sku: z.string().optional(),
  retail_price: z.union([z.string(), z.number()]).transform(v => Number(v) || 0).optional(),
});

type PeptideFormData = z.infer<typeof peptideSchema>;

export default function Peptides() {
  usePageTitle('Peptides');
  const { userRole, profile } = useAuth();
  const isMobile = useIsMobile();
  const { data: peptides, isLoading, isError, refetch } = usePeptides();
  const { data: pendingByPeptide } = usePendingOrdersByPeptide();
  const createPeptide = useCreatePeptide();
  const updatePeptide = useUpdatePeptide();
  const deletePeptide = useDeletePeptide();

  const { isEnabled } = useOrgFeatures();
  const { data: tenantConfig } = useTenantConfig();
  const { data: orgTier } = useOrgWholesaleTier();
  const showWholesaleTab = isEnabled('wholesale_catalog') && !!tenantConfig?.supplier_org_id;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<'catalog' | 'wholesale'>('catalog');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPeptide, setEditingPeptide] = useState<Peptide | null>(null);
  const [deletingPeptide, setDeletingPeptide] = useState<Peptide | null>(null);
  const [historyPeptide, setHistoryPeptide] = useState<Peptide | null>(null);
  const [addingToCatalog, setAddingToCatalog] = useState<Set<string>>(new Set());

  const form = useForm<PeptideFormData>({
    resolver: zodResolver(peptideSchema),
    defaultValues: { name: '', description: '', sku: '', retail_price: 0 },
  });

  const isPartner = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

  const canEdit = (userRole?.role === 'admin' || userRole?.role === 'super_admin' || userRole?.role === 'staff' || profile?.role === 'admin') && !isPartner;
  const canDelete = (userRole?.role === 'admin' || userRole?.role === 'super_admin' || profile?.role === 'admin') && !isPartner;

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

  const isWholesaleView = activeTab === 'wholesale' && showWholesaleTab;
  const myCatalogPeptides = peptides?.filter(p => p.catalog_source !== 'supplier') || [];
  const wholesalePeptides = peptides?.filter(p => p.catalog_source === 'supplier') || [];
  const basePeptides = isWholesaleView ? wholesalePeptides : myCatalogPeptides;

  const filteredPeptides = basePeptides.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.active : !p.active);
    return matchesSearch && matchesStatus;
  });

  const peptideSortAccessors = {
    name: (p: Peptide) => p.name?.toLowerCase(),
    sku: (p: Peptide) => p.sku?.toLowerCase(),
    stock: (p: Peptide) => p.stock_count ?? 0,
    cost: (p: Peptide) => p.avg_cost ?? 0,
    msrp: (p: Peptide) => p.retail_price ?? 0,
    status: (p: Peptide) => (p.active ? 'active' : 'inactive'),
  } as const;

  const { sortedData: sortedPeptides, sortState: peptideSortState, requestSort: requestPeptideSort } = useSortableTable(
    filteredPeptides,
    peptideSortAccessors,
  );

  const handleCreate = async (data: PeptideFormData) => {
    try {
      await createPeptide.mutateAsync({ name: data.name, description: data.description, sku: data.sku, retail_price: data.retail_price });
      setIsCreateOpen(false);
      form.reset();
    } catch { /* onError in hook shows toast */ }
  };

  const handleEdit = async (data: PeptideFormData) => {
    if (!editingPeptide) return;
    try {
      await updatePeptide.mutateAsync({ id: editingPeptide.id, ...data });
      setEditingPeptide(null);
      form.reset();
    } catch { /* onError in hook shows toast */ }
  };

  const handleDelete = async () => {
    if (!deletingPeptide) return;
    try {
      await deletePeptide.mutateAsync(deletingPeptide.id);
      setDeletingPeptide(null);
    } catch { /* onError in hook shows toast */ }
  };

  const handleToggleActive = async (peptide: Peptide) => {
    try {
      await updatePeptide.mutateAsync({ id: peptide.id, active: !peptide.active });
    } catch { /* onError in hook shows toast */ }
  };

  // Track which wholesale items are already in My Catalog (by name)
  const catalogNameSet = new Set(myCatalogPeptides.map(p => p.name.toLowerCase()));

  const handleAddToCatalog = async (peptide: Peptide) => {
    try {
      setAddingToCatalog(prev => new Set(prev).add(peptide.id));
      const wholesalePrice = calculateWholesalePrice(peptide.base_cost || 0, orgTier?.markup_amount || 0);
      await createPeptide.mutateAsync({
        name: peptide.name,
        description: peptide.description || undefined,
        sku: peptide.sku || undefined,
        retail_price: peptide.retail_price || 0,
        base_cost: wholesalePrice,
        catalog_source: 'manual',
      });
    } catch { /* onError in hook shows toast */ } finally {
      setAddingToCatalog(prev => {
        const next = new Set(prev);
        next.delete(peptide.id);
        return next;
      });
    }
  };

  const openEditDialog = (peptide: Peptide) => {
    setEditingPeptide(peptide);
    form.reset({
      name: peptide.name,
      description: peptide.description || '',
      sku: peptide.sku || '',
      retail_price: peptide.retail_price || 0,
    });
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="space-y-2"
      >
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Peptides</span>
      </nav>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Peptides</h1>
              {filteredPeptides && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                  {filteredPeptides.length} products
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">Manage your product catalog</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && isWholesaleView && <SupplierOrderDialog />}
          {canEdit && !isWholesaleView && (
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) form.reset(); }}>
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
      </div>
      </motion.div>

      {showWholesaleTab && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'catalog' | 'wholesale')}>
          <TabsList>
            <TabsTrigger value="catalog">My Catalog</TabsTrigger>
            <TabsTrigger value="wholesale">Wholesale Available</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <Card className="bg-card border-border/60">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search peptides"
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
            {!isWholesaleView && <Button variant="outline" onClick={() => {
              if (filteredPeptides?.length) {
                exportToCSV(filteredPeptides.map(p => ({
                  name: p.name,
                  sku: p.sku || '',
                  retail_price: p.retail_price,
                  active: p.active ? 'Yes' : 'No',
                  description: p.description || '',
                  created_at: p.created_at ? format(new Date(p.created_at), 'yyyy-MM-dd') : '',
                })), 'peptides', [
                  { key: 'name', label: 'Name' },
                  { key: 'sku', label: 'SKU' },
                  { key: 'retail_price', label: 'Retail Price' },
                  { key: 'active', label: 'Active' },
                  { key: 'description', label: 'Description' },
                  { key: 'created_at', label: 'Created' },
                ]);
              }
            }}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryError message="Failed to load peptides." onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : filteredPeptides?.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No peptides found"
              description="Get started by adding your first peptide to the catalog"
            />
          ) : isMobile ? (
            <div className="space-y-3">
              {sortedPeptides?.map((peptide, index) => (
                <motion.div
                  key={peptide.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                >
                  <Card
                    className={!isWholesaleView ? "cursor-pointer hover:bg-accent/30 hover:shadow-card hover:border-border/80 transition-all" : ""}
                    {...(!isWholesaleView ? {
                      role: "button" as const,
                      tabIndex: 0,
                      'aria-label': `Edit ${peptide.name}`,
                      onClick: () => openEditDialog(peptide),
                      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditDialog(peptide); } },
                    } : {})}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium">{peptide.name}</p>
                            {!isWholesaleView && peptide.catalog_source === 'website' && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-400/50 text-blue-600 gap-0.5">
                                <Globe className="h-2.5 w-2.5" /> Web
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{peptide.sku || 'No SKU'}</p>
                        </div>
                        <Badge variant={peptide.active ? 'default' : 'secondary'} className="text-xs">
                          {peptide.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Badge variant="outline" className={
                          (peptide.stock_count || 0) === 0 ? 'text-red-500 border-red-500/30' :
                          (peptide.stock_count || 0) < 5 ? 'text-amber-500 border-amber-500/30' : ''
                        }>
                          {peptide.stock_count || 0} Vials
                        </Badge>
                        {isWholesaleView ? (
                          <>
                            <span className="text-muted-foreground">
                              Cost: ${calculateWholesalePrice(peptide.base_cost || 0, orgTier?.markup_amount || 0).toFixed(2)}
                            </span>
                            <span className="text-muted-foreground">
                              MSRP: ${(peptide.retail_price || 0).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            ${(peptide.retail_price || 0).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {isWholesaleView && canEdit && (
                        <div className="mt-2">
                          {catalogNameSet.has(peptide.name.toLowerCase()) ? (
                            <Badge variant="outline" className="text-green-600 border-green-400/50 gap-1">
                              <Check className="h-3 w-3" /> Already in My Catalog
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs w-full"
                              disabled={addingToCatalog.has(peptide.id)}
                              onClick={(e) => { e.stopPropagation(); handleAddToCatalog(peptide); }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              {addingToCatalog.has(peptide.id) ? 'Adding...' : 'Add to My Catalog'}
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="Peptides table" tabIndex={0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead columnKey="name" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>Name</SortableTableHead>
                  <SortableTableHead columnKey="sku" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>SKU</SortableTableHead>
                  <SortableTableHead columnKey="stock" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>In Stock</SortableTableHead>
                  {!isWholesaleView && <TableHead>On Order</TableHead>}
                  {!isWholesaleView && <TableHead>Next Delivery</TableHead>}
                  <SortableTableHead columnKey="cost" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>
                    {isWholesaleView ? 'Your Cost' : isPartner ? 'Cost' : 'Avg Cost'}
                  </SortableTableHead>
                  <SortableTableHead columnKey="msrp" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>MSRP</SortableTableHead>
                  {isWholesaleView && <TableHead>Margin</TableHead>}
                  {!isWholesaleView && <SortableTableHead columnKey="status" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>Status</SortableTableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPeptides?.map((peptide, index) => (
                  <motion.tr key={peptide.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <button
                          className="text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
                          onClick={() => setHistoryPeptide(peptide)}
                          title="View Sales History"
                        >
                          {peptide.name}
                        </button>
                        {!isWholesaleView && peptide.catalog_source === 'website' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-400/50 text-blue-600 gap-0.5">
                            <Globe className="h-2.5 w-2.5" /> Web
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
                        <span className="text-xs text-red-500 block">Out of Stock</span>
                      )}
                      {(peptide.stock_count || 0) > 0 && (peptide.stock_count || 0) < 5 && (
                        <span className="text-xs text-amber-500 block">Low Stock</span>
                      )}
                    </TableCell>
                    {!isWholesaleView && (
                    <TableCell>
                      {pendingByPeptide?.[peptide.id]?.totalOrdered ? (
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
                          {pendingByPeptide[peptide.id].totalOrdered} ordered
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    )}
                    {!isWholesaleView && (
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
                    )}
                    {isWholesaleView ? (
                      <TableCell>
                        ${calculateWholesalePrice(peptide.base_cost || 0, orgTier?.markup_amount || 0).toFixed(2)}
                      </TableCell>
                    ) : isPartner ? (
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
                      ${(peptide.retail_price || 0).toFixed(2)}
                    </TableCell>
                    {isWholesaleView && (
                    <TableCell>
                      {(() => {
                        const yourCost = calculateWholesalePrice(peptide.base_cost || 0, orgTier?.markup_amount || 0);
                        const margin = (peptide.retail_price || 0) - yourCost;
                        const pct = peptide.retail_price ? (margin / peptide.retail_price * 100) : 0;
                        return (
                          <span className={margin > 0 ? 'text-green-600' : 'text-red-500'}>
                            ${margin.toFixed(2)} ({pct.toFixed(0)}%)
                          </span>
                        );
                      })()}
                    </TableCell>
                    )}
                    {!isWholesaleView && (
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
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isWholesaleView && canEdit && (
                          catalogNameSet.has(peptide.name.toLowerCase()) ? (
                            <Badge variant="outline" className="text-green-600 border-green-400/50 gap-1">
                              <Check className="h-3 w-3" /> Added
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              disabled={addingToCatalog.has(peptide.id)}
                              onClick={() => handleAddToCatalog(peptide)}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              {addingToCatalog.has(peptide.id) ? 'Adding...' : 'Add to My Catalog'}
                            </Button>
                          )
                        )}
                        {canEdit && !isWholesaleView && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit peptide"
                            onClick={() => openEditDialog(peptide)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View Sales History"
                          aria-label="View history"
                          onClick={() => setHistoryPeptide(peptide)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canDelete && !isWholesaleView && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete peptide"
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
            </div>
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
              disabled={deletePeptide.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePeptide.isPending ? 'Deleting...' : 'Delete'}
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

      {/* Wholesale Margin Calculator — visible in wholesale tab */}
      {isWholesaleView && canEdit && <MarginCalculator />}
    </div >
  );
}
