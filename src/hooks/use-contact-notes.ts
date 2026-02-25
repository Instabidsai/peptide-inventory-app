import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactNote {
    id: string;
    contact_id: string;
    content: string;
    created_at: string;
    created_by: string | null;
    org_id: string;
}

export function useContactNotes(contactId?: string) {
    return useQuery({
        queryKey: ['contact_notes', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contact_notes')
                .select('*')
                .eq('contact_id', contactId as string)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as ContactNote[];
        },
        enabled: !!contactId,
    });
}

export function useCreateContactNote() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ contact_id, content }: { contact_id: string; content: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (!profile?.org_id) throw new Error('No organization found');

            const { data, error } = await supabase
                .from('contact_notes')
                .insert({
                    contact_id,
                    content,
                    created_by: user.id,
                    org_id: profile.org_id,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['contact_notes', variables.contact_id] });
            toast({ title: 'Note saved' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to save note', description: error.message });
        },
    });
}

export function useDeleteContactNote() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, contact_id }: { id: string; contact_id: string }) => {
            const { error } = await supabase
                .from('contact_notes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { contact_id };
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['contact_notes', variables.contact_id] });
            toast({ title: 'Note deleted' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete note', description: error.message });
        },
    });
}
