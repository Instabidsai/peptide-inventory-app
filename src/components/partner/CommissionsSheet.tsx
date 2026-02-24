import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, ArrowRightLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Commission } from '@/hooks/use-partner';
import type { CommissionStats } from './types';

interface CommissionsSheetProps {
    open: boolean;
    onClose: () => void;
    stats: CommissionStats;
    commissions: Commission[] | undefined;
    totalOwed: number;
    applyPending: boolean;
    convertPending: boolean;
    onApplyCommissions: () => void;
    onConvertToCredit: (commissionId: string) => void;
}

export function CommissionsSheet({
    open,
    onClose,
    stats,
    commissions,
    totalOwed,
    applyPending,
    convertPending,
    onApplyCommissions,
    onConvertToCredit,
}: CommissionsSheetProps) {
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-amber-500" />
                        Commissions
                    </SheetTitle>
                    <SheetDescription>Manage your earned commissions</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-2xl font-bold text-amber-500">${stats.pending.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                            <p className="text-xs text-muted-foreground">Paid Out</p>
                            <p className="text-2xl font-bold text-green-500">${stats.paid.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Apply to owed button */}
                    {stats.available > 0 && totalOwed > 0 && (
                        <Button
                            className="w-full"
                            onClick={onApplyCommissions}
                            disabled={applyPending}
                        >
                            {applyPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                            Apply ${stats.available.toFixed(2)} to Amount Owed (${totalOwed.toFixed(2)})
                        </Button>
                    )}

                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold">All Commissions</h4>
                        {commissions && commissions.length > 0 ? (
                            commissions.map((comm) => (
                                <div key={comm.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium truncate">
                                                Order #{comm.sale_id?.slice(0, 8) || 'N/A'}
                                            </p>
                                            <Badge variant="outline" className="capitalize text-xs shrink-0">
                                                {comm.type.replace(/_/g, ' ')}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{format(new Date(comm.created_at), 'MMM d, yyyy')}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                                        <span className={`text-sm font-bold ${
                                            comm.status === 'paid' ? 'text-muted-foreground' :
                                            comm.status === 'pending' ? 'text-amber-500' : 'text-green-500'
                                        }`}>
                                            ${Number(comm.amount).toFixed(2)}
                                        </span>
                                        <Badge variant={comm.status === 'paid' ? 'secondary' : comm.status === 'pending' ? 'outline' : 'default'} className="text-xs">
                                            {comm.status}
                                        </Badge>
                                        {comm.status === 'available' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-xs px-2"
                                                disabled={convertPending}
                                                onClick={() => onConvertToCredit(comm.id)}
                                                aria-label={`Convert commission ${comm.id} to store credit`}
                                            >
                                                {convertPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Convert'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">No commissions yet.</p>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
