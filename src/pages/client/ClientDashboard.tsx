import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2, CheckCircle2, Clock, Sparkles, User, Flame, Target } from "lucide-react";
import { format, isSameDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { WeekStrip } from '@/components/regimen/WeekStrip';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIChatInterface } from "@/components/ai/AIChatInterface";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { QueryError } from "@/components/ui/query-error";

function ClientDashboardContent() {
    const { data: contact, isLoading: isLoadingContact, isError: isContactError, refetch: refetchContact } = useClientProfile();
    const { protocols, logProtocolUsage } = useProtocols(contact?.id);
    const navigate = useNavigate();
    const { user } = useAuth();

    const today = new Date();

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

    const activeProtocols = protocols || [];

    // Calculate adherence for today
    const todaysItems = activeProtocols.map(p => {
        const item = p.protocol_items?.[0];
        if (!item) return null;

        const logs = item.protocol_logs || [];
        const sortedLogs = [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const latestLog = sortedLogs[0];
        const isTakenToday = latestLog && isSameDay(new Date(), new Date(latestLog.created_at));

        return {
            protocolName: p.name,
            item,
            isTakenToday,
            lastTaken: latestLog?.created_at,
            units: (() => {
                const activeVial = inventory?.find((v) => v.peptide_id === item.peptide_id && v.concentration_mg_ml);
                if (!activeVial || !activeVial.concentration_mg_ml) return null;
                const doseMg = item.dosage_unit === 'mcg' ? item.dosage_amount / 1000 : item.dosage_amount;
                return Math.round((doseMg / activeVial.concentration_mg_ml) * 100);
            })()
        };
    }).filter(Boolean);

    const takenCount = todaysItems.filter(i => i?.isTakenToday).length;
    const totalCount = todaysItems.length;
    const adherenceRate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
    const streak = parseInt(contact?.notes?.match(/streak:(\d+)/i)?.[1] || '0');

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
                    {/* Today's Regimen Checklist */}
                    {todaysItems.length > 0 && (
                        <GlassCard className="border-white/[0.04] overflow-hidden">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold tracking-tight flex justify-between items-center">
                                    Today's Regimen
                                    <span className="text-[11px] font-medium text-muted-foreground/50 bg-white/[0.04] px-2.5 py-1 rounded-full">
                                        {takenCount}/{totalCount}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {todaysItems.map((item) => (
                                        <div
                                            key={item.item.id}
                                            className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${
                                                item.isTakenToday
                                                    ? 'bg-emerald-500/[0.06]'
                                                    : 'bg-white/[0.02] border border-white/[0.04]'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {item.isTakenToday ? (
                                                    <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                                    </div>
                                                ) : (
                                                    <div className="h-8 w-8 rounded-xl bg-white/[0.04] flex items-center justify-center">
                                                        <Clock className="h-4 w-4 text-muted-foreground/50" />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium text-sm">{item.protocolName}</p>
                                                    <p className="text-xs text-muted-foreground/50">
                                                        {item.item.dosage_amount}{item.item.dosage_unit}
                                                        {item.units && (
                                                            <span className="ml-1.5 text-emerald-400/80 font-medium">· {item.units} units</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            {item.isTakenToday ? (
                                                <span className="text-[11px] text-emerald-400/70 font-medium">
                                                    {format(new Date(item.lastTaken), 'h:mm a')}
                                                </span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="h-8 rounded-xl text-xs font-medium"
                                                    disabled={logProtocolUsage.isPending}
                                                    onClick={() => logProtocolUsage.mutate({ itemId: item.item.id })}
                                                >
                                                    Mark Done
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </GlassCard>
                    )}

                    {/* Week Calendar Strip */}
                    <WeekStrip inventory={inventory || []} />

                    {/* Vial Lifecycle Manager */}
                    <SimpleVials inventory={inventory || []} contactId={contact?.id} />

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <GlassCard className="border-white/[0.04] hover-lift">
                            <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center gap-1.5">
                                <div className="p-2 rounded-xl bg-primary/10 mb-1">
                                    <Flame className="h-4 w-4 text-primary" />
                                </div>
                                <div className="text-2xl font-bold tracking-tight text-primary">{streak}</div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Day Streak</div>
                            </CardContent>
                        </GlassCard>
                        <GlassCard className="border-white/[0.04] hover-lift">
                            <CardContent className="pt-5 pb-4 flex flex-col items-center justify-center gap-1.5">
                                <div className="p-2 rounded-xl bg-emerald-500/10 mb-1">
                                    <Target className="h-4 w-4 text-emerald-400" />
                                </div>
                                <div className="text-2xl font-bold tracking-tight text-emerald-400">{adherenceRate}%</div>
                                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Adherence</div>
                            </CardContent>
                        </GlassCard>
                    </div>

                    {/* Quick Actions */}
                    <button
                        onClick={() => navigate('/my-regimen')}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all duration-200"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/[0.04]">
                                <Clock className="h-4 w-4 text-muted-foreground/60" />
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
