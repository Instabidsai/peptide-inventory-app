import { useEffect } from 'react';
import { useTenantConfig } from './use-tenant-config';

export function usePageTitle(title?: string) {
  const { brand_name } = useTenantConfig();
  useEffect(() => {
    document.title = title ? `${title} — ${brand_name}` : brand_name;
    return () => { document.title = brand_name; };
  }, [title, brand_name]);
}
