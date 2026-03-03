import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

/**
 * Self-healing client profile hook.
 *
 * 1. Queries contacts by linked_user_id (normal path).
 * 2. If null after ~8 seconds of polling, calls ensure_customer_contact RPC
 *    to auto-create or auto-link a contact (SECURITY DEFINER — bypasses RLS).
 * 3. Returns the contact once it exists.
 */
export function useClientProfile() {
    const { user, profile } = useAuth();
    const queryClient = useQueryClient();
    const healAttempted = useRef(false);
    const pollStartRef = useRef<number>(0);

    return useQuery({
        queryKey: ['client-profile', user?.id],
        queryFn: async () => {
            if (!user) throw new Error('Not authenticated');

            // Track when polling started
            if (!pollStartRef.current) {
                pollStartRef.current = Date.now();
            }

            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('linked_user_id', user.id)
                .maybeSingle();

            // If the query errors (RLS, network, etc.) but we have a valid user,
            // return null instead of throwing — lets the dashboard show the
            // welcome/no-contact state instead of a hard error wall.
            if (error) {
                console.warn('[useClientProfile] contacts query failed, treating as no contact:', error.message);
                // Fall through to self-healing below
            }

            if (data) {
                // Found contact — reset refs and return
                pollStartRef.current = 0;
                healAttempted.current = false;
                return data;
            }

            // No contact found — try self-healing after 8 seconds of polling
            const elapsed = Date.now() - pollStartRef.current;
            if (elapsed > 8000 && !healAttempted.current && profile?.org_id) {
                healAttempted.current = true;
                logger.warn('[useClientProfile] No contact after 8s — calling ensure_customer_contact RPC');

                try {
                    const { data: healResult, error: healError } = await supabase.rpc(
                        'ensure_customer_contact',
                        { p_user_id: user.id }
                    );

                    if (healError) {
                        logger.error('[useClientProfile] ensure_customer_contact failed:', healError.message);
                    } else if (healResult?.created || healResult?.linked) {
                        logger.info('[useClientProfile] Self-healed contact:', healResult);
                        // Re-query immediately to pick up the new contact
                        const { data: newContact } = await supabase
                            .from('contacts')
                            .select('*')
                            .eq('linked_user_id', user.id)
                            .maybeSingle();

                        if (newContact) {
                            pollStartRef.current = 0;
                            return newContact;
                        }
                    }
                } catch (e) {
                    logger.error('[useClientProfile] Self-heal exception:', e);
                }
            }

            return null;
        },
        enabled: !!user,
        // Poll every 2s while null so the UI auto-resolves without a page refresh.
        // After 20s of polling (10 attempts), slow down to every 5s.
        refetchInterval: (query) => {
            if (query.state.data !== null) return false;
            const elapsed = pollStartRef.current ? Date.now() - pollStartRef.current : 0;
            return elapsed > 20000 ? 5000 : 2000;
        },
    });
}
