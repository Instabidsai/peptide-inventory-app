import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
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
    const { toast } = useToast();

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
            return payload;
        },
        onSuccess: (payload) => {
            queryClient.invalidateQueries({ queryKey: ['vendor-messages'] });

            // Also send email copy to admin@thepeptideai.com (fire-and-forget)
            invokeEdgeFunction('send-email', {
                to: 'admin@thepeptideai.com',
                subject: `[Vendor] ${payload.subject}`,
                html: `<div style="font-family:sans-serif;max-width:600px">
                    <h2 style="color:#7c3aed">${payload.subject}</h2>
                    <p style="white-space:pre-wrap">${payload.body}</p>
                    <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
                    <p style="color:#888;font-size:12px">Type: ${payload.message_type} | To org: ${payload.to_org_id || 'all'}</p>
                </div>`,
                from_name: 'ThePeptideAI Platform',
            }).catch((err: unknown) => logger.error('Vendor message email failed:', err));
        },
        onError: (error: Error) => {
            logger.error('Failed to send vendor message:', error);
            toast({ title: 'Send Failed', description: error.message, variant: 'destructive' });
        },
    });
}
