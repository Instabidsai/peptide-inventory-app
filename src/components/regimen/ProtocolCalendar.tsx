import { useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DAYS_OF_WEEK, isDoseDay, type ClientInventoryItem } from '@/types/regimen';
import { cn } from '@/lib/utils';
import {
    format, addMonths, subMonths, addWeeks, subWeeks,
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameDay, isSameMonth, isToday,
    startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, LayoutList, Check, Dot, AlertTriangle, Syringe } from 'lucide-react';
import { vialDailyUsage } from '@/lib/supply-calculations';

const DOT_COLORS = [
    'bg-emerald-400', 'bg-blue-400', 'bg-amber-400', 'bg-violet-400',
    'bg-rose-400', 'bg-cyan-400', 'bg-orange-400', 'bg-pink-400',
];

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
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);

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
    // Supports both protocol_item_id and client_inventory_id keys
    const logIndex = useMemo(() => {
        const idx = new Set<string>();
        for (const log of protocolLogs) {
            const dateKey = format(new Date(log.taken_at || log.created_at), 'yyyy-MM-dd');
            if (log.protocol_item_id) idx.add(`${dateKey}:pi:${log.protocol_item_id}`);
            if (log.client_inventory_id) idx.add(`${dateKey}:ci:${log.client_inventory_id}`);
        }
        return idx;
    }, [protocolLogs]);

    // Build day grid
    const days = useMemo(() => {
        if (viewMode === 'month') {
            const monthStart = startOfMonth(currentDate);
            const monthEnd = endOfMonth(currentDate);
            const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
            const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
            return eachDayOfInterval({ start: gridStart, end: gridEnd });
        }
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [viewMode, currentDate]);

    // Compute doses per day
    const dosesMap = useMemo(() => {
        const map = new Map<string, DayDose[]>();
        for (const day of days) {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayAbbr = format(day, 'EEE') as typeof DAYS_OF_WEEK[number];
            const dayDoses: DayDose[] = [];

            for (const vial of scheduledVials) {
                if (isDoseDay(vial, dayAbbr, day)) {
                    const colorIdx = peptideColorMap.get(vial.peptide_id || vial.id) ?? 0;
                    const isTaken = (vial.protocol_item_id && logIndex.has(`${dayKey}:pi:${vial.protocol_item_id}`))
                        || logIndex.has(`${dayKey}:ci:${vial.id}`);

                    dayDoses.push({
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
            map.set(dayKey, dayDoses);
        }
        return map;
    }, [days, scheduledVials, logIndex, peptideColorMap]);

    // ── Supply runway: per-peptide depletion dates ──
    interface PeptideDepletion {
        peptideId: string;
        peptideName: string;
        depletionDate: Date;
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
            const depletionDate = new Date(Date.now() + daysRemaining * 86400000);
            const status: PeptideDepletion['status'] = daysRemaining <= 0 ? 'depleted'
                : daysRemaining < 3 ? 'critical'
                : daysRemaining < 7 ? 'low'
                : 'adequate';
            return {
                peptideId,
                peptideName: vials[0].peptide?.name || 'Peptide',
                depletionDate,
                daysRemaining,
                status,
                colorIdx: peptideColorMap.get(peptideId) ?? 0,
            };
        }).sort((a, b) => a.daysRemaining - b.daysRemaining);
    }, [scheduledVials, peptideColorMap]);

    // Index: which peptides deplete on which calendar day?
    const depletionDayIndex = useMemo(() => {
        const map = new Map<string, PeptideDepletion[]>();
        for (const d of peptideDepletions) {
            if (d.daysRemaining > 0) {
                const key = format(d.depletionDate, 'yyyy-MM-dd');
                const arr = map.get(key) || [];
                arr.push(d);
                map.set(key, arr);
            }
        }
        return map;
    }, [peptideDepletions]);

    const handleNav = (dir: 'prev' | 'next') => {
        if (viewMode === 'month') {
            setCurrentDate(prev => dir === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
        } else {
            setCurrentDate(prev => dir === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
        }
        setSelectedDay(null);
    };

    const handleToday = () => {
        setCurrentDate(new Date());
        setSelectedDay(null);
    };

    const handleDayClick = (day: Date) => {
        setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day);
    };

    if (scheduledVials.length === 0) {
        return (
            <GlassCard className="border-white/[0.04]">
                <CardContent className="py-6 text-center space-y-2">
                    <CalendarDays className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm font-medium text-muted-foreground/50">No schedule set up yet</p>
                    <p className="text-xs text-muted-foreground/30 max-w-[280px] mx-auto">
                        Once your provider sets up a dosing schedule for your vials, your calendar will appear here showing when each dose is due.
                    </p>
                </CardContent>
            </GlassCard>
        );
    }

    const isViewingCurrentPeriod = viewMode === 'month'
        ? isSameMonth(currentDate, now)
        : days.some(d => isToday(d));

    const headerLabel = viewMode === 'month'
        ? format(currentDate, 'MMMM yyyy')
        : `${format(days[0], 'MMM d')} – ${format(days[days.length - 1], 'MMM d, yyyy')}`;

    const selectedDayDoses = selectedDay
        ? dosesMap.get(format(selectedDay, 'yyyy-MM-dd')) || []
        : [];

    return (
        <GlassCard className="border-white/[0.04] overflow-hidden">
            <CardContent className="py-4 px-3">
                {/* Header: navigation + view toggle */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNav('prev')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <button
                            onClick={handleToday}
                            className="text-sm font-semibold min-w-[140px] text-center hover:text-primary transition-colors"
                            title="Jump to today"
                        >
                            {headerLabel}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleNav('next')}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {!isViewingCurrentPeriod && (
                            <button
                                onClick={handleToday}
                                className="text-[10px] text-primary/70 hover:text-primary font-medium transition-colors"
                            >
                                Today
                            </button>
                        )}
                        <div className="flex gap-0.5 bg-muted/30 rounded-lg p-0.5">
                            <button
                                onClick={() => { setViewMode('month'); setSelectedDay(null); }}
                                className={cn(
                                    "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                                    viewMode === 'month' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <CalendarDays className="h-3 w-3" />
                            </button>
                            <button
                                onClick={() => { setViewMode('week'); setSelectedDay(null); }}
                                className={cn(
                                    "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                                    viewMode === 'week' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <LayoutList className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                    {DAYS_OF_WEEK.map(d => (
                        <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 py-1">
                            {d.slice(0, 2)}
                        </div>
                    ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-px">
                    {days.map(day => {
                        const dayKey = format(day, 'yyyy-MM-dd');
                        const dayDoses = dosesMap.get(dayKey) || [];
                        const depletionsOnDay = depletionDayIndex.get(dayKey) || [];
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isTodayCell = isToday(day);
                        const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                        const allTaken = dayDoses.length > 0 && dayDoses.every(d => d.isTaken);
                        const isPast = day < todayStart;
                        const hasMissed = isPast && dayDoses.length > 0 && dayDoses.some(d => !d.isTaken);

                        return (
                            <button
                                key={dayKey}
                                onClick={() => handleDayClick(day)}
                                className={cn(
                                    "relative flex flex-col items-center rounded-xl transition-all duration-200",
                                    viewMode === 'month' ? 'h-11 justify-center py-1.5' : 'h-[72px] justify-start pt-1.5 gap-0.5',
                                    isTodayCell && 'ring-2 ring-primary/40',
                                    isSelected && 'bg-primary/15 ring-2 ring-primary/60',
                                    !isCurrentMonth && viewMode === 'month' && 'opacity-30',
                                    dayDoses.length > 0 && !isSelected && !isTodayCell && 'hover:bg-white/[0.04]',
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-medium leading-none",
                                    isTodayCell ? 'text-primary font-bold' : isPast ? 'text-muted-foreground/40' : 'text-foreground/80',
                                )}>
                                    {format(day, 'd')}
                                </span>

                                {/* Month view: compact dots */}
                                {viewMode === 'month' && dayDoses.length > 0 && (
                                    <div className="flex gap-0.5 mt-1">
                                        {dayDoses.slice(0, 4).map((dose, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "h-1 w-1 rounded-full",
                                                    dose.isTaken
                                                        ? 'bg-emerald-400/80'
                                                        : isPast
                                                            ? 'bg-red-400/50'
                                                            : DOT_COLORS[dose.colorIdx],
                                                )}
                                            />
                                        ))}
                                        {dayDoses.length > 4 && (
                                            <span className="text-[7px] text-muted-foreground/50 leading-none">+{dayDoses.length - 4}</span>
                                        )}
                                    </div>
                                )}

                                {/* Week view: show peptide names inline */}
                                {viewMode === 'week' && dayDoses.length > 0 && (
                                    <div className="flex flex-col items-center gap-px w-full px-0.5 overflow-hidden">
                                        {dayDoses.slice(0, 3).map((dose, i) => (
                                            <div key={i} className="flex items-center gap-0.5 w-full justify-center">
                                                <div className={cn(
                                                    "h-1 w-1 rounded-full shrink-0",
                                                    dose.isTaken ? 'bg-emerald-400/80' : isPast ? 'bg-red-400/50' : DOT_COLORS[dose.colorIdx],
                                                )} />
                                                <span className={cn(
                                                    "text-[8px] leading-tight truncate",
                                                    dose.isTaken ? 'text-emerald-400/60 line-through' : 'text-muted-foreground/50',
                                                )}>
                                                    {dose.peptideName.length > 8 ? dose.peptideName.slice(0, 7) + '…' : dose.peptideName}
                                                </span>
                                            </div>
                                        ))}
                                        {dayDoses.length > 3 && (
                                            <span className="text-[7px] text-muted-foreground/40">+{dayDoses.length - 3}</span>
                                        )}
                                    </div>
                                )}

                                {/* All-done checkmark */}
                                {allTaken && (
                                    <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 flex items-center justify-center">
                                        <Check className="h-2 w-2 text-white" />
                                    </div>
                                )}

                                {/* Missed indicator for past days with incomplete doses */}
                                {hasMissed && !allTaken && (
                                    <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500/60 flex items-center justify-center">
                                        <Dot className="h-3 w-3 text-white" />
                                    </div>
                                )}

                                {/* Depletion marker — colored bar on the day a peptide runs out */}
                                {depletionsOnDay.length > 0 && (
                                    <div className="absolute bottom-0 left-1 right-1 h-[3px] bg-gradient-to-r from-red-500 to-amber-500 rounded-full" />
                                )}

                                {/* Week view: show depletion warnings inline */}
                                {viewMode === 'week' && depletionsOnDay.length > 0 && (
                                    <div className="flex flex-col items-center gap-px w-full px-0.5">
                                        {depletionsOnDay.slice(0, 2).map((dep, i) => (
                                            <span key={`dep-${i}`} className="text-[7px] text-red-400 font-semibold truncate w-full text-center">
                                                {dep.peptideName} ends
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Expanded day detail */}
                {selectedDay && (() => {
                    const selectedDayDepletions = depletionDayIndex.get(format(selectedDay, 'yyyy-MM-dd')) || [];
                    return (
                    <div className="mt-3 pt-3 border-t border-border/20 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="text-xs font-semibold text-foreground/80">
                            {format(selectedDay, 'EEEE, MMMM d')}
                            {selectedDayDoses.length === 0 && selectedDayDepletions.length === 0 && (
                                <span className="text-muted-foreground/50 font-normal ml-2">No doses scheduled</span>
                            )}
                        </div>

                        {/* Depletion notices for this day */}
                        {selectedDayDepletions.map((dep, i) => (
                            <div key={`depl-${i}`}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium text-red-300">
                                        {dep.peptideName} supply runs out
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50 ml-2">
                                        {dep.daysRemaining} days from today
                                    </span>
                                </div>
                            </div>
                        ))}

                        {selectedDayDoses.map((dose, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg",
                                    dose.isTaken ? 'bg-emerald-500/10' : 'bg-muted/20',
                                )}
                            >
                                <div className={cn("h-2 w-2 rounded-full shrink-0", DOT_COLORS[dose.colorIdx])} />
                                <div className="flex-1 min-w-0">
                                    <span className={cn(
                                        "text-xs font-medium",
                                        dose.isTaken && 'line-through text-muted-foreground/60',
                                    )}>
                                        {dose.peptideName}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50 ml-2">
                                        {dose.doseAmountMg}mg
                                        {dose.timeOfDay && ` · ${dose.timeOfDay}`}
                                    </span>
                                </div>
                                {dose.isTaken ? (
                                    <div className="flex items-center gap-1 text-emerald-400">
                                        <Check className="h-3 w-3" />
                                        <span className="text-[10px] font-medium">Done</span>
                                    </div>
                                ) : onLogDose ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onLogDose({ itemId: dose.protocolItemId || undefined, inventoryItemId: dose.vialId, status: 'taken', takenAt: format(selectedDay, "yyyy-MM-dd'T'12:00:00") }); }}
                                        disabled={isLogging}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                                    >
                                        <Syringe className="h-3 w-3" />
                                        {isLogging ? 'Logging…' : 'Mark Taken'}
                                    </button>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground/40">
                                        {startOfDay(selectedDay) < todayStart ? 'Missed' : 'Scheduled'}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    );
                })()}

                {/* Legend */}
                {scheduledVials.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/10 space-y-1.5">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {Array.from(peptideColorMap.entries()).map(([peptideId, colorIdx]) => {
                                const vial = scheduledVials.find(v => (v.peptide_id || v.id) === peptideId);
                                return (
                                    <div key={peptideId} className="flex items-center gap-1">
                                        <div className={cn("h-1.5 w-1.5 rounded-full", DOT_COLORS[colorIdx])} />
                                        <span className="text-[9px] text-muted-foreground/50">{vial?.peptide?.name || 'Peptide'}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-3">
                            <div className="flex items-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                                <span className="text-[9px] text-muted-foreground/40">Taken</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-red-400/50" />
                                <span className="text-[9px] text-muted-foreground/40">Missed</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="h-[3px] w-3 bg-gradient-to-r from-red-500 to-amber-500 rounded-full" />
                                <span className="text-[9px] text-muted-foreground/40">Runs out</span>
                            </div>
                        </div>

                        {/* Supply Runway — per-peptide days remaining */}
                        {peptideDepletions.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border/10 space-y-1.5">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                                    Supply Runway
                                </span>
                                {peptideDepletions.map(dep => (
                                    <div key={dep.peptideId} className="flex items-center gap-2">
                                        <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT_COLORS[dep.colorIdx])} />
                                        <span className="text-[9px] text-muted-foreground/60 w-16 truncate">{dep.peptideName}</span>
                                        <div className="flex-1 h-1 bg-muted/20 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    dep.status === 'adequate' ? 'bg-green-500'
                                                        : dep.status === 'low' ? 'bg-yellow-500'
                                                        : dep.status === 'critical' ? 'bg-orange-500'
                                                        : 'bg-red-500',
                                                )}
                                                style={{ width: `${Math.min(100, (dep.daysRemaining / 30) * 100)}%` }}
                                            />
                                        </div>
                                        <span className={cn(
                                            "text-[9px] font-medium shrink-0 w-12 text-right",
                                            dep.status === 'adequate' ? 'text-green-400/70'
                                                : dep.status === 'low' ? 'text-yellow-400/70'
                                                : dep.status === 'critical' ? 'text-orange-400/70'
                                                : 'text-red-400/70',
                                        )}>
                                            {dep.daysRemaining <= 0 ? 'Empty' : `${dep.daysRemaining}d`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </GlassCard>
    );
}
