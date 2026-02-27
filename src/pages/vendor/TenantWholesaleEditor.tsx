import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck } from 'lucide-react';
import type { TenantDetail } from '@/hooks/use-tenant-detail';
import { useAuth } from '@/contexts/AuthContext';

type Config = NonNullable<TenantDetail['config']>;

interface WholesaleTier {
    id: string;
    name: string;
    min_monthly_units: number;
    markup_amount: number;
    active: boolean;
}

export default function TenantWholesaleEditor({ orgId, config }: { orgId: string; config: Config | null }) {
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    // The super_admin's own org is the supplier
    const supplierOrgId = profile?.org_id;

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

    const handleToggleSupplier = async (enabled: boolean) => {
        setSaving(true);
        try {
            const updates: Record<string, string | null> = enabled
                ? { supplier_org_id: supplierOrgId || null }
                : { supplier_org_id: null, wholesale_tier_id: null };

            // If enabling and no tier set, default to Standard
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

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Wholesale / Supplier
                </CardTitle>
                <CardDescription>Link your wholesale catalog to this tenant</CardDescription>
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

                {/* Tier selection — only visible when linked */}
                {isLinked && (
                    <>
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
                                    Current: <strong>{currentTier.name}</strong> — ${currentTier.markup_amount} markup per unit
                                </p>
                            )}
                        </div>

                    </>
                )}

                {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
