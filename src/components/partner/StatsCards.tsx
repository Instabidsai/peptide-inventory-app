import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Users,
    DollarSign,
    Wallet,
    Clock,
    AlertTriangle,
    ChevronRight,
} from 'lucide-react';
import type { SheetView, CommissionStats } from './types';

interface StatsCardsProps {
    stats: CommissionStats;
    creditBalance: number;
    totalOwed: number;
    unpaidCount: number;
    downlineCount: number;
    clientCount: number;
    onOpenSheet: (view: SheetView) => void;
}

function StatsCardsBase({
    stats,
    creditBalance,
    totalOwed,
    unpaidCount,
    downlineCount,
    clientCount,
    onOpenSheet,
}: StatsCardsProps) {
    return (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Card
                className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 cursor-pointer hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300"
                onClick={() => onOpenSheet('commissions')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-semibold">Available Commission</CardTitle>
                    <Wallet className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-500">${(stats.available + creditBalance).toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {creditBalance > 0 ? `$${creditBalance.toFixed(2)} credit + $${stats.available.toFixed(2)} earned` : 'Earned & ready'}
                        <ChevronRight className="h-3 w-3" />
                    </p>
                </CardContent>
            </Card>
            <Card
                className="border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 cursor-pointer hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300"
                onClick={() => onOpenSheet('commissions')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-semibold">Pending Commissions</CardTitle>
                    <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-amber-500">${stats.pending.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">Awaiting payment <ChevronRight className="h-3 w-3" /></p>
                </CardContent>
            </Card>
            <Card
                className={`cursor-pointer transition-all duration-300 ${(totalOwed) > 0 ? 'border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/10' : 'border-border/60 hover:bg-muted/30 hover:border-border/80'}`}
                onClick={() => onOpenSheet('owed')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-semibold">Amount Owed</CardTitle>
                    <AlertTriangle className={`h-4 w-4 ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        ${totalOwed.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {unpaidCount} unpaid <ChevronRight className="h-3 w-3" />
                    </p>
                </CardContent>
            </Card>
            <Card
                className="cursor-pointer hover:bg-muted/30 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                onClick={() => onOpenSheet('earnings')}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-semibold">Lifetime Earnings</CardTitle>
                    <DollarSign className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${stats.total.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">All time <ChevronRight className="h-3 w-3" /></p>
                </CardContent>
            </Card>
            <Card className="hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-semibold">My Network</CardTitle>
                    <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{downlineCount + clientCount}</div>
                    <p className="text-xs text-muted-foreground">
                        {downlineCount} partners · {clientCount} customers
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export const StatsCards = memo(StatsCardsBase);
