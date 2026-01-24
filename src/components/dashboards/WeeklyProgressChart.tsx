
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfWeek, endOfWeek, subDays, format, startOfDay, endOfDay } from 'date-fns';
import { Loader2 } from "lucide-react";

export function WeeklyProgressChart() {
    const { user } = useAuth();

    // Fetch last 7 days of logs
    const { data: chartData, isLoading } = useQuery({
        queryKey: ['weekly-macros', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];

            const endDate = endOfDay(new Date());
            const startDate = startOfDay(subDays(endDate, 6)); // Last 7 days

            const { data } = await supabase
                .from('meal_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());

            // Aggregate by day
            const dailyMap = new Map();

            // Initialize last 7 days with 0
            for (let i = 6; i >= 0; i--) {
                const d = subDays(new Date(), i);
                const key = format(d, 'yyyy-MM-dd');
                dailyMap.set(key, { name: format(d, 'EEE'), calories: 0, protein: 0 });
            }

            data?.forEach(log => {
                const key = format(new Date(log.created_at), 'yyyy-MM-dd');
                if (dailyMap.has(key)) {
                    const curr = dailyMap.get(key);
                    curr.calories += Number(log.total_calories || 0);
                    curr.protein += Number(log.total_protein || 0);
                }
            });

            return Array.from(dailyMap.values());
        },
        enabled: !!user?.id
    });

    if (isLoading) return <div className="h-[200px] flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Weekly Progress (Calories)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis
                                dataKey="name"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                                labelStyle={{ color: 'hsl(var(--foreground))' }}
                                cursor={{ fill: 'hsl(var(--muted))' }}
                            />
                            <Bar
                                dataKey="calories"
                                fill="currentColor"
                                radius={[4, 4, 0, 0]}
                                className="fill-primary"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
