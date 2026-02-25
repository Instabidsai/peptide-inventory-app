import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

export function useVendorMessages() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['vendor-messages'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('vendor_messages')
                .select('*, org:organizations(name)')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}

export function useSendVendorMessage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async (payload: {
            to_org_id: string | null;
            subject: string;
            body: string;
            message_type: string;
        }) => {
            const { error } = await supabase
                .from('vendor_messages')
                .insert({
                    from_user_id: user?.id,
                    ...payload,
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendor-messages'] });
        },
        onError: (error: Error) => {
            logger.error('Failed to send vendor message:', error);
        },
    });
}
