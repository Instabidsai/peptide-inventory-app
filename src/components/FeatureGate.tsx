import { Navigate } from 'react-router-dom';
import { useOrgFeatures } from '@/hooks/use-org-features';

interface FeatureGateProps {
  flag: string;
  children: React.ReactNode;
  redirectTo?: string;
}

export function FeatureGate({ flag, children, redirectTo = '/dashboard' }: FeatureGateProps) {
  const { isEnabled, isLoaded } = useOrgFeatures();

  if (!isLoaded) return null;
  if (!isEnabled(flag)) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
