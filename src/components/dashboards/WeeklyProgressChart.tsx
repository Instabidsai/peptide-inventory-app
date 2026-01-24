
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfWeek, endOfWeek, subDays, format, startOfDay, endOfDay } from 'date-fns';
import { Loader2 } from "lucide-react";
import { processWeeklyChartData } from '@/utils/nutrition-utils';

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

            return processWeeklyChartData(data || []);
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
