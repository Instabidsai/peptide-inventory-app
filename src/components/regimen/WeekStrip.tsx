import { memo } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { CardContent } from '@/components/ui/card';
import { DAYS_OF_WEEK, isDoseDay, type ClientInventoryItem } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';

interface WeekStripProps {
    inventory: ClientInventoryItem[];
}

function WeekStripBase({ inventory }: WeekStripProps) {
    const now = new Date();
    const todayAbbr = format(now, 'EEE');
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekDates = DAYS_OF_WEEK.map((_, i) => addDays(weekStart, i));

    const scheduledVials = inventory.filter(
        (v) => v.in_fridge && v.concentration_mg_ml && v.dose_frequency
    );

    const dosesPerDay: Record<string, number> = {};
    DAYS_OF_WEEK.forEach(d => { dosesPerDay[d] = 0; });

    DAYS_OF_WEEK.forEach((day, i) => {
        scheduledVials.forEach((vial) => {
            if (isDoseDay(vial, day, weekDates[i])) {
                dosesPerDay[day]++;
            }
        });
    });

    if (scheduledVials.length === 0) return null;

    return (
        <GlassCard className="border-white/[0.04] overflow-hidden">
            <CardContent className="py-4 px-2">
                <div className="flex justify-around items-center">
                    {DAYS_OF_WEEK.map((day, i) => {
                        const isToday = todayAbbr === day;
                        const count = dosesPerDay[day] || 0;
                        const dateNum = format(weekDates[i], 'd');
                        const isPast = weekDates[i] < now && !isToday;

                        return (
                            <div key={day} className="flex flex-col items-center gap-1">
                                <span className={cn(
                                    "text-[10px] font-semibold uppercase tracking-widest",
                                    isToday ? "text-primary" : "text-muted-foreground/60"
                                )}>
                                    {day.slice(0, 2)}
                                </span>
                                <div className={cn(
                                    "relative h-10 w-10 rounded-2xl flex flex-col items-center justify-center transition-all duration-300",
                                    isToday && count > 0 && "bg-primary/20 shadow-[0_0_20px_hsl(var(--primary)/0.15)]",
                                    isToday && count === 0 && "bg-primary/10 ring-2 ring-primary/30",
                                    !isToday && count > 0 && "bg-white/[0.04]",
                                    !isToday && count === 0 && "bg-transparent",
                                )}>
                                    <span className={cn(
                                        "text-sm font-semibold leading-none",
                                        isToday ? "text-primary" : isPast ? "text-muted-foreground/40" : "text-foreground/80"
                                    )}>
                                        {dateNum}
                                    </span>
                                    {count > 0 && (
                                        <div className="flex gap-0.5 mt-0.5">
                                            {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                                                <div
                                                    key={j}
                                                    className={cn(
                                                        "h-1 w-1 rounded-full",
                                                        isToday ? "bg-primary" : isPast ? "bg-muted-foreground/30" : "bg-primary/50"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </GlassCard>
    );
}

export const WeekStrip = memo(WeekStripBase);
