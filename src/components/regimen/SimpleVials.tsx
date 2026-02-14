import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Droplets, ShoppingBag, Syringe, Check, XCircle, Beaker, ChevronDown, ChevronUp, Plus, ArrowUpFromLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVialActions } from '@/hooks/use-vial-actions';
import { DAYS_OF_WEEK, FREQUENCY_OPTIONS, isDoseDay, getScheduleLabel } from '@/types/regimen';
import type { DoseFrequency } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SimpleVialsProps {
    inventory: any[];
    contactId?: string;
}

type VialState = 'unmixed' | 'needs_schedule' | 'due_today' | 'not_today' | 'low_stock';

function getVialState(vial: any, todayAbbr: string): VialState {
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
    const [frequency, setFrequency] = useState<DoseFrequency | ''>('');
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
        if (!doseMg || parseFloat(doseMg) <= 0 || !frequency) return false;
        if (frequency === 'specific_days' && selectedDays.length === 0) return false;
        if (frequency === 'every_x_days' && (!interval || parseInt(interval) < 1)) return false;
        if (frequency === 'x_on_y_off' && (!onDays || parseInt(onDays) < 1 || !offDays || parseInt(offDays) < 1)) return false;
        return true;
    };

    const handleSave = () => {
        actions.setSchedule.mutate({
            vialId: vial.id,
            doseAmountMg: parseFloat(doseMg),
            doseFrequency: frequency,
            doseDays: frequency === 'specific_days' ? selectedDays : undefined,
            doseInterval: frequency === 'every_x_days' ? parseInt(interval)
                : frequency === 'x_on_y_off' ? parseInt(onDays) : undefined,
            doseOffDays: frequency === 'x_on_y_off' ? parseInt(offDays) : undefined,
        });
    };

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

            {/* Frequency selector */}
            <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">How often?</label>
                <div className="flex flex-wrap gap-1.5">
                    {FREQUENCY_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFrequency(opt.value)}
                            className={cn(
                                "px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all border",
                                frequency === opt.value
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                    : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Conditional inputs based on frequency */}
            {frequency === 'every_x_days' && (
                <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Every how many days?</label>
                    <Input
                        type="number"
                        min="1"
                        placeholder="e.g. 5"
                        value={interval}
                        onChange={e => setInterval(e.target.value)}
                        className="h-8 text-sm"
                    />
                </div>
            )}

            {frequency === 'x_on_y_off' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Days on</label>
                        <Input
                            type="number"
                            min="1"
                            placeholder="e.g. 5"
                            value={onDays}
                            onChange={e => setOnDays(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Days off</label>
                        <Input
                            type="number"
                            min="1"
                            placeholder="e.g. 2"
                            value={offDays}
                            onChange={e => setOffDays(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>
            )}

            {frequency === 'specific_days' && (
                <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Which days?</label>
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
            )}

            <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!canSave() || actions.setSchedule.isPending}
                onClick={handleSave}
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
    const scheduleLabel = getScheduleLabel(vial);

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

            {isDueToday && doseMg > 0 && (
                <div className="flex items-center gap-2 text-xs">
                    <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">{doseMg}mg dose = {units} units</span>
                </div>
            )}

            {scheduleLabel && (
                <p className="text-xs text-muted-foreground">{scheduleLabel}</p>
            )}

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

// ─── Storage Vial Row ─────────────────────────────────────────
function StorageRow({ vial, actions }: { vial: any; actions: ReturnType<typeof useVialActions> }) {
    const pct = Math.min(100, Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100));
    const isMixed = !!vial.concentration_mg_ml;

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 p-2.5">
            <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{vial.peptide?.name || 'Unknown'}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{vial.vial_size_mg}mg</span>
                    <span>·</span>
                    {isMixed ? (
                        <span className="text-emerald-400">{Number(vial.concentration_mg_ml).toFixed(2)} mg/ml</span>
                    ) : (
                        <span className="text-amber-400">Unmixed</span>
                    )}
                    <span>·</span>
                    <span>{Math.round(pct)}% left</span>
                </div>
            </div>
            <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 shrink-0"
                disabled={actions.toggleFridge.isPending}
                onClick={() => actions.toggleFridge.mutate({ vialId: vial.id, inFridge: true })}
            >
                <Plus className="h-3.5 w-3.5 mr-1" />
                To Fridge
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
            <GlassCard className="border-emerald-500/10">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                            <Droplets className="w-4 h-4" />
                        </div>
                        My Fridge
                        {fridgeVials.length > 0 && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {fridgeVials.length} vial{fridgeVials.length !== 1 ? 's' : ''}
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {sortedFridge.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground border-2 border-dashed border-border/50 rounded-lg">
                            <Droplets className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                            <p className="text-sm">Your fridge is empty.</p>
                            <p className="text-xs mt-0.5">
                                {storageVials.length > 0
                                    ? 'Tap "My Vials" below to move vials to your fridge.'
                                    : 'Vials from your orders will appear here.'}
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

                    {sortedFridge.length > 0 && (
                        <div className="pt-1 border-t border-border/30">
                            <p className="text-[10px] text-muted-foreground/60 text-center mb-2">
                                Tap to move back to storage
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {sortedFridge.map(vial => (
                                    <button
                                        key={vial.id}
                                        onClick={() => actions.toggleFridge.mutate({ vialId: vial.id, inFridge: false })}
                                        className="text-[10px] px-2 py-1 rounded-full bg-secondary/50 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    >
                                        {vial.peptide?.name || 'Unknown'} ×
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </GlassCard>

            {/* ─── Storage (collapsible) ─── */}
            {storageVials.length > 0 && (
                <GlassCard className="border-border/30">
                    <button
                        onClick={() => setStorageOpen(prev => !prev)}
                        className="w-full flex items-center justify-between p-4 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">My Vials</span>
                            <Badge variant="secondary" className="text-xs">
                                {storageVials.length}
                            </Badge>
                        </div>
                        {storageOpen
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                    </button>
                    {storageOpen && (
                        <CardContent className="pt-0 space-y-2">
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
