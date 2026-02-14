import { useClientProfile } from '@/hooks/use-client-profile';
import { useProtocols } from '@/hooks/use-protocols';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2, CheckCircle2, Clock, Sparkles, User } from "lucide-react";
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleVials } from '@/components/regimen/SimpleVials';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIChatInterface } from "@/components/ai/AIChatInterface";

import { ErrorBoundary } from "@/components/ErrorBoundary";

function ClientDashboardContent() {
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
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
                        Debug: AI Coach
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
        const sortedLogs = [...logs].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const latestLog = sortedLogs[0];
        const isTakenToday = latestLog && differenceInDays(new Date(), new Date(latestLog.created_at)) === 0;

        return {
            protocolName: p.name,
            item,
            isTakenToday,
            lastTaken: latestLog?.created_at,
            units: (() => {
                const activeVial = inventory?.find((v: any) => v.peptide_id === item.peptide_id && v.concentration_mg_ml);
                if (!activeVial) return null;
                const doseMg = item.dosage_unit === 'mcg' ? item.dosage_amount / 1000 : item.dosage_amount;
                return Math.round((doseMg / (activeVial as any).concentration_mg_ml) * 100);
            })()
        };
    }).filter(Boolean);

    const takenCount = todaysItems.filter(i => i?.isTakenToday).length;
    const totalCount = todaysItems.length;
    const adherenceRate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Greeting */}
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight">
                    Good {today.getHours() < 12 ? 'Morning' : today.getHours() < 18 ? 'Afternoon' : 'Evening'},
                </h1>
                <p className="text-muted-foreground text-lg">{contact?.name || 'Friend'}</p>
                <p className="text-sm text-muted-foreground mt-1">
                    {format(today, 'EEEE, MMMM do')}
                </p>
            </div>

            <Tabs defaultValue="protocol" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                    <TabsTrigger value="protocol">My Protocol</TabsTrigger>
                    <TabsTrigger value="ai-coach" className="gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Coach
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="protocol" className="space-y-6">
                    {/* Today's Regimen Checklist */}
                    <GlassCard className="border-l-4 border-l-primary shadow-sm shadow-primary/5">
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
                                                        {item.units && (
                                                            <span className="ml-1 text-emerald-500 font-semibold">• {item.units} units</span>
                                                        )}
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

                    {/* Simple Vials */}
                    <SimpleVials inventory={inventory || []} />

                    {/* Streak / Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <GlassCard className="border-primary/20 hover:border-primary/30 transition-all duration-300">
                            <CardContent className="pt-6 flex flex-col items-center justify-center gap-2">
                                <div className="text-3xl font-bold text-primary">{contact?.notes?.match(/streak:(\d+)/i)?.[1] || 0}</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Day Streak</div>
                            </CardContent>
                        </GlassCard>
                        <GlassCard className="border-green-500/20 hover:border-green-500/30 transition-all duration-300">
                            <CardContent className="pt-6 flex flex-col items-center justify-center gap-2">
                                <div className="text-3xl font-bold text-green-500">{adherenceRate}%</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Daily Adherence</div>
                            </CardContent>
                        </GlassCard>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-lg">Quick Actions</h3>
                        <Button variant="secondary" className="w-full justify-between h-auto py-4 hover:border-primary/20 border border-transparent" onClick={() => navigate('/my-regimen')}>
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
