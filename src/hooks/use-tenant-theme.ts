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
 * Derive a lighter tint of an HSL string for gradient "from" endpoint.
 * Increases lightness by ~16% and slightly reduces saturation.
 */
function lighterHSL(hsl: string): string {
  const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!parts) return hsl;
  const h = parseInt(parts[1]);
  const s = Math.max(0, parseInt(parts[2]) - 10);
  const l = Math.min(85, parseInt(parts[3]) + 16);
  return `${h} ${s}% ${l}%`;
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
 * Injects the tenant's brand identity into CSS custom properties
 * so the entire Tailwind/shadcn theme updates dynamically.
 *
 * Sets: --primary, --primary-foreground, --sidebar-primary,
 *       --accent-secondary, --gradient-from, --gradient-to,
 *       --ring, --sidebar-ring, font-family, and favicon.
 *
 * Call this once in both AppLayout and ClientLayout.
 */
export function useTenantTheme() {
  const { primary_color, secondary_color, font_family, favicon_url, isLoaded } = useTenantConfig();

  useEffect(() => {
    if (!isLoaded) return;
    // Only inject if the tenant has set a custom color (not the default)
    if (!primary_color || primary_color === '#7c3aed') return;

    const primaryHSL = hexToHSL(primary_color);
    if (!primaryHSL) return;

    const root = document.documentElement;
    const propsSet: string[] = [];

    const set = (prop: string, value: string) => {
      root.style.setProperty(prop, value);
      propsSet.push(prop);
    };

    // Primary color → buttons, nav, badges, accents
    set('--primary', primaryHSL);
    set('--primary-foreground', contrastForeground(primary_color));
    set('--sidebar-primary', primaryHSL);
    set('--accent', primaryHSL);

    // Ring/focus colors match primary
    set('--ring', primaryHSL);
    set('--sidebar-ring', primaryHSL);

    // Gradient endpoints — uses secondary if available, otherwise auto-derives
    const gradientFrom = lighterHSL(primaryHSL);
    set('--gradient-from', gradientFrom);

    if (secondary_color) {
      const secondaryHSL = hexToHSL(secondary_color);
      if (secondaryHSL) {
        set('--accent-secondary', secondaryHSL);
        set('--accent-secondary-foreground', contrastForeground(secondary_color));
        set('--gradient-to', secondaryHSL);
      }
    } else {
      // Auto-derive: shift hue +60° for a complementary gradient endpoint
      const parts = primaryHSL.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
      if (parts) {
        const autoHue = (parseInt(parts[1]) + 60) % 360;
        const autoHSL = `${autoHue} ${parts[2]}% ${parts[3]}%`;
        set('--gradient-to', autoHSL);
      }
    }

    // Font family
    if (font_family) {
      const prev = document.body.style.fontFamily;
      document.body.style.fontFamily = `'${font_family}', ${prev || "'Inter', -apple-system, system-ui, sans-serif"}`;
      propsSet.push('__font');
    }

    // Favicon
    let prevFavicon: string | null = null;
    if (favicon_url) {
      const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']") || document.createElement('link');
      prevFavicon = link.getAttribute('href');
      link.rel = 'icon';
      link.href = favicon_url;
      if (!link.parentNode) document.head.appendChild(link);
      propsSet.push('__favicon');
    }

    return () => {
      // Clean up all CSS vars
      for (const prop of propsSet) {
        if (prop === '__font') {
          document.body.style.fontFamily = '';
        } else if (prop === '__favicon') {
          const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
          if (link && prevFavicon) link.href = prevFavicon;
        } else {
          root.style.removeProperty(prop);
        }
      }
    };
  }, [primary_color, secondary_color, font_family, favicon_url, isLoaded]);
}
