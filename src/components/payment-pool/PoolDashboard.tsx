import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Coins,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  Bell,
  Eye,
} from 'lucide-react';
import { useUpdatePool, type PaymentPool, type PoolStatus } from '@/hooks/use-payment-pool';
import { useToast } from '@/hooks/use-toast';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useQueryClient } from '@tanstack/react-query';
import { PoolTransactionList } from './PoolTransactionList';
import { PoolSettings } from './PoolSettings';
import { PoolCapacityCalculator } from './PoolCapacityCalculator';

interface PoolDashboardProps {
  pool: PaymentPool;
}

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

const CHAIN_LABELS: Record<string, string> = {
  base: 'Base',
  polygon: 'Polygon',
};

function explorerAddressUrl(chain: string | null, address: string): string {
  if (chain === 'polygon') return `https://polygonscan.com/address/${address}`;
  return `https://basescan.org/address/${address}`;
}

export function PoolDashboard({ pool }: PoolDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePool = useUpdatePool();
  const [isSyncing, setIsSyncing] = useState(false);

  const ordersRemaining =
    pool.max_per_tx > 0
      ? Math.floor(pool.usdc_balance / pool.max_per_tx)
      : 0;

  const dailyOrderCapacity =
    pool.max_per_tx > 0 && pool.daily_limit > 0
      ? Math.floor(pool.daily_limit / pool.max_per_tx)
      : 0;

  const handleRefreshBalance = async () => {
    setIsSyncing(true);
    const { data, error } = await invokeEdgeFunction('pool-sync-balance', { pool_id: pool.id });
    setIsSyncing(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Sync failed', description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['payment-pool', pool.org_id] });
    toast({ title: 'Balance refreshed', description: `Pool balance updated.` });
  };

  const handleTogglePause = () => {
    const newStatus: PoolStatus = pool.status === 'paused' ? 'active' : 'paused';
    updatePool.mutate(
      { id: pool.id, status: newStatus },
      {
        onSuccess: () => {
          toast({
            title: newStatus === 'paused' ? 'Pool paused' : 'Pool resumed',
            description: newStatus === 'paused'
              ? 'No new payments will be processed until unpaused.'
              : 'Pool is now accepting payments.',
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Paused banner */}
      {pool.status === 'paused' && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Your payment pool is paused. No new card payments will be processed.</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={handleTogglePause}
            disabled={updatePool.isPending}
          >
            <PlayCircle className="h-4 w-4 mr-1.5" />
            Resume
          </Button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                Pool Balance
              </p>
              <Badge variant={STATUS_VARIANTS[pool.status]}>
                {STATUS_LABELS[pool.status]}
              </Badge>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              ${pool.usdc_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">USDC</p>
          </CardContent>
        </Card>

        {/* Orders remaining */}
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">Orders Remaining Today</p>
            <p className="text-2xl font-bold tabular-nums">{ordersRemaining.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              of {dailyOrderCapacity.toLocaleString()} daily capacity
            </p>
          </CardContent>
        </Card>

        {/* Daily limit */}
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">Daily Limit</p>
            <p className="text-2xl font-bold tabular-nums">
              ${pool.daily_limit.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max ${pool.max_per_tx.toLocaleString()} per tx
            </p>
          </CardContent>
        </Card>

        {/* Chain + contract */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-muted-foreground">Network</p>
              {pool.chain && (
                <Badge variant="outline" className="text-xs">{CHAIN_LABELS[pool.chain] ?? pool.chain}</Badge>
              )}
            </div>
            {pool.contract_address ? (
              <a
                href={explorerAddressUrl(pool.chain, pool.contract_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline font-mono"
              >
                {pool.contract_address.slice(0, 8)}...{pool.contract_address.slice(-6)}
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No contract</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshBalance}
          disabled={isSyncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Refresh Balance'}
        </Button>
        <Button
          variant={pool.status === 'paused' ? 'default' : 'outline'}
          size="sm"
          onClick={handleTogglePause}
          disabled={updatePool.isPending || (pool.status !== 'active' && pool.status !== 'paused')}
        >
          {pool.status === 'paused' ? (
            <><PlayCircle className="h-4 w-4 mr-2" />Unpause Pool</>
          ) : (
            <><PauseCircle className="h-4 w-4 mr-2" />Pause Pool</>
          )}
        </Button>
      </div>

      {/* Verify & Independence */}
      {pool.contract_address && pool.chain && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            {/* Verify on BaseScan */}
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-semibold">Verify Your Pool On-Chain</p>
                <p className="text-xs text-muted-foreground">
                  Your funds live on the public blockchain. Verify your exact balance anytime — no trust required.
                </p>
                <a
                  href={explorerAddressUrl(pool.chain, pool.contract_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                >
                  View Pool on {pool.chain === 'polygon' ? 'PolygonScan' : 'BaseScan'}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="border-t" />

            {/* Email Alerts */}
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-semibold">Get Email Alerts When Money Moves</p>
                <p className="text-xs text-muted-foreground">
                  Set up free email notifications so you know instantly when USDC enters or leaves your pool:
                </p>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                  <li>
                    Create a free account at{' '}
                    <a
                      href={pool.chain === 'polygon' ? 'https://polygonscan.com/register' : 'https://basescan.org/register'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {pool.chain === 'polygon' ? 'PolygonScan.com' : 'BaseScan.org'}
                    </a>
                  </li>
                  <li>Go to your Watch List and click "Add Address"</li>
                  <li>
                    Paste your contract address: <code className="text-xs bg-muted px-1 rounded break-all">{pool.contract_address.slice(0, 10)}...{pool.contract_address.slice(-6)}</code>
                  </li>
                  <li>Enable "Email Notification" — you'll get an email every time USDC moves in or out</li>
                </ol>
              </div>
            </div>

            <div className="border-t" />

            {/* Independence guarantee */}
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-semibold">Your Funds Are Always Yours — With or Without Us</p>
                <p className="text-xs text-muted-foreground">
                  Even if you cancel your PeptideAI subscription, your pool and funds remain fully accessible.
                  Your wallet is the master key — not our app. To access your funds independently:
                </p>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                  <li>
                    Go to{' '}
                    <a
                      href={`${explorerAddressUrl(pool.chain, pool.contract_address)}#writeContract`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      your contract's "Write Contract" page
                    </a>
                  </li>
                  <li>Click "Connect to Web3" and connect your MetaMask or Coinbase Wallet</li>
                  <li>Find the <strong>withdraw</strong> function, enter the amount (in USDC units), and click "Write"</li>
                  <li>Approve the transaction in your wallet — the USDC goes directly to your wallet</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  You can also <strong>pause</strong>, <strong>unpause</strong>, and <strong>change limits</strong> directly on the blockchain.
                  We provide the dashboard for convenience, but you never depend on us.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions */}
      <PoolTransactionList pool={pool} />

      {/* Settings */}
      <PoolSettings pool={pool} />

      {/* Capacity calculator */}
      <PoolCapacityCalculator pool={pool} />
    </div>
  );
}
