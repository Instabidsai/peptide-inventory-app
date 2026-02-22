import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TenantConfig {
    brand_name: string;
    admin_brand_name: string;
    support_email: string;
    app_url: string;
    logo_url: string;
    primary_color: string;
    zelle_email: string;
    venmo_handle: string;
    cashapp_handle: string;
    session_timeout_minutes: number;
}

export interface TenantConfigResult extends TenantConfig {
    /** True once the config has been fetched (whether successfully or not) */
    isLoaded: boolean;
    /** True if the fetch failed — UI can show a subtle fallback indicator */
    isError: boolean;
}

const DEFAULTS: TenantConfig = {
    brand_name: 'Peptide AI',
    admin_brand_name: 'Peptide Admin',
    support_email: '',
    app_url: window.location.origin,
    logo_url: '',
    primary_color: '#7c3aed',
    zelle_email: '',
    venmo_handle: '',
    cashapp_handle: '',
    session_timeout_minutes: 60,
};

let cachedConfig: TenantConfig | null = null;
let cachedOrgId: string | null = null;

export function useTenantConfig(): TenantConfigResult {
    const { profile } = useAuth();
    const [config, setConfig] = useState<TenantConfig>(cachedConfig || DEFAULTS);
    const [isLoaded, setIsLoaded] = useState(!!cachedConfig);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        const orgId = profile?.org_id;
        if (!orgId) return;

        // Return cached if same org
        if (cachedConfig && cachedOrgId === orgId) {
            setConfig(cachedConfig);
            setIsLoaded(true);
            setIsError(false);
            return;
        }

        supabase
            .from('tenant_config')
            .select('brand_name, admin_brand_name, support_email, app_url, logo_url, primary_color, zelle_email, venmo_handle, cashapp_handle, session_timeout_minutes')
            .eq('org_id', orgId)
            .single()
            .then(({ data, error }) => {
                if (error) {
                    console.error('[useTenantConfig] Failed to load config:', error.message);
                    setIsError(true);
                    setIsLoaded(true);
                    return;
                }
                if (data) {
                    const merged = { ...DEFAULTS, ...data };
                    cachedConfig = merged;
                    cachedOrgId = orgId;
                    setConfig(merged);
                    setIsError(false);
                }
                setIsLoaded(true);
            });
    }, [profile?.org_id]);

    return { ...config, isLoaded, isError };
}
