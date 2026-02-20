import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardWidget {
  id: string;
  org_id: string;
  title: string;
  widget_type: 'stat' | 'chart' | 'table' | 'list';
  config: Record<string, any>;
  position: number;
  size: 'sm' | 'md' | 'lg' | 'full';
  active: boolean;
  created_at: string;
}

export function useCustomDashboard() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['custom-dashboard', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) throw new Error('No org');
      const { data, error } = await supabase
        .from('custom_dashboard_widgets')
        .select('*')
        .eq('org_id', profile.org_id)
        .eq('active', true)
        .order('position');
      if (error) throw error;
      return (data || []) as DashboardWidget[];
    },
    enabled: !!profile?.org_id,
  });
}
