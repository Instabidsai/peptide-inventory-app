import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Award, Calendar } from 'lucide-react';
import { MACRO_COLORS } from '@/lib/colors';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';

export function WeeklyTrends() {
    const { user } = useAuth();

    // Fetch last 7 days of meal logs
    const { data: weeklyData } = useQuery({
        queryKey: ['weekly-trends', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;

            const today = new Date();
            const sevenDaysAgo = subDays(today, 6); // Last 7 days including today

            // Fetch logs
            const { data: logs, error: logsError } = await supabase
                .from('meal_logs')
                .select('created_at, total_calories, total_protein, total_carbs, total_fat')
                .eq('user_id', user.id)
                .gte('created_at', startOfDay(sevenDaysAgo).toISOString())
                .lte('created_at', endOfDay(today).toISOString())
                .order('created_at', { ascending: true });

            if (logsError) throw logsError;

            // Fetch user's goals
            const { data: goals, error: goalsError } = await supabase
                .from('daily_macro_goals')
                .select('calories, protein, carbs, fat')
                .eq('user_id', user.id)
                .single();

            if (goalsError) throw goalsError;

            // Aggregate by day
            const dailyTotals: Record<string, { calories: number; protein: number; carbs: number; fat: number; count: number }> = {};

            logs?.forEach(log => {
                const day = format(new Date(log.created_at), 'yyyy-MM-dd');
                if (!dailyTotals[day]) {
                    dailyTotals[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
                }
                dailyTotals[day].calories += log.total_calories || 0;
                dailyTotals[day].protein += log.total_protein || 0;
                dailyTotals[day].carbs += log.total_carbs || 0;
                dailyTotals[day].fat += log.total_fat || 0;
                dailyTotals[day].count += 1;
            });

            // Format for chart (last 7 days)
            const chartData = [];
            for (let i = 6; i >= 0; i--) {
                const date = subDays(today, i);
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayData = dailyTotals[dateStr] || { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };

                chartData.push({
                    date: format(date, 'EEE'), // Mon, Tue, etc.
                    fullDate: dateStr,
                    calories: Math.round(dayData.calories),
                    protein: Math.round(dayData.protein),
                    carbs: Math.round(dayData.carbs),
                    fat: Math.round(dayData.fat),
                    logged: dayData.count > 0
                });
            }

            // Calculate stats
            const daysWithLogs = Object.keys(dailyTotals).length;
            const totalCalories = Object.values(dailyTotals).reduce((sum, day) => sum + day.calories, 0);
            const avgCalories = daysWithLogs > 0 ? Math.round(totalCalories / 7) : 0;
            const avgProtein = daysWithLogs > 0 ? Math.round(Object.values(dailyTotals).reduce((sum, day) => sum + day.protein, 0) / 7) : 0;

            // Calculate compliance (days within ±10% of calorie goal)
            const complianceDays = Object.values(dailyTotals).filter(day => {
                const diff = Math.abs(day.calories - (goals?.calories || 0));
                const withinRange = diff <= (goals?.calories || 0) * 0.1;
                return withinRange;
            }).length;
            const compliancePercent = daysWithLogs > 0 ? Math.round((complianceDays / daysWithLogs) * 100) : 0;

            // Find best day (closest to goals)
            let bestDay: { date: string; score: number } | null = null;
            Object.entries(dailyTotals).forEach(([date, day]) => {
                const calorieScore = 1 - Math.abs(day.calories - (goals?.calories || 0)) / (goals?.calories || 1);
                const proteinScore = 1 - Math.abs(day.protein - (goals?.protein || 0)) / (goals?.protein || 1);
                const score = (calorieScore + proteinScore) / 2;

                if (!bestDay || score > bestDay.score) {
                    bestDay = { date, score };
                }
            });

            return {
                chartData,
                stats: {
                    daysTracked: daysWithLogs,
                    avgCalories,
                    avgProtein,
                    compliancePercent,
                    bestDay: bestDay ? format(new Date(bestDay.date), 'EEEE') : null,
                    goals: goals || { calories: 2000, protein: 150, carbs: 200, fat: 65 }
                }
            };
        },
        enabled: !!user?.id,
        retry: false
    });

    // Don't render anything while loading or if no data
    if (!weeklyData) return null;

    // Ensure we have valid data before rendering
    if (!weeklyData.chartData || !weeklyData.stats) return null;

    return (
        <Card className="shadow-sm bg-white">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Weekly Macro Trends
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Chart */}
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyData.chartData}>
                            <defs>
                                <linearGradient id="colorCalories" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorProtein" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={MACRO_COLORS.protein} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={MACRO_COLORS.protein} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    padding: '8px'
                                }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="calories"
                                stroke="#8884d8"
                                fillOpacity={1}
                                fill="url(#colorCalories)"
                                name="Calories"
                            />
                            <Area
                                type="monotone"
                                dataKey="protein"
                                stroke={MACRO_COLORS.protein}
                                fillOpacity={1}
                                fill="url(#colorProtein)"
                                name="Protein (g)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg Calories</div>
                        <div className="text-2xl font-bold">{weeklyData.stats.avgCalories}</div>
                        <div className="text-xs text-muted-foreground">
                            Goal: {weeklyData.stats.goals.calories}
                        </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg Protein</div>
                        <div className="text-2xl font-bold">{weeklyData.stats.avgProtein}g</div>
                        <div className="text-xs text-muted-foreground">
                            Goal: {weeklyData.stats.goals.protein}g
                        </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Days Tracked
                        </div>
                        <div className="text-2xl font-bold">{weeklyData.stats.daysTracked}/7</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Award className="h-3 w-3" />
                            Compliance
                        </div>
                        <div className="text-2xl font-bold">{weeklyData.stats.compliancePercent}%</div>
                        <div className="text-xs text-muted-foreground">
                            Within ±10% of goal
                        </div>
                    </div>
                </div>

                {/* Best Day */}
                {weeklyData.stats.bestDay && (
                    <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Best Day</div>
                        <div className="text-lg font-bold text-primary">{weeklyData.stats.bestDay}</div>
                        <div className="text-xs text-muted-foreground">Closest to your goals!</div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
