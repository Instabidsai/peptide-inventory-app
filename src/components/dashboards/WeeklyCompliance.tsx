
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";
import { aggregateDailyLogs } from "@/utils/nutrition-utils";

export function WeeklyCompliance() {
    const { user } = useAuth();

    // Fetch Goals
    const { data: goals } = useQuery({
        queryKey: ['user-goals', user?.id],
        queryFn: async () => {
            if (!user?.id) return { calories_target: 2000 };
            const { data } = await supabase.from('daily_macro_goals').select('*').eq('user_id', user.id).maybeSingle();
            return data || { calories_target: 2000 };
        },
        enabled: !!user?.id
    });

    // Fetch 7 Days of Logs
    const { data: weeklyLogs } = useQuery({
        queryKey: ['weekly-compliance', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const start = subDays(startOfDay(new Date()), 6).toISOString(); // Last 7 days including today
            const end = endOfDay(new Date()).toISOString();

            const { data } = await supabase
                .from('meal_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('created_at', start)
                .lte('created_at', end);

            return data || [];
        },
        enabled: !!user?.id
    });

    // Process Compliance
    const days = Array.from({ length: 7 }).map((_, i) => {
        const date = subDays(new Date(), 6 - i);
        return date;
    });

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Weekly Calorie Compliance</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex justify-between items-center">
                    {days.map((day, idx) => {
                        const dayLogs = weeklyLogs?.filter(log => isSameDay(new Date(log.created_at), day)) || [];
                        const totals = aggregateDailyLogs(dayLogs);
                        const target = goals?.calories_target || 2000;
                        const range = target * 0.15; // 15% variance allowed

                        // Logic: Green if within range, Red if over/under significantly, Gray if empty
                        let status = 'empty';
                        if (totals.calories > 0) {
                            if (Math.abs(totals.calories - target) <= range) {
                                status = 'success';
                            } else {
                                status = 'miss';
                            }
                        }

                        // If today and empty, simpler styles
                        const isToday = isSameDay(day, new Date());

                        return (
                            <div key={idx} className="flex flex-col items-center gap-1">
                                <span className={`text-[10px] font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {format(day, 'EEE')}
                                </span>
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${status === 'success' ? 'bg-green-100 border-green-200 text-green-600' :
                                        status === 'miss' ? 'bg-red-100 border-red-200 text-red-600' :
                                            'bg-secondary border-transparent text-muted-foreground'
                                    }`}>
                                    {status === 'success' && <CheckCircle2 className="h-4 w-4" />}
                                    {status === 'miss' && <span className="text-xs font-bold">{Math.round(totals.calories)}</span>}
                                    {status === 'empty' && <span className="text-xs text-muted-foreground">-</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
