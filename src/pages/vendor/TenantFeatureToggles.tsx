import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FEATURE_REGISTRY, CATEGORY_LABELS, CATEGORY_ORDER, SAAS_MODE_OVERRIDES, type FeatureCategory } from '@/lib/feature-registry';
import { useToast } from '@/hooks/use-toast';
import { Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TenantFeatureToggles({ orgId }: { orgId: string }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const saasChildKeys = new Set(Object.keys(SAAS_MODE_OVERRIDES));

    const { data: dbFeatures, isLoading } = useQuery({
        queryKey: ['tenant-features', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_features')
                .select('feature_key, enabled')
                .eq('org_id', orgId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!orgId,
    });

    const toggleFeature = async (key: string, enabled: boolean) => {
        // Build upserts — cascade child flags when toggling saas_mode
        const now = new Date().toISOString();
        const upserts: { org_id: string; feature_key: string; enabled: boolean; updated_at: string }[] = [
            { org_id: orgId, feature_key: key, enabled, updated_at: now },
        ];

        if (key === 'saas_mode') {
            for (const [childKey, childValue] of Object.entries(SAAS_MODE_OVERRIDES)) {
                upserts.push({
                    org_id: orgId,
                    feature_key: childKey,
                    enabled: enabled ? childValue : !childValue,
                    updated_at: now,
                });
            }
        }

        // Optimistic update
        queryClient.setQueryData(
            ['tenant-features', orgId],
            (old: { feature_key: string; enabled: boolean }[] | undefined) => {
                let result = old ? [...old] : [];
                for (const up of upserts) {
                    const exists = result.find(f => f.feature_key === up.feature_key);
                    if (exists) {
                        result = result.map(f => f.feature_key === up.feature_key ? { ...f, enabled: up.enabled } : f);
                    } else {
                        result.push({ feature_key: up.feature_key, enabled: up.enabled });
                    }
                }
                return result;
            },
        );

        const { error } = await supabase.from('org_features').upsert(
            upserts,
            { onConflict: 'org_id,feature_key' },
        );

        if (error) {
            queryClient.invalidateQueries({ queryKey: ['tenant-features', orgId] });
            toast({ variant: 'destructive', title: 'Failed to toggle feature', description: error.message });
        }
    };

    const getEnabled = (key: string, core?: boolean): boolean => {
        if (core) return true;
        const saasRow = dbFeatures?.find(f => f.feature_key === 'saas_mode');
        const saasModeOn = saasRow?.enabled ?? false;
        if (saasModeOn && key in SAAS_MODE_OVERRIDES) {
            return SAAS_MODE_OVERRIDES[key];
        }
        const override = dbFeatures?.find(f => f.feature_key === key);
        return override?.enabled ?? true;
    };

    const saasModeOn = dbFeatures?.find(f => f.feature_key === 'saas_mode')?.enabled ?? false;

    // Group features by category, exclude saas_mode from loop
    const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
        acc[cat] = FEATURE_REGISTRY.filter(f => f.category === cat && f.key !== 'saas_mode');
        return acc;
    }, {} as Record<FeatureCategory, typeof FEATURE_REGISTRY>);

    if (isLoading) return <Skeleton className="h-48 w-full" />;

    const saasFeature = FEATURE_REGISTRY.find(f => f.key === 'saas_mode');

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Feature Flags</CardTitle>
                <CardDescription>Toggle features on/off for this tenant</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-5">
                    {/* SaaS-Safe Mode master switch */}
                    {saasFeature && (
                        <div className={cn(
                            'p-3 rounded-lg border-2 transition-colors',
                            saasModeOn ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-border',
                        )}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-4">
                                    <ShieldCheck className={cn('h-4 w-4 shrink-0', saasModeOn ? 'text-amber-400' : 'text-muted-foreground')} />
                                    <div>
                                        <span className="text-sm font-semibold">{saasFeature.label}</span>
                                        <p className="text-xs text-muted-foreground">{saasFeature.description}</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={saasModeOn}
                                    onCheckedChange={(v) => toggleFeature('saas_mode', v)}
                                />
                            </div>
                        </div>
                    )}

                    {CATEGORY_ORDER.map(cat => {
                        const features = grouped[cat];
                        if (!features?.length) return null;
                        return (
                            <div key={cat}>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    {CATEGORY_LABELS[cat]}
                                </p>
                                <div className="space-y-2">
                                    {features.map(f => {
                                        const enabled = getEnabled(f.key, f.core);
                                        const lockedBySaas = saasModeOn && saasChildKeys.has(f.key);
                                        return (
                                            <div key={f.key} className={cn(
                                                'flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50',
                                                lockedBySaas && 'opacity-60',
                                            )}>
                                                <div className="flex-1 min-w-0 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">{f.label}</span>
                                                        {f.core && <Badge variant="secondary" className="text-[9px] px-1.5">Core</Badge>}
                                                        {lockedBySaas && (
                                                            <Badge variant="secondary" className="text-[9px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                                                                <Lock className="h-2.5 w-2.5 mr-0.5" />
                                                                SaaS
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                                                </div>
                                                <Switch
                                                    checked={enabled}
                                                    disabled={f.core || lockedBySaas}
                                                    onCheckedChange={(v) => toggleFeature(f.key, v)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
