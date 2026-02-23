/**
 * Extract the merchant subdomain from the current hostname.
 *
 * Matches: `merchant.thepeptideai.com`
 * Ignores: `www`, `app`, bare domain, localhost, Vercel previews
 */
export function getSubdomain(): string | null {
    const host = window.location.hostname;

    // Match: <sub>.thepeptideai.com
    const match = host.match(/^([a-z0-9][a-z0-9-]*[a-z0-9])\.thepeptideai\.com$/);
    if (!match) return null;

    const sub = match[1];
    // Reserved subdomains that aren't merchant stores
    if (['www', 'app', 'api', 'admin', 'mail', 'staging', 'smtp', 'ftp'].includes(sub)) return null;

    return sub;
}
