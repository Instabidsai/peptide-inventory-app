import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export function useClientProfile() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['client-profile', user?.id],
        queryFn: async () => {
            if (!user) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('linked_user_id', user.id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },
        enabled: !!user,
        // For new users, contact may not exist yet (created async by linkReferral).
        // Poll every 2s while null so the UI auto-resolves without a page refresh.
        refetchInterval: (query) => (query.state.data === null ? 2000 : false),
    });
}
