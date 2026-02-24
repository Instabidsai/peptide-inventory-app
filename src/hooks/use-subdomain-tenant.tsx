import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { getSubdomain } from '@/lib/subdomain';

/** Convert hex color to HSL string (e.g. "160 84% 39%") for Tailwind CSS variables */
function hexToHsl(hex: string): string | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Apply all branding CSS variables, favicon, and document title */
function applyBranding(tenant: SubdomainTenant) {
    const root = document.documentElement;

    // Primary color → HSL for Tailwind --primary variable
    if (tenant.primary_color) {
        const hsl = hexToHsl(tenant.primary_color);
        if (hsl) root.style.setProperty('--primary', hsl);
    }

    // Secondary/accent color → --accent variable
    if (tenant.secondary_color) {
        const hsl = hexToHsl(tenant.secondary_color);
        if (hsl) root.style.setProperty('--accent', hsl);
    }

    // Font family
    if (tenant.font_family) {
        root.style.setProperty('--font-sans', `"${tenant.font_family}", ui-sans-serif, system-ui, sans-serif`);
        // Load the font from Google Fonts if not already present
        const fontId = `tenant-font-${tenant.font_family.replace(/\s+/g, '-').toLowerCase()}`;
        if (!document.getElementById(fontId)) {
            const link = document.createElement('link');
            link.id = fontId;
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(tenant.font_family)}:wght@400;500;600;700&display=swap`;
            document.head.appendChild(link);
        }
    }

    // Favicon
    if (tenant.favicon_url) {
        let faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!faviconEl) {
            faviconEl = document.createElement('link');
            faviconEl.rel = 'icon';
            document.head.appendChild(faviconEl);
        }
        faviconEl.href = tenant.favicon_url;
    }

    // Document title
    if (tenant.brand_name) {
        document.title = tenant.brand_name;
    }
}

export interface SubdomainTenant {
    org_id: string;
    brand_name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string | null;
    font_family: string | null;
    favicon_url: string | null;
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
            .select('org_id, brand_name, logo_url, primary_color, secondary_color, font_family, favicon_url, subdomain')
            .eq('subdomain', subdomain)
            .single()
            .then(({ data, error }) => {
                if (error || !data) {
                    console.warn(`[SubdomainTenant] No tenant found for subdomain: ${subdomain}`);
                } else {
                    setTenant(data as SubdomainTenant);
                    applyBranding(data as SubdomainTenant);
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
