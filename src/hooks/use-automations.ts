import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Automation {
  id: string;
  org_id: string;
  name: string;
  trigger_type: 'cron' | 'event' | 'threshold';
  trigger_config: Record<string, any>;
  condition_sql: string | null;
  action_type: 'notification' | 'email' | 'webhook' | 'update_field' | 'create_record';
  action_config: Record<string, any>;
  active: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

export function useAutomations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['automations', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) throw new Error('No org');
      const { data, error } = await supabase
        .from('custom_automations')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Automation[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useToggleAutomation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('custom_automations')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', profile?.org_id] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update automation', description: error.message });
    },
  });
}

export function useDeleteAutomation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_automations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', profile?.org_id] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete automation', description: error.message });
    },
  });
}
