import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Settings, ExternalLink, AlertCircle } from 'lucide-react';
import { useUpdatePool, type PaymentPool } from '@/hooks/use-payment-pool';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { MERCHANT_POOL_ABI, parseUSDC } from '@/lib/wagmi-config';
import { useToast } from '@/hooks/use-toast';
import { type Address } from 'viem';

interface PoolSettingsProps {
  pool: PaymentPool;
}

const CHAIN_LABELS: Record<string, string> = {
  base: 'Base',
  polygon: 'Polygon',
};

const PROCESSOR_LABELS: Record<string, string> = {
  nmi: 'NMI',
  authorize_net: 'Authorize.net',
};

function explorerAddressUrl(chain: string | null, address: string): string {
  if (chain === 'polygon') return `https://polygonscan.com/address/${address}`;
  return `https://basescan.org/address/${address}`;
}

export function PoolSettings({ pool }: PoolSettingsProps) {
  const { toast } = useToast();
  const updatePool = useUpdatePool();
  const { writeContract, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [syncingContract, setSyncingContract] = useState(false);

  const [dailyLimit, setDailyLimit] = useState(String(pool.daily_limit));
  const [maxPerTx, setMaxPerTx] = useState(String(pool.max_per_tx));

  const handleSaveLimits = () => {
    const daily = parseFloat(dailyLimit);
    const perTx = parseFloat(maxPerTx);

    if (isNaN(daily) || daily <= 0) {
      toast({ variant: 'destructive', title: 'Invalid daily limit', description: 'Enter a positive number.' });
      return;
    }
    if (isNaN(perTx) || perTx <= 0) {
      toast({ variant: 'destructive', title: 'Invalid max per transaction', description: 'Enter a positive number.' });
      return;
    }
    if (perTx > daily) {
      toast({ variant: 'destructive', title: 'Invalid limits', description: 'Max per transaction cannot exceed daily limit.' });
      return;
    }

    // Save to database first
    updatePool.mutate(
      { id: pool.id, daily_limit: daily, max_per_tx: perTx },
      {
        onSuccess: () => {
          // Then sync to smart contract if deployed
          if (pool.contract_address) {
            setSyncingContract(true);
            try {
              writeContract({
                address: pool.contract_address as Address,
                abi: MERCHANT_POOL_ABI,
                functionName: 'setLimits',
                args: [parseUSDC(perTx), parseUSDC(daily)],
              }, {
                onSuccess: () => {
                  setSyncingContract(false);
                  toast({ title: 'Limits updated', description: 'Database and smart contract limits synced.' });
                },
                onError: (err) => {
                  setSyncingContract(false);
                  toast({ title: 'DB updated, contract sync failed', description: `Connect your wallet as contract owner to sync: ${err.message}`, variant: 'destructive' });
                },
              });
            } catch {
              setSyncingContract(false);
              toast({ title: 'Limits saved to database', description: 'Connect your wallet to sync limits to the smart contract.' });
            }
          } else {
            toast({ title: 'Limits updated', description: 'Saved to database.' });
          }
        },
      },
    );
  };

  const isSaving = updatePool.isPending || isTxPending || isConfirming || syncingContract;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Pool Settings
        </CardTitle>
        <CardDescription>
          Configure transaction limits and view pool details. Limits are synced to both the database and smart contract.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Transaction limits */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Transaction Limits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="daily-limit">Daily limit ($)</Label>
              <Input
                id="daily-limit"
                type="number"
                min="0"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-per-tx">Max per transaction ($)</Label>
              <Input
                id="max-per-tx"
                type="number"
                min="0"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleSaveLimits} disabled={isSaving} size="sm">
            {isSaving ? 'Saving...' : 'Update Limits'}
          </Button>
          {pool.contract_address && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Requires wallet connection as contract owner to sync on-chain limits.
            </p>
          )}
        </div>

        {/* Read-only pool info */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Pool Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Card Processor</Label>
              <p className="text-sm font-medium">
                {pool.card_processor ? PROCESSOR_LABELS[pool.card_processor] ?? pool.card_processor : '—'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Processor Public Key</Label>
              <p className="text-sm font-mono truncate">
                {pool.processor_public_key ? pool.processor_public_key.slice(0, 12) + '••••••••' : '—'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Processor API Key</Label>
              <p className="text-sm font-mono">
                {pool.processor_api_key_encrypted ? '••••••••••••••••' : '—'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Chain</Label>
              <div>
                {pool.chain ? (
                  <Badge variant="outline">{CHAIN_LABELS[pool.chain] ?? pool.chain}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not set</span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Contract Address</Label>
              {pool.contract_address ? (
                <a
                  href={explorerAddressUrl(pool.chain, pool.contract_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-mono"
                >
                  {pool.contract_address.slice(0, 10)}...{pool.contract_address.slice(-6)}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">Not deployed</span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Operator Address</Label>
              <p className="text-sm font-mono truncate">
                {pool.operator_address ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
