import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, CheckCircle2, Loader2 } from 'lucide-react';

interface ApplyCommissionBannerProps {
    availableAmount: number;
    totalOwed: number;
    isPending: boolean;
    onApply: () => void;
}

function ApplyCommissionBannerBase({ availableAmount, totalOwed, isPending, onApply }: ApplyCommissionBannerProps) {
    if (availableAmount <= 0 || totalOwed <= 0) return null;

    return (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 shadow-card">
            <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                    <ArrowRightLeft className="h-5 w-5 text-primary" />
                    <div>
                        <p className="text-sm font-medium">Apply ${availableAmount.toFixed(2)} in earned commissions to your ${totalOwed.toFixed(2)} balance?</p>
                        <p className="text-xs text-muted-foreground">Pays off oldest invoices first. Any surplus goes to store credit.</p>
                    </div>
                </div>
                <Button
                    size="sm"
                    onClick={onApply}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Apply Now
                </Button>
            </CardContent>
        </Card>
    );
}

export const ApplyCommissionBanner = memo(ApplyCommissionBannerBase);
