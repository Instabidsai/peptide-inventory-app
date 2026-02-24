import { describe, it, expect } from 'vitest';
import { getTrackingUrl } from '../tracking';

describe('getTrackingUrl', () => {
  it('generates USPS tracking URL', () => {
    const url = getTrackingUrl('USPS', '9400111111');
    expect(url).toContain('tools.usps.com');
    expect(url).toContain('9400111111');
  });

  it('generates UPS tracking URL', () => {
    const url = getTrackingUrl('UPS', '1Z999AA10');
    expect(url).toContain('ups.com/track');
    expect(url).toContain('1Z999AA10');
  });

  it('generates FedEx tracking URL', () => {
    const url = getTrackingUrl('FedEx', '794644790132');
    expect(url).toContain('fedex.com');
    expect(url).toContain('794644790132');
  });

  it('generates DHL tracking URL', () => {
    const url = getTrackingUrl('DHL', '1234567890');
    expect(url).toContain('dhl.com');
    expect(url).toContain('1234567890');
  });

  it('falls back to parcelsapp for unknown carrier', () => {
    const url = getTrackingUrl('UnknownCarrier', 'TRACK123');
    expect(url).toContain('parcelsapp.com');
    expect(url).toContain('TRACK123');
  });

  it('handles null carrier', () => {
    const url = getTrackingUrl(null, 'TRACK123');
    expect(url).toContain('parcelsapp.com');
  });

  it('handles undefined carrier', () => {
    const url = getTrackingUrl(undefined, 'TRACK123');
    expect(url).toContain('parcelsapp.com');
  });

  it('is case insensitive for carrier name', () => {
    expect(getTrackingUrl('usps', 'X')).toContain('usps.com');
    expect(getTrackingUrl('Ups', 'X')).toContain('ups.com');
    expect(getTrackingUrl('fedex', 'X')).toContain('fedex.com');
  });
});
