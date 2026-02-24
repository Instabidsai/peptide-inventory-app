import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSubdomain } from '../subdomain';

describe('getSubdomain', () => {
    const originalLocation = window.location;

    function setHostname(hostname: string) {
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, hostname },
            writable: true,
        });
    }

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
    });

    it('extracts a valid merchant subdomain', () => {
        setHostname('acmepeptides.thepeptideai.com');
        expect(getSubdomain()).toBe('acmepeptides');
    });

    it('extracts a subdomain with hyphens', () => {
        setHostname('my-store.thepeptideai.com');
        expect(getSubdomain()).toBe('my-store');
    });

    it('returns null for reserved subdomain www', () => {
        setHostname('www.thepeptideai.com');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for reserved subdomain app', () => {
        setHostname('app.thepeptideai.com');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for reserved subdomain api', () => {
        setHostname('api.thepeptideai.com');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for reserved subdomain admin', () => {
        setHostname('admin.thepeptideai.com');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for bare domain', () => {
        setHostname('thepeptideai.com');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for localhost', () => {
        setHostname('localhost');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for Vercel preview URLs', () => {
        setHostname('my-app-abc123.vercel.app');
        expect(getSubdomain()).toBeNull();
    });

    it('returns null for completely different domains', () => {
        setHostname('example.com');
        expect(getSubdomain()).toBeNull();
    });
});
