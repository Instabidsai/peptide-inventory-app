import { useMemo, useState } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { useHouseholdMembers } from '@/hooks/use-household';
import { useInventoryOwnerId } from '@/hooks/use-inventory-owner';
import { CardContent } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import {
    ChevronRight,
    ChevronDown,
    Sparkles,
    Users,
    Flame,
    Target,
    Calendar,
    X,
    Heart,
    MessageSquare,
    Bell,
    Scale,
    DollarSign,
} from "lucide-react";
import { Progress } from '@/components/ui/progress';
import { format, isSameDay, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { SupplyOverview } from '@/components/regimen/SupplyOverview';
import { ProtocolCalendar } from '@/components/regimen/ProtocolCalendar';
import { useVialActions } from '@/hooks/use-vial-actions';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { isDoseDay } from '@/types/regimen';
import { cn } from '@/lib/utils';
import { calculateDoseUnits } from '@/utils/dose-utils';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIChatInterface } from "@/components/ai/AIChatInterface";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryError } from "@/components/ui/query-error";
import { ClientRequestModal } from "@/components/client/ClientRequestModal";

import { PeptideRings, RING_COLORS, type RingDose } from '@/components/gamified/PeptideRings';
import { DueNowCards, type DueNowDose } from '@/components/gamified/DueNowCards';
import { HouseholdDoseSection } from '@/components/gamified/HouseholdDoseSection';
import { ComplianceHeatmap, type DayCompletion } from '@/components/gamified/ComplianceHeatmap';

type TimeWindow = 'morning' | 'afternoon' | 'evening';

function getCurrentTimeWindow(): TimeWindow {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

function ClientDashboardContent() {
    usePageTitle('My Dashboard');
    const { brand_name: brandName } = useTenantConfig();
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
    const [changeRequestOpen, setChangeRequestOpen] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(() =>
        localStorage.getItem('household-banner-dismissed') === 'true'
    );

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

    // ── Quick Glance data (messages, notifications, weight, balance) ──
    const { data: unreadNotifications } = useQuery({
        queryKey: ['dashboard-unread-notifications', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);
            return count || 0;
        },
        enabled: !!user?.id,
    });

    const { data: unreadMessages } = useQuery({
        queryKey: ['dashboard-unread-messages', user?.id],
        queryFn: async () => {
            if (!user?.id) return 0;
            const { count } = await supabase
                .from('client_requests')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .not('admin_notes', 'is', null)
                .eq('status', 'pending');
            return count || 0;
        },
        enabled: !!user?.id,
    });

    const { data: latestWeight } = useQuery({
        queryKey: ['dashboard-latest-weight', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            const { data } = await supabase
                .from('body_composition_logs')
                .select('weight, date')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .limit(1)
                .maybeSingle();
            return data as { weight: number; date: string } | null;
        },
        enabled: !!user?.id,
    });

    const { data: outstandingBalance } = useQuery({
        queryKey: ['dashboard-balance', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return 0;
            const { data: orders } = await supabase
                .from('sales_orders')
                .select('total_amount, amount_paid')
                .eq('client_id', contact.id)
                .neq('status', 'cancelled')
                .neq('payment_status', 'paid');
            if (!orders?.length) return 0;
            return orders.reduce((sum, o) => sum + ((Number(o.total_amount) || 0) - (Number(o.amount_paid) || 0)), 0);
        },
        enabled: !!contact?.id,
    });

    const hasQuickGlance = (unreadNotifications ?? 0) > 0 || (unreadMessages ?? 0) > 0 || !!latestWeight || (outstandingBalance ?? 0) > 0;

    // ── Helper: build doses for one set of protocols against shared inventory ──
    const buildDosesForProtocols = (
        memberProtocols: typeof protocols,
        inv: typeof inventory,
        memberName?: string,
        memberContactId?: string,
        memberIsLinked?: boolean,
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
                isUnlinkedMember: !!memberContactId && memberContactId !== contact?.id && memberIsLinked === false,
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
                    member.is_linked,
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
        // In household mode, only allow logging your own doses OR unlinked members' doses
        if (dose.memberContactId && dose.memberContactId !== contact?.id && !dose.isUnlinkedMember) {
            toast.info(`Only ${dose.memberName || 'they'} can log their own doses`);
            return;
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
        <motion.div
            className="space-y-6 pb-20"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
            <motion.div className="space-y-1" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-7 w-52" />
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <Skeleton className="h-11 w-full rounded-xl" />
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <GlassCard><CardContent className="pt-6 pb-5 flex justify-center"><Skeleton className="h-28 w-28 rounded-full" /></CardContent></GlassCard>
            </motion.div>
            <motion.div className="grid grid-cols-2 gap-3" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <GlassCard><CardContent className="pt-5 pb-4 flex flex-col items-center gap-2"><Skeleton className="h-8 w-8 rounded-xl" /><Skeleton className="h-6 w-10" /><Skeleton className="h-3 w-16" /></CardContent></GlassCard>
                <GlassCard><CardContent className="pt-5 pb-4 flex flex-col items-center gap-2"><Skeleton className="h-8 w-8 rounded-xl" /><Skeleton className="h-6 w-10" /><Skeleton className="h-3 w-16" /></CardContent></GlassCard>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <GlassCard><CardContent className="pt-5 pb-4 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                </CardContent></GlassCard>
            </motion.div>
        </motion.div>
    );

    if (isContactError) return <QueryError message="Failed to load your profile." onRetry={refetchContact} />;

    if (!contact && !isLoadingContact) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-5 p-8">
                <motion.div
                    className="p-5 bg-gradient-to-br from-primary/15 to-primary/5 rounded-2xl ring-1 ring-primary/15"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                    <Sparkles className="h-10 w-10 text-primary" />
                </motion.div>
                <motion.div
                    className="text-center space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <h2 className="text-2xl font-bold tracking-tight">Welcome to <span className="text-gradient-primary">{brandName}</span></h2>
                    <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
                        Your account is ready! Your personalized protocol is being prepared by your provider. In the meantime, explore or chat with our AI assistant.
                    </p>
                </motion.div>
                <motion.div
                    className="flex gap-3 mt-1"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                >
                    <button
                        onClick={() => navigate('/store')}
                        className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all hover-lift"
                    >
                        Browse Store
                    </button>
                    <button
                        onClick={() => navigate('/messages')}
                        className="px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all hover-lift"
                    >
                        Contact Support
                    </button>
                </motion.div>
                <motion.div
                    className="w-full max-w-md border border-border/50 rounded-xl p-4 mt-6 bg-white/[0.02]"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                >
                    <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Peptide AI Assistant
                    </h3>
                    <div className="h-[400px]">
                        <AIChatInterface />
                    </div>
                </motion.div>
            </div>
        );
    }

    const hasDosesToday = gamified.todayDoses.length > 0;
    const hasScheduledVials = (inventory || []).some(
        v => v.in_fridge && v.status === 'active' && v.concentration_mg_ml && v.dose_frequency
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Greeting Hero */}
            <GlassCard className="border-white/[0.04] overflow-hidden relative">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/[0.08] rounded-full blur-3xl pointer-events-none" />
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-blue-500 rounded-l-xl" />
                <CardContent className="pt-5 pb-4 pl-5">
                    <motion.div
                        className="flex flex-col gap-1"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        <p className="text-xs font-medium text-muted-foreground/50 tracking-wide">
                            {format(today, 'EEEE, MMMM do')}
                        </p>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 18 ? 'Afternoon' : 'Evening'},{' '}
                            <span className="text-gradient-primary">{contact?.name?.split(' ')[0] || 'Friend'}</span>
                        </h1>
                        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/[0.04] flex-wrap">
                            {isHousehold && (
                                <span className="text-xs font-medium text-muted-foreground/50 flex items-center gap-1">
                                    <Users className="h-3 w-3 text-violet-400" />
                                    {householdMembers?.length} family
                                </span>
                            )}
                            {hasDosesToday && (
                                <span className="text-xs font-medium text-muted-foreground/50">
                                    <span className="text-emerald-400 font-semibold">{gamified.todayDoses.filter(d => d.isTaken).length}/{gamified.todayDoses.length}</span> doses today
                                </span>
                            )}
                            {gamified.streak > 0 && (
                                <span className="text-xs font-medium text-muted-foreground/50 flex items-center gap-1">
                                    <Flame className="h-3 w-3 text-orange-400" />
                                    {gamified.streak}d streak
                                </span>
                            )}
                            {(inventory?.length ?? 0) > 0 && (
                                <span className="text-xs font-medium text-muted-foreground/50">
                                    {inventory?.length} active vial{inventory?.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </motion.div>
                </CardContent>
            </GlassCard>

            {/* ── Family Discovery Banner (non-household users) ─── */}
            {!contact?.household_id && !bannerDismissed && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-violet-500/[0.06] border border-violet-500/15"
                >
                    <div className="p-2 rounded-xl bg-violet-500/10 shrink-0">
                        <Heart className="h-4 w-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold tracking-tight">Share your fridge with family</p>
                        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Add family members so everyone tracks their own doses from your shared supply.</p>
                    </div>
                    <button
                        onClick={() => navigate('/account?section=family')}
                        className="text-xs font-semibold text-violet-400 hover:text-violet-300 px-3 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/15 transition-colors whitespace-nowrap shrink-0"
                    >
                        Set Up
                    </button>
                    <button
                        onClick={() => {
                            localStorage.setItem('household-banner-dismissed', 'true');
                            setBannerDismissed(true);
                        }}
                        className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors shrink-0"
                        title="Dismiss"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </motion.div>
            )}

            {/* ── Quick Glance — connected data tiles ─── */}
            {hasQuickGlance && (
                <motion.div
                    className="grid grid-cols-2 gap-2.5"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    {(unreadMessages ?? 0) > 0 && (
                        <button
                            onClick={() => navigate('/messages')}
                            className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/15 hover:bg-blue-500/[0.1] transition-colors text-left"
                        >
                            <div className="p-1.5 rounded-lg bg-blue-500/10 shrink-0 relative">
                                <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white leading-none px-0.5">
                                    {(unreadMessages ?? 0) > 9 ? '9+' : unreadMessages}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{unreadMessages} New Message{unreadMessages !== 1 ? 's' : ''}</p>
                                <p className="text-[10px] text-muted-foreground/40">From your care team</p>
                            </div>
                        </button>
                    )}

                    {(unreadNotifications ?? 0) > 0 && (
                        <button
                            onClick={() => navigate('/notifications')}
                            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 hover:bg-amber-500/[0.1] transition-colors text-left"
                        >
                            <div className="p-1.5 rounded-lg bg-amber-500/10 shrink-0 relative">
                                <Bell className="h-3.5 w-3.5 text-amber-400" />
                                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white leading-none px-0.5">
                                    {(unreadNotifications ?? 0) > 9 ? '9+' : unreadNotifications}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{unreadNotifications} Alert{(unreadNotifications ?? 0) !== 1 ? 's' : ''}</p>
                                <p className="text-[10px] text-muted-foreground/40">Updates & reminders</p>
                            </div>
                        </button>
                    )}

                    {latestWeight && (
                        <button
                            onClick={() => navigate('/body-composition')}
                            className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 hover:bg-emerald-500/[0.1] transition-colors text-left"
                        >
                            <div className="p-1.5 rounded-lg bg-emerald-500/10 shrink-0">
                                <Scale className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">{latestWeight.weight} lbs</p>
                                <p className="text-[10px] text-muted-foreground/40">Last weigh-in</p>
                            </div>
                        </button>
                    )}

                    {(outstandingBalance ?? 0) > 0 && (
                        <button
                            onClick={() => navigate('/my-regimen')}
                            className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 hover:bg-red-500/[0.1] transition-colors text-left"
                        >
                            <div className="p-1.5 rounded-lg bg-red-500/10 shrink-0">
                                <DollarSign className="h-3.5 w-3.5 text-red-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold truncate">${(outstandingBalance ?? 0).toFixed(2)} due</p>
                                <p className="text-[10px] text-muted-foreground/40">Outstanding balance</p>
                            </div>
                        </button>
                    )}
                </motion.div>
            )}

            <Tabs defaultValue="protocol" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-5 h-11 rounded-xl bg-white/[0.04] p-1">
                    <TabsTrigger value="protocol" className="rounded-lg text-sm font-medium data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
                        My Protocol
                    </TabsTrigger>
                    <TabsTrigger value="ai-coach" className="rounded-lg text-sm font-medium gap-2 data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
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
                        <GlassCard className="border-white/[0.04] overflow-hidden relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent pointer-events-none" />
                            <CardContent className="py-8">
                                <div className="flex flex-col items-center gap-3 text-center">
                                    <motion.div
                                        className="p-4 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/10"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                                    >
                                        <Calendar className="h-6 w-6 text-emerald-400" />
                                    </motion.div>
                                    <div className="space-y-1">
                                        <p className="font-bold text-base tracking-tight">Rest & Recover</p>
                                        <p className="text-xs text-muted-foreground/50 max-w-[240px] leading-relaxed">
                                            No doses scheduled today. Your body is recovering — you're right on track.
                                        </p>
                                    </div>
                                    {gamified.streak > 0 && (
                                        <div className="flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                                            <Flame className="h-3.5 w-3.5 text-orange-400" />
                                            <span className="text-xs font-semibold text-muted-foreground/70">{gamified.streak} day streak</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* ─── Progress Bar ─── */}
                    {hasDosesToday && (() => {
                        const totalDoses = gamified.todayDoses.length;
                        const doneDoses = gamified.todayDoses.filter(d => d.isTaken).length;
                        const pct = totalDoses > 0 ? Math.round((doneDoses / totalDoses) * 100) : 0;
                        const personalDoses = isHousehold
                            ? gamified.todayDoses.filter(d => !d.memberContactId || d.memberContactId === contact?.id)
                            : gamified.todayDoses;
                        const personalDone = personalDoses.filter(d => d.isTaken).length;
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-1.5 px-1"
                            >
                                <div className="flex items-center gap-3">
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
                                </div>
                                {isHousehold && (
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/40 pl-[52px]">
                                        <span>You: <span className="font-semibold text-emerald-400/70">{personalDone}/{personalDoses.length}</span></span>
                                        <span>Family total: {doneDoses}/{totalDoses}</span>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()}

                    {/* ─── Supply Overview (aggregate days-of-supply for all peptides) ─── */}
                    <SupplyOverview inventory={inventory || []} contactId={contact?.id} />

                    {/* ─── Fridge (Vial Lifecycle Manager — moved up) ─── */}
                    <SimpleVials inventory={inventory || []} contactId={contact?.id} />

                    {/* ─── Protocol Calendar (month/week) ─── */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                            <Calendar className="h-4 w-4 text-muted-foreground/50" />
                            <h3 className="text-sm font-semibold tracking-tight">{isHousehold ? 'Family Schedule' : 'Your Schedule'}</h3>
                            <span className="text-[10px] text-muted-foreground/40">Tap any day to see details</span>
                        </div>
                    <ProtocolCalendar
                        inventory={inventory || []}
                        protocolLogs={(protocols || []).flatMap(p =>
                            (p.protocol_items || []).flatMap(item =>
                                (item.protocol_logs || []).map(log => ({
                                    created_at: log.created_at,
                                    protocol_item_id: item.id,
                                    status: log.status,
                                }))
                            )
                        )}
                    />
                    </div>

                    {/* ─── Request Protocol Change ─── */}
                    <div className="flex justify-center">
                        <button
                            onClick={() => setChangeRequestOpen(true)}
                            className="flex items-center gap-2 text-xs font-medium text-muted-foreground/60 hover:text-primary bg-white/[0.02] hover:bg-primary/5 border border-white/[0.06] hover:border-primary/20 px-4 py-2.5 rounded-xl transition-all"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Want to adjust your dosage or schedule? Request a change
                        </button>
                    </div>
                    <ClientRequestModal
                        open={changeRequestOpen}
                        onOpenChange={setChangeRequestOpen}
                        defaultType="protocol_change"
                        context={contact ? { type: 'protocol', id: contact.id, title: 'My Protocol' } : undefined}
                    />

                    {/* ─── My Stats (collapsible — gamification in supporting role) ─── */}
                    <GlassCard className="border-white/[0.04] overflow-hidden">
                        <button
                            onClick={() => setStatsOpen(prev => !prev)}
                            className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-white/[0.04] text-muted-foreground/60">
                                    <Target className="h-4 w-4" />
                                </div>
                                <span className="font-semibold text-sm tracking-tight">My Progress</span>
                                <span className="text-xs text-muted-foreground/40">
                                    {gamified.adherenceRate}% consistency
                                </span>
                            </div>
                            <div className={cn("p-1 rounded-lg bg-white/[0.04] transition-transform duration-200", statsOpen && "rotate-180")}>
                                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                        </button>
                        <div className={statsOpen ? '' : 'hidden'}>
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
                                        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">30-Day Consistency</div>
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
                    <motion.button
                        onClick={() => navigate('/my-regimen')}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-primary/10 transition-all duration-300 group"
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10 group-hover:ring-primary/20 transition-all">
                                <Calendar className="h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-sm tracking-tight">My Wellness Hub</div>
                                <div className="text-xs text-muted-foreground/40">Manage supplies, log health data, and view your full plan</div>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
                    </motion.button>
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
