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

            // If the query errors (RLS, network, etc.) but we have a valid user,
            // return null instead of throwing — lets the dashboard show the
            // welcome/no-contact state instead of a hard error wall.
            // This also handles admin preview_role=customer gracefully.
            if (error) {
                console.warn('[useClientProfile] contacts query failed, treating as no contact:', error.message);
                return null;
            }
            return data;
        },
        enabled: !!user,
        // For new users, contact may not exist yet (created async by linkReferral).
        // Poll every 2s while null so the UI auto-resolves without a page refresh.
        refetchInterval: (query) => (query.state.data === null ? 2000 : false),
    });
}
