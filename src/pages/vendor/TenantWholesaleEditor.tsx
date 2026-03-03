import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, DollarSign, Save } from 'lucide-react';
import type { TenantDetail } from '@/hooks/use-tenant-detail';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantWholesalePrices, useUpsertTenantWholesalePrices, buildPriceMap } from '@/hooks/use-tenant-wholesale-prices';
import SupplierOrderDialog from '@/components/merchant/SupplierOrderDialog';

type Config = NonNullable<TenantDetail['config']>;

interface WholesaleTier {
    id: string;
    name: string;
    min_monthly_units: number;
    markup_amount: number;
    active: boolean;
}

interface SupplierPeptide {
    id: string;
    name: string;
    base_cost: number;
    retail_price: number | null;
    sku: string | null;
}

export default function TenantWholesaleEditor({ orgId, config, tenantName }: { orgId: string; config: Config | null; tenantName?: string }) {
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    const supplierOrgId = config?.supplier_org_id;
    const vendorOrgId = profile?.org_id;

    // Fetch wholesale pricing tiers
    const { data: tiers = [] } = useQuery({
        queryKey: ['wholesale_pricing_tiers'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('wholesale_pricing_tiers')
                .select('id, name, min_monthly_units, markup_amount, active')
                .eq('active', true)
                .order('sort_order');
            if (error) throw error;
            return (data || []) as WholesaleTier[];
        },
        staleTime: 5 * 60 * 1000,
    });

    const isLinked = !!config?.supplier_org_id;
    const currentTierId = config?.wholesale_tier_id;
    const currentTier = tiers.find(t => t.id === currentTierId);
    const pricingMode = config?.wholesale_pricing_mode || 'tier';

    // Fetch supplier's peptide catalog (vendor's own org products)
    const { data: supplierPeptides = [], isLoading: peptidesLoading } = useQuery({
        queryKey: ['supplier-peptides-for-pricing', supplierOrgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('peptides')
                .select('id, name, base_cost, retail_price, sku')
                .eq('org_id', supplierOrgId!)
                .eq('active', true)
                .gt('base_cost', 0)
                .order('name');
            if (error) throw error;
            return (data || []) as SupplierPeptide[];
        },
        enabled: !!supplierOrgId && isLinked && pricingMode === 'custom',
        staleTime: 5 * 60 * 1000,
    });

    // Fetch existing flat prices for this tenant
    const { data: existingPrices, isLoading: pricesLoading } = useTenantWholesalePrices(
        isLinked && pricingMode === 'custom' ? orgId : null
    );
    const upsertPrices = useUpsertTenantWholesalePrices(orgId);

    // Local state for price editing
    const [priceEdits, setPriceEdits] = useState<Map<string, string>>(new Map());
    const [hasChanges, setHasChanges] = useState(false);

    // Seed local edits from existing DB prices
    useEffect(() => {
        if (!existingPrices) return;
        const map = new Map<string, string>();
        for (const p of existingPrices) {
            map.set(p.peptide_id, p.wholesale_price.toFixed(2));
        }
        setPriceEdits(map);
        setHasChanges(false);
    }, [existingPrices]);

    const handlePriceChange = (peptideId: string, value: string) => {
        const newEdits = new Map(priceEdits);
        if (value === '' || value === '0') {
            newEdits.delete(peptideId);
        } else {
            newEdits.set(peptideId, value);
        }
        setPriceEdits(newEdits);
        setHasChanges(true);
    };

    const handleSavePrices = async () => {
        setSaving(true);
        try {
            const entries = supplierPeptides.map(p => {
                const val = priceEdits.get(p.id);
                const price = val ? parseFloat(val) : null;
                return {
                    peptide_id: p.id,
                    wholesale_price: price && price > 0 ? price : null,
                };
            });

            await upsertPrices.mutateAsync(entries);

            toast({
                title: 'Custom prices saved',
                description: `Updated pricing for ${entries.filter(e => e.wholesale_price).length} products`,
            });
            setHasChanges(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save prices', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleSupplier = async (enabled: boolean) => {
        setSaving(true);
        try {
            const updates: Record<string, string | null> = enabled
                ? { supplier_org_id: vendorOrgId || null }
                : { supplier_org_id: null, wholesale_tier_id: null };

            if (enabled && !currentTierId) {
                const standardTier = tiers.find(t => t.name === 'Standard');
                if (standardTier) updates.wholesale_tier_id = standardTier.id;
            }

            const { error } = await supabase
                .from('tenant_config')
                .update(updates)
                .eq('org_id', orgId);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({
                title: enabled ? 'Wholesale supplier linked' : 'Wholesale supplier unlinked',
                description: enabled
                    ? 'Tenant can now see your wholesale catalog'
                    : 'Wholesale catalog hidden from tenant',
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handlePricingModeChange = async (mode: string) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('tenant_config')
                .update({ wholesale_pricing_mode: mode })
                .eq('org_id', orgId);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({
                title: 'Pricing mode updated',
                description: mode === 'custom'
                    ? 'Using custom flat prices for this tenant'
                    : 'Using volume-based tier pricing',
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleTierChange = async (tierId: string) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('tenant_config')
                .update({ wholesale_tier_id: tierId })
                .eq('org_id', orgId);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            const tier = tiers.find(t => t.id === tierId);
            toast({ title: 'Wholesale tier updated', description: `Set to ${tier?.name || 'Unknown'}` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to update tier', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const customPriceCount = Array.from(priceEdits.values()).filter(v => v && parseFloat(v) > 0).length;
    const existingPriceMap = buildPriceMap(existingPrices);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Wholesale / Supplier
                </CardTitle>
                <CardDescription className="flex items-center justify-between">
                    <span>Link your wholesale catalog to this tenant</span>
                    {isLinked && (
                        <SupplierOrderDialog targetOrgId={orgId} targetOrgName={tenantName} />
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Toggle supplier link */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Supplier Linked</p>
                        <p className="text-xs text-muted-foreground">
                            {isLinked ? 'Tenant can browse your wholesale catalog' : 'No supplier linked — tenant only sees their own products'}
                        </p>
                    </div>
                    <Switch
                        checked={isLinked}
                        onCheckedChange={handleToggleSupplier}
                        disabled={saving}
                    />
                </div>

                {isLinked && (
                    <>
                        {/* Pricing mode selector */}
                        <div className="border-t pt-4">
                            <label className="text-sm font-medium block mb-1.5">Pricing Mode</label>
                            <Select
                                value={pricingMode}
                                onValueChange={handlePricingModeChange}
                                disabled={saving}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tier">
                                        <span className="flex items-center gap-2">
                                            Volume Tiers
                                            <span className="text-xs text-muted-foreground">
                                                price changes with quantity
                                            </span>
                                        </span>
                                    </SelectItem>
                                    <SelectItem value="custom">
                                        <span className="flex items-center gap-2">
                                            Custom Flat Pricing
                                            <span className="text-xs text-muted-foreground">
                                                set price per product
                                            </span>
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* TIER MODE: show tier dropdown */}
                        {pricingMode === 'tier' && (
                            <div className="border-t pt-4">
                                <label className="text-sm font-medium block mb-1.5">Pricing Tier</label>
                                <Select
                                    value={currentTierId || ''}
                                    onValueChange={handleTierChange}
                                    disabled={saving}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select a tier" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tiers.map(tier => (
                                            <SelectItem key={tier.id} value={tier.id}>
                                                <span className="flex items-center gap-2">
                                                    {tier.name}
                                                    <span className="text-xs text-muted-foreground">
                                                        (+${tier.markup_amount}/unit, min {tier.min_monthly_units}/mo)
                                                    </span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {currentTier && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Current: <strong>{currentTier.name}</strong> — ${currentTier.markup_amount} markup per unit.
                                        Price varies by order volume.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* CUSTOM MODE: show per-item price editor */}
                        {pricingMode === 'custom' && (
                            <div className="border-t pt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <label className="text-sm font-medium flex items-center gap-1.5">
                                            <DollarSign className="h-3.5 w-3.5" />
                                            Set Prices
                                        </label>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Flat wholesale price per product — same price regardless of quantity.
                                        </p>
                                    </div>
                                    {customPriceCount > 0 && (
                                        <Badge variant="secondary">{customPriceCount} priced</Badge>
                                    )}
                                </div>

                                {peptidesLoading || pricesLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog...
                                    </div>
                                ) : supplierPeptides.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No active products with base cost in supplier catalog.
                                    </p>
                                ) : (
                                    <>
                                        <div className="overflow-x-auto border rounded-md">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Product</TableHead>
                                                        <TableHead className="text-right w-[100px]">Your Cost</TableHead>
                                                        <TableHead className="text-right w-[140px]">Their Price</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {supplierPeptides.map(p => {
                                                        const editValue = priceEdits.get(p.id) ?? '';
                                                        const hasCustomPrice = !!existingPriceMap.get(p.id);
                                                        return (
                                                            <TableRow key={p.id}>
                                                                <TableCell>
                                                                    <div className="font-medium text-sm">{p.name}</div>
                                                                    {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                                                                </TableCell>
                                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                                    ${p.base_cost.toFixed(2)}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <span className="text-muted-foreground text-sm">$</span>
                                                                        <Input
                                                                            type="number"
                                                                            min={0}
                                                                            step={0.01}
                                                                            placeholder="0.00"
                                                                            value={editValue}
                                                                            onChange={e => handlePriceChange(p.id, e.target.value)}
                                                                            className="w-[90px] h-7 text-right text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                        />
                                                                        {hasCustomPrice && !hasChanges && (
                                                                            <Badge variant="outline" className="text-[10px] px-1 ml-1">set</Badge>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="flex items-center justify-end pt-2">
                                            <Button
                                                size="sm"
                                                onClick={handleSavePrices}
                                                disabled={!hasChanges || saving}
                                            >
                                                {saving ? (
                                                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</>
                                                ) : (
                                                    <><Save className="h-3 w-3 mr-1" /> Save Prices</>
                                                )}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}

                {saving && !isLinked && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
