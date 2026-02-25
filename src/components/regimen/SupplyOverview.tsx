import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    ShoppingBag,
    TrendingDown,
    CalendarClock,
    Lock,
    RefreshCw,
    Beaker,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupplyStatusColor, getSupplyStatusLabel, vialDailyUsage } from '@/lib/supply-calculations';
import type { ClientInventoryItem } from '@/types/regimen';

interface SupplyOverviewProps {
    inventory: ClientInventoryItem[];
    contactId?: string;
}

function getStatus(daysRemaining: number): 'adequate' | 'low' | 'critical' | 'depleted' {
    if (daysRemaining <= 0) return 'depleted';
    if (daysRemaining < 3) return 'critical';
    if (daysRemaining < 7) return 'low';
    return 'adequate';
}

interface PeptideSupply {
    peptideId: string;
    peptideName: string;
    totalMg: number;
    dailyUsage: number;
    daysRemaining: number;
    status: 'adequate' | 'low' | 'critical' | 'depleted';
    vialCount: number;
}

const STATUS_BAR_COLORS: Record<string, string> = {
    adequate: 'bg-green-500',
    low: 'bg-yellow-500',
    critical: 'bg-orange-500',
    depleted: 'bg-red-500',
};

const STATUS_RING_COLORS: Record<string, string> = {
    adequate: 'ring-green-500/20',
    low: 'ring-yellow-500/20',
    critical: 'ring-orange-500/20',
    depleted: 'ring-red-500/20',
};

export function SupplyOverview({ inventory, contactId }: SupplyOverviewProps) {
    const navigate = useNavigate();

    // Only consider active vials (reconstituted + has schedule)
    const activeVials = useMemo(() =>
        inventory.filter(v =>
            v.in_fridge &&
            v.concentration_mg_ml &&
            v.reconstituted_at &&
            v.dose_amount_mg &&
            v.dose_frequency &&
            v.current_quantity_mg > 0
        ),
    [inventory]);

    // Group by peptide and aggregate supply
    const peptideSupplies = useMemo<PeptideSupply[]>(() => {
        const groups = new Map<string, ClientInventoryItem[]>();
        for (const vial of activeVials) {
            const key = vial.peptide_id || vial.peptide?.name || vial.id;
            const existing = groups.get(key) || [];
            existing.push(vial);
            groups.set(key, existing);
        }

        return Array.from(groups.entries()).map(([peptideId, vials]) => {
            const totalMg = vials.reduce((sum, v) => sum + (Number(v.current_quantity_mg) || 0), 0);
            // Use the schedule from the first vial with a schedule (they should all match for same peptide)
            const scheduleVial = vials.find(v => v.dose_amount_mg && v.dose_frequency) || vials[0];
            const dailyUsage = vialDailyUsage(scheduleVial);
            const daysRemaining = dailyUsage > 0 ? Math.floor(totalMg / dailyUsage) : 0;
            const status = getStatus(daysRemaining);

            return {
                peptideId,
                peptideName: vials[0].peptide?.name || 'Unknown Peptide',
                totalMg,
                dailyUsage,
                daysRemaining,
                status,
                vialCount: vials.length,
            };
        }).sort((a, b) => a.daysRemaining - b.daysRemaining); // Most urgent first
    }, [activeVials]);

    // Items that need reordering
    const lowItems = useMemo(() =>
        peptideSupplies.filter(p => p.status !== 'adequate'),
    [peptideSupplies]);

    // Earliest depletion date
    const earliestDepletion = useMemo(() => {
        if (peptideSupplies.length === 0) return null;
        const minDays = Math.min(...peptideSupplies.map(p => p.daysRemaining));
        if (minDays <= 0) return 'now';
        const date = new Date(Date.now() + minDays * 86400000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }, [peptideSupplies]);

    // Count vials that exist but don't pass the strict filter
    const allFridgeVials = inventory.filter(v => v.in_fridge && v.current_quantity_mg > 0);
    const needSetupCount = allFridgeVials.length - activeVials.length;

    // Show helpful fallback if vials exist but none are fully configured
    if (activeVials.length === 0) {
        if (allFridgeVials.length === 0) return null; // genuinely no vials

        return (
            <GlassCard className="border-amber-500/15">
                <CardContent className="py-5">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
                            <Beaker className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold tracking-tight">
                                {needSetupCount} vial{needSetupCount !== 1 ? 's' : ''} need{needSetupCount === 1 ? 's' : ''} setup
                            </p>
                            <p className="text-xs text-muted-foreground/50 mt-0.5 leading-relaxed">
                                Your fridge has vials that need reconstitution or a dose schedule before supply tracking can work.
                            </p>
                            <button
                                onClick={() => navigate('/my-regimen')}
                                className="mt-2.5 text-xs font-semibold text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
                            >
                                Configure Vials
                            </button>
                        </div>
                    </div>
                </CardContent>
            </GlassCard>
        );
    }

    const handleReorderOne = (supply: PeptideSupply) => {
        navigate(`/store?reorder=${encodeURIComponent(JSON.stringify([{
            peptide_name: supply.peptideName,
            peptide_id: supply.peptideId,
            quantity: 1,
        }]))}`);
    };

    const handleReorderAll = () => {
        const items = lowItems.map(s => ({
            peptide_name: s.peptideName,
            peptide_id: s.peptideId,
            quantity: 1,
        }));
        navigate(`/store?reorder=${encodeURIComponent(JSON.stringify(items))}`);
    };

    return (
        <GlassCard className="border-border/30">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">Supply Overview</CardTitle>
                    </div>
                    {lowItems.length > 0 && (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-xs">
                            {lowItems.length} running low
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Per-peptide supply bars */}
                {peptideSupplies.map(supply => (
                    <div
                        key={supply.peptideId}
                        className={cn(
                            "flex items-center gap-3 p-2.5 rounded-xl transition-colors",
                            supply.status !== 'adequate' ? 'bg-muted/30 ring-1' : '',
                            STATUS_RING_COLORS[supply.status] || '',
                        )}
                    >
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">
                                    {supply.peptideName}
                                    {supply.vialCount > 1 && (
                                        <span className="text-muted-foreground/50 text-xs ml-1">
                                            ({supply.vialCount} vials)
                                        </span>
                                    )}
                                </span>
                                <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white shrink-0",
                                    getSupplyStatusColor(supply.status)
                                )}>
                                    {getSupplyStatusLabel(supply.daysRemaining)}
                                </span>
                            </div>
                            <Progress
                                value={Math.min(100, (supply.daysRemaining / 30) * 100)}
                                className="h-1.5"
                                indicatorClassName={STATUS_BAR_COLORS[supply.status]}
                            />
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                                <span>{supply.totalMg.toFixed(1)}mg remaining</span>
                                <span>{supply.dailyUsage.toFixed(2)}mg/day</span>
                            </div>
                        </div>

                        {/* Per-peptide reorder button */}
                        {supply.status !== 'adequate' && (
                            <button
                                onClick={() => handleReorderOne(supply)}
                                className="shrink-0 p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                title={`Reorder ${supply.peptideName}`}
                            >
                                <ShoppingBag className="h-3.5 w-3.5 text-amber-400" />
                            </button>
                        )}
                    </div>
                ))}

                {/* Bulk reorder button */}
                {lowItems.length > 0 && (
                    <Button
                        onClick={handleReorderAll}
                        variant="outline"
                        className="w-full mt-2 border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] text-amber-400"
                    >
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Reorder Low Stock ({lowItems.length} item{lowItems.length !== 1 ? 's' : ''})
                    </Button>
                )}

                {/* Auto-Reorder placeholder */}
                <div className="mt-3 p-3 rounded-xl border border-border/30 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/50" />
                            <span className="text-xs font-medium text-muted-foreground/70">Auto-Reorder</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Lock className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-[10px] text-muted-foreground/40">Coming soon</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/40 mt-1">
                        Automatic reorders require a card on file. We'll notify you when this is available.
                    </p>
                </div>

                {/* Footer: next refill date */}
                {earliestDepletion && (
                    <div className="pt-2 border-t border-border/20 flex items-center gap-1.5 text-xs text-muted-foreground/60">
                        <CalendarClock className="h-3 w-3" />
                        <span>
                            Next refill needed: <span className="font-medium text-foreground/70">
                                {earliestDepletion === 'now' ? 'Now' : `~${earliestDepletion}`}
                            </span>
                        </span>
                    </div>
                )}
            </CardContent>
        </GlassCard>
    );
}
