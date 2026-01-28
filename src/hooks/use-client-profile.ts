import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export function useClientProfile() {
    const { user } = useAuth();

    const [searchParams] = useSearchParams();
    const previewRole = searchParams.get('preview_role');

    return useQuery({
        queryKey: ['client-profile', user?.id, previewRole],
        queryFn: async () => {
            if (!user) throw new Error('Not authenticated');

            // SPECIAL: Thompson Family Portal Override
            // Allows the Admin to view the 'Justin Thompson' profile when using the Family Portal link
            const isThompsonAdmin = user.email === 'thompsonfamv@gmail.com';
            const isPreviewing = previewRole === 'customer';

            let query = supabase.from('contacts').select('*');

            if (isThompsonAdmin && isPreviewing) {
                console.log("Using Thompson Family Portal Override -> Fetching justin@instabids.ai");
                // Fetch the specific family head profile
                query = query.eq('email', 'justin@instabids.ai');
            } else {
                // Standard behavior: Fetch linked profile
                query = query.eq('linked_user_id', user.id);
            }

            const { data, error } = await query.maybeSingle();

            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });
}
