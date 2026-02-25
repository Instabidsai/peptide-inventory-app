import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Droplets,
    ShoppingBag,
    Syringe,
    Check,
    Beaker,
    ChevronDown,
    ChevronUp,
    Plus,
    Package,
    Sun,
    Sunset,
    Moon,
    AlertTriangle,
    Pill,
    Info,
    CalendarClock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVialActions } from '@/hooks/use-vial-actions';
import { DAYS_OF_WEEK, FREQUENCY_OPTIONS, TIME_OF_DAY_OPTIONS, isDoseDay, getScheduleLabel, type DoseFrequency, type DoseTimeOfDay, type ClientInventoryItem } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { lookupKnowledge, type PeptideKnowledge, type DosingTier } from '@/data/protocol-knowledge';
import { calculateDoseUnits } from '@/utils/dose-utils';
import { vialDailyUsage, getSupplyStatusColor, getSupplyStatusLabel } from '@/lib/supply-calculations';

interface SimpleVialsProps {
    inventory: ClientInventoryItem[];
    contactId?: string;
}

type VialState = 'unmixed' | 'needs_schedule' | 'due_today' | 'not_today' | 'low_stock';

function getVialState(vial: ClientInventoryItem, todayAbbr: string): VialState {
    if (!vial.concentration_mg_ml || !vial.reconstituted_at) return 'unmixed';
    if (!vial.dose_amount_mg || !vial.dose_frequency) return 'needs_schedule';
    const sizeMg = Number(vial.vial_size_mg) || 0;
    const pct = sizeMg > 0 ? (Number(vial.current_quantity_mg) / sizeMg) * 100 : 0;
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

function getVialSupplyStatus(daysRemaining: number): 'adequate' | 'low' | 'critical' | 'depleted' {
    if (daysRemaining <= 0) return 'depleted';
    if (daysRemaining < 3) return 'critical';
    if (daysRemaining < 7) return 'low';
    return 'adequate';
}

// ─── Unmixed Card ─────────────────────────────────────────────
function UnmixedCard({ vial, actions, knowledge }: { vial: ClientInventoryItem; actions: ReturnType<typeof useVialActions>; knowledge: PeptideKnowledge | null }) {
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

            {/* Peptide description */}
            {knowledge?.description && (
                <p className="text-[12px] text-muted-foreground/50 leading-relaxed line-clamp-2">{knowledge.description}</p>
            )}

            {/* Warning (always visible — safety-critical) */}
            {knowledge?.warningText && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/15">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-amber-400/80">{knowledge.warningText}</span>
                </div>
            )}

            <div className="space-y-2.5">
                {/* Quick-fill: big primary button when we know the amount */}
                {knowledge?.reconstitutionMl && !waterMl ? (
                    <div className="space-y-2">
                        <Button
                            className="w-full h-12 rounded-xl text-sm font-semibold"
                            onClick={() => setWaterMl(String(knowledge.reconstitutionMl))}
                        >
                            <Beaker className="h-4 w-4 mr-2" />
                            Add {knowledge.reconstitutionMl}mL Water (Recommended)
                        </Button>
                        <button
                            type="button"
                            onClick={() => setWaterMl('0')}
                            className="w-full text-center text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 py-1"
                        >
                            Enter custom amount instead
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="relative">
                            <Beaker className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                            <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                placeholder="Bacteriostatic water (mL)"
                                value={waterMl === '0' ? '' : waterMl}
                                onChange={e => setWaterMl(e.target.value)}
                                className="h-11 pl-10 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                            />
                        </div>
                        {knowledge?.reconstitutionMl && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-9 rounded-xl text-xs border-blue-500/20 text-blue-400 hover:bg-blue-500/10"
                                onClick={() => setWaterMl(String(knowledge.reconstitutionMl))}
                            >
                                Use recommended: {knowledge.reconstitutionMl}mL
                            </Button>
                        )}
                    </div>
                )}

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

// ─── Frequency Mapping: knowledge → fridge schedule format ────
function knowledgeFreqToFridge(freq: string): { frequency: DoseFrequency; interval?: number; onDays?: number; offDays?: number } | null {
    const map: Record<string, { frequency: DoseFrequency; interval?: number }> = {
        'daily': { frequency: 'daily' },
        'daily_am_pm': { frequency: 'daily' },
        'twice daily': { frequency: 'daily' },
        'every other day': { frequency: 'every_x_days', interval: 2 },
        'every 3 days': { frequency: 'every_x_days', interval: 3 },
        'every 5 days': { frequency: 'every_x_days', interval: 5 },
        'weekly': { frequency: 'every_x_days', interval: 7 },
        'twice weekly': { frequency: 'specific_days' },
        '3x weekly': { frequency: 'specific_days' },
        'as needed': { frequency: 'daily' },
    };
    return map[freq] || null;
}

function knowledgeTimingToFridge(timing: string): DoseTimeOfDay | '' {
    if (timing === 'AM' || timing === 'With meals') return 'morning';
    if (timing === 'PM') return 'afternoon';
    if (timing === 'Before bed') return 'evening';
    return '';
}

// ─── Needs Schedule Card ──────────────────────────────────────
function NeedsScheduleCard({ vial, actions, knowledge }: { vial: ClientInventoryItem; actions: ReturnType<typeof useVialActions>; knowledge: PeptideKnowledge | null }) {
    const [doseMg, setDoseMg] = useState('');
    const [frequency, setFrequency] = useState<DoseFrequency | ''>('');
    const [timeOfDay, setTimeOfDay] = useState<DoseTimeOfDay | ''>('');
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [interval, setInterval] = useState('');
    const [onDays, setOnDays] = useState('');
    const [offDays, setOffDays] = useState('');
    const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

    const toggleDay = (day: string) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseNum = parseFloat(doseMg) || 0;
    const units = calculateDoseUnits(doseNum, concentration);

    const tiers = knowledge?.dosingTiers ?? [];

    const applyTier = (tier: DosingTier) => {
        setSelectedTierId(tier.id);
        // Convert dose: knowledge uses mcg/mg, fridge uses mg
        const mgDose = tier.doseUnit === 'mcg' ? tier.doseAmount / 1000 : tier.doseAmount;
        setDoseMg(String(mgDose));
        // Map frequency
        const mapped = knowledgeFreqToFridge(tier.frequency);
        if (mapped) {
            setFrequency(mapped.frequency);
            if (mapped.interval) setInterval(String(mapped.interval));
        }
        // Map timing
        const mappedTime = knowledgeTimingToFridge(tier.timing);
        if (mappedTime) setTimeOfDay(mappedTime);
    };

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

            {/* Peptide description */}
            {knowledge?.description && (
                <p className="text-[12px] text-muted-foreground/50 leading-relaxed line-clamp-2">{knowledge.description}</p>
            )}

            {/* Dosing Tier Selector */}
            {tiers.length > 0 && (
                <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Quick start — pick a protocol</span>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(tiers.length, 3)}, 1fr)` }}>
                        {tiers.map(tier => {
                            const tierMg = tier.doseUnit === 'mcg' ? tier.doseAmount / 1000 : tier.doseAmount;
                            const unitLabel = tier.doseUnit === 'iu' ? 'IU' : 'mg';
                            const doseDisplay = tier.doseUnit === 'iu' ? `${tier.doseAmount} ${unitLabel}` : `${tierMg} ${unitLabel}`;
                            return (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => applyTier(tier)}
                                    className={cn(
                                        "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-center transition-all duration-200 border",
                                        selectedTierId === tier.id
                                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_hsl(160_84%_39%/0.1)]"
                                            : "bg-white/[0.03] border-white/[0.06] text-muted-foreground/60 hover:bg-white/[0.06] hover:text-foreground/80"
                                    )}
                                >
                                    <span className="text-[12px] font-semibold">{tier.label.replace(' Protocol', '').replace(' Start', '')}</span>
                                    <span className="text-[10px] opacity-70">{doseDisplay}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Selected tier context */}
                    {selectedTierId && (() => {
                        const tier = tiers.find(t => t.id === selectedTierId);
                        if (!tier) return null;
                        return (
                            <div className="space-y-1 animate-fade-in">
                                {tier.cyclePattern && (
                                    <p className="text-[11px] text-muted-foreground/50 pl-1">
                                        Cycle: {tier.cyclePattern}
                                    </p>
                                )}
                                {tier.notes && (
                                    <p className="text-[11px] text-blue-400/60 pl-1">
                                        {tier.notes}
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    <div className="h-px bg-white/[0.04]" />
                </div>
            )}

            {/* Section 1: Dose */}
            <div className="space-y-2">
                <label htmlFor="regimen-dose" className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Dose per injection</label>
                <div className="relative">
                    <Input
                        id="regimen-dose"
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
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Schedule</span>
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
                    <label htmlFor="regimen-interval" className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Interval</label>
                    <div className="relative">
                        <Input
                            id="regimen-interval"
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
                        <label htmlFor="regimen-days-on" className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Days on</label>
                        <Input
                            id="regimen-days-on"
                            type="number"
                            min="1"
                            placeholder="5"
                            value={onDays}
                            onChange={e => setOnDays(e.target.value)}
                            className="h-11 text-sm rounded-xl bg-white/[0.03] border-white/[0.06]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="regimen-days-off" className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Days off</label>
                        <Input
                            id="regimen-days-off"
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
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Which days?</span>
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
                        <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Time of day</span>
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
function ActiveCard({ vial, isDueToday, isLow, actions, knowledge }: {
    vial: ClientInventoryItem; isDueToday: boolean; isLow: boolean;
    actions: ReturnType<typeof useVialActions>;
    knowledge: PeptideKnowledge | null;
}) {
    const navigate = useNavigate();
    const [infoOpen, setInfoOpen] = useState(false);
    const sizeMg = Number(vial.vial_size_mg) || 0;
    const pct = sizeMg > 0 ? Math.min(100, Math.max(0, (Number(vial.current_quantity_mg) / sizeMg) * 100)) : 0;
    const concentration = Number(vial.concentration_mg_ml) || 0;
    const doseMg = Number(vial.dose_amount_mg) || 0;
    const units = calculateDoseUnits(doseMg, concentration);
    const scheduleLabel = getScheduleLabel(vial);
    const TimeIcon = vial.dose_time_of_day ? TIME_ICONS[vial.dose_time_of_day as keyof typeof TIME_ICONS] : null;

    // Match current dose against knowledge tiers
    const matchedTier = knowledge?.dosingTiers?.find(t => {
        const tierMg = t.doseUnit === 'mcg' ? t.doseAmount / 1000 : t.doseAmount;
        return Math.abs(tierMg - doseMg) < 0.01;
    });

    // Dose count estimation
    const dosesRemaining = doseMg > 0 ? Math.floor(vial.current_quantity_mg / doseMg) : null;

    // Supply duration (days remaining based on schedule)
    const dailyUsage = vialDailyUsage(vial);
    const daysRemaining = dailyUsage > 0 ? Math.floor(vial.current_quantity_mg / dailyUsage) : null;
    const supplyStatus = daysRemaining !== null ? getVialSupplyStatus(daysRemaining) : null;

    // Depletion date
    const depletionDate = daysRemaining && daysRemaining > 0
        ? format(new Date(Date.now() + daysRemaining * 86400000), 'MMM d')
        : null;

    // Next dose date (scan forward up to 14 days)
    const nextDoseInfo = useMemo(() => {
        if (!vial.dose_frequency) return null;
        const today = new Date();
        for (let i = 0; i <= 14; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() + i);
            const dayAbbr = format(checkDate, 'EEE');
            if (isDoseDay(vial, dayAbbr, checkDate)) {
                return { daysAway: i };
            }
        }
        return null;
    }, [vial]);

    const hasProtocolInfo = knowledge && (knowledge.description || knowledge.supplementNotes?.length || knowledge.cyclePattern || knowledge.dosageSchedule);

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
                    <div className="flex items-center gap-2">
                        <p className="font-semibold text-[15px] tracking-tight">{vial.peptide?.name || 'Unknown'}</p>
                        {matchedTier && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                {matchedTier.label}
                            </span>
                        )}
                    </div>
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
                    <span className="text-muted-foreground/60 font-medium flex items-center gap-1.5 flex-wrap">
                        <span>
                            {Number(vial.current_quantity_mg).toFixed(1)}mg remaining
                            {dosesRemaining !== null && dosesRemaining > 0 && (
                                <span className="text-muted-foreground/40 ml-1">
                                    ({dosesRemaining} dose{dosesRemaining !== 1 ? 's' : ''})
                                </span>
                            )}
                        </span>
                        {supplyStatus && daysRemaining !== null && (
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white",
                                getSupplyStatusColor(supplyStatus)
                            )}>
                                {getSupplyStatusLabel(daysRemaining)}
                            </span>
                        )}
                        {depletionDate && (
                            <span className="text-[10px] text-muted-foreground/40">~{depletionDate}</span>
                        )}
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

            {/* Next dose indicator (only when not due today) */}
            {!isDueToday && nextDoseInfo && nextDoseInfo.daysAway > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                    <CalendarClock className="h-3 w-3" />
                    <span>
                        {nextDoseInfo.daysAway === 1
                            ? 'Next dose tomorrow'
                            : `Next dose in ${nextDoseInfo.daysAway} days`}
                    </span>
                </div>
            )}

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

            {/* Warning (always visible — safety-critical, never hidden) */}
            {knowledge?.warningText && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/15">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-amber-400/80">{knowledge.warningText}</span>
                </div>
            )}

            {/* Low stock warning — show if % low OR supply < 3 days */}
            {(isLow || supplyStatus === 'critical' || supplyStatus === 'depleted') && (
                <button
                    onClick={() => navigate(`/store?reorder=${encodeURIComponent(JSON.stringify([{
                        peptide_name: vial.peptide?.name || '',
                        peptide_id: vial.peptide_id,
                        quantity: 1,
                    }]))}`)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/15 transition-colors hover:bg-amber-500/[0.12]"
                >
                    <ShoppingBag className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-amber-400">Running low — Reorder</span>
                    {daysRemaining !== null && supplyStatus && (
                        <span className={cn(
                            "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-white",
                            getSupplyStatusColor(supplyStatus)
                        )}>
                            {getSupplyStatusLabel(daysRemaining)}
                        </span>
                    )}
                </button>
            )}

            {/* Protocol Info (collapsible) */}
            {hasProtocolInfo && (
                <div>
                    <button
                        onClick={() => setInfoOpen(!infoOpen)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[12px] text-muted-foreground/50 hover:bg-white/[0.05] hover:text-muted-foreground/70 transition-all"
                    >
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 text-left font-medium">Protocol Details</span>
                        {infoOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {infoOpen && (
                        <div className="mt-2.5 space-y-2.5 animate-fade-in">
                            {/* Description */}
                            {knowledge.description && (
                                <p className="text-[12px] text-muted-foreground/60 leading-relaxed">{knowledge.description}</p>
                            )}

                            {/* Cycle pattern */}
                            {knowledge.cyclePattern && (
                                <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <span className="text-[11px] font-medium text-muted-foreground/50">Cycle: </span>
                                    <span className="text-[12px] text-muted-foreground/70">{knowledge.cyclePattern}</span>
                                </div>
                            )}

                            {/* Dosage schedule */}
                            {knowledge.dosageSchedule && (
                                <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <span className="text-[11px] font-medium text-muted-foreground/50 block mb-1">Schedule</span>
                                    <span className="text-[12px] text-muted-foreground/70 whitespace-pre-line">{knowledge.dosageSchedule}</span>
                                </div>
                            )}

                            {/* Supplements */}
                            {knowledge.supplementNotes && knowledge.supplementNotes.length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[11px] font-medium text-muted-foreground/50 flex items-center gap-1">
                                        <Pill className="h-3 w-3" /> Recommended Supplements
                                    </span>
                                    {knowledge.supplementNotes.map((supp, idx) => (
                                        <div key={idx} className="px-3 py-2 rounded-xl bg-blue-500/[0.06] border border-blue-500/15 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-[12px] font-medium text-blue-400">{supp.name}</span>
                                                    <span className="text-[11px] text-blue-400/50">{supp.dosage}</span>
                                                </div>
                                                {supp.productLink && (
                                                    <a
                                                        href={supp.productLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] font-medium text-blue-400 underline shrink-0 ml-2"
                                                    >
                                                        Amazon
                                                    </a>
                                                )}
                                            </div>
                                            {supp.reason && (
                                                <p className="text-[11px] text-blue-400/40 leading-relaxed">{supp.reason}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
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
    const sizeMg = Number(vial.vial_size_mg) || 0;
    const pct = sizeMg > 0 ? Math.min(100, Math.max(0, (Number(vial.current_quantity_mg) / sizeMg) * 100)) : 0;
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

    // Build knowledge map for all peptides in inventory
    const knowledgeMap = useMemo(() => {
        const map = new Map<string, PeptideKnowledge | null>();
        for (const vial of activeVials) {
            const name = vial.peptide?.name;
            if (name && !map.has(name)) {
                map.set(name, lookupKnowledge(name));
            }
        }
        return map;
    }, [activeVials]);

    const getKnowledge = (vial: ClientInventoryItem) => knowledgeMap.get(vial.peptide?.name || '') ?? null;

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
                    ) : (() => {
                        // Group vials by state category for clear section headers
                        const unmixed = sortedFridge.filter(v => getVialState(v, todayAbbr) === 'unmixed');
                        const needsSchedule = sortedFridge.filter(v => getVialState(v, todayAbbr) === 'needs_schedule');
                        const active = sortedFridge.filter(v => !['unmixed', 'needs_schedule'].includes(getVialState(v, todayAbbr)));

                        const renderVial = (vial: ClientInventoryItem) => {
                            const state = getVialState(vial, todayAbbr);
                            const k = getKnowledge(vial);
                            switch (state) {
                                case 'unmixed':
                                    return <UnmixedCard key={vial.id} vial={vial} actions={actions} knowledge={k} />;
                                case 'needs_schedule':
                                    return <NeedsScheduleCard key={vial.id} vial={vial} actions={actions} knowledge={k} />;
                                case 'due_today':
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday isLow={false} actions={actions} knowledge={k} />;
                                case 'low_stock': {
                                    const isDue = isDoseDay(vial, todayAbbr);
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday={isDue} isLow actions={actions} knowledge={k} />;
                                }
                                case 'not_today':
                                    return <ActiveCard key={vial.id} vial={vial} isDueToday={false} isLow={false} actions={actions} knowledge={k} />;
                            }
                        };

                        return (
                            <>
                                {/* Section: Ready to Mix */}
                                {unmixed.length > 0 && (
                                    <div className="space-y-2.5">
                                        <div className="flex items-center gap-2 px-1">
                                            <Beaker className="h-3.5 w-3.5 text-amber-400" />
                                            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Ready to Mix</span>
                                            <span className="text-[10px] text-muted-foreground/40 bg-white/[0.04] px-2 py-0.5 rounded-full">{unmixed.length}</span>
                                        </div>
                                        {unmixed.map(renderVial)}
                                    </div>
                                )}

                                {/* Section: Set Your Schedule */}
                                {needsSchedule.length > 0 && (
                                    <div className="space-y-2.5">
                                        {unmixed.length > 0 && <div className="h-px bg-white/[0.04]" />}
                                        <div className="flex items-center gap-2 px-1">
                                            <Sun className="h-3.5 w-3.5 text-blue-400" />
                                            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Set Your Schedule</span>
                                            <span className="text-[10px] text-muted-foreground/40 bg-white/[0.04] px-2 py-0.5 rounded-full">{needsSchedule.length}</span>
                                        </div>
                                        {needsSchedule.map(renderVial)}
                                    </div>
                                )}

                                {/* Section: Active in Fridge */}
                                {active.length > 0 && (
                                    <div className="space-y-2.5">
                                        {(unmixed.length > 0 || needsSchedule.length > 0) && <div className="h-px bg-white/[0.04]" />}
                                        <div className="flex items-center gap-2 px-1">
                                            <Droplets className="h-3.5 w-3.5 text-emerald-400" />
                                            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">In Your Fridge</span>
                                            <span className="text-[10px] text-muted-foreground/40 bg-white/[0.04] px-2 py-0.5 rounded-full">{active.length}</span>
                                        </div>
                                        {active.map(renderVial)}
                                    </div>
                                )}
                            </>
                        );
                    })()}

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
