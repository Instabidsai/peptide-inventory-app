import { GlassCard } from '@/components/ui/glass-card';
import { CardContent } from '@/components/ui/card';
import { DAYS_OF_WEEK } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface WeekStripProps {
    inventory: any[];
}

export function WeekStrip({ inventory }: WeekStripProps) {
    const todayAbbr = format(new Date(), 'EEE'); // 'Mon', 'Tue', etc.

    // Count how many active vials have a dose scheduled per day
    const dosesPerDay: Record<string, number> = {};
    DAYS_OF_WEEK.forEach(d => { dosesPerDay[d] = 0; });

    inventory.forEach((vial) => {
        if (vial.concentration_mg_ml && vial.dose_days?.length) {
            vial.dose_days.forEach((day: string) => {
                if (dosesPerDay[day] !== undefined) {
                    dosesPerDay[day]++;
                }
            });
        }
    });

    const hasAnySchedule = Object.values(dosesPerDay).some(c => c > 0);
    if (!hasAnySchedule) return null;

    return (
        <GlassCard className="border-emerald-500/10">
            <CardContent className="py-3 px-4">
                <div className="flex justify-between items-center">
                    {DAYS_OF_WEEK.map((day) => {
                        const isToday = todayAbbr === day;
                        const count = dosesPerDay[day] || 0;
                        return (
                            <div key={day} className="flex flex-col items-center gap-1.5">
                                <span className={cn(
                                    "text-[10px] font-medium uppercase tracking-wider",
                                    isToday ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {day}
                                </span>
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center border transition-all",
                                    isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                                    count > 0
                                        ? "bg-emerald-500/20 border-emerald-500/30"
                                        : "bg-secondary/50 border-transparent"
                                )}>
                                    {count > 0 ? (
                                        <span className="text-xs font-bold text-emerald-400">{count}</span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground/40">-</span>
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
