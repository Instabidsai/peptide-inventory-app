import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/use-page-title';
import { motion } from 'framer-motion';
import { usePeptides, useCreatePeptide, useUpdatePeptide, useDeletePeptide, type Peptide } from '@/hooks/use-peptides';
import { usePendingOrdersByPeptide } from '@/hooks/use-orders';
import { useCreateLot, useDeleteLot } from '@/hooks/use-lots';
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
import { Plus, Pencil, Trash2, FlaskConical, Search, Calendar, History, Download, Globe, Warehouse, ShoppingCart, Check, PackagePlus, Undo2, Loader2 } from 'lucide-react';
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
import { useOrgWholesaleTier, useWholesaleTiers, calculateWholesalePrice } from '@/hooks/use-wholesale-pricing';
import { useTenantWholesalePrices, buildPriceMap } from '@/hooks/use-tenant-wholesale-prices';
import { useSupplierCatalog, type SupplierPeptide } from '@/hooks/use-supplier-catalog';
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
  base_cost: z.union([z.string(), z.number()]).transform(v => Number(v) || 0).optional(),
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
  const tenantConfig = useTenantConfig();
  const { data: orgTier } = useOrgWholesaleTier();
  const { data: allTiers } = useWholesaleTiers();
  const showWholesaleTab = isEnabled('wholesale_catalog') && !!tenantConfig?.supplier_org_id;
  const { data: supplierCatalog, isLoading: supplierLoading } = useSupplierCatalog(null, showWholesaleTab);
  const { data: flatPrices } = useTenantWholesalePrices(profile?.org_id);
  const flatPriceMap = buildPriceMap(flatPrices);
  const isCustomPricing = orgTier?.pricing_mode === 'custom' && flatPriceMap.size > 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<'catalog' | 'wholesale'>('catalog');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPeptide, setEditingPeptide] = useState<Peptide | null>(null);
  const [deletingPeptide, setDeletingPeptide] = useState<Peptide | null>(null);
  const [historyPeptide, setHistoryPeptide] = useState<Peptide | null>(null);
  const [addingToCatalog, setAddingToCatalog] = useState<Set<string>>(new Set());

  // Quick Stock Add / Delete
  const [quickStockPeptide, setQuickStockPeptide] = useState<Peptide | null>(null);
  const [quickStockQty, setQuickStockQty] = useState('');
  const [quickStockCost, setQuickStockCost] = useState('');
  const [lastAddedLot, setLastAddedLot] = useState<{ id: string; qty: number; cost: number; peptideName: string } | null>(null);
  const createLot = useCreateLot();
  const deleteLot = useDeleteLot();

  const handleQuickStock = async () => {
    if (!quickStockPeptide) return;
    const qty = parseInt(quickStockQty, 10);
    const cost = parseFloat(quickStockCost);
    if (!qty || qty <= 0 || !cost || cost <= 0) return;
    const lotNum = `QS-${format(new Date(), 'yyyyMMdd')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
      const lot = await createLot.mutateAsync({
        peptide_id: quickStockPeptide.id,
        lot_number: lotNum,
        quantity_received: qty,
        cost_per_unit: cost,
        payment_status: 'paid',
      });
      setLastAddedLot({ id: lot.id, qty, cost, peptideName: quickStockPeptide.name });
      setQuickStockQty('');
      setQuickStockCost('');
    } catch { /* toast from hook */ }
  };

  const handleUndoQuickStock = async () => {
    if (!lastAddedLot) return;
    try {
      await deleteLot.mutateAsync(lastAddedLot.id);
      setLastAddedLot(null);
      setQuickStockPeptide(null);
    } catch { /* toast from hook */ }
  };

  const form = useForm<PeptideFormData>({
    resolver: zodResolver(peptideSchema),
    defaultValues: { name: '', description: '', sku: '', retail_price: 0, base_cost: 0 },
  });

  const isPartner = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

  const canEdit = (userRole?.role === 'admin' || userRole?.role === 'super_admin' || userRole?.role === 'staff' || profile?.role === 'admin') && !isPartner;
  const canDelete = (userRole?.role === 'admin' || userRole?.role === 'super_admin' || profile?.role === 'admin') && !isPartner;

  const isWholesaleView = activeTab === 'wholesale' && showWholesaleTab;
  const myCatalogPeptides = peptides?.filter(p => p.catalog_source !== 'supplier') || [];

  // Wholesale view: filter supplier catalog; My Catalog view: filter own peptides
  // In custom pricing mode, only show peptides that have flat prices assigned
  const filteredSupplierCatalog = (supplierCatalog || []).filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    if (isCustomPricing && !flatPriceMap.has(p.id)) return false;
    return matchesSearch;
  });

  const filteredPeptides = isWholesaleView ? [] : myCatalogPeptides.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.active : !p.active);
    return matchesSearch && matchesStatus;
  });

  const peptideSortAccessors = {
    name: (p: Peptide) => p.name?.toLowerCase(),
    sku: (p: Peptide) => p.sku?.toLowerCase(),
    stock: (p: Peptide) => p.stock_count ?? 0,
    cost: (p: Peptide) => p.base_cost ?? p.avg_cost ?? 0,
    msrp: (p: Peptide) => p.retail_price ?? 0,
    status: (p: Peptide) => (p.active ? 'active' : 'inactive'),
  } as const;

  const { sortedData: sortedPeptides, sortState: peptideSortState, requestSort: requestPeptideSort } = useSortableTable(
    filteredPeptides,
    peptideSortAccessors,
  );

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

  const handleAddToCatalog = async (peptide: SupplierPeptide) => {
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
      base_cost: peptide.base_cost || 0,
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
              {(isWholesaleView ? filteredSupplierCatalog : filteredPeptides) && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                  {(isWholesaleView ? filteredSupplierCatalog.length : filteredPeptides.length)} products
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
                    name="base_cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost</FormLabel>
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
            <TabsTrigger value="wholesale">
              <Warehouse className="h-3.5 w-3.5 mr-1.5" />
              The Peptide AI Wholesale Catalog
            </TabsTrigger>
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
          {isWholesaleView ? (
            /* ── WHOLESALE CATALOG VIEW ── */
            supplierLoading ? (
              <TableSkeleton rows={5} columns={4} />
            ) : filteredSupplierCatalog.length === 0 ? (
              <EmptyState
                icon={Warehouse}
                title="No wholesale products available"
                description="Your supplier hasn't added any products yet"
              />
            ) : (
              <>
                {/* Pricing mode legend */}
                {isCustomPricing ? (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <Badge variant="default" className="text-xs">Custom pricing applied</Badge>
                  </div>
                ) : allTiers && allTiers.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-muted-foreground font-medium">Volume pricing:</span>
                    {[...allTiers].sort((a, b) => a.min_monthly_units - b.min_monthly_units).map(t => (
                      <Badge key={t.id} variant={orgTier?.id === t.id ? 'default' : 'outline'} className="text-xs">
                        {t.min_monthly_units}+ units: cost + ${t.markup_amount}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {isMobile ? (
                  <div className="space-y-3">
                    {filteredSupplierCatalog.map((peptide, index) => {
                      const flatPrice = flatPriceMap.get(peptide.id);
                      const yourCost = isCustomPricing && flatPrice != null
                        ? flatPrice
                        : calculateWholesalePrice(peptide.base_cost, orgTier?.markup_amount || allTiers?.[0]?.markup_amount || 25);
                      const margin = (peptide.retail_price || 0) - yourCost;
                      return (
                      <motion.div key={peptide.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04 }}>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-medium">{peptide.name}</p>
                                <p className="text-xs text-muted-foreground">{peptide.sku || 'No SKU'}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">MSRP ${(peptide.retail_price || 0).toFixed(2)}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs mb-2">
                              {isCustomPricing ? (
                                <Badge variant="default" className="text-[10px]">
                                  Your Price: ${yourCost.toFixed(2)}
                                </Badge>
                              ) : (
                                allTiers && [...allTiers].sort((a, b) => a.min_monthly_units - b.min_monthly_units).map(t => (
                                  <Badge key={t.id} variant={orgTier?.id === t.id ? 'default' : 'secondary'} className="text-[10px]">
                                    {t.min_monthly_units}+: ${calculateWholesalePrice(peptide.base_cost, t.markup_amount).toFixed(2)}
                                  </Badge>
                                ))
                              )}
                            </div>
                            {canEdit && (
                              <div className="mt-2">
                                {catalogNameSet.has(peptide.name.toLowerCase()) ? (
                                  <Badge variant="outline" className="text-green-600 border-green-400/50 gap-1">
                                    <Check className="h-3 w-3" /> Already in My Catalog
                                  </Badge>
                                ) : (
                                  <Button variant="outline" size="sm" className="gap-1 text-xs w-full" disabled={addingToCatalog.has(peptide.id)} onClick={(e) => { e.stopPropagation(); handleAddToCatalog(peptide); }}>
                                    <ShoppingCart className="h-3.5 w-3.5" />
                                    {addingToCatalog.has(peptide.id) ? 'Adding...' : 'Add to My Catalog'}
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto" role="region" aria-label="Wholesale catalog table" tabIndex={0}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          {isCustomPricing ? (
                            <TableHead className="text-right">Your Price</TableHead>
                          ) : (
                            allTiers && [...allTiers].sort((a, b) => a.min_monthly_units - b.min_monthly_units).map(t => (
                              <TableHead key={t.id} className="text-right">
                                {t.min_monthly_units}+ units
                              </TableHead>
                            ))
                          )}
                          <TableHead className="text-right">MSRP</TableHead>
                          <TableHead className="text-right">Your Margin</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSupplierCatalog.map((peptide, index) => {
                          const flatPrice = flatPriceMap.get(peptide.id);
                          const yourCost = isCustomPricing && flatPrice != null
                            ? flatPrice
                            : calculateWholesalePrice(peptide.base_cost, orgTier?.markup_amount || allTiers?.[0]?.markup_amount || 25);
                          const margin = (peptide.retail_price || 0) - yourCost;
                          const pct = peptide.retail_price ? (margin / peptide.retail_price * 100) : 0;
                          return (
                            <motion.tr key={peptide.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50">
                              <TableCell className="font-medium">{peptide.name}</TableCell>
                              <TableCell className="text-muted-foreground">{peptide.sku || '-'}</TableCell>
                              {isCustomPricing ? (
                                <TableCell className="text-right tabular-nums font-semibold text-green-600">
                                  ${yourCost.toFixed(2)}
                                </TableCell>
                              ) : (
                                allTiers && [...allTiers].sort((a, b) => a.min_monthly_units - b.min_monthly_units).map(t => (
                                  <TableCell key={t.id} className={`text-right tabular-nums ${orgTier?.id === t.id ? 'font-semibold text-primary' : ''}`}>
                                    ${calculateWholesalePrice(peptide.base_cost, t.markup_amount).toFixed(2)}
                                  </TableCell>
                                ))
                              )}
                              <TableCell className="text-right tabular-nums">${(peptide.retail_price || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={margin > 0 ? 'text-green-600' : 'text-red-500'}>
                                  ${margin.toFixed(2)} ({pct.toFixed(0)}%)
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {canEdit && (
                                  catalogNameSet.has(peptide.name.toLowerCase()) ? (
                                    <Badge variant="outline" className="text-green-600 border-green-400/50 gap-1">
                                      <Check className="h-3 w-3" /> Added
                                    </Badge>
                                  ) : (
                                    <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={addingToCatalog.has(peptide.id)} onClick={() => handleAddToCatalog(peptide)}>
                                      <ShoppingCart className="h-3.5 w-3.5" />
                                      {addingToCatalog.has(peptide.id) ? 'Adding...' : 'Add to My Catalog'}
                                    </Button>
                                  )
                                )}
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )
          ) : (
            /* ── MY CATALOG VIEW ── */
            isError ? (
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
                      className="cursor-pointer hover:bg-accent/30 hover:shadow-card hover:border-border/80 transition-all"
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${peptide.name}`}
                      onClick={() => openEditDialog(peptide)}
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditDialog(peptide); } }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium">{peptide.name}</p>
                              {peptide.catalog_source === 'website' && (
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
                          <span className="text-muted-foreground">
                            ${(peptide.retail_price || 0).toFixed(2)}
                          </span>
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-auto gap-1 text-xs"
                              onClick={(e) => { e.stopPropagation(); setQuickStockPeptide(peptide); setQuickStockQty(''); setQuickStockCost(''); }}
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                              Add Stock
                            </Button>
                          )}
                        </div>
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
                    <TableHead>On Order</TableHead>
                    <TableHead>Next Delivery</TableHead>
                    <SortableTableHead columnKey="cost" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>
                      Cost
                    </SortableTableHead>
                    <SortableTableHead columnKey="msrp" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>MSRP</SortableTableHead>
                    <SortableTableHead columnKey="status" activeColumn={peptideSortState.column} direction={peptideSortState.direction} onSort={requestPeptideSort}>Status</SortableTableHead>
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
                          {peptide.catalog_source === 'website' && (
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
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={
                            (peptide.stock_count || 0) === 0 ? 'text-red-500 border-red-500/30' :
                            (peptide.stock_count || 0) < 5 ? 'text-amber-500 border-amber-500/30' : ''
                          }>
                            {peptide.stock_count || 0} Vials
                          </Badge>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                              title="Quick add stock"
                              aria-label={`Quick add stock for ${peptide.name}`}
                              onClick={() => { setQuickStockPeptide(peptide); setQuickStockQty(''); setQuickStockCost(''); }}
                            >
                              <PackagePlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {(peptide.stock_count || 0) === 0 && (
                          <span className="text-xs text-red-500 block">Out of Stock</span>
                        )}
                        {(peptide.stock_count || 0) > 0 && (peptide.stock_count || 0) < 5 && (
                          <span className="text-xs text-amber-500 block">Low Stock</span>
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
                          {(() => {
                            const cost = peptide.base_cost || peptide.avg_cost || pendingByPeptide?.[peptide.id]?.avgPendingCost || 0;
                            return `$${(cost + (profile?.overhead_per_unit ?? 4.00)).toFixed(2)}`;
                          })()}
                        </TableCell>
                      ) : (
                        <TableCell>
                          {(() => {
                            const cost = peptide.base_cost || peptide.avg_cost || pendingByPeptide?.[peptide.id]?.avgPendingCost || 0;
                            return `$${cost.toFixed(2)}`;
                          })()}
                        </TableCell>
                      )}
                      <TableCell>
                        ${(peptide.retail_price || 0).toFixed(2)}
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
                          {canDelete && (
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
            )
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
                    name="base_cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost</FormLabel>
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

      {/* Quick Stock Add Dialog */}
      <Dialog open={!!quickStockPeptide} onOpenChange={(open) => { if (!open) { setQuickStockPeptide(null); setLastAddedLot(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" />
              {lastAddedLot ? 'Stock Added' : 'Add Stock'}
            </DialogTitle>
            <DialogDescription>
              {quickStockPeptide?.name}{lastAddedLot ? '' : ' — record a purchase'}
            </DialogDescription>
          </DialogHeader>

          {lastAddedLot ? (
            /* ── Success state with Undo ── */
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                  <Check className="h-5 w-5 text-green-600" />
                </div>
                <p className="font-medium text-green-600">
                  {lastAddedLot.qty} vial{lastAddedLot.qty !== 1 ? 's' : ''} added
                </p>
                <p className="text-sm text-muted-foreground">
                  ${lastAddedLot.cost.toFixed(2)}/unit — ${(lastAddedLot.qty * lastAddedLot.cost).toFixed(2)} total
                </p>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={handleUndoQuickStock}
                  disabled={deleteLot.isPending}
                >
                  {deleteLot.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                  {deleteLot.isPending ? 'Removing...' : 'Undo — Delete This Stock'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setLastAddedLot(null); }}
                >
                  Add More Stock
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setQuickStockPeptide(null); setLastAddedLot(null); }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Input state ── */
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label htmlFor="qs-qty" className="text-sm font-medium">Quantity Purchased</label>
                  <Input
                    id="qs-qty"
                    type="number"
                    min="1"
                    placeholder="e.g. 10"
                    value={quickStockQty}
                    onChange={(e) => setQuickStockQty(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="qs-cost" className="text-sm font-medium">Cost Per Unit ($)</label>
                  <Input
                    id="qs-cost"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 12.50"
                    value={quickStockCost}
                    onChange={(e) => setQuickStockCost(e.target.value)}
                  />
                </div>
                {quickStockQty && quickStockCost && parseFloat(quickStockQty) > 0 && parseFloat(quickStockCost) > 0 && (
                  <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Cost</span>
                      <span className="font-semibold">${(parseFloat(quickStockQty) * parseFloat(quickStockCost)).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setQuickStockPeptide(null)}>Cancel</Button>
                <Button
                  onClick={handleQuickStock}
                  disabled={createLot.isPending || !quickStockQty || !quickStockCost || parseFloat(quickStockQty) <= 0 || parseFloat(quickStockCost) <= 0}
                >
                  {createLot.isPending ? 'Adding...' : 'Add Stock'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Wholesale Margin Calculator — visible in wholesale tab, hidden for custom pricing */}
      {isWholesaleView && canEdit && !isCustomPricing && <MarginCalculator />}
    </div >
  );
}
