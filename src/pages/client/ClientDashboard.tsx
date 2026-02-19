import { useMemo } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { useHouseholdMembers } from '@/hooks/use-household';
import { useInventoryOwnerId } from '@/hooks/use-inventory-owner';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Loader2, Sparkles, User, Flame, Target, Calendar } from "lucide-react";
import { Progress } from '@/components/ui/progress';
import { format, isSameDay, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { WeekStrip } from '@/components/regimen/WeekStrip';
import { useVialActions } from '@/hooks/use-vial-actions';
import { isDoseDay } from '@/types/regimen';
import { calculateDoseUnits } from '@/utils/dose-utils';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIChatInterface } from "@/components/ai/AIChatInterface";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryError } from "@/components/ui/query-error";

import { PeptideRings, RING_COLORS } from '@/components/gamified/PeptideRings';
import type { RingDose } from '@/components/gamified/PeptideRings';
import { DueNowCards } from '@/components/gamified/DueNowCards';
import type { DueNowDose } from '@/components/gamified/DueNowCards';
import { HouseholdDoseSection } from '@/components/gamified/HouseholdDoseSection';
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
    usePageTitle('My Dashboard');
    const { data: contact, isLoading: isLoadingContact, isError: isContactError, refetch: refetchContact } = useClientProfile();
    const { protocols, logProtocolUsage } = useProtocols(contact?.id);
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Household support ─────────────────────────────────────────
    const inventoryOwnerId = useInventoryOwnerId(contact);
    const { data: householdMembers } = useHouseholdMembers(
        contact?.household_id ? contact?.id : undefined
    );
    const isHousehold = !!contact?.household_id && (householdMembers?.length ?? 0) > 1;
    const actions = useVialActions(inventoryOwnerId);

    const today = new Date();
    const todayAbbr = format(today, 'EEE');
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentWindow = getCurrentTimeWindow();

    // Fetch Inventory — uses household owner's ID for shared fridge
    const { data: inventory } = useQuery({
        queryKey: ['client-inventory', inventoryOwnerId],
        queryFn: async () => {
            if (!inventoryOwnerId) return [];
            const { data } = await supabase
                .from('client_inventory')
                .select('*, peptide:peptides(name)')
                .eq('contact_id', inventoryOwnerId)
                .eq('status', 'active');
            return data || [];
        },
        enabled: !!inventoryOwnerId
    });

    // Fetch protocols for ALL household members (for multi-person morning view)
    const { data: allMemberProtocols } = useQuery({
        queryKey: ['household-protocols', contact?.household_id, householdMembers?.map(m => m.id).join(',')],
        queryFn: async () => {
            if (!householdMembers || householdMembers.length <= 1) return null;
            const results = await Promise.all(
                householdMembers.map(async (member) => {
                    const { data } = await supabase
                        .from('protocols')
                        .select('*, protocol_items(*, protocol_logs(created_at, status))')
                        .eq('contact_id', member.id)
                        .order('created_at', { ascending: false });
                    return { member, protocols: data ?? [] };
                })
            );
            return results;
        },
        enabled: isHousehold,
    });

    // ── Helper: build doses for one set of protocols against shared inventory ──
    const buildDosesForProtocols = (
        memberProtocols: typeof protocols,
        inv: typeof inventory,
        memberName?: string,
        memberContactId?: string,
    ) => {
        const protocolItemMap = new Map<string, {
            id: string;
            peptide_id: string;
            dosage_amount: number;
            dosage_unit: string;
            protocol_logs: Array<{ created_at: string; status: string }>;
        }>();
        const logs: Array<{ date: string; protocolItemId: string }> = [];

        for (const protocol of (memberProtocols || [])) {
            for (const item of (protocol.protocol_items || [])) {
                protocolItemMap.set(item.id, {
                    id: item.id,
                    peptide_id: item.peptide_id,
                    dosage_amount: item.dosage_amount,
                    dosage_unit: item.dosage_unit,
                    protocol_logs: item.protocol_logs || [],
                });
                for (const log of (item.protocol_logs || [])) {
                    logs.push({
                        date: format(new Date(log.created_at), 'yyyy-MM-dd'),
                        protocolItemId: item.id,
                    });
                }
            }
        }

        const scheduledVials = (inv || []).filter(
            v => v.in_fridge && v.status === 'active' && v.concentration_mg_ml && v.dose_frequency && v.dose_amount_mg
        );

        // Cross-reference: only include vials that match a protocol item's peptide_id for this member
        const memberPeptideIds = new Set(
            Array.from(protocolItemMap.values()).map(pi => pi.peptide_id)
        );

        const doses: DueNowDose[] = [];
        let colorIdx = 0;

        for (const vial of scheduledVials) {
            // In household mode, only show vials that match this member's protocol peptides
            if (memberName && memberPeptideIds.size > 0 && !memberPeptideIds.has(vial.peptide_id)) continue;
            if (!isDoseDay(vial, todayAbbr)) continue;

            const protocolItem = vial.protocol_item_id
                ? protocolItemMap.get(vial.protocol_item_id)
                : null;

            const todayLogs = protocolItem
                ? protocolItem.protocol_logs.filter(
                    log => isSameDay(new Date(), new Date(log.created_at))
                )
                : [];
            const isTaken = todayLogs.length > 0;
            const takenAt = isTaken ? todayLogs[todayLogs.length - 1].created_at : undefined;

            const concentration = Number(vial.concentration_mg_ml) || 0;
            const doseAmountMg = Number(vial.dose_amount_mg) || 0;
            const units = calculateDoseUnits(doseAmountMg, concentration);
            const timeOfDay = (vial.dose_time_of_day as TimeWindow) || 'morning';

            doses.push({
                id: `${vial.id}-${memberContactId || 'solo'}`,
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
                memberName,
                memberContactId,
                isOtherMember: !!memberContactId && memberContactId !== contact?.id,
            });
            colorIdx++;
        }

        return { doses, logs, scheduledVials, protocolItemMap };
    };

    // ── Gamified data computation ────────────────────────────────
    const gamified = useMemo(() => {
        let todayDoses: DueNowDose[] = [];
        let allLogs: Array<{ date: string; protocolItemId: string }> = [];
        let scheduledVials: typeof inventory = [];

        if (isHousehold && allMemberProtocols && allMemberProtocols.length > 1) {
            // ── HOUSEHOLD MODE: merge doses from all members ──
            for (const { member, protocols: memberProtos } of allMemberProtocols) {
                const result = buildDosesForProtocols(
                    memberProtos,
                    inventory,
                    member.name?.split(' ')[0] || 'Member',
                    member.id,
                );
                todayDoses.push(...result.doses);
                allLogs.push(...result.logs);
                if (result.scheduledVials.length > 0) {
                    scheduledVials = result.scheduledVials;
                }
            }
        } else {
            // ── SOLO MODE: existing logic ──
            const result = buildDosesForProtocols(protocols, inventory);
            todayDoses = result.doses;
            allLogs = result.logs;
            scheduledVials = result.scheduledVials;
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

        // Ring doses
        const ringDoses: RingDose[] = todayDoses.map(d => ({
            id: d.id,
            peptideName: d.peptideName,
            isTaken: d.isTaken,
            color: d.color,
        }));

        // Heatmap data (last 91 days)
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
            for (const vial of (scheduledVials || [])) {
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

        // Streak
        const heatmapByDate = new Map(
            heatmapData.map(d => [format(d.date, 'yyyy-MM-dd'), d])
        );

        let streak = 0;
        const todayHeatmap = heatmapByDate.get(todayStr);
        if (todayHeatmap && todayHeatmap.total > 0 && todayHeatmap.completed >= todayHeatmap.total) {
            streak = 1;
        }
        for (let i = 1; i <= 90; i++) {
            const dateStr = format(subDays(today, i), 'yyyy-MM-dd');
            const day = heatmapByDate.get(dateStr);
            if (!day || day.total === 0) continue;
            if (day.completed >= day.total) {
                streak++;
            } else {
                break;
            }
        }

        // Adherence rate (last 30 days)
        const last30 = heatmapData.filter(d => {
            const daysAgo = Math.floor((today.getTime() - d.date.getTime()) / (1000 * 60 * 60 * 24));
            return daysAgo <= 30 && d.total > 0;
        });
        const totalExpected = last30.reduce((acc, d) => acc + d.total, 0);
        const totalCompleted = last30.reduce((acc, d) => acc + d.completed, 0);
        const adherenceRate = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;

        return { todayDoses, ringDoses, heatmapData, streak, adherenceRate, currentWindow };
    }, [protocols, inventory, todayAbbr, todayStr, currentWindow, isHousehold, allMemberProtocols]);

    // ── Unified dose logging (protocol log + vial decrement) ────
    const handleLogDose = (dose: DueNowDose) => {
        // In household mode, only allow logging your own doses (not other members')
        if (dose.memberContactId && dose.memberContactId !== contact?.id) {
            return; // Can't log another member's protocol
        }

        // 1. Log protocol compliance (if linked)
        if (dose.protocolItemId) {
            logProtocolUsage.mutate({ itemId: dose.protocolItemId });
        }
        // 2. Atomic vial decrement via RPC
        actions.logDose.mutate({
            vialId: dose.vialId,
            doseMg: dose.doseAmountMg,
        });
    };

    if (isLoadingContact) return (
        <div className="space-y-6 pb-20">
            <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-7 w-52" />
            </div>
            <Skeleton className="h-11 w-full rounded-xl" />
            <GlassCard><CardContent className="pt-6 pb-5 flex justify-center"><Skeleton className="h-28 w-28 rounded-full" /></CardContent></GlassCard>
            <div className="grid grid-cols-2 gap-3">
                <GlassCard><CardContent className="pt-5 pb-4 flex flex-col items-center gap-2"><Skeleton className="h-8 w-8 rounded-xl" /><Skeleton className="h-6 w-10" /><Skeleton className="h-3 w-16" /></CardContent></GlassCard>
                <GlassCard><CardContent className="pt-5 pb-4 flex flex-col items-center gap-2"><Skeleton className="h-8 w-8 rounded-xl" /><Skeleton className="h-6 w-10" /><Skeleton className="h-3 w-16" /></CardContent></GlassCard>
            </div>
            <GlassCard><CardContent className="pt-5 pb-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
            </CardContent></GlassCard>
        </div>
    );

    if (isContactError) return <QueryError message="Failed to load your profile." onRetry={refetchContact} />;

    if (!contact && !isLoadingContact) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 p-8">
                <div className="p-4 bg-primary/10 rounded-full">
                    <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Welcome to ThePeptideAI</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    Your account is set up! Your profile is being finalized by your provider. In the meantime, feel free to explore or chat with our AI assistant.
                </p>
                <div className="flex gap-3 mt-2">
                    <button
                        onClick={() => navigate('/store')}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Browse Store
                    </button>
                    <button
                        onClick={() => navigate('/messages')}
                        className="px-4 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                        Contact Support
                    </button>
                </div>
                <div className="w-full max-w-md border border-border/50 rounded-lg p-4 mt-6">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Peptide AI Assistant
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
            <motion.div
                className="flex flex-col gap-0.5"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
                <p className="text-sm font-medium text-muted-foreground/60">
                    {format(today, 'EEEE, MMMM do')}
                </p>
                <h1 className="text-2xl font-bold tracking-tight">
                    Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 18 ? 'Afternoon' : 'Evening'},{' '}
                    <span className="text-gradient-primary">{contact?.name?.split(' ')[0] || 'Friend'}</span>
                </h1>
            </motion.div>

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
                    {/* ─── TODAY'S DOSES (HERO — first thing boomers see) ─── */}
                    {hasDosesToday && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardContent className="pt-5 pb-4">
                                {isHousehold ? (
                                    <HouseholdDoseSection
                                        doses={gamified.todayDoses}
                                        currentWindow={gamified.currentWindow}
                                        onLogDose={handleLogDose}
                                        isLogging={logProtocolUsage.isPending || actions.logDose.isPending}
                                        currentMemberId={contact?.id}
                                    />
                                ) : (
                                    <DueNowCards
                                        doses={gamified.todayDoses}
                                        currentWindow={gamified.currentWindow}
                                        onLogDose={handleLogDose}
                                        isLogging={logProtocolUsage.isPending || actions.logDose.isPending}
                                    />
                                )}
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

                    {/* ─── Progress Bar (compact replacement for rings) ─── */}
                    {hasDosesToday && (() => {
                        const totalDoses = gamified.todayDoses.length;
                        const doneDoses = gamified.todayDoses.filter(d => d.isTaken).length;
                        const pct = totalDoses > 0 ? Math.round((doneDoses / totalDoses) * 100) : 0;
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 px-1"
                            >
                                <div className="flex items-center gap-2 shrink-0">
                                    <Flame className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-bold text-primary">{gamified.streak}d</span>
                                </div>
                                <Progress
                                    value={pct}
                                    className="flex-1 h-3 rounded-full [&>div]:bg-gradient-to-r [&>div]:from-emerald-600 [&>div]:to-emerald-400 [&>div]:rounded-full"
                                />
                                <span className="text-sm font-semibold text-emerald-400 shrink-0">
                                    {doneDoses}/{totalDoses}
                                </span>
                            </motion.div>
                        );
                    })()}

                    {/* ─── Fridge (Vial Lifecycle Manager — moved up) ─── */}
                    <SimpleVials inventory={inventory || []} contactId={contact?.id} />

                    {/* ─── Week Calendar Strip ─── */}
                    <WeekStrip inventory={inventory || []} />

                    {/* ─── My Stats (collapsible — gamification in supporting role) ─── */}
                    <GlassCard className="border-white/[0.04] overflow-hidden">
                        <button
                            onClick={() => {
                                const el = document.getElementById('stats-content');
                                if (el) el.classList.toggle('hidden');
                                const chevron = document.getElementById('stats-chevron');
                                if (chevron) chevron.classList.toggle('rotate-180');
                            }}
                            className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-white/[0.04] text-muted-foreground/60">
                                    <Target className="h-4 w-4" />
                                </div>
                                <span className="font-semibold text-sm tracking-tight">My Stats</span>
                                <span className="text-xs text-muted-foreground/40">
                                    {gamified.adherenceRate}% adherence
                                </span>
                            </div>
                            <div id="stats-chevron" className="p-1 rounded-lg bg-white/[0.04] transition-transform duration-200">
                                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                        </button>
                        <div id="stats-content" className="hidden">
                            <CardContent className="pt-0 pb-4 space-y-4">
                                {/* Stats Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col items-center gap-1.5">
                                        <Flame className="h-4 w-4 text-primary" />
                                        <div className="text-2xl font-bold tracking-tight text-primary">{gamified.streak}</div>
                                        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Day Streak</div>
                                    </div>
                                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col items-center gap-1.5">
                                        <Target className="h-4 w-4 text-emerald-400" />
                                        <div className="text-2xl font-bold tracking-tight text-emerald-400">{gamified.adherenceRate}%</div>
                                        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">30-Day Adherence</div>
                                    </div>
                                </div>

                                {/* Peptide Rings */}
                                {hasDosesToday && <PeptideRings doses={gamified.ringDoses} />}

                                {/* Heatmap */}
                                {gamified.heatmapData.some(d => d.total > 0) && (
                                    <ComplianceHeatmap data={gamified.heatmapData} />
                                )}
                            </CardContent>
                        </div>
                    </GlassCard>

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
