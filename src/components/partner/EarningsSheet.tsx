import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DollarSign } from 'lucide-react';
import type { Commission } from '@/hooks/use-partner';
import type { CommissionStats } from './types';

interface EarningsSheetProps {
    open: boolean;
    onClose: () => void;
    stats: CommissionStats;
    commissions: Commission[] | undefined;
}

export function EarningsSheet({ open, onClose, stats, commissions }: EarningsSheetProps) {
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        Lifetime Earnings
                    </SheetTitle>
                    <SheetDescription>Your complete commission earnings breakdown</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                        <p className="text-xs text-muted-foreground">Total Earned</p>
                        <p className="text-4xl font-bold text-primary">${stats.total.toFixed(2)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-lg font-bold text-amber-500">${stats.pending.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">Available</p>
                            <p className="text-lg font-bold text-green-500">${stats.available.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">Paid</p>
                            <p className="text-lg font-bold">${stats.paid.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Breakdown by Type</h4>
                        {commissions && commissions.length > 0 ? (() => {
                            const byType: Record<string, number> = {};
                            commissions.forEach((c) => {
                                const label = c.type.replace(/_/g, ' ');
                                byType[label] = (byType[label] || 0) + Number(c.amount);
                            });
                            return Object.entries(byType).map(([type, amount]) => (
                                <div key={type} className="flex justify-between p-2 rounded border border-border/50">
                                    <span className="text-sm capitalize">{type}</span>
                                    <span className="text-sm font-medium">${amount.toFixed(2)}</span>
                                </div>
                            ));
                        })() : (
                            <p className="text-sm text-muted-foreground">No earnings yet. Commissions are earned when your network makes sales.</p>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
