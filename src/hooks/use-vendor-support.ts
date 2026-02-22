import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAllPartnerSuggestions() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['vendor-partner-suggestions'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('partner_suggestions')
                .select('*, org:organizations(name)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}

export function useUpdateSuggestionStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, status, admin_notes }: { id: string; status: string; admin_notes?: string }) => {
            const updates: { status: string; admin_notes?: string } = { status };
            if (admin_notes !== undefined) updates.admin_notes = admin_notes;

            const { error } = await supabase
                .from('partner_suggestions')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendor-partner-suggestions'] });
        },
    });
}

export function useAllClientRequests() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['vendor-client-requests'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_requests')
                .select('*, org:organizations(name)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}

export function useAllProtocolFeedback() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['vendor-protocol-feedback'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('protocol_feedback')
                .select('*, protocol:protocols(name, org_id)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return data || [];
        },
        staleTime: 60_000,
    });
}
