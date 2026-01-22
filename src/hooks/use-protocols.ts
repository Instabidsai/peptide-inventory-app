import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useProtocols(contactId?: string) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['protocols', contactId],
        queryFn: async () => {
            let query = supabase
                .from('protocols')
                .select(`
                    *,
                    protocol_items (
                        *,
                        peptides (
                            name,
                            sku
                        ),
                        protocol_logs (
                            created_at,
                            status
                        )
                    ),
                    protocol_feedback (
                        *
                    )
                `)
                .order('created_at', { ascending: false });

            if (contactId) {
                query = query.eq('contact_id', contactId);
            } else {
                query = query.is('contact_id', null);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
    });

    const createProtocol = useMutation({
        mutationFn: async ({ name, description, contact_id, items }: { name: string; description?: string; contact_id?: string, items?: any[] }) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Not authenticated');

            // Fetch profile to get org_id reliably
            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('user_id', user.user.id)
                .single();

            if (!profile?.org_id) throw new Error('Organization ID not found');

            const { data: protocol, error } = await supabase
                .from('protocols')
                .insert({ name, description, contact_id, org_id: profile.org_id })
                .select()
                .single();

            if (error) throw error;

            if (items && items.length > 0) {
                const itemsToInsert = items.map(item => ({
                    ...item,
                    protocol_id: protocol.id,
                    // Fix for legacy schema requirement: if duration_days is present, ensure duration_weeks is also set (approx)
                    duration_weeks: item.duration_days ? Math.ceil(item.duration_days / 7) : (item.duration_weeks || 1)
                }));

                const { error: itemsError } = await supabase
                    .from('protocol_items')
                    .insert(itemsToInsert);

                if (itemsError) throw itemsError;
            }

            return protocol;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            toast({ title: 'Protocol created successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to create protocol', description: error.message });
        },
    });



    const updateProtocolItem = useMutation({
        mutationFn: async ({ id, ...updates }: { id: string } & any) => {
            const { error } = await supabase
                .from('protocol_items')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            toast({ title: 'Regimen updated' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Update failed', description: error.message });
        },
    });

    const logProtocolUsage = useMutation({
        mutationFn: async ({ itemId, status = 'taken', note }: { itemId: string, status?: string, note?: string }) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('protocol_logs')
                .insert({
                    protocol_item_id: itemId,
                    user_id: user.user.id,
                    status,
                    notes: note
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            toast({ title: 'Dose logged' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to log dose', description: error.message });
        }
    });


    const deleteProtocol = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('protocols')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            toast({ title: 'Protocol deleted successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete protocol', description: error.message });
        },
    });

    return {
        protocols: query.data,
        isLoading: query.isLoading,
        createProtocol,
        deleteProtocol,
        updateProtocolItem,
        logProtocolUsage
    };
}

export function useProtocolItems(protocolId: string) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['protocol-items', protocolId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('protocol_items')
                .select('*, peptides(name)')
                .eq('protocol_id', protocolId);

            if (error) throw error;
            return data;
        },
        enabled: !!protocolId
    });

    const addItem = useMutation({
        mutationFn: async (item: any) => {
            const { error } = await supabase
                .from('protocol_items')
                .insert([{ ...item, protocol_id: protocolId }]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['protocol-items', protocolId] });
            toast({ title: 'Item added' });
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'Failed to add item', description: err.message });
        }
    });

    return {
        items: query.data,
        isLoading: query.isLoading,
        addItem
    };
}
