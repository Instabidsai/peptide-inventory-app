import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { getSubdomain } from '@/lib/subdomain';

export interface SubdomainTenant {
    org_id: string;
    brand_name: string;
    logo_url: string;
    primary_color: string;
    subdomain: string;
}

interface SubdomainContextValue {
    /** The resolved tenant for the current subdomain, or null if no subdomain / not found */
    tenant: SubdomainTenant | null;
    /** True while we're still resolving the subdomain */
    isLoading: boolean;
    /** The raw subdomain string (or null if on the main domain) */
    subdomain: string | null;
}

const SubdomainContext = createContext<SubdomainContextValue>({
    tenant: null,
    isLoading: false,
    subdomain: null,
});

export function useSubdomainTenant() {
    return useContext(SubdomainContext);
}

export function SubdomainTenantProvider({ children }: { children: ReactNode }) {
    const subdomain = getSubdomain();
    const [tenant, setTenant] = useState<SubdomainTenant | null>(null);
    const [isLoading, setIsLoading] = useState(!!subdomain);

    useEffect(() => {
        if (!subdomain) {
            setIsLoading(false);
            return;
        }

        supabase
            .from('tenant_config')
            .select('org_id, brand_name, logo_url, primary_color, subdomain')
            .eq('subdomain', subdomain)
            .single()
            .then(({ data, error }) => {
                if (error || !data) {
                    console.warn(`[SubdomainTenant] No tenant found for subdomain: ${subdomain}`);
                } else {
                    setTenant(data as SubdomainTenant);

                    // Apply tenant branding to the page
                    if (data.primary_color) {
                        document.documentElement.style.setProperty('--primary', data.primary_color);
                    }
                    if (data.brand_name) {
                        document.title = data.brand_name;
                    }
                }
                setIsLoading(false);
            });
    }, [subdomain]);

    return (
        <SubdomainContext.Provider value={{ tenant, isLoading, subdomain }}>
            {children}
        </SubdomainContext.Provider>
    );
}
