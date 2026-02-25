import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FEATURE_REGISTRY, CATEGORY_LABELS, CATEGORY_ORDER, type FeatureCategory } from '@/lib/feature-registry';
import { useToast } from '@/hooks/use-toast';

export default function TenantFeatureToggles({ orgId }: { orgId: string }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

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
        // Optimistic update
        queryClient.setQueryData(
            ['tenant-features', orgId],
            (old: { feature_key: string; enabled: boolean }[] | undefined) => {
                if (!old) return [{ feature_key: key, enabled }];
                const exists = old.find(f => f.feature_key === key);
                if (exists) return old.map(f => f.feature_key === key ? { ...f, enabled } : f);
                return [...old, { feature_key: key, enabled }];
            },
        );

        const { error } = await supabase.from('org_features').upsert(
            { org_id: orgId, feature_key: key, enabled, updated_at: new Date().toISOString() },
            { onConflict: 'org_id,feature_key' },
        );

        if (error) {
            queryClient.invalidateQueries({ queryKey: ['tenant-features', orgId] });
            toast({ variant: 'destructive', title: 'Failed to toggle feature', description: error.message });
        }
    };

    const getEnabled = (key: string, core?: boolean): boolean => {
        if (core) return true;
        const override = dbFeatures?.find(f => f.feature_key === key);
        return override?.enabled ?? true;
    };

    // Group features by category
    const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
        acc[cat] = FEATURE_REGISTRY.filter(f => f.category === cat);
        return acc;
    }, {} as Record<FeatureCategory, typeof FEATURE_REGISTRY>);

    if (isLoading) return <Skeleton className="h-48 w-full" />;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Feature Flags</CardTitle>
                <CardDescription>Toggle features on/off for this tenant</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-5">
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
                                        return (
                                            <div key={f.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                                                <div className="flex-1 min-w-0 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">{f.label}</span>
                                                        {f.core && <Badge variant="secondary" className="text-[9px] px-1.5">Core</Badge>}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">{f.description}</p>
                                                </div>
                                                <Switch
                                                    checked={enabled}
                                                    disabled={f.core}
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
