
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PartnerNode {
    id: string;
    full_name: string | null;
    email: string | null;
    partner_tier: string;
    commission_rate: number;
    total_sales: number;
    depth: number;
    path: string[];
    parent_rep_id: string | null;
    isClient?: boolean;
    contactType?: string;
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
        id: string;
        total_amount: number;
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

            // Look up profile ID from auth user ID
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (!profile?.id) return [];

            const { data, error } = await (supabase as any)
                .from('commissions')
                .select(`
                    *,
                    sales_orders (
                        id,
                        total_amount
                    )
                `)
                .eq('partner_id', profile.id)
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

// Admin hook: fetch ALL partners + their clients as a flat tree for the Network View
export function useFullNetwork() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['full_network', profile?.org_id],
        queryFn: async () => {
            // 1. Fetch all partner profiles scoped to org
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email, partner_tier, commission_rate, parent_rep_id')
                .eq('role', 'sales_rep')
                .eq('org_id', profile!.org_id!)
                .order('full_name');

            if (error) throw error;

            // 2. Fetch customer contacts assigned to reps (exclude partner-type contacts)
            const { data: contacts, error: contError } = await supabase
                .from('contacts')
                .select('id, name, email, type, assigned_rep_id')
                .not('assigned_rep_id', 'is', null)
                .eq('type', 'customer')
                .eq('org_id', profile!.org_id!)
                .order('name');

            if (contError) throw contError;

            // Convert flat profiles into PartnerNode format
            // Build depth by walking parent chains
            const profileMap = new Map(data.map(p => [p.id, p]));

            const getDepth = (id: string, visited = new Set<string>()): number => {
                if (visited.has(id)) return 0; // prevent cycles
                visited.add(id);
                const p = profileMap.get(id);
                if (!p?.parent_rep_id || !profileMap.has(p.parent_rep_id)) return 0;
                return 1 + getDepth(p.parent_rep_id, visited);
            };

            const getPath = (id: string, visited = new Set<string>()): string[] => {
                if (visited.has(id)) return [id]; // prevent cycles
                visited.add(id);
                const p = profileMap.get(id);
                if (!p?.parent_rep_id || !profileMap.has(p.parent_rep_id)) return [id];
                return [...getPath(p.parent_rep_id, visited), id];
            };

            const partnerNodes = data.map(p => ({
                id: p.id,
                full_name: p.full_name,
                email: p.email,
                partner_tier: p.partner_tier || 'standard',
                commission_rate: p.commission_rate || 0,
                total_sales: 0,
                depth: getDepth(p.id),
                path: getPath(p.id),
                parent_rep_id: p.parent_rep_id,
            })) as PartnerNode[];

            // Build client nodes as children of their assigned rep
            // Exclude contacts who are also partner profiles (by name match)
            const partnerNames = new Set(data.map(p => p.full_name?.toLowerCase()));
            const customerContacts = (contacts || []).filter(c => !partnerNames.has(c.name?.toLowerCase()));

            const partnerDepthMap = new Map(partnerNodes.map(p => [p.id, p.depth]));
            const partnerPathMap = new Map(partnerNodes.map(p => [p.id, p.path]));

            const clientNodes = customerContacts.map(c => {
                const parentDepth = partnerDepthMap.get(c.assigned_rep_id) ?? 0;
                const parentPath = partnerPathMap.get(c.assigned_rep_id) ?? [];
                return {
                    id: c.id,
                    full_name: c.name,
                    email: c.email,
                    partner_tier: 'client',
                    commission_rate: 0,
                    total_sales: 0,
                    depth: parentDepth + 1,
                    path: [...parentPath, c.id],
                    parent_rep_id: c.assigned_rep_id,
                    isClient: true,
                    contactType: c.type,
                };
            }) as PartnerNode[];

            return [...partnerNodes, ...clientNodes];
        },
        enabled: !!user && !!profile?.org_id,
    });
}

export interface DownlineClient {
    id: string;
    name: string;
    email: string | null;
    type: string;
    assigned_rep_id: string | null;
}

export function useDownlineClients(repIds: string[]) {
    return useQuery({
        queryKey: ['downline_clients', repIds],
        queryFn: async () => {
            if (repIds.length === 0) return [];
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type, assigned_rep_id')
                .in('assigned_rep_id', repIds)
                .eq('type', 'customer')
                .order('name');
            if (error) throw error;
            return (data || []) as DownlineClient[];
        },
        enabled: repIds.length > 0,
    });
}
