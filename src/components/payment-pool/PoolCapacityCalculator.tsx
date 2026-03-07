import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator } from 'lucide-react';
import type { PaymentPool } from '@/hooks/use-payment-pool';

interface PoolCapacityCalculatorProps {
  pool?: PaymentPool | null;
}

export function PoolCapacityCalculator({ pool }: PoolCapacityCalculatorProps) {
  const [avgOrderValue, setAvgOrderValue] = useState('250');
  const [ordersPerDay, setOrdersPerDay] = useState('10');
  const [settlementDays, setSettlementDays] = useState('5');

  const avg = parseFloat(avgOrderValue) || 0;
  const perDay = parseFloat(ordersPerDay) || 0;
  const days = parseFloat(settlementDays) || 5;

  const requiredPool = avg * perDay * days;
  const currentBalance = pool?.usdc_balance ?? 0;
  const ordersCurrentPoolCanHandle = avg > 0 && days > 0
    ? Math.floor(currentBalance / (avg * days))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          Pool Capacity Calculator
        </CardTitle>
        <CardDescription>
          Estimate how much USDC you need to handle your order volume.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="calc-avg-order">Average order value ($)</Label>
            <Input
              id="calc-avg-order"
              type="number"
              min="0"
              value={avgOrderValue}
              onChange={(e) => setAvgOrderValue(e.target.value)}
              placeholder="250"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-orders-day">Orders per day</Label>
            <Input
              id="calc-orders-day"
              type="number"
              min="0"
              value={ordersPerDay}
              onChange={(e) => setOrdersPerDay(e.target.value)}
              placeholder="10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-settlement">Settlement days</Label>
            <Input
              id="calc-settlement"
              type="number"
              min="1"
              max="30"
              value={settlementDays}
              onChange={(e) => setSettlementDays(e.target.value)}
              placeholder="5"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Required pool size</span>
            <span className="font-semibold text-lg">
              ${requiredPool.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </span>
          </div>
          {pool && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current pool can handle</span>
              <span className="font-medium">
                {ordersCurrentPoolCanHandle.toLocaleString()} orders/day
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            Formula: orders/day × avg order value × settlement days
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
