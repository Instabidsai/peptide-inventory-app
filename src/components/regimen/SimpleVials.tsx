import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Droplets, ShoppingBag, Syringe, Check, Beaker,
    ChevronDown, ChevronUp, Plus, Package, Sun, Sunset, Moon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVialActions } from '@/hooks/use-vial-actions';
import { DAYS_OF_WEEK, FREQUENCY_OPTIONS, TIME_OF_DAY_OPTIONS, isDoseDay, getScheduleLabel } from '@/types/regimen';
import type { DoseFrequency, DoseTimeOfDay } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { ClientInventoryItem } from '@/types/regimen';

interface SimpleVialsProps {
    inventory: ClientInventoryItem[];
    contactId?: string;
}

type VialState = 'unmixed' | 'needs_schedule' | 'due_today' | 'not_today' | 'low_stock';

function getVialState(vial: ClientInventoryItem, todayAbbr: string): VialState {
    if (!vial.concentration_mg_ml || !vial.reconstituted_at) return 'unmixed';
    if (!vial.dose_amount_mg || !vial.dose_frequency) return 'needs_schedule';
    const pct = (vial.current_quantity_mg / vial.vial_size_mg) * 100;
    const dueToday = isDoseDay(vial, todayAbbr);
    if (pct < 20) return 'low_stock';
    if (dueToday) return 'due_today';
    return 'not_today';
}

const STATE_ORDER: Record<VialState, number> = {
    due_today: 0,
    low_stock: 1,
    needs_schedule: 2,
    unmixed: 3,
    not_today: 4,
};

const TIME_ICONS = { morning: Sun, afternoon: Sunset, evening: Moon } as const;

// ─── Unmixed Card ─────────────────────────────────────────────
function UnmixedCard({ vial, actions }: { vial: ClientInventoryItem; actions: ReturnType<typeof useVialActions> }) {
    const [waterMl, setWaterMl] = useState('');
    const concentration = waterMl && parseFloat(waterMl) > 0 ? vial.vial_size_mg / parseFloat(waterMl) : 0;

    return (
        <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-500/[0.06] to-transparent p-4 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-[15px] tracking-tight">{vial.peptide?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{vial.vial_size_mg}mg vial</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[11px] font-medium text-amber-400">Unmixed</span>
                </div>
            </div>

            <div className="space-y-2.5">
                <div className="relative">
                    <Beaker className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        placeholder="Bacteriostatic water (ml)"
                        value={waterMl}
                        onChange={e => setWaterMl(e.target.value)}
                        className="h-11 pl-10 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                    />
                </div>

                {concentration > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/15">
                        <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">
                            {concentration.toFixed(2)} mg/ml
                        </span>
                    </div>
                )}

                <Button
                    size="sm"
                    className="w-full h-11 rounded-xl text-sm font-medium"
                    disabled={!waterMl || isNaN(parseFloat(waterMl)) || parseFloat(waterMl) <= 0 || actions.reconstitute.isPending}
                    onClick={() => {
                        const ml = parseFloat(waterMl);
                        if (isNaN(ml) || ml <= 0) return;
                        actions.reconstitute.mutate({
                            vialId: vial.id,
                            waterMl: ml,
                            vialSizeMg: vial.vial_size_mg,
                        });
                    }}
                >
                    <Droplets className="h-4 w-4 mr-1.5" />
                    Mix Vial
                </Button>
            </div>
        </div>
    );
}

// ─── Needs Schedule Card ──────────────────────────────────────
function NeedsScheduleCard({ vial, actions }: { vial: ClientInventoryItem; actions: ReturnType<typeof useVialActions> }) {
    const [doseMg, setDoseMg] = useState('');
    const [frequency, setFrequency] = useState<DoseFrequency | ''>('');
    const [timeOfDay, setTimeOfDay] = useState<DoseTimeOfDay | ''>('');
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [interval, setInterval] = useState('');
    const [onDays, setOnDays] = useState('');
    const [offDays, setOffDays] = useState('');

    const toggleDay = (day: string) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseNum = parseFloat(doseMg) || 0;
    const units = concentration > 0 && doseNum > 0 ? Math.round((doseNum / concentration) * 100) : 0;

    const canSave = (): boolean => {
        if (!doseMg || parseFloat(doseMg) <= 0 || !frequency || !timeOfDay) return false;
        if (frequency === 'specific_days' && selectedDays.length === 0) return false;
        if (frequency === 'every_x_days' && (!interval || parseInt(interval) < 1)) return false;
        if (frequency === 'x_on_y_off' && (!onDays || parseInt(onDays) < 1 || !offDays || parseInt(offDays) < 1)) return false;
        return true;
    };

    const handleSave = () => {
        if (!canSave()) return;
        const parsedDose = parseFloat(doseMg);
        if (isNaN(parsedDose) || parsedDose <= 0) return;
        actions.setSchedule.mutate({
            vialId: vial.id,
            doseAmountMg: parsedDose,
            doseFrequency: frequency,
            doseDays: frequency === 'specific_days' ? selectedDays : undefined,
            doseInterval: frequency === 'every_x_days' ? (parseInt(interval) || undefined)
                : frequency === 'x_on_y_off' ? (parseInt(onDays) || undefined) : undefined,
            doseOffDays: frequency === 'x_on_y_off' ? (parseInt(offDays) || undefined) : undefined,
            doseTimeOfDay: timeOfDay || undefined,
        });
    };

    return (
        <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-b from-blue-500/[0.05] to-transparent p-4 space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-[15px] tracking-tight">{vial.peptide?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{concentration.toFixed(2)} mg/ml</p>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                    <span className="text-[11px] font-medium text-blue-400">Set Up</span>
                </div>
            </div>

            {/* Section 1: Dose */}
            <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Dose per injection</label>
                <div className="relative">
                    <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.25"
                        value={doseMg}
                        onChange={e => setDoseMg(e.target.value)}
                        className="h-11 pr-12 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50 font-medium">mg</span>
                </div>
                {units > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/15">
                        <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">{units} units</span>
                    </div>
                )}
            </div>

            <div className="h-px bg-white/[0.04]" />

            {/* Section 2: Frequency */}
            <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Schedule</label>
                <div className="flex flex-wrap gap-1.5">
                    {FREQUENCY_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFrequency(opt.value)}
                            className={cn(
                                "px-3 py-2 rounded-xl text-[12px] font-medium transition-all duration-200 border",
                                frequency === opt.value
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_hsl(160_84%_39%/0.1)]"
                                    : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/70 hover:bg-white/[0.06] hover:text-foreground/80"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Conditional frequency inputs */}
            {frequency === 'every_x_days' && (
                <div className="space-y-2 animate-fade-in">
                    <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Interval</label>
                    <div className="relative">
                        <Input
                            type="number"
                            min="1"
                            placeholder="5"
                            value={interval}
                            onChange={e => setInterval(e.target.value)}
                            className="h-11 pr-16 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50 font-medium">days</span>
                    </div>
                </div>
            )}

            {frequency === 'x_on_y_off' && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Days on</label>
                        <Input
                            type="number"
                            min="1"
                            placeholder="5"
                            value={onDays}
                            onChange={e => setOnDays(e.target.value)}
                            className="h-11 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Days off</label>
                        <Input
                            type="number"
                            min="1"
                            placeholder="2"
                            value={offDays}
                            onChange={e => setOffDays(e.target.value)}
                            className="h-11 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                </div>
            )}

            {frequency === 'specific_days' && (
                <div className="space-y-2 animate-fade-in">
                    <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Which days?</label>
                    <div className="grid grid-cols-7 gap-1.5">
                        {DAYS_OF_WEEK.map(day => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(day)}
                                className={cn(
                                    "h-10 rounded-xl text-[11px] font-semibold transition-all duration-200 border",
                                    selectedDays.includes(day)
                                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                        : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/60 hover:bg-white/[0.06]"
                                )}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {frequency && (
                <>
                    <div className="h-px bg-white/[0.04]" />

                    {/* Section 3: Time of day */}
                    <div className="space-y-2 animate-fade-in">
                        <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Time of day</label>
                        <div className="grid grid-cols-3 gap-2">
                            {TIME_OF_DAY_OPTIONS.map(opt => {
                                const Icon = TIME_ICONS[opt.value];
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setTimeOfDay(opt.value)}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-all duration-200 border",
                                            timeOfDay === opt.value
                                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_hsl(160_84%_39%/0.1)]"
                                                : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/60 hover:bg-white/[0.06]"
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            <Button
                className="w-full h-12 rounded-xl text-sm font-semibold"
                disabled={!canSave() || actions.setSchedule.isPending}
                onClick={handleSave}
            >
                <Check className="h-4 w-4 mr-1.5" />
                Save Schedule
            </Button>
        </div>
    );
}

// ─── Active Card (due today, not today, or low stock) ─────────
function ActiveCard({ vial, isDueToday, isLow, actions }: {
    vial: ClientInventoryItem; isDueToday: boolean; isLow: boolean;
    actions: ReturnType<typeof useVialActions>;
}) {
    const navigate = useNavigate();
    const pct = Math.min(100, Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100));
    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseMg = Number(vial.dose_amount_mg) || 0;
    const units = concentration > 0 && doseMg > 0 ? Math.round((doseMg / concentration) * 100) : 0;
    const scheduleLabel = getScheduleLabel(vial);
    const TimeIcon = vial.dose_time_of_day ? TIME_ICONS[vial.dose_time_of_day as keyof typeof TIME_ICONS] : null;

    return (
        <div className={cn(
            "rounded-2xl border bg-gradient-to-b p-4 space-y-3 animate-fade-in transition-all duration-300",
            isLow
                ? "border-amber-500/20 from-amber-500/[0.06] to-transparent"
                : isDueToday
                    ? "border-emerald-500/20 from-emerald-500/[0.06] to-transparent shadow-[0_0_25px_hsl(160_84%_39%/0.08)]"
                    : "border-white/[0.04] from-white/[0.02] to-transparent"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] tracking-tight">{vial.peptide?.name || 'Unknown'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground/60">{concentration.toFixed(2)} mg/ml</span>
                        {scheduleLabel && (
                            <>
                                <span className="text-muted-foreground/30">·</span>
                                <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                                    {TimeIcon && <TimeIcon className="h-3 w-3" />}
                                    {scheduleLabel}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {isDueToday && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[11px] font-medium text-emerald-400">Due</span>
                    </div>
                )}
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground/60 font-medium">
                        {Number(vial.current_quantity_mg).toFixed(1)}mg remaining
                    </span>
                    <span className={cn(
                        "font-semibold",
                        isLow ? "text-amber-400" : "text-muted-foreground/60"
                    )}>
                        {Math.round(pct)}%
                    </span>
                </div>
                <Progress
                    value={pct}
                    className={cn(
                        "h-2.5 rounded-full",
                        isLow ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-amber-400 [&>div]:rounded-full'
                            : '[&>div]:bg-gradient-to-r [&>div]:from-emerald-600 [&>div]:to-emerald-400 [&>div]:rounded-full'
                    )}
                />
            </div>

            {/* Dose info */}
            {isDueToday && doseMg > 0 && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/15">
                    <Syringe className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="flex-1">
                        <span className="text-sm font-semibold text-emerald-400">{units} units</span>
                        <span className="text-xs text-emerald-400/60 ml-1.5">({doseMg}mg)</span>
                    </div>
                </div>
            )}

            {/* Low stock warning */}
            {isLow && (
                <button
                    onClick={() => navigate('/store')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/15 transition-colors hover:bg-amber-500/[0.12]"
                >
                    <ShoppingBag className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-400">Running low — Reorder</span>
                </button>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
                {isDueToday && doseMg > 0 && (
                    <Button
                        className="flex-1 h-12 rounded-xl text-sm font-semibold"
                        disabled={actions.logDose.isPending}
                        onClick={() => {
                            actions.logDose.mutate({
                                vialId: vial.id,
                                currentQty: vial.current_quantity_mg,
                                doseMg,
                            });
                        }}
                    >
                        <Syringe className="h-4 w-4 mr-1.5" />
                        Log Dose
                    </Button>
                )}
                <Button
                    variant="ghost"
                    className={cn(
                        "h-12 rounded-xl text-xs text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10",
                        isDueToday && doseMg > 0 ? "px-4" : "flex-1"
                    )}
                    disabled={actions.markEmpty.isPending}
                    onClick={() => actions.markEmpty.mutate(vial.id)}
                >
                    Mark Empty
                </Button>
            </div>
        </div>
    );
}

// ─── Storage Vial Row ─────────────────────────────────────────
function StorageRow({ vial, actions }: { vial: ClientInventoryItem; actions: ReturnType<typeof useVialActions> }) {
    const pct = Math.min(100, Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100));
    const isMixed = !!vial.concentration_mg_ml;

    return (
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]">
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm tracking-tight truncate">{vial.peptide?.name || 'Unknown'}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50 mt-0.5">
                    <span>{vial.vial_size_mg}mg</span>
                    <span className="text-muted-foreground/20">·</span>
                    {isMixed ? (
                        <span className="text-emerald-400/70">{Number(vial.concentration_mg_ml).toFixed(2)} mg/ml</span>
                    ) : (
                        <span className="text-amber-400/70">Unmixed</span>
                    )}
                    <span className="text-muted-foreground/20">·</span>
                    <span>{Math.round(pct)}%</span>
                </div>
            </div>
            <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl text-xs border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 shrink-0"
                disabled={actions.toggleFridge.isPending}
                onClick={() => actions.toggleFridge.mutate({ vialId: vial.id, inFridge: true })}
            >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Fridge
            </Button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────
export function SimpleVials({ inventory, contactId }: SimpleVialsProps) {
    const actions = useVialActions(contactId);
    const todayAbbr = format(new Date(), 'EEE');
    const [storageOpen, setStorageOpen] = useState(false);

    const activeVials = inventory.filter(
        (v) => v.status === 'active' && v.vial_size_mg > 0
    );

    const fridgeVials = activeVials.filter(v => v.in_fridge);
    const storageVials = activeVials.filter(v => !v.in_fridge);

    const sortedFridge = [...fridgeVials].sort((a, b) => {
        const stateA = getVialState(a, todayAbbr);
        const stateB = getVialState(b, todayAbbr);
        return STATE_ORDER[stateA] - STATE_ORDER[stateB];
    });

    return (
        <div className="space-y-4">
            {/* ─── Fridge ─── */}
            <GlassCard className="border-white/[0.04] overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_hsl(160_84%_39%/0.1)]">
                            <Droplets className="w-4 h-4" />
                        </div>
                        <span className="tracking-tight">My Fridge</span>
                        {fridgeVials.length > 0 && (
                            <span className="ml-auto text-xs font-medium text-muted-foreground/50 bg-white/[0.04] px-2.5 py-1 rounded-full">
                                {fridgeVials.length}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                    {sortedFridge.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground rounded-2xl border-2 border-dashed border-white/[0.04]">
                            <Droplets className="h-8 w-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm font-medium text-foreground/60">Your fridge is empty</p>
                            <p className="text-xs mt-1 text-muted-foreground/50 max-w-[200px] mx-auto">
                                {storageVials.length > 0
                                    ? 'Move vials from storage below to start tracking doses.'
                                    : 'Vials from new orders will appear here.'}
                            </p>
                        </div>
                    ) : (
                        sortedFridge.map((vial) => {
                            const state = getVialState(vial, todayAbbr);
                            switch (state) {
                                case 'unmixed':
                                    return <UnmixedCard key={vial.id} vial={vial} actions={actions} />;
                                case 'needs_schedule':
                                    return <NeedsScheduleCard key={vial.id} vial={vial} actions={actions} />;
                                case 'due_today':
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday isLow={false} actions={actions} />;
                                case 'low_stock': {
                                    const isDue = isDoseDay(vial, todayAbbr);
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday={isDue} isLow actions={actions} />;
                                }
                                case 'not_today':
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday={false} isLow={false} actions={actions} />;
                            }
                        })
                    )}

                    {/* Remove from fridge */}
                    {sortedFridge.length > 0 && (
                        <div className="pt-2 mt-1 border-t border-white/[0.04]">
                            <div className="flex flex-wrap gap-1.5">
                                {sortedFridge.map(vial => (
                                    <button
                                        key={vial.id}
                                        onClick={() => actions.toggleFridge.mutate({ vialId: vial.id, inFridge: false })}
                                        className="group text-[11px] px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-muted-foreground/40 hover:bg-destructive/10 hover:border-destructive/20 hover:text-destructive transition-all duration-200"
                                    >
                                        {vial.peptide?.name || 'Unknown'}
                                        <span className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">×</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </GlassCard>

            {/* ─── Storage (collapsible) ─── */}
            {storageVials.length > 0 && (
                <GlassCard className="border-white/[0.04] overflow-hidden">
                    <button
                        onClick={() => setStorageOpen(prev => !prev)}
                        className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/[0.04] text-muted-foreground/60">
                                <Package className="h-4 w-4" />
                            </div>
                            <span className="font-semibold text-sm tracking-tight">Storage</span>
                            <span className="text-xs font-medium text-muted-foreground/40 bg-white/[0.04] px-2.5 py-1 rounded-full">
                                {storageVials.length}
                            </span>
                        </div>
                        <div className={cn(
                            "p-1 rounded-lg bg-white/[0.04] transition-transform duration-200",
                            storageOpen && "rotate-180"
                        )}>
                            <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                    </button>
                    {storageOpen && (
                        <CardContent className="pt-0 pb-4 space-y-2 animate-fade-in">
                            {storageVials.map(vial => (
                                <StorageRow key={vial.id} vial={vial} actions={actions} />
                            ))}
                        </CardContent>
                    )}
                </GlassCard>
            )}
        </div>
    );
}
