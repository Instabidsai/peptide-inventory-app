import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgFeatures } from '@/hooks/use-org-features';
import { usePaymentPool } from '@/hooks/use-payment-pool';
import { PoolSetupWizard } from '@/components/payment-pool/PoolSetupWizard';
import { PoolDashboard } from '@/components/payment-pool/PoolDashboard';
import { PoolWagmiWrapper } from '@/components/payment-pool/PoolWagmiWrapper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';

export default function PaymentPool() {
  usePageTitle('Payment Pool');
  const { profile } = useAuth();
  const { isEnabled, isLoading: featuresLoading } = useOrgFeatures();
  const { data: pool, isLoading: poolLoading } = usePaymentPool();

  if (featuresLoading || poolLoading) {
    return (
      <div className="space-y-6 p-1">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!isEnabled('payment_pool')) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-1">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <CardTitle>Payment Pool Not Enabled</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Enable the USDC Payment Pool feature in Settings → Features to get started.
          </CardContent>
        </Card>
      </div>
    );
  }

  const showDashboard = pool && ['active', 'paused', 'funded'].includes(pool.status);

  return (
    <PoolWagmiWrapper>
      <div className="space-y-6 p-1">
        <div>
          <h1 className="text-3xl font-bold">Payment Pool</h1>
          <p className="text-muted-foreground">
            Self-service USDC liquidity pool for instant credit card processing
          </p>
        </div>
        {showDashboard ? <PoolDashboard pool={pool} /> : <PoolSetupWizard pool={pool} />}
      </div>
    </PoolWagmiWrapper>
  );
}
