/**
 * Input validation helpers for Supabase Edge Functions.
 * Prevents injection, enforces limits, sanitizes user input.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a UUID string.
 */
export function isValidUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validate an email address (basic format check).
 */
export function isValidEmail(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 320 && EMAIL_REGEX.test(value);
}

/**
 * Validate an org/company name: non-empty, max 200 chars, no control characters.
 */
export function isValidOrgName(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    // eslint-disable-next-line no-control-regex
    return trimmed.length >= 1 && trimmed.length <= 200 && !/[\x00-\x1f]/.test(trimmed);
}

/**
 * Strip HTML tags to prevent XSS in stored content.
 * For display purposes only — not a substitute for CSP headers.
 */
export function sanitizeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Clamp a number to a range.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Validate and sanitize a string field: trim, enforce max length, strip control chars.
 * Returns the sanitized string or null if invalid.
 */
export function sanitizeString(value: unknown, maxLength = 500): string | null {
    if (typeof value !== 'string') return null;
    // eslint-disable-next-line no-control-regex
    const cleaned = value.trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    if (cleaned.length === 0 || cleaned.length > maxLength) return null;
    return cleaned;
}
