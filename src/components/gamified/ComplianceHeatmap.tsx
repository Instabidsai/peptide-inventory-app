import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface DayCompletion {
    date: Date;
    completed: number;
    total: number;
}

interface ComplianceHeatmapProps {
    data: DayCompletion[];
}

function getCellColor(completed: number, total: number): string {
    if (total === 0) return 'bg-white/[0.04]';
    const pct = (completed / total) * 100;
    if (pct === 0) return 'bg-white/[0.04]';
    if (pct < 33) return 'bg-primary/20';
    if (pct < 66) return 'bg-primary/40';
    if (pct < 100) return 'bg-primary/60';
    return 'bg-primary';
}

export function ComplianceHeatmap({ data }: ComplianceHeatmapProps) {
    const [expanded, setExpanded] = useState(true);

    const dataMap = useMemo(() => {
        const map = new Map<string, DayCompletion>();
        for (const d of data) {
            map.set(format(d.date, 'yyyy-MM-dd'), d);
        }
        return map;
    }, [data]);

    const today = startOfDay(new Date());

    // Generate 91 cells (13 weeks)
    const cells = useMemo(() => {
        const result: Array<{ date: Date; key: string; completed: number; total: number }> = [];
        for (let i = 90; i >= 0; i--) {
            const date = subDays(today, i);
            const key = format(date, 'yyyy-MM-dd');
            const dayData = dataMap.get(key);
            result.push({
                date,
                key,
                completed: dayData?.completed ?? 0,
                total: dayData?.total ?? 0,
            });
        }
        return result;
    }, [dataMap, today]);

    // Group into columns of 7 (weeks)
    const weeks = useMemo(() => {
        const w: typeof cells[] = [];
        for (let i = 0; i < cells.length; i += 7) {
            w.push(cells.slice(i, i + 7));
        }
        return w;
    }, [cells]);

    // Stats
    const totalScheduledDays = cells.filter(c => c.total > 0).length;
    const perfectDays = cells.filter(c => c.total > 0 && c.completed >= c.total).length;
    const overallPct = totalScheduledDays > 0 ? Math.round((perfectDays / totalScheduledDays) * 100) : 0;

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-1 py-2 text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground/70">90-Day History</span>
                    {totalScheduledDays > 0 && (
                        <span className="text-[10px] text-muted-foreground/40 bg-white/[0.04] px-2 py-0.5 rounded-full">
                            {overallPct}% perfect days
                        </span>
                    )}
                </div>
                {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
            </button>

            {expanded && (
                <div className="animate-fade-in pt-2 pb-1">
                    {/* Day labels (left side) */}
                    <div className="flex gap-[3px] justify-center">
                        {/* Day abbreviations column */}
                        <div className="flex flex-col gap-[3px] mr-1 justify-center">
                            {['M', '', 'W', '', 'F', '', 'S'].map((label, i) => (
                                <div key={i} className="h-[11px] flex items-center">
                                    <span className="text-[8px] text-muted-foreground/30 leading-none w-3 text-right">
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Grid */}
                        {weeks.map((week, wi) => (
                            <div key={wi} className="flex flex-col gap-[3px]">
                                {week.map(cell => {
                                    const isToday = cell.key === format(today, 'yyyy-MM-dd');
                                    return (
                                        <div
                                            key={cell.key}
                                            className={cn(
                                                "h-[11px] w-[11px] rounded-[3px] transition-colors",
                                                getCellColor(cell.completed, cell.total),
                                                isToday && "ring-1 ring-primary/50"
                                            )}
                                            title={`${format(cell.date, 'MMM d')}: ${cell.completed}/${cell.total} doses`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-end gap-1.5 mt-2.5">
                        <span className="text-[9px] text-muted-foreground/30">Less</span>
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-white/[0.04]" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-primary/20" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-primary/40" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-primary/60" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
                        <span className="text-[9px] text-muted-foreground/30">More</span>
                    </div>
                </div>
            )}
        </div>
    );
}
