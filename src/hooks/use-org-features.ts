import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { FEATURE_REGISTRY, SAAS_MODE_OVERRIDES, type FeatureDef } from '@/lib/feature-registry';

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
    // Resolve saas_mode first
    const saasRow = dbFeatures?.find((d) => d.feature_key === 'saas_mode');
    const saasEnabled = saasRow?.enabled ?? false;

    return FEATURE_REGISTRY.map((f) => {
      if (f.core) return { ...f, enabled: true };

      // If saas_mode is ON and this flag is in the override map, force it
      if (saasEnabled && f.key in SAAS_MODE_OVERRIDES) {
        return { ...f, enabled: SAAS_MODE_OVERRIDES[f.key] };
      }

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

      // Build the list of upserts — if toggling saas_mode, cascade to child flags
      const upserts: { org_id: string; feature_key: string; enabled: boolean; updated_at: string }[] = [];
      const now = new Date().toISOString();

      upserts.push({ org_id: profile.org_id, feature_key: key, enabled, updated_at: now });

      if (key === 'saas_mode') {
        for (const [childKey, childValue] of Object.entries(SAAS_MODE_OVERRIDES)) {
          upserts.push({
            org_id: profile.org_id,
            feature_key: childKey,
            enabled: enabled ? childValue : !childValue, // When saas_mode OFF, invert overrides
            updated_at: now,
          });
        }
      }

      // Optimistic update for all upserts
      queryClient.setQueryData(
        ['org-features', profile.org_id],
        (old: { feature_key: string; enabled: boolean }[] | undefined) => {
          let result = old ? [...old] : [];
          for (const up of upserts) {
            const exists = result.find((f) => f.feature_key === up.feature_key);
            if (exists) {
              result = result.map((f) => (f.feature_key === up.feature_key ? { ...f, enabled: up.enabled } : f));
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
