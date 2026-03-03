import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

export interface Commission {
    id: string;
    amount: number;
    commission_rate: number;
    type: string;
    status: string;
    partner_id: string;
    created_at: string;
    profiles: { full_name: string | null };
}

export function useOrderCommissions(orderId?: string) {
    return useQuery({
        queryKey: ['order_commissions', orderId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('commissions')
                .select('id, amount, commission_rate, type, status, partner_id, created_at, profiles:partner_id(full_name)')
                .eq('sale_id', orderId!);
            if (error) throw error;
            return data as Commission[];
        },
        enabled: !!orderId,
        staleTime: 30_000,
        retry: 2,
    });
}
