import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomEntity {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  icon: string;
  schema: Record<string, any>;
  active: boolean;
  created_at: string;
}

export interface CustomEntityRecord {
  id: string;
  org_id: string;
  entity_id: string;
  data: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomEntities() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-entities', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) throw new Error('No org');
      const { data, error } = await supabase
        .from('custom_entities')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as CustomEntity[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCustomEntityRecords(entityId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-entity-records', profile?.org_id, entityId],
    queryFn: async () => {
      if (!profile?.org_id || !entityId) return [];
      const { data, error } = await supabase
        .from('custom_entity_records')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CustomEntityRecord[];
    },
    enabled: !!profile?.org_id && !!entityId,
  });
}

export function useCreateEntityRecord(entityId: string) {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, any>) => {
      if (!profile?.org_id) throw new Error('No org');
      const { error } = await supabase
        .from('custom_entity_records')
        .insert({
          org_id: profile.org_id,
          entity_id: entityId,
          data,
          created_by: user?.id || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-entity-records', profile?.org_id, entityId] });
    },
  });
}

export function useDeleteEntityRecord(entityId: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from('custom_entity_records')
        .delete()
        .eq('id', recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-entity-records', profile?.org_id, entityId] });
    },
  });
}
