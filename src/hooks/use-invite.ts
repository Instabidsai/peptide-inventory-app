import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

interface InviteRepInput {
    email: string;
    fullName: string;
    parentRepId?: string;
}

export function useInviteRep() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ email, fullName, parentRepId }: InviteRepInput) => {
            const { data, error } = await supabase.rpc('invite_new_rep', {
                p_email: email,
                p_full_name: fullName || '',
                p_parent_rep_id: parentRepId || null,
                p_redirect_origin: window.location.origin,
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.message || 'Failed to invite user');

            return data as { success: boolean; new_user: boolean; contact_id: string; action_link: string; message: string };
        },
        onSuccess: (data) => {
            toast({
                title: 'Invitation Sent',
                description: `Invite link generated for ${data.new_user ? 'new' : 'existing'} user.`
            });
            if (data.action_link) {
                navigator.clipboard.writeText(data.action_link).then(() => {
                    toast({ title: "Link Copied", description: "Invite link copied to clipboard!" });
                }).catch(() => {
                    toast({ title: "Invite Link", description: data.action_link });
                });
            }
            queryClient.invalidateQueries({ queryKey: ['reps'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['pending_partners'] });
        },
        onError: (error: Error) => {
            toast({
                variant: 'destructive',
                title: 'Invite Failed',
                description: error.message
            });
        }
    });
}
