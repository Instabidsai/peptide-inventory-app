
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PartnerNode {
    id: string;
    full_name: string | null;
    email: string | null;
    partner_tier: string;
    total_sales: number;
    depth: number;
    path: string[];
}

export interface Commission {
    id: string;
    sale_id: string;
    partner_id: string;
    amount: number;
    commission_rate: number;
    type: 'direct' | 'second_tier_override' | 'third_tier_override';
    status: 'pending' | 'available' | 'paid' | 'void';
    created_at: string;
    sales_orders?: {
        order_number: string;
        order_number: string;
    }
}

export function usePartnerDownline(rootId?: string) {
    const { user } = useAuth();
    // Use the passed rootId or fall back to the authenticated user's ID
    const effectiveRootId = rootId || user?.id;

    return useQuery({
        queryKey: ['partner_downline', effectiveRootId],
        queryFn: async () => {
            if (!effectiveRootId) return [];

            const { data, error } = await supabase
                .rpc('get_partner_downline', { root_id: effectiveRootId });

            if (error) throw error;
            return data as PartnerNode[];
        },
        enabled: !!effectiveRootId
    });
}

export function useCommissions() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['commissions', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];

            // We want to join with sales_orders to get context about the sale
            const { data, error } = await supabase
                .from('commissions')
                .select(`
                    *,
                    sales_orders (
                        id,
                        order_number,
                        total_amount
                    )
                `)
                .eq('partner_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!user?.id
    });
}

export function useCommissionStats() {
    const { data: commissions } = useCommissions();

    if (!commissions) return {
        pending: 0,
        available: 0,
        paid: 0,
        total: 0
    };

    return commissions.reduce((acc, curr) => {
        const amount = Number(curr.amount);
        acc.total += amount;

        switch (curr.status) {
            case 'pending': acc.pending += amount; break;
            case 'available': acc.available += amount; break;
            case 'paid': acc.paid += amount; break;
        }
        return acc;
    }, { pending: 0, available: 0, paid: 0, total: 0 });
}

export function usePayCommission() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (commissionId: string) => {
            const { error } = await supabase
                .from('commissions')
                .update({ status: 'paid' })
                .eq('id', commissionId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['partner_detail'] }); // Refresh stats
        }
    });
}

export function useConvertCommission() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (commissionId: string) => {
            const { error } = await supabase
                .rpc('convert_commission_to_credit', { commission_id: commissionId });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['partner_detail'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        }
    });
}
