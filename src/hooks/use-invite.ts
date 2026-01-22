import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface InviteRepInput {
    email: string;
    fullName: string; // We might want to update profile after invite?
}

export function useInviteRep() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ email, fullName }: InviteRepInput) => {
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

            // 2. If user created/linked, we might want to update their profile name immediately
            // The trigger creates a profile, but maybe with empty name.
            // We can try to update it if we have text.
            if (data.user_id && fullName) {
                await supabase
                    .from('profiles')
                    .update({ full_name: fullName })
                    .eq('user_id', data.user_id);
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
                console.log("Invite Link:", data.action_link);
                // Optionally copy to clipboard?
                navigator.clipboard.writeText(data.action_link);
                toast({ title: "Link Copied", description: "Invite link copied to clipboard!" });
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
