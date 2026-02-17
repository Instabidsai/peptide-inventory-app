import { useMemo } from 'react';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { ChevronRight, Loader2, Sparkles, User, Flame, Target, Calendar } from "lucide-react";
import { format, isSameDay, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { WeekStrip } from '@/components/regimen/WeekStrip';
import { useVialActions } from '@/hooks/use-vial-actions';
import { isDoseDay } from '@/types/regimen';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIChatInterface } from "@/components/ai/AIChatInterface";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryError } from "@/components/ui/query-error";

import { PeptideRings, RING_COLORS } from '@/components/gamified/PeptideRings';
import type { RingDose } from '@/components/gamified/PeptideRings';
import { DueNowCards } from '@/components/gamified/DueNowCards';
import type { DueNowDose } from '@/components/gamified/DueNowCards';
import { ComplianceHeatmap } from '@/components/gamified/ComplianceHeatmap';
import type { DayCompletion } from '@/components/gamified/ComplianceHeatmap';

type TimeWindow = 'morning' | 'afternoon' | 'evening';

function getCurrentTimeWindow(): TimeWindow {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

function ClientDashboardContent() {
    const { data: contact, isLoading: isLoadingContact, isError: isContactError, refetch: refetchContact } = useClientProfile();
    const { protocols, logProtocolUsage } = useProtocols(contact?.id);
    const navigate = useNavigate();
    const { user } = useAuth();
    const actions = useVialActions(contact?.id);

    const today = new Date();
    const todayAbbr = format(today, 'EEE');
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentWindow = getCurrentTimeWindow();

    // Fetch Inventory for unit conversions + SimpleVials
    const { data: inventory } = useQuery({
        queryKey: ['client-inventory', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return [];
            const { data } = await supabase
                .from('client_inventory')
                .select('*, peptide:peptides(name)')
                .eq('contact_id', contact.id)
                .eq('status', 'active');
            return data || [];
        },
        enabled: !!contact?.id
    });

    // ── Gamified data computation ────────────────────────────────
    const gamified = useMemo(() => {
        // 1. Build protocol item map + flatten all logs
        const protocolItemMap = new Map<string, {
            id: string;
            peptide_id: string;
            dosage_amount: number;
            dosage_unit: string;
            protocol_logs: Array<{ created_at: string; status: string }>;
        }>();
        const allLogs: Array<{ date: string; protocolItemId: string }> = [];

        for (const protocol of (protocols || [])) {
            for (const item of (protocol.protocol_items || [])) {
                protocolItemMap.set(item.id, {
                    id: item.id,
                    peptide_id: item.peptide_id,
                    dosage_amount: item.dosage_amount,
                    dosage_unit: item.dosage_unit,
                    protocol_logs: item.protocol_logs || [],
                });
                for (const log of (item.protocol_logs || [])) {
                    allLogs.push({
                        date: format(new Date(log.created_at), 'yyyy-MM-dd'),
                        protocolItemId: item.id,
                    });
                }
            }
        }

        // 2. Get scheduled fridge vials (mixed + have a schedule)
        const scheduledVials = (inventory || []).filter(
            v => v.in_fridge && v.status === 'active' && v.concentration_mg_ml && v.dose_frequency && v.dose_amount_mg
        );

        // 3. Build today's doses
        const todayDoses: DueNowDose[] = [];
        let colorIdx = 0;

        for (const vial of scheduledVials) {
            if (!isDoseDay(vial, todayAbbr)) continue;

            const protocolItem = vial.protocol_item_id
                ? protocolItemMap.get(vial.protocol_item_id)
                : null;

            // Check if logged today (via protocol_logs)
            const todayLogs = protocolItem
                ? protocolItem.protocol_logs.filter(
                    log => isSameDay(new Date(), new Date(log.created_at))
                )
                : [];
            const isTaken = todayLogs.length > 0;
            const takenAt = isTaken ? todayLogs[todayLogs.length - 1].created_at : undefined;

            const concentration = Number(vial.concentration_mg_ml) || 0;
            const doseAmountMg = Number(vial.dose_amount_mg) || 0;
            const units = concentration > 0 && doseAmountMg > 0
                ? Math.round((doseAmountMg / concentration) * 100)
                : 0;
            const timeOfDay = (vial.dose_time_of_day as TimeWindow) || 'morning';

            todayDoses.push({
                id: vial.id,
                vialId: vial.id,
                protocolItemId: protocolItem?.id,
                peptideName: vial.peptide?.name || 'Unknown',
                doseAmountMg,
                units,
                timeOfDay,
                isTaken,
                takenAt,
                color: RING_COLORS[colorIdx % RING_COLORS.length],
                currentQuantityMg: vial.current_quantity_mg,
            });
            colorIdx++;
        }

        // Sort: untaken current-window first, then untaken later, then taken
        const windowOrder: Record<TimeWindow, number> = { morning: 0, afternoon: 1, evening: 2 };
        todayDoses.sort((a, b) => {
            if (a.isTaken !== b.isTaken) return a.isTaken ? 1 : -1;
            const aIsNow = a.timeOfDay === currentWindow ? 0 : 1;
            const bIsNow = b.timeOfDay === currentWindow ? 0 : 1;
            if (aIsNow !== bIsNow) return aIsNow - bIsNow;
            return windowOrder[a.timeOfDay] - windowOrder[b.timeOfDay];
        });

        // 4. Ring doses (same data, simpler interface)
        const ringDoses: RingDose[] = todayDoses.map(d => ({
            id: d.id,
            peptideName: d.peptideName,
            isTaken: d.isTaken,
            color: d.color,
        }));

        // 5. Heatmap data (last 91 days)
        const logsByDate = new Map<string, number>();
        for (const log of allLogs) {
            logsByDate.set(log.date, (logsByDate.get(log.date) || 0) + 1);
        }

        const heatmapData: DayCompletion[] = [];
        for (let i = 90; i >= 0; i--) {
            const date = subDays(today, i);
            const dateStr = format(date, 'yyyy-MM-dd');
            const dateAbbr = format(date, 'EEE');

            let expectedCount = 0;
            for (const vial of scheduledVials) {
                if (isDoseDay(vial, dateAbbr, date)) {
                    expectedCount++;
                }
            }

            heatmapData.push({
                date,
                completed: Math.min(logsByDate.get(dateStr) || 0, expectedCount),
                total: expectedCount,
            });
        }

        // 6. Auto-calculate streak from heatmap
        const heatmapByDate = new Map(
            heatmapData.map(d => [format(d.date, 'yyyy-MM-dd'), d])
        );

        let streak = 0;
        // If today is all done, count it
        const todayHeatmap = heatmapByDate.get(todayStr);
        if (todayHeatmap && todayHeatmap.total > 0 && todayHeatmap.completed >= todayHeatmap.total) {
            streak = 1;
        }
        // Count backwards from yesterday
        for (let i = 1; i <= 90; i++) {
            const dateStr = format(subDays(today, i), 'yyyy-MM-dd');
            const day = heatmapByDate.get(dateStr);
            if (!day || day.total === 0) continue; // rest day doesn't break streak
            if (day.completed >= day.total) {
                streak++;
            } else {
                break;
            }
        }

        // 7. Adherence rate (last 30 days)
        const last30 = heatmapData.filter(d => {
            const daysAgo = Math.floor((today.getTime() - d.date.getTime()) / (1000 * 60 * 60 * 24));
            return daysAgo <= 30 && d.total > 0;
        });
        const totalExpected = last30.reduce((acc, d) => acc + d.total, 0);
        const totalCompleted = last30.reduce((acc, d) => acc + d.completed, 0);
        const adherenceRate = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;

        return { todayDoses, ringDoses, heatmapData, streak, adherenceRate, currentWindow };
    }, [protocols, inventory, todayAbbr, todayStr, currentWindow]);

    // ── Unified dose logging (protocol log + vial decrement) ────
    const handleLogDose = (dose: DueNowDose) => {
        // 1. Log protocol compliance (if linked)
        if (dose.protocolItemId) {
            logProtocolUsage.mutate({ itemId: dose.protocolItemId });
        }
        // 2. Decrement vial quantity
        actions.logDose.mutate({
            vialId: dose.vialId,
            currentQty: dose.currentQuantityMg,
            doseMg: dose.doseAmountMg,
        });
    };

    if (isLoadingContact) return <div className="flex h-screen items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    if (isContactError) return <QueryError message="Failed to load your profile." onRetry={refetchContact} />;

    if (!contact && !isLoadingContact) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 p-8">
                <div className="p-4 bg-muted rounded-full">
                    <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold">No Client Profile Found</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    We couldn't find a client profile linked to this account. If you are an admin previewing, ensure the Contact is linked.
                </p>
                <div className="w-full max-w-md border rounded-lg p-4 mt-8">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Debug: Peptide AI
                    </h3>
                    <div className="h-[400px]">
                        <AIChatInterface />
                    </div>
                </div>
            </div>
        );
    }

    const hasDosesToday = gamified.todayDoses.length > 0;
    const hasScheduledVials = (inventory || []).some(
        v => v.in_fridge && v.status === 'active' && v.concentration_mg_ml && v.dose_frequency
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Greeting */}
            <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-muted-foreground/60">
                    {format(today, 'EEEE, MMMM do')}
                </p>
                <h1 className="text-2xl font-bold tracking-tight">
                    Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 18 ? 'Afternoon' : 'Evening'},{' '}
                    <span className="text-gradient-primary">{contact?.name?.split(' ')[0] || 'Friend'}</span>
                </h1>
            </div>

            <Tabs defaultValue="protocol" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-5 h-11 rounded-xl bg-white/[0.04] p-1">
                    <TabsTrigger value="protocol" className="rounded-lg text-sm font-medium data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-sm">
                        My Protocol
                    </TabsTrigger>
                    <TabsTrigger value="ai-coach" className="rounded-lg text-sm font-medium gap-2 data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" />
                        Peptide AI
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="protocol" className="space-y-5">
                    {/* ─── Peptide Rings (hero) ─── */}
                    {hasDosesToday && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardContent className="pt-6 pb-5">
                                <PeptideRings doses={gamified.ringDoses} />
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* ─── Stats Row ─── */}
                    <div className="grid grid-cols-2 gap-3">
                        <GlassCard className="border-white/[0.04] hover-lift">
                            <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center gap-1.5">
                                <div className="p-2 rounded-xl bg-primary/10 mb-1">
                                    <Flame className="h-4 w-4 text-primary" />
                                </div>
                                <div className="text-2xl font-bold tracking-tight text-primary">
                                    {gamified.streak}
                                </div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">
                                    Day Streak
                                </div>
                            </CardContent>
                        </GlassCard>
                        <GlassCard className="border-white/[0.04] hover-lift">
                            <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center gap-1.5">
                                <div className="p-2 rounded-xl bg-emerald-500/10 mb-1">
                                    <Target className="h-4 w-4 text-emerald-400" />
                                </div>
                                <div className="text-2xl font-bold tracking-tight text-emerald-400">
                                    {gamified.adherenceRate}%
                                </div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">
                                    30-Day Adherence
                                </div>
                            </CardContent>
                        </GlassCard>
                    </div>

                    {/* ─── Due Now Cards ─── */}
                    {hasDosesToday && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardContent className="pt-5 pb-4">
                                <DueNowCards
                                    doses={gamified.todayDoses}
                                    currentWindow={gamified.currentWindow}
                                    onLogDose={handleLogDose}
                                    isLogging={logProtocolUsage.isPending || actions.logDose.isPending}
                                />
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* ─── Rest Day / No Schedule Message ─── */}
                    {!hasDosesToday && hasScheduledVials && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardContent className="py-8">
                                <div className="flex flex-col items-center gap-2 text-center">
                                    <div className="p-3 rounded-2xl bg-emerald-500/10">
                                        <Calendar className="h-5 w-5 text-emerald-400" />
                                    </div>
                                    <p className="font-semibold text-sm">Rest Day</p>
                                    <p className="text-xs text-muted-foreground/50 max-w-[200px]">
                                        No doses scheduled for today. Check your fridge below for upcoming schedules.
                                    </p>
                                </div>
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* ─── Week Calendar Strip ─── */}
                    <WeekStrip inventory={inventory || []} />

                    {/* ─── 90-Day Compliance Heatmap ─── */}
                    {gamified.heatmapData.some(d => d.total > 0) && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardContent className="py-3">
                                <ComplianceHeatmap data={gamified.heatmapData} />
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* ─── Fridge (Vial Lifecycle Manager) ─── */}
                    <SimpleVials inventory={inventory || []} contactId={contact?.id} />

                    {/* ─── Full Regimen Link ─── */}
                    <button
                        onClick={() => navigate('/my-regimen')}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all duration-200"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/[0.04]">
                                <Calendar className="h-4 w-4 text-muted-foreground/60" />
                            </div>
                            <div className="text-left">
                                <div className="font-medium text-sm">Full Regimen</div>
                                <div className="text-xs text-muted-foreground/40">View all protocol details</div>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                </TabsContent>

                <TabsContent value="ai-coach" className="min-h-[400px] md:min-h-[600px]">
                    <AIChatInterface />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function ClientDashboard() {
    return (
        <ErrorBoundary name="ClientDashboard">
            <ClientDashboardContent />
        </ErrorBoundary>
    );
}
