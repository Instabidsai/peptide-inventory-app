import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePaymentPool, type PoolStatus } from '@/hooks/use-payment-pool';

const STATUS_VARIANTS: Record<PoolStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  setup: 'secondary',
  deployed: 'secondary',
  funded: 'outline',
  active: 'default',
  paused: 'destructive',
};

const STATUS_LABELS: Record<PoolStatus, string> = {
  setup: 'Setup',
  deployed: 'Deployed',
  funded: 'Funded',
  active: 'Active',
  paused: 'Paused',
};

export function PoolBalanceCard() {
  const { data: pool, isLoading } = usePaymentPool();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (!pool) return null;

  const ordersRemaining =
    pool.status === 'active' && pool.max_per_tx > 0
      ? Math.floor(pool.usdc_balance / pool.max_per_tx)
      : 0;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5" />
              USDC Payment Pool
            </p>
            <p className="text-2xl font-bold tabular-nums">
              ${pool.usdc_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[pool.status]}>
                {STATUS_LABELS[pool.status]}
              </Badge>
              {pool.status === 'active' && (
                <span className="text-xs text-muted-foreground">
                  {ordersRemaining} orders remaining today
                </span>
              )}
            </div>
          </div>
          <Link
            to="/admin/payment-pool"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            Manage
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
