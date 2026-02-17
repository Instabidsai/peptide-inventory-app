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
            // 1. Call Edge Function to create/invite user
            const { data, error } = await supabase.functions.invoke('invite-user', {
                body: {
                    email,
                    role: 'sales_rep',
                    redirect_origin: window.location.origin
                }
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error || 'Failed to invite user');

            // 2. Update profile with name and parent_rep_id
            if (data.user_id) {
                const updates: Record<string, unknown> = {};
                if (fullName) updates.full_name = fullName;
                if (parentRepId) updates.parent_rep_id = parentRepId;

                if (Object.keys(updates).length > 0) {
                    await supabase
                        .from('profiles')
                        .update(updates)
                        .eq('user_id', data.user_id);
                }
            }

            return data;
        },
        onSuccess: (data) => {
            toast({
                title: 'Invitation Sent',
                description: `Invite link generated for ${data.new_user ? 'new' : 'existing'} user.`
            });
            // In a real app, we'd email this. Here we might show it?
            // For now, let's assume the edge function logs it or we rely on the toast.
            // Actually, for "Add Rep", gaining the link is useful.
            if (data.action_link) {
                try {
                    await navigator.clipboard.writeText(data.action_link);
                    toast({ title: "Link Copied", description: "Invite link copied to clipboard!" });
                } catch {
                    // Clipboard API unavailable (non-HTTPS or denied permission)
                    toast({ title: "Invite Link", description: data.action_link });
                }
            }
            queryClient.invalidateQueries({ queryKey: ['reps'] });
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
