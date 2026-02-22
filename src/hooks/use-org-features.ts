import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { FEATURE_REGISTRY, type FeatureDef } from '@/lib/feature-registry';

export interface ResolvedFeature extends FeatureDef {
  enabled: boolean;
}

export function useOrgFeatures() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: dbFeatures, isLoading } = useQuery({
    queryKey: ['org-features', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_features')
        .select('feature_key, enabled')
        .eq('org_id', profile!.org_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.org_id,
    staleTime: 60_000,
  });

  const features: ResolvedFeature[] = useMemo(() => {
    return FEATURE_REGISTRY.map((f) => {
      if (f.core) return { ...f, enabled: true };
      const override = dbFeatures?.find((d) => d.feature_key === f.key);
      return { ...f, enabled: override?.enabled ?? f.defaultEnabled };
    });
  }, [dbFeatures]);

  const isEnabled = useCallback(
    (key: string): boolean => {
      const f = features.find((feat) => feat.key === key);
      return f?.enabled ?? true;
    },
    [features],
  );

  const toggleFeature = useCallback(
    async (key: string, enabled: boolean) => {
      if (!profile?.org_id) return;

      // Optimistic update
      queryClient.setQueryData(
        ['org-features', profile.org_id],
        (old: { feature_key: string; enabled: boolean }[] | undefined) => {
          if (!old) return [{ feature_key: key, enabled }];
          const exists = old.find((f) => f.feature_key === key);
          if (exists) return old.map((f) => (f.feature_key === key ? { ...f, enabled } : f));
          return [...old, { feature_key: key, enabled }];
        },
      );

      const { error } = await supabase.from('org_features').upsert(
        {
          org_id: profile.org_id,
          feature_key: key,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,feature_key' },
      );

      if (error) {
        // Revert on failure
        queryClient.invalidateQueries({ queryKey: ['org-features', profile.org_id] });
        throw error;
      }
    },
    [profile?.org_id, queryClient],
  );

  return {
    features,
    isEnabled,
    toggleFeature,
    isLoaded: !isLoading && !!dbFeatures,
  };
}
