import { describe, it, expect } from 'vitest';
import { getTrackingUrl } from './tracking';

describe('getTrackingUrl', () => {
  it('returns USPS URL for USPS carrier', () => {
    expect(getTrackingUrl('USPS', '123')).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=123');
  });

  it('matches USPS case-insensitively', () => {
    expect(getTrackingUrl('usps', 'ABC')).toContain('tools.usps.com');
  });

  it('returns UPS URL for UPS carrier', () => {
    expect(getTrackingUrl('UPS', '1Z999')).toBe('https://www.ups.com/track?tracknum=1Z999');
  });

  it('returns FedEx URL for FedEx carrier', () => {
    expect(getTrackingUrl('FedEx', '7890')).toBe('https://www.fedex.com/fedextrack/?trknbr=7890');
  });

  it('returns FedEx URL for FEDEX uppercase', () => {
    expect(getTrackingUrl('FEDEX', '7890')).toContain('fedex.com');
  });

  it('returns DHL URL for DHL carrier', () => {
    expect(getTrackingUrl('DHL', 'DHL123')).toBe('https://www.dhl.com/us-en/home/tracking.html?tracking-id=DHL123');
  });

  it('returns fallback URL for unknown carrier', () => {
    expect(getTrackingUrl('LaserShip', 'LS123')).toBe('https://parcelsapp.com/en/tracking/LS123');
  });

  it('handles null carrier', () => {
    expect(getTrackingUrl(null, 'X123')).toBe('https://parcelsapp.com/en/tracking/X123');
  });

  it('handles undefined carrier', () => {
    expect(getTrackingUrl(undefined, 'X123')).toBe('https://parcelsapp.com/en/tracking/X123');
  });

  it('handles empty string carrier', () => {
    expect(getTrackingUrl('', 'X123')).toBe('https://parcelsapp.com/en/tracking/X123');
  });
});
