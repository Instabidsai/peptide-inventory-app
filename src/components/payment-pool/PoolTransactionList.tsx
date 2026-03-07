import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, List } from 'lucide-react';
import { format } from 'date-fns';
import { usePoolTransactions, type PoolTxStatus } from '@/hooks/use-pool-transactions';
import type { PaymentPool } from '@/hooks/use-payment-pool';

interface PoolTransactionListProps {
  pool: PaymentPool;
}

const STATUS_VARIANTS: Record<PoolTxStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  refunded: 'outline',
};

const STATUS_LABELS: Record<PoolTxStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  refunded: 'Refunded',
};

function explorerUrl(chain: string | null, txHash: string): string {
  if (chain === 'polygon') return `https://polygonscan.com/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

export function PoolTransactionList({ pool }: PoolTransactionListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: transactions, isLoading } = usePoolTransactions(pool.id);

  const filtered = statusFilter === 'all'
    ? (transactions ?? [])
    : (transactions ?? []).filter((t) => t.status === statusFilter);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <List className="h-4 w-4 text-muted-foreground" />
              Recent Transactions
            </CardTitle>
            <CardDescription>Last 50 pool transactions</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>TX Hash</TableHead>
                  <TableHead>Card Last 4</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">
                      {tx.order_id ? tx.order_id.slice(0, 8) + '...' : '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      ${tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[tx.status]}>
                        {STATUS_LABELS[tx.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.tx_hash ? (
                        <a
                          href={explorerUrl(pool.chain, tx.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-mono"
                        >
                          {tx.tx_hash.slice(0, 10)}...
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.card_last4 ? `••••${tx.card_last4}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tx.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
