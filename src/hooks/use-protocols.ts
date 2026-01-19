
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Protocol = {
    id: string;
    org_id: string;
    contact_id?: string;
    name: string;
    description?: string;
    items_count?: number; // Calculated view
    created_at: string;
};

export type ProtocolItem = {
    id: string;
    protocol_id: string;
    peptide_id: string;
    dosage_amount: number;
    dosage_unit: string;
    frequency: string;
    duration_weeks: number;
    price_tier: 'at_cost' | 'wholesale' | 'retail';
    peptides?: { name: string }; // Joined
};

export function useProtocols(contactId?: string) {
    const queryClient = useQueryClient();

    // Fetch Protocols
    const { data: protocols, isLoading } = useQuery({
        queryKey: ['protocols', contactId],
        queryFn: async () => {
            let query = supabase
                .from('protocols')
                .select('*, protocol_items(count)')
                .order('created_at', { ascending: false });

            if (contactId) {
                query = query.eq('contact_id', contactId);
            } else {
                // If no contactId, showing Global Templates (where contact_id is null)
                // OR show all? Let's assume Templates have contact_id = null
                query = query.is('contact_id', null);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Map response to include items_count
            return data.map((p: any) => ({
                ...p,
                items_count: p.protocol_items?.[0]?.count || 0
            })) as Protocol[];
        }
    });

    // Create Protocol
    const createProtocol = useMutation({
        mutationFn: async (newProtocol: { name: string; description?: string; contact_id?: string }) => {
            // Get Org ID First
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('user_id', user.id).single();
            if (!profile?.org_id) throw new Error('No org found');

            const { data, error } = await supabase
                .from('protocols')
                .insert({ ...newProtocol, org_id: profile.org_id })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
        },
    });

    return {
        protocols,
        isLoading,
        createProtocol
    };
}

export function useProtocolItems(protocolId?: string) {
    const queryClient = useQueryClient();

    const { data: items, isLoading } = useQuery({
        queryKey: ['protocol-items', protocolId],
        enabled: !!protocolId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('protocol_items')
                .select('*, peptides(name)')
                .eq('protocol_id', protocolId!);

            if (error) throw error;
            return data as ProtocolItem[];
        }
    });

    const addItem = useMutation({
        mutationFn: async (item: Omit<ProtocolItem, 'id' | 'created_at' | 'peptides'>) => {
            const { data, error } = await supabase
                .from('protocol_items')
                .insert(item)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocol-items', protocolId] });
            queryClient.invalidateQueries({ queryKey: ['protocols'] }); // Update counts
        }
    });

    return {
        items,
        isLoading,
        addItem
    };
}
