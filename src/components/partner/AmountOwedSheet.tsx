import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { CommissionStats, OwedMovement } from './types';

interface AmountOwedSheetProps {
    open: boolean;
    onClose: () => void;
    totalOwed: number;
    unpaidMovements: OwedMovement[];
    allMovements: OwedMovement[] | undefined;
    stats: CommissionStats;
    applyPending: boolean;
    onApplyCommissions: () => void;
}

export function AmountOwedSheet({
    open,
    onClose,
    totalOwed,
    unpaidMovements,
    allMovements,
    stats,
    applyPending,
    onApplyCommissions,
}: AmountOwedSheetProps) {
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <AlertTriangle className={`h-5 w-5 ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                        Amount Owed
                    </SheetTitle>
                    <SheetDescription>Peptides received with outstanding balance</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                        <p className="text-xs text-muted-foreground">Total Outstanding</p>
                        <p className={`text-4xl font-bold ${totalOwed > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            ${totalOwed.toFixed(2)}
                        </p>
                    </div>

                    {stats.available > 0 && totalOwed > 0 && (
                        <Button
                            className="w-full"
                            onClick={onApplyCommissions}
                            disabled={applyPending}
                        >
                            {applyPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                            Apply ${stats.available.toFixed(2)} Commissions Here
                        </Button>
                    )}

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold">
                            {unpaidMovements.length > 0 ? 'Unpaid Orders' : 'All Paid Up!'}
                        </h4>
                        {unpaidMovements.map((m) => (
                            <div key={m.id} className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'MMM d, yyyy')}</p>
                                        <p className="text-sm">{m.itemCount} item{m.itemCount !== 1 ? 's' : ''} — ${m.subtotal.toFixed(2)}</p>
                                        {m.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.notes}</p>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-red-500">${m.owed.toFixed(2)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            of ${m.subtotal.toFixed(2)}
                                            {m.paid > 0 && ` (paid $${m.paid.toFixed(2)})`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Show paid movements too */}
                        {allMovements && allMovements.filter((m) => m.owed === 0).length > 0 && (
                            <>
                                <h4 className="text-sm font-semibold text-muted-foreground mt-4">Paid Orders</h4>
                                {allMovements.filter((m) => m.owed === 0).slice(0, 10).map((m) => (
                                    <div key={m.id} className="p-3 rounded-lg border border-border/50 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'MMM d, yyyy')}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {m.itemCount} item{m.itemCount !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1 text-green-500">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                <span className="text-sm font-medium">${m.subtotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
