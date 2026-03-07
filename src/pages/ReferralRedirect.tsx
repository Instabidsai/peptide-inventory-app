import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/sb_client/client';
import { Loader2 } from 'lucide-react';

/**
 * Handles short referral URLs: /r/:slug and /r/:slug?p
 * Resolves the slug to a profile_id + org_id via RPC,
 * then redirects to /join with proper query params.
 * ?p flag means partner referral (role=partner&tier=standard).
 */
export default function ReferralRedirect() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [redirect, setRedirect] = useState<string | null>(null);

    const isPartner = searchParams.has('p');

    useEffect(() => {
        if (!slug) {
            setError('Invalid referral link.');
            return;
        }

        (async () => {
            const { data, error: rpcError } = await supabase.rpc('resolve_referral_slug', {
                p_slug: slug,
            });

            if (rpcError || !data || data.length === 0) {
                setError('This referral link is no longer valid.');
                return;
            }

            const { profile_id, org_id } = data[0];
            const params = new URLSearchParams();
            params.set('ref', profile_id);
            if (org_id) params.set('org', org_id);
            if (isPartner) {
                params.set('role', 'partner');
                params.set('tier', 'standard');
            }

            setRedirect(`/join?${params.toString()}`);
        })();
    }, [slug, isPartner]);

    if (redirect) {
        return <Navigate to={redirect} replace />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="max-w-md w-full text-center space-y-3">
                    <h2 className="text-xl font-semibold text-destructive">Invalid Link</h2>
                    <p className="text-sm text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}
