import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface CustomField {
  id: string;
  org_id: string;
  entity: string;
  field_name: string;
  field_type: string;
  label: string;
  options: any;
  required: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  org_id: string;
  field_id: string;
  record_id: string;
  value: any;
}

export function useCustomFields(entity?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-fields', profile?.org_id, entity],
    queryFn: async () => {
      if (!profile?.org_id) throw new Error('No org');
      let query = supabase
        .from('custom_fields')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('active', true)
        .order('sort_order');

      if (entity) query = query.eq('entity', entity);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CustomField[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCustomFieldValues(entity: string, recordId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-field-values', profile?.org_id, entity, recordId],
    queryFn: async () => {
      if (!profile?.org_id || !recordId) return {};
      const { data: fields } = await supabase
        .from('custom_fields')
        .select('id, field_name')
        .eq('org_id', profile.org_id)
        .eq('entity', entity)
        .eq('active', true);

      if (!fields?.length) return {};

      const fieldIds = fields.map(f => f.id);
      const { data: values, error } = await supabase
        .from('custom_field_values')
        .select('field_id, value')
        .eq('org_id', profile.org_id)
        .eq('record_id', recordId)
        .in('field_id', fieldIds);

      if (error) throw error;

      const map: Record<string, any> = {};
      for (const v of values || []) {
        const field = fields.find(f => f.id === v.field_id);
        if (field) map[field.field_name] = v.value;
      }
      return map;
    },
    enabled: !!profile?.org_id && !!recordId,
  });
}

export function useSaveCustomFieldValue() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ fieldId, recordId, value }: { fieldId: string; recordId: string; value: any }) => {
      if (!profile?.org_id) throw new Error('No org');
      const { error } = await supabase
        .from('custom_field_values')
        .upsert({
          org_id: profile.org_id,
          field_id: fieldId,
          record_id: recordId,
          value,
        }, { onConflict: 'org_id,field_id,record_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-values'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to save field value', description: error.message });
    },
  });
}
