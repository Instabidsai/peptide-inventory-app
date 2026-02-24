import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Wallet } from 'lucide-react';
import { format } from 'date-fns';
import type { Commission } from '@/hooks/use-partner';
import type { CommissionStats } from './types';

interface BalanceSheetProps {
    open: boolean;
    onClose: () => void;
    creditBalance: number;
    stats: CommissionStats;
    commissions: Commission[] | undefined;
}

export function BalanceSheet({ open, onClose, creditBalance, stats, commissions }: BalanceSheetProps) {
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-green-500" />
                        Available Balance
                    </SheetTitle>
                    <SheetDescription>Your store credit balance and history</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                        <p className="text-sm text-muted-foreground">Current Balance</p>
                        <p className="text-4xl font-bold text-green-500">${creditBalance.toFixed(2)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Your store credit can be used for purchases in the Partner Store. Credit is earned from
                        commission conversions.
                    </p>
                    {stats.pending > 0 && (
                        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                            <p className="text-sm font-medium text-amber-500">
                                You have ${stats.pending.toFixed(2)} in pending commissions that can be converted to store credit.
                            </p>
                        </div>
                    )}
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Recent Activity</h4>
                        {commissions?.filter((c) => c.status === 'paid').length ? (
                            commissions.filter((c) => c.status === 'paid').slice(0, 10).map((c) => (
                                <div key={c.id} className="flex justify-between items-center p-2 rounded border border-border/50">
                                    <div>
                                        <p className="text-sm font-medium">Commission converted</p>
                                        <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), 'MMM d, yyyy')}</p>
                                    </div>
                                    <span className="text-sm font-medium text-green-500">+${Number(c.amount).toFixed(2)}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">No credit history yet.</p>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
