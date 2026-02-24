import { useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DAYS_OF_WEEK, isDoseDay, type ClientInventoryItem } from '@/types/regimen';
import { cn } from '@/lib/utils';
import {
    format, addMonths, subMonths,
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
    isSameDay, isSameMonth, isToday, startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Check, Syringe, ChevronDown, ChevronUp } from 'lucide-react';
import { vialDailyUsage } from '@/lib/supply-calculations';

const DOT_COLORS = [
    'bg-emerald-400', 'bg-blue-400', 'bg-amber-400', 'bg-violet-400',
    'bg-rose-400', 'bg-cyan-400', 'bg-orange-400', 'bg-pink-400',
];

/** Strip trailing vial size from peptide names: "Ipamorelin 10mg" → "Ipamorelin" */
function cleanPeptideName(name: string): string {
    return name.replace(/\s+\d+\s*mg$/i, '').trim() || name;
}

/** Sort order for time of day */
function timeSort(t: string | null): number {
    if (t === 'morning') return 0;
    if (t === 'afternoon') return 1;
    if (t === 'evening') return 2;
    return 3;
}

interface ProtocolCalendarProps {
    inventory: ClientInventoryItem[];
    protocolLogs?: Array<{ taken_at?: string; created_at: string; protocol_item_id?: string | null; client_inventory_id?: string | null; status: string }>;
    onLogDose?: (params: { itemId?: string; inventoryItemId?: string; status?: string; takenAt?: string }) => void;
    isLogging?: boolean;
}

interface DayDose {
    peptideName: string;
    doseAmountMg: number;
    timeOfDay: string | null;
    vialId: string;
    protocolItemId: string | null;
    colorIdx: number;
    isTaken: boolean;
}

export function ProtocolCalendar({ inventory, protocolLogs = [], onLogDose, isLogging }: ProtocolCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);

    const now = useMemo(() => new Date(), []);
    const todayStart = useMemo(() => startOfDay(now), [now]);

    const scheduledVials = useMemo(() =>
        inventory.filter(v => v.in_fridge && v.concentration_mg_ml && v.dose_frequency && v.dose_amount_mg),
        [inventory],
    );

    // Assign a stable color index per peptide
    const peptideColorMap = useMemo(() => {
        const map = new Map<string, number>();
        let idx = 0;
        for (const v of scheduledVials) {
            const key = v.peptide_id || v.id;
            if (!map.has(key)) { map.set(key, idx % DOT_COLORS.length); idx++; }
        }
        return map;
    }, [scheduledVials]);

    // Pre-index protocol logs by date+itemId for O(1) lookup
    const logIndex = useMemo(() => {
        const idx = new Set<string>();
        for (const log of protocolLogs) {
            const dateKey = format(new Date(log.taken_at || log.created_at), 'yyyy-MM-dd');
            if (log.protocol_item_id) idx.add(`${dateKey}:pi:${log.protocol_item_id}`);
            if (log.client_inventory_id) idx.add(`${dateKey}:ci:${log.client_inventory_id}`);
        }
        return idx;
    }, [protocolLogs]);

    // Compute doses for ANY given day
    const getDosesForDay = useMemo(() => {
        return (day: Date): DayDose[] => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayAbbr = format(day, 'EEE') as typeof DAYS_OF_WEEK[number];
            const doses: DayDose[] = [];

            for (const vial of scheduledVials) {
                if (isDoseDay(vial, dayAbbr, day)) {
                    const colorIdx = peptideColorMap.get(vial.peptide_id || vial.id) ?? 0;
                    const isTaken = (vial.protocol_item_id && logIndex.has(`${dayKey}:pi:${vial.protocol_item_id}`))
                        || logIndex.has(`${dayKey}:ci:${vial.id}`);

                    doses.push({
                        peptideName: vial.peptide?.name || 'Peptide',
                        doseAmountMg: Number(vial.dose_amount_mg) || 0,
                        timeOfDay: vial.dose_time_of_day,
                        vialId: vial.id,
                        protocolItemId: vial.protocol_item_id || null,
                        colorIdx,
                        isTaken,
                    });
                }
            }
            // Sort by time of day: AM → Noon → PM → unset
            return doses.sort((a, b) => timeSort(a.timeOfDay) - timeSort(b.timeOfDay));
        };
    }, [scheduledVials, logIndex, peptideColorMap]);

    // Today's doses — always computed, independent of calendar
    const todayDoses = useMemo(() => getDosesForDay(now), [getDosesForDay, now]);

    // Selected day's doses (when browsing calendar)
    const selectedDayDoses = useMemo(() =>
        selectedDay ? getDosesForDay(selectedDay) : [],
        [selectedDay, getDosesForDay],
    );

    // Calendar grid (month only)
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: gridStart, end: gridEnd });
    }, [currentDate]);

    // Calendar doses map
    const calendarDosesMap = useMemo(() => {
        const map = new Map<string, DayDose[]>();
        for (const day of calendarDays) {
            map.set(format(day, 'yyyy-MM-dd'), getDosesForDay(day));
        }
        return map;
    }, [calendarDays, getDosesForDay]);

    // ── Supply runway: per-peptide depletion ──
    interface PeptideDepletion {
        peptideId: string;
        peptideName: string;
        daysRemaining: number;
        status: 'adequate' | 'low' | 'critical' | 'depleted';
        colorIdx: number;
    }

    const peptideDepletions = useMemo<PeptideDepletion[]>(() => {
        const groups = new Map<string, typeof scheduledVials>();
        for (const v of scheduledVials) {
            const key = v.peptide_id || v.id;
            const arr = groups.get(key) || [];
            arr.push(v);
            groups.set(key, arr);
        }

        return Array.from(groups.entries()).map(([peptideId, vials]) => {
            const totalMg = vials.reduce((s, v) => s + (Number(v.current_quantity_mg) || 0), 0);
            const daily = vialDailyUsage(vials[0]);
            const daysRemaining = daily > 0 ? Math.floor(totalMg / daily) : 0;
            const status: PeptideDepletion['status'] = daysRemaining <= 0 ? 'depleted'
                : daysRemaining < 3 ? 'critical'
                : daysRemaining < 7 ? 'low'
                : 'adequate';
            return { peptideId, peptideName: vials[0].peptide?.name || 'Peptide', daysRemaining, status, colorIdx: peptideColorMap.get(peptideId) ?? 0 };
        }).sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [scheduledVials, peptideColorMap]);

    // ── Group doses by time of day for the daily view ──
    function groupByTime(doses: DayDose[]): { label: string; doses: DayDose[] }[] {
        const groups: { label: string; doses: DayDose[] }[] = [];
        const am = doses.filter(d => d.timeOfDay === 'morning');
        const noon = doses.filter(d => d.timeOfDay === 'afternoon');
        const pm = doses.filter(d => d.timeOfDay === 'evening');
        const other = doses.filter(d => !d.timeOfDay);

        if (am.length) groups.push({ label: 'Morning (AM)', doses: am });
        if (noon.length) groups.push({ label: 'Afternoon', doses: noon });
        if (pm.length) groups.push({ label: 'Evening (PM)', doses: pm });
        if (other.length) groups.push({ label: doses.length === other.length ? 'Your Doses' : 'Other', doses: other });
        // If no time-of-day is set on any, just show flat
        if (groups.length === 0 && doses.length > 0) groups.push({ label: 'Your Doses', doses });
        return groups;
    }

    // ── Render a dose card (reused for today + selected day) ──
    function renderDoseCard(dose: DayDose, day: Date, i: number) {
        const isPast = startOfDay(day) < todayStart;
        return (
            <div
                key={i}
                className={cn(
                    "flex items-center gap-4 px-5 py-4 rounded-2xl",
                    dose.isTaken
                        ? 'bg-emerald-500/10 border-2 border-emerald-500/30'
                        : 'bg-muted/20 border-2 border-border/20',
                )}
            >
                <div className={cn("h-4 w-4 rounded-full shrink-0", DOT_COLORS[dose.colorIdx])} />
                <div className="flex-1 min-w-0">
                    <div className={cn(
                        "text-base font-bold leading-snug",
                        dose.isTaken && 'line-through text-muted-foreground/50',
                    )}>
                        {cleanPeptideName(dose.peptideName)}
                    </div>
                    <div className="text-sm text-muted-foreground/60 mt-0.5">
                        {dose.doseAmountMg}mg dose
                    </div>
                </div>
                {dose.isTaken ? (
                    <div className="flex items-center gap-2 text-emerald-400 shrink-0">
                        <Check className="h-6 w-6" />
                        <span className="text-base font-bold">Done</span>
                    </div>
                ) : onLogDose && !isPast ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onLogDose({ itemId: dose.protocolItemId || undefined, inventoryItemId: dose.vialId, status: 'taken', takenAt: format(day, "yyyy-MM-dd'T'12:00:00") }); }}
                        disabled={isLogging}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                    >
                        <Syringe className="h-5 w-5" />
                        {isLogging ? 'Saving...' : 'Take'}
                    </button>
                ) : isPast && !dose.isTaken ? (
                    <span className="text-sm text-red-400/70 font-semibold shrink-0">Missed</span>
                ) : (
                    <span className="text-sm text-muted-foreground/40 font-medium shrink-0">Upcoming</span>
                )}
            </div>
        );
    }

    // ── Empty state ──
    if (scheduledVials.length === 0) {
        return (
            <GlassCard className="border-white/[0.04]">
                <CardContent className="py-10 text-center space-y-3">
                    <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-lg font-bold text-muted-foreground/60">No schedule set up yet</p>
                    <p className="text-base text-muted-foreground/40 max-w-[340px] mx-auto leading-relaxed">
                        Once your provider sets up a dosing schedule, your daily doses will appear here.
                    </p>
                </CardContent>
            </GlassCard>
        );
    }

    // ── Which day detail to show (selected from calendar, or null) ──
    const showingDay = selectedDay;
    const showingDoses = selectedDayDoses;
    const isShowingToday = showingDay ? isToday(showingDay) : false;

    // Today's progress
    const todayTakenCount = todayDoses.filter(d => d.isTaken).length;
    const todayTotalCount = todayDoses.length;
    const todayAllDone = todayTotalCount > 0 && todayTakenCount === todayTotalCount;

    return (
        <div className="space-y-4">
            {/* ═══════════════════════════════════════════════ */}
            {/* TODAY'S DOSES — The main thing a user cares about */}
            {/* ═══════════════════════════════════════════════ */}
            <GlassCard className="border-white/[0.04]">
                <CardContent className="py-5 px-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold">
                                {todayAllDone ? 'All Done Today!' : "Today's Doses"}
                            </h2>
                            <p className="text-sm text-muted-foreground/60 mt-0.5">
                                {format(now, 'EEEE, MMMM d')}
                                {todayTotalCount > 0 && (
                                    <span className="ml-2 font-semibold">
                                        {todayAllDone
                                            ? '— Great job!'
                                            : `— ${todayTakenCount} of ${todayTotalCount} done`
                                        }
                                    </span>
                                )}
                            </p>
                        </div>
                        {todayAllDone && (
                            <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Check className="h-7 w-7 text-emerald-400" />
                            </div>
                        )}
                    </div>

                    {/* Dose list grouped by time of day */}
                    {todayDoses.length === 0 ? (
                        <div className="text-center py-6 text-base text-muted-foreground/50">
                            No doses scheduled for today.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groupByTime(todayDoses).map(group => (
                                <div key={group.label} className="space-y-2">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50 px-1">
                                        {group.label}
                                    </h3>
                                    {group.doses.map((dose, i) => renderDoseCard(dose, now, i))}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Supply summary — simple text, not bars */}
                    {peptideDepletions.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-border/20">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
                                Supply Left
                            </h3>
                            <div className="space-y-2">
                                {peptideDepletions.map(dep => (
                                    <div key={dep.peptideId} className="flex items-center gap-3">
                                        <div className={cn("h-3 w-3 rounded-full shrink-0", DOT_COLORS[dep.colorIdx])} />
                                        <span className="text-base font-medium text-foreground/80 flex-1">
                                            {cleanPeptideName(dep.peptideName)}
                                        </span>
                                        <span className={cn(
                                            "text-base font-bold",
                                            dep.status === 'adequate' ? 'text-green-400'
                                                : dep.status === 'low' ? 'text-yellow-400'
                                                : dep.status === 'critical' ? 'text-orange-400'
                                                : 'text-red-400',
                                        )}>
                                            {dep.daysRemaining <= 0 ? 'Empty!' : `${dep.daysRemaining} days`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </GlassCard>

            {/* ═══════════════════════════════════════════════ */}
            {/* CALENDAR — Collapsible, for browsing other days */}
            {/* ═══════════════════════════════════════════════ */}
            <GlassCard className="border-white/[0.04]">
                <CardContent className="py-3 px-4">
                    <button
                        onClick={() => { setCalendarOpen(prev => !prev); if (calendarOpen) setSelectedDay(null); }}
                        className="flex items-center justify-between w-full py-1"
                    >
                        <span className="text-sm font-bold text-muted-foreground/70">
                            Calendar
                        </span>
                        {calendarOpen
                            ? <ChevronUp className="h-5 w-5 text-muted-foreground/50" />
                            : <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
                        }
                    </button>

                    {calendarOpen && (
                        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Month nav */}
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setCurrentDate(prev => subMonths(prev, 1)); setSelectedDay(null); }}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <button
                                    onClick={() => { setCurrentDate(new Date()); setSelectedDay(null); }}
                                    className="text-sm font-semibold min-w-[140px] text-center hover:text-primary transition-colors"
                                >
                                    {format(currentDate, 'MMMM yyyy')}
                                </button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setCurrentDate(prev => addMonths(prev, 1)); setSelectedDay(null); }}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Day-of-week headers */}
                            <div className="grid grid-cols-7 mb-1">
                                {DAYS_OF_WEEK.map(d => (
                                    <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 py-1">
                                        {d.slice(0, 3)}
                                    </div>
                                ))}
                            </div>

                            {/* Day grid — compact */}
                            <div className="grid grid-cols-7 gap-0.5">
                                {calendarDays.map(day => {
                                    const dayKey = format(day, 'yyyy-MM-dd');
                                    const dayDoses = calendarDosesMap.get(dayKey) || [];
                                    const isCurrentMonth = isSameMonth(day, currentDate);
                                    const isTodayCell = isToday(day);
                                    const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                                    const allTaken = dayDoses.length > 0 && dayDoses.every(d => d.isTaken);
                                    const isPast = day < todayStart;
                                    const hasMissed = isPast && dayDoses.length > 0 && dayDoses.some(d => !d.isTaken);

                                    return (
                                        <button
                                            key={dayKey}
                                            onClick={() => setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day)}
                                            className={cn(
                                                "relative flex flex-col items-center justify-center rounded-lg h-10 transition-all",
                                                isTodayCell && 'ring-2 ring-primary/50',
                                                isSelected && 'bg-primary/15 ring-2 ring-primary/60',
                                                !isCurrentMonth && 'opacity-25',
                                                dayDoses.length > 0 && !isSelected && !isTodayCell && 'hover:bg-white/[0.06]',
                                            )}
                                        >
                                            <span className={cn(
                                                "text-xs font-semibold",
                                                isTodayCell ? 'text-primary font-bold' : isPast ? 'text-muted-foreground/40' : 'text-foreground/80',
                                            )}>
                                                {format(day, 'd')}
                                            </span>

                                            {dayDoses.length > 0 && (
                                                <div className="flex gap-0.5 mt-0.5">
                                                    {dayDoses.slice(0, 4).map((dose, i) => (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "h-1 w-1 rounded-full",
                                                                dose.isTaken ? 'bg-emerald-400' : isPast ? 'bg-red-400/50' : DOT_COLORS[dose.colorIdx],
                                                            )}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {allTaken && (
                                                <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 flex items-center justify-center">
                                                    <Check className="h-2 w-2 text-white" />
                                                </div>
                                            )}
                                            {hasMissed && !allTaken && (
                                                <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500/60" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Selected day detail (from calendar click) */}
                            {showingDay && !isShowingToday && (
                                <div className="mt-4 pt-3 border-t border-border/20 space-y-2 animate-in fade-in duration-200">
                                    <div className="text-base font-bold text-foreground/90">
                                        {format(showingDay, 'EEEE, MMMM d')}
                                    </div>
                                    {showingDoses.length === 0 ? (
                                        <p className="text-sm text-muted-foreground/50 py-2">No doses scheduled</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {groupByTime(showingDoses).map(group => (
                                                <div key={group.label} className="space-y-1.5">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/40 px-1">
                                                        {group.label}
                                                    </h4>
                                                    {group.doses.map((dose, i) => renderDoseCard(dose, showingDay, i))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* If they clicked today in the calendar, nudge them up */}
                            {isShowingToday && (
                                <div className="mt-3 text-center">
                                    <p className="text-sm text-muted-foreground/50">Today's doses are shown above</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </GlassCard>
        </div>
    );
}
