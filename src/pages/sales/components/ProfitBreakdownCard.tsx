import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TrendingUp } from 'lucide-react';

interface ProfitBreakdownCardProps {
    order: {
        total_amount?: number;
        cogs_amount?: number;
        shipping_cost?: number;
        commission_amount?: number;
        merchant_fee?: number;
        profit_amount?: number;
    };
}

export function ProfitBreakdownCard({ order }: ProfitBreakdownCardProps) {
    const totalAmount = order.total_amount || 0;
    const cogsAmount = order.cogs_amount || 0;
    const shippingCost = order.shipping_cost || 0;
    const commissionAmount = order.commission_amount || 0;
    const merchantFee = order.merchant_fee || 0;
    const profitAmount = order.profit_amount || 0;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Profit Breakdown
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span>Revenue</span>
                    <span className="font-medium">${totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                    <span>COGS</span>
                    <span>-${cogsAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                    <span>Shipping</span>
                    <span>-${shippingCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                    <span>Commission</span>
                    <span>-${commissionAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                    <span>Merchant Fee{merchantFee > 0 && totalAmount > 0 ? ` (${(merchantFee / totalAmount * 100).toFixed(0)}%)` : ''}</span>
                    <span>-${merchantFee.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                    <span>Net Profit</span>
                    <span className={profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                        ${profitAmount.toFixed(2)}
                    </span>
                </div>
                <div className="text-xs text-muted-foreground">
                    Margin: {totalAmount > 0
                        ? (profitAmount / totalAmount * 100).toFixed(1)
                        : '0.0'}%
                </div>
            </CardContent>
        </Card>
    );
}
