import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Droplets, ShoppingBag, Syringe, Check, XCircle, Beaker } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVialActions } from '@/hooks/use-vial-actions';
import { DAYS_OF_WEEK } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SimpleVialsProps {
    inventory: any[];
    contactId?: string;
}

type VialState = 'unmixed' | 'needs_schedule' | 'due_today' | 'not_today' | 'low_stock';

function getVialState(vial: any, todayAbbr: string): VialState {
    if (!vial.concentration_mg_ml || !vial.reconstituted_at) return 'unmixed';
    if (!vial.dose_amount_mg || !vial.dose_days?.length) return 'needs_schedule';
    const pct = (vial.current_quantity_mg / vial.vial_size_mg) * 100;
    if (pct < 20) return 'low_stock';
    if (vial.dose_days.includes(todayAbbr)) return 'due_today';
    return 'not_today';
}

const STATE_ORDER: Record<VialState, number> = {
    due_today: 0,
    low_stock: 1,
    needs_schedule: 2,
    unmixed: 3,
    not_today: 4,
};

// ─── Unmixed Card ─────────────────────────────────────────────
function UnmixedCard({ vial, actions }: { vial: any; actions: ReturnType<typeof useVialActions> }) {
    const [waterMl, setWaterMl] = useState('');
    const concentration = waterMl && parseFloat(waterMl) > 0 ? vial.vial_size_mg / parseFloat(waterMl) : 0;

    return (
        <div className="rounded-lg border border-amber-500/20 bg-card/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{vial.peptide?.name || 'Unknown'}</p>
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                    Unmixed
                </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{vial.vial_size_mg}mg vial</p>

            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Beaker className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="Water (ml)"
                        value={waterMl}
                        onChange={e => setWaterMl(e.target.value)}
                        className="h-8 text-sm"
                    />
                </div>
                {concentration > 0 && (
                    <p className="text-xs text-emerald-400 pl-6">
                        = {concentration.toFixed(2)} mg/ml
                    </p>
                )}
                <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={!waterMl || parseFloat(waterMl) <= 0 || actions.reconstitute.isPending}
                    onClick={() => {
                        actions.reconstitute.mutate({
                            vialId: vial.id,
                            waterMl: parseFloat(waterMl),
                            vialSizeMg: vial.vial_size_mg,
                        });
                    }}
                >
                    <Droplets className="h-3.5 w-3.5 mr-1" />
                    Mix Vial
                </Button>
            </div>
        </div>
    );
}

// ─── Needs Schedule Card ──────────────────────────────────────
function NeedsScheduleCard({ vial, actions }: { vial: any; actions: ReturnType<typeof useVialActions> }) {
    const [doseMg, setDoseMg] = useState('');
    const [selectedDays, setSelectedDays] = useState<string[]>([]);

    const toggleDay = (day: string) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseNum = parseFloat(doseMg) || 0;
    const units = concentration > 0 && doseNum > 0 ? Math.round((doseNum / concentration) * 100) : 0;

    return (
        <div className="rounded-lg border border-blue-500/20 bg-card/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{vial.peptide?.name || 'Unknown'}</p>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                    {concentration.toFixed(2)} mg/ml
                </Badge>
            </div>

            {/* Dose amount */}
            <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Dose per injection (mg)</label>
                <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 0.25"
                    value={doseMg}
                    onChange={e => setDoseMg(e.target.value)}
                    className="h-8 text-sm"
                />
                {units > 0 && (
                    <p className="text-xs text-emerald-400">
                        <Syringe className="h-3 w-3 inline mr-1" />
                        {units} units on the syringe
                    </p>
                )}
            </div>

            {/* Day-of-week picker */}
            <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Injection days</label>
                <div className="flex gap-1">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={cn(
                                "flex-1 h-8 rounded-md text-[10px] font-medium transition-all border",
                                selectedDays.includes(day)
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                    : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary"
                            )}
                        >
                            {day.charAt(0)}
                        </button>
                    ))}
                </div>
            </div>

            <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!doseMg || parseFloat(doseMg) <= 0 || selectedDays.length === 0 || actions.setSchedule.isPending}
                onClick={() => {
                    actions.setSchedule.mutate({
                        vialId: vial.id,
                        doseAmountMg: parseFloat(doseMg),
                        doseDays: selectedDays,
                    });
                }}
            >
                <Check className="h-3.5 w-3.5 mr-1" />
                Save Schedule
            </Button>
        </div>
    );
}

// ─── Active Card (due today, not today, or low stock) ─────────
function ActiveCard({ vial, isDueToday, isLow, actions }: {
    vial: any; isDueToday: boolean; isLow: boolean;
    actions: ReturnType<typeof useVialActions>;
}) {
    const navigate = useNavigate();
    const pct = Math.min(100, Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100));
    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseMg = Number(vial.dose_amount_mg) || 0;
    const units = concentration > 0 && doseMg > 0 ? Math.round((doseMg / concentration) * 100) : 0;
    const daysLabel = (vial.dose_days || []).join(', ');

    return (
        <div className={cn(
            "rounded-lg border bg-card/50 p-3 space-y-2",
            isLow ? "border-amber-500/30" : isDueToday ? "border-emerald-500/20" : "border-border/50"
        )}>
            <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{vial.peptide?.name || 'Unknown'}</p>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                    {concentration.toFixed(2)} mg/ml
                </Badge>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{Number(vial.current_quantity_mg).toFixed(1)}mg / {vial.vial_size_mg}mg</span>
                    <span>{Math.round(pct)}%</span>
                </div>
                <Progress
                    value={pct}
                    className={`h-2 ${isLow ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`}
                />
            </div>

            {/* Dose info — shown when due today */}
            {isDueToday && doseMg > 0 && (
                <div className="flex items-center gap-2 text-xs">
                    <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">{doseMg}mg dose = {units} units</span>
                </div>
            )}

            {/* Schedule text — shown when not due today */}
            {!isDueToday && daysLabel && (
                <p className="text-xs text-muted-foreground">{daysLabel}</p>
            )}

            {/* Low stock warning */}
            {isLow && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    onClick={() => navigate('/store')}
                >
                    <ShoppingBag className="h-3 w-3 mr-1" />
                    Running low — Reorder
                </Button>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
                {isDueToday && doseMg > 0 && (
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        disabled={actions.logDose.isPending}
                        onClick={() => {
                            actions.logDose.mutate({
                                vialId: vial.id,
                                currentQty: vial.current_quantity_mg,
                                doseMg,
                            });
                        }}
                    >
                        <Syringe className="h-3.5 w-3.5 mr-1" />
                        Log Dose
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-8 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30",
                        isDueToday && doseMg > 0 ? "" : "flex-1"
                    )}
                    disabled={actions.markEmpty.isPending}
                    onClick={() => actions.markEmpty.mutate(vial.id)}
                >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Empty
                </Button>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────
export function SimpleVials({ inventory, contactId }: SimpleVialsProps) {
    const actions = useVialActions(contactId);
    const todayAbbr = format(new Date(), 'EEE');

    const activeVials = inventory.filter(
        (v) => v.status === 'active' && v.vial_size_mg > 0
    );

    if (activeVials.length === 0) {
        return (
            <GlassCard className="border-emerald-500/10">
                <CardContent className="py-6 text-center text-muted-foreground">
                    <Droplets className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No active vials in your fridge.</p>
                    <p className="text-xs mt-1">Vials from your orders will appear here.</p>
                </CardContent>
            </GlassCard>
        );
    }

    // Sort vials by state priority
    const sortedVials = [...activeVials].sort((a, b) => {
        const stateA = getVialState(a, todayAbbr);
        const stateB = getVialState(b, todayAbbr);
        return STATE_ORDER[stateA] - STATE_ORDER[stateB];
    });

    return (
        <GlassCard className="border-emerald-500/10">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                        <Droplets className="w-4 h-4" />
                    </div>
                    My Vials
                    <Badge variant="secondary" className="ml-auto text-xs">
                        {activeVials.length} active
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {sortedVials.map((vial) => {
                    const state = getVialState(vial, todayAbbr);

                    switch (state) {
                        case 'unmixed':
                            return <UnmixedCard key={vial.id} vial={vial} actions={actions} />;
                        case 'needs_schedule':
                            return <NeedsScheduleCard key={vial.id} vial={vial} actions={actions} />;
                        case 'due_today':
                            return <ActiveCard key={vial.id} vial={vial} isDueToday isLow={false} actions={actions} />;
                        case 'low_stock': {
                            const isDue = vial.dose_days?.includes(todayAbbr) ?? false;
                            return <ActiveCard key={vial.id} vial={vial} isDueToday={isDue} isLow actions={actions} />;
                        }
                        case 'not_today':
                            return <ActiveCard key={vial.id} vial={vial} isDueToday={false} isLow={false} actions={actions} />;
                    }
                })}
            </CardContent>
        </GlassCard>
    );
}
