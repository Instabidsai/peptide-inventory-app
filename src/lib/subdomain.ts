/**
 * Extract the merchant subdomain from the current hostname.
 *
 * Matches: `merchant.<APP_DOMAIN>`
 * APP_DOMAIN defaults to `thepeptideai.com` but can be overridden via VITE_APP_DOMAIN.
 * Ignores: `www`, `app`, bare domain, localhost, Vercel previews
 */

const APP_DOMAIN = (import.meta.env.VITE_APP_DOMAIN || 'thepeptideai.com').replace(/\./g, '\\.');

const RESERVED_SUBS = new Set(['www', 'app', 'api', 'admin', 'mail', 'staging', 'smtp', 'ftp']);

export function getSubdomain(): string | null {
    const host = window.location.hostname;

    const re = new RegExp(`^([a-z0-9][a-z0-9-]*[a-z0-9])\\.${APP_DOMAIN}$`);
    const match = host.match(re);
    if (!match) return null;

    const sub = match[1];
    if (RESERVED_SUBS.has(sub)) return null;

    return sub;
}
