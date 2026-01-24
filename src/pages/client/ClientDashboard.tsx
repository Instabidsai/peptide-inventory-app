import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar, Scale, Activity, Utensils, TrendingUp, TrendingDown, Zap, ChevronRight } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { MACRO_COLORS, MACRO_COLORS_LIGHT } from '@/lib/colors'; // Added start/endOfDay
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'; // Ensure this is imported
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { WeeklyProgressChart } from '@/components/dashboards/WeeklyProgressChart';
import { WeeklyCompliance } from '@/components/dashboards/WeeklyCompliance';
import { WaterTracker } from '@/components/dashboards/WaterTracker';
import { WeeklyTrends } from '@/components/dashboards/WeeklyTrends';

import { aggregateDailyLogs } from '@/utils/nutrition-utils';

export default function ClientDashboard() {
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const { protocols, logProtocolUsage } = useProtocols(contact?.id);
    const navigate = useNavigate();
    const { user } = useAuth(); // Get auth user

    const today = new Date();

    // Fetch Today's Macros
    const { data: dailyMacros } = useQuery({
        queryKey: ['daily-macros', user?.id],
        queryFn: async () => {
            if (!user?.id) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

            const start = startOfDay(new Date()).toISOString();
            const end = endOfDay(new Date()).toISOString();

            const { data, error } = await supabase
                .from('meal_logs')
                .select('total_calories, total_protein, total_carbs, total_fat')
                .eq('user_id', user.id)
                .gte('created_at', start)
                .lte('created_at', end);

            if (error) {
                console.error('Error fetching macros:', error);
                return { calories: 0, protein: 0, carbs: 0, fat: 0 };
            }

            return aggregateDailyLogs(data);
        },
        enabled: !!user?.id
    });

    // Fetch Daily Goals
    const { data: userGoals } = useQuery({
        queryKey: ['user-goals', user?.id],
        queryFn: async () => {
            if (!user?.id) return { calories_target: 2000, protein_target: 150, carbs_target: 200, fat_target: 65 };

            const { data } = await supabase
                .from('daily_macro_goals')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            return data || { calories_target: 2000, protein_target: 150, carbs_target: 200, fat_target: 65 };
        },
        enabled: !!user?.id
    });

    if (isLoadingContact) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    const activeProtocols = protocols || [];

    // Calculate adherence for today
    const todaysItems = activeProtocols.map(p => {
        const item = p.protocol_items?.[0];
        if (!item) return null;

        const logs = item.protocol_logs || [];
        const sortedLogs = [...logs].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const latestLog = sortedLogs[0];
        const isTakenToday = latestLog && differenceInDays(new Date(), new Date(latestLog.created_at)) === 0;

        return {
            protocolName: p.name, // or peptide name if we fetched peptide
            item,
            isTakenToday,
            lastTaken: latestLog?.created_at
        };
    }).filter(Boolean);

    const takenCount = todaysItems.filter(i => i?.isTakenToday).length;
    const totalCount = todaysItems.length;

    // Simple adherence % logic (just based on total active protocols for now)
    // Real calc would need history.
    const adherenceRate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

    return (
        <div className="space-y-6 pb-20"> {/* pb-20 for bottom nav if used */}
            {/* Header / Greeting */}
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">
                    Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 18 ? 'Afternoon' : 'Evening'},
                </h1>
                <p className="text-muted-foreground text-lg">{contact?.name || 'Friend'}</p>
                <p className="text-sm text-muted-foreground mt-1">
                    {format(today, 'EEEE, MMMM do')}
                </p>
                {contact?.tier && (
                    <span className="text-xs bg-secondary px-2 py-0.5 rounded w-fit capitalize text-muted-foreground">
                        {contact.tier} Member
                    </span>
                )}
            </div>

            {/* Today's Overview Card */}
            <GlassCard className="border-l-4 border-l-primary shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex justify-between items-center">
                        Today's Regimen
                        <span className="text-xs font-normal text-muted-foreground bg-secondary/50 px-2 py-1 rounded-full">
                            {takenCount} of {totalCount} Done
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {todaysItems.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-2">No active protocols assigned.</div>
                        ) : (
                            todaysItems.map((item: any, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${item.isTakenToday ? 'bg-muted/40' : 'border border-white/10'}`}>
                                    <div className={`flex items-center gap-3 ${item.isTakenToday ? '' : 'opacity-80'}`}>
                                        {item.isTakenToday ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        ) : (
                                            <Clock className="h-5 w-5 text-muted-foreground" />
                                        )}
                                        <div>
                                            <p className="font-medium">{item.protocolName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {item.item.dosage_amount}{item.item.dosage_unit} • {item.item.frequency}
                                            </p>
                                        </div>
                                    </div>
                                    {item.isTakenToday ? (
                                        <span className="text-xs text-green-600 font-medium">
                                            {format(new Date(item.lastTaken), 'h:mm a')}
                                        </span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs"
                                            onClick={() => logProtocolUsage.mutate({ itemId: item.item.id })}
                                        >
                                            Mark
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </GlassCard>

            {/* Weekly Compliance */}
            <WeeklyCompliance />

            {/* Daily Macros Widget */}
            <GlassCard className="shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Today's Nutrition</CardTitle>
                    <Utensils className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="font-medium">Calories</span>
                                <span>{Math.round(dailyMacros?.calories || 0)} / {userGoals?.calories_target}</span>
                            </div>
                            <Progress value={Math.min(100, ((dailyMacros?.calories || 0) / (userGoals?.calories_target || 2000)) * 100)} className="h-2" />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium" style={{ color: MACRO_COLORS.protein }}>
                                    <span>Protein</span>
                                    <span>{Math.round(dailyMacros?.protein || 0)}/{userGoals?.protein_target}g</span>
                                </div>
                                <Progress value={Math.min(100, ((dailyMacros?.protein || 0) / (userGoals?.protein_target || 1)) * 100)} className="h-2.5" style={{ backgroundColor: MACRO_COLORS_LIGHT.protein }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium" style={{ color: MACRO_COLORS.carbs }}>
                                    <span>Carbs</span>
                                    <span>{Math.round(dailyMacros?.carbs || 0)}/{userGoals?.carbs_target}g</span>
                                </div>
                                <Progress value={Math.min(100, ((dailyMacros?.carbs || 0) / (userGoals?.carbs_target || 1)) * 100)} className="h-2.5" style={{ backgroundColor: MACRO_COLORS_LIGHT.carbs }} />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-medium" style={{ color: MACRO_COLORS.fat }}>
                                    <span>Fat</span>
                                    <span>{Math.round(dailyMacros?.fat || 0)}/{userGoals?.fat_target}g</span>
                                </div>
                                <Progress value={Math.min(100, ((dailyMacros?.fat || 0) / (userGoals?.fat_target || 1)) * 100)} className="h-2.5" style={{ backgroundColor: MACRO_COLORS_LIGHT.fat }} />
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-4 text-xs h-7"
                        onClick={() => navigate('/macro-tracker')}
                    >
                        Log Meal <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                </CardContent>
            </GlassCard>

            {/* Water Tracker */}
            <WaterTracker />

            {/* Weekly Macro Trends */}
            <WeeklyTrends />

            {/* Weekly Progress Component */}
            <WeeklyProgressChart />

            {/* Streak / Stats */}
            <div className="grid grid-cols-2 gap-4">
                <GlassCard>
                    <CardContent className="pt-6 flex flex-col items-center justify-center gap-2">
                        <div className="text-3xl font-bold text-primary">{contact?.notes?.match(/streak:(\d+)/i)?.[1] || 0}</div>
                        {/* Placeholder for streak logic */}
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Day Streak</div>
                    </CardContent>
                </GlassCard>
                <GlassCard>
                    <CardContent className="pt-6 flex flex-col items-center justify-center gap-2">
                        <div className="text-3xl font-bold text-green-600">{adherenceRate}%</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Daily Adherence</div>
                    </CardContent>
                </GlassCard>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
                <h3 className="font-semibold text-lg">Quick Actions</h3>
                <Button variant="secondary" className="w-full justify-between h-auto py-4" onClick={() => navigate('/my-regimen')}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-full">
                            <Clock className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <div className="font-medium">Full Regimen</div>
                            <div className="text-xs text-muted-foreground">View all details</div>
                        </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>
        </div >
    );
}
