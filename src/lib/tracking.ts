/**
 * Generate a carrier-specific tracking URL for a given tracking number.
 * Falls back to a universal tracking aggregator if the carrier isn't recognized.
 */
export function getTrackingUrl(carrier: string | null | undefined, trackingNumber: string): string {
  const c = (carrier || '').toUpperCase();
  if (c.includes('USPS')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  if (c.includes('UPS')) return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  if (c.includes('FEDEX') || c.includes('FEDE')) return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  if (c.includes('DHL')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${trackingNumber}`;
  return `https://parcelsapp.com/en/tracking/${trackingNumber}`;
}
