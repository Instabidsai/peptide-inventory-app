import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TenantConnection {
  id: string;
  org_id: string;
  service: string;
  status: 'pending' | 'connected' | 'disconnected';
  composio_connection_id: string | null;
  connected_at: string | null;
  metadata: Record<string, any>;
}

export function useTenantConnections() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['tenant-connections', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) throw new Error('No org');
      const { data, error } = await supabase
        .from('tenant_connections')
        .select('*')
        .eq('org_id', profile.org_id);
      if (error) throw error;
      return (data || []) as TenantConnection[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useConnectService() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (service: string) => {
      if (!profile?.org_id) throw new Error('No org');
      const { data, error } = await supabase.functions.invoke('composio-connect', {
        body: { service, org_id: profile.org_id },
      });
      if (error) throw error;
      return data as { redirect_url: string; connection_id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-connections', profile?.org_id] });
      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank', 'width=600,height=700');
      }
    },
  });
}
