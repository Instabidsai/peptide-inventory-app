import { useEffect } from 'react';
import { useTenantConfig } from './use-tenant-config';

/**
 * Convert a hex color (#rrggbb or #rgb) to HSL string "H S% L%"
 * matching the format used by Tailwind/shadcn CSS variables.
 */
function hexToHSL(hex: string): string | null {
  // Strip # and expand shorthand
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;

  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(hue * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Compute a readable foreground color (white or dark) for a given hex background.
 */
function contrastForeground(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // W3C relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  // White text on dark bg, dark text on light bg
  return luminance > 0.5 ? '222.2 47.4% 11.2%' : '210 40% 98%';
}

/**
 * Injects the tenant's primary_color into CSS custom properties
 * so the entire Tailwind/shadcn theme updates dynamically.
 * Call this once in AppLayout — it reacts to tenant config changes.
 */
export function useTenantTheme() {
  const { primary_color, isLoaded } = useTenantConfig();

  useEffect(() => {
    if (!isLoaded) return;
    // Only inject if the tenant has set a custom color (not the default)
    if (!primary_color || primary_color === '#7c3aed') return;

    const hsl = hexToHSL(primary_color);
    if (!hsl) return;

    const root = document.documentElement;
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--primary-foreground', contrastForeground(primary_color));

    // Also update sidebar accent to match
    root.style.setProperty('--sidebar-primary', hsl);

    return () => {
      // Reset on unmount (shouldn't happen, but just in case)
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--sidebar-primary');
    };
  }, [primary_color, isLoaded]);
}
