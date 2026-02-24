import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, CalendarDays, Eye, Flame, Target, Pill } from 'lucide-react';
import { format, isSameDay, subDays } from 'date-fns';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { ProtocolCalendar } from '@/components/regimen/ProtocolCalendar';
import { PeptideRings, RING_COLORS, type RingDose } from '@/components/gamified/PeptideRings';
import { DueNowCards, type DueNowDose } from '@/components/gamified/DueNowCards';
import { ComplianceHeatmap, type DayCompletion } from '@/components/gamified/ComplianceHeatmap';
import { SupplyOverview } from '@/components/regimen/SupplyOverview';
import { calculateDoseUnits } from '@/utils/dose-utils';
import { isDoseDay, type Protocol, type ClientInventoryItem } from '@/types/regimen';
import { ClientInventoryList } from './ClientInventoryList';

interface DigitalFridgeSectionProps {
    contactId: string;
    contactName: string | undefined;
    assignedProtocols: Protocol[] | undefined;
    logProtocolUsage: {
        mutate: (params: { itemId?: string; inventoryItemId?: string; status?: string; takenAt?: string }) => void;
        isPending?: boolean;
    };
}

export function DigitalFridgeSection({ contactId, contactName, assignedProtocols, logProtocolUsage }: DigitalFridgeSectionProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Client Digital Fridge (Inventory)</h2>
            <Tabs defaultValue="client-view">
                <TabsList>
                    <TabsTrigger value="client-view">Client View</TabsTrigger>
                    <TabsTrigger value="client-dashboard"><Eye className="h-3.5 w-3.5 mr-1.5" />Client Dashboard</TabsTrigger>
                    <TabsTrigger value="calendar">Protocol Calendar</TabsTrigger>
                    <TabsTrigger value="admin-manage">Admin Manage</TabsTrigger>
                </TabsList>
                <TabsContent value="client-view" className="mt-4">
                    <AdminClientFridgeView contactId={contactId} />
                </TabsContent>
                <TabsContent value="client-dashboard" className="mt-4">
                    <AdminClientPreview contactId={contactId} protocols={assignedProtocols} onLogDose={logProtocolUsage} />
                </TabsContent>
                <TabsContent value="calendar" className="mt-4">
                    <AdminProtocolCalendarView contactId={contactId} protocols={assignedProtocols} onLogDose={logProtocolUsage} />
                </TabsContent>
                <TabsContent value="admin-manage" className="mt-4">
                    <ClientInventoryList contactId={contactId} contactName={contactName} assignedProtocols={assignedProtocols} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function AdminProtocolCalendarView({ contactId, protocols, onLogDose }: { contactId: string; protocols?: Protocol[]; onLogDose?: { mutate: (params: { itemId?: string; inventoryItemId?: string; status?: string; takenAt?: string }) => void; isPending?: boolean } }) {
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['client-inventory-calendar-view', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_inventory')
                .select(`
                    *,
                    peptide:peptides(name)
                `)
                .eq('contact_id', contactId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as ClientInventoryItem[];
        },
    });

    const inventoryIds = (inventory || []).map(i => i.id);
    const { data: inventoryLogs } = useQuery({
        queryKey: ['protocol-logs', contactId, inventoryIds],
        queryFn: async () => {
            if (!inventoryIds.length) return [];
            const { data, error } = await supabase
                .from('protocol_logs')
                .select('taken_at, created_at, protocol_item_id, client_inventory_id, status')
                .in('client_inventory_id', inventoryIds);
            if (error) throw error;
            return data || [];
        },
        enabled: inventoryIds.length > 0,
    });

    if (isLoading) {
        return <div className="space-y-3"><Skeleton className="h-60" /></div>;
    }

    const protocolItemLogs = (protocols || []).flatMap(p =>
        (p.protocol_items || []).flatMap(item =>
            (item.protocol_logs || []).map(log => ({
                created_at: log.created_at,
                protocol_item_id: item.id,
                status: log.status,
            }))
        )
    );

    const allLogs = [
        ...protocolItemLogs,
        ...(inventoryLogs || []).map(log => ({
            taken_at: log.taken_at,
            created_at: log.created_at,
            protocol_item_id: log.protocol_item_id,
            client_inventory_id: log.client_inventory_id,
            status: log.status,
        })),
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400">
                    Viewing this client's dosing calendar — tap <strong>Edit</strong> on any dose to change amount or set AM/PM timing
                </span>
            </div>
            <ProtocolCalendar
                inventory={inventory || []}
                protocolLogs={allLogs}
                onLogDose={onLogDose ? (params) => onLogDose.mutate(params) : undefined}
                isLogging={onLogDose?.isPending}
                contactId={contactId}
            />
        </div>
    );
}

function AdminClientFridgeView({ contactId }: { contactId: string }) {
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['client-inventory-fridge-view', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_inventory')
                .select(`
                    *,
                    peptide:peptides(name)
                `)
                .eq('contact_id', contactId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as ClientInventoryItem[];
        },
    });

    if (isLoading) {
        return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
    }

    if (!inventory || inventory.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active inventory items. Fulfill an order to populate the fridge.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400">
                    Previewing this client's fridge exactly as they see it
                </span>
            </div>
            <SimpleVials inventory={inventory} contactId={contactId} />
        </div>
    );
}

type PreviewTimeWindow = 'morning' | 'afternoon' | 'evening';

function AdminClientPreview({ contactId, protocols, onLogDose }: {
    contactId: string;
    protocols?: Protocol[];
    onLogDose?: { mutate: (params: { itemId?: string; inventoryItemId?: string; status?: string; takenAt?: string }) => void; isPending?: boolean };
}) {
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['client-inventory-preview', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_inventory')
                .select(`*, peptide:peptides(name)`)
                .eq('contact_id', contactId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as ClientInventoryItem[];
        },
    });

    const gamified = useMemo(() => {
        const today = new Date();
        const todayAbbr = format(today, 'EEE');
        const todayStr = format(today, 'yyyy-MM-dd');
        const hour = today.getHours();
        const currentWindow: PreviewTimeWindow = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

        // Build protocol item map and collect logs
        const protocolItemMap = new Map<string, {
            id: string; peptide_id: string; dosage_amount: number; dosage_unit: string;
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

        // Scheduled vials
        const scheduledVials = (inventory || []).filter(
            v => v.in_fridge && v.status === 'active' && v.concentration_mg_ml && v.dose_frequency && v.dose_amount_mg
        );

        // Build today's doses
        const todayDoses: DueNowDose[] = [];
        let colorIdx = 0;
        for (const vial of scheduledVials) {
            if (!isDoseDay(vial, todayAbbr)) continue;
            const protocolItem = vial.protocol_item_id ? protocolItemMap.get(vial.protocol_item_id) : null;
            const todayLogs = protocolItem
                ? protocolItem.protocol_logs.filter(log => isSameDay(new Date(), new Date(log.created_at)))
                : [];
            const isTaken = todayLogs.length > 0;
            const takenAt = isTaken ? todayLogs[todayLogs.length - 1].created_at : undefined;

            const concentration = Number(vial.concentration_mg_ml) || 0;
            const doseAmountMg = Number(vial.dose_amount_mg) || 0;
            const units = calculateDoseUnits(doseAmountMg, concentration);
            const timeOfDay = (vial.dose_time_of_day as PreviewTimeWindow) || 'morning';

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

        // Sort: untaken first, current window first
        const windowOrder: Record<PreviewTimeWindow, number> = { morning: 0, afternoon: 1, evening: 2 };
        todayDoses.sort((a, b) => {
            if (a.isTaken !== b.isTaken) return a.isTaken ? 1 : -1;
            const aIsNow = a.timeOfDay === currentWindow ? 0 : 1;
            const bIsNow = b.timeOfDay === currentWindow ? 0 : 1;
            if (aIsNow !== bIsNow) return aIsNow - bIsNow;
            return windowOrder[a.timeOfDay] - windowOrder[b.timeOfDay];
        });

        // Ring doses
        const ringDoses: RingDose[] = todayDoses.map(d => ({
            id: d.id, peptideName: d.peptideName, isTaken: d.isTaken, color: d.color,
        }));

        // Heatmap (last 91 days)
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
                if (isDoseDay(vial, dateAbbr, date)) expectedCount++;
            }
            heatmapData.push({ date, completed: Math.min(logsByDate.get(dateStr) || 0, expectedCount), total: expectedCount });
        }

        // Streak
        const heatmapByDate = new Map(heatmapData.map(d => [format(d.date, 'yyyy-MM-dd'), d]));
        let streak = 0;
        const todayHeatmap = heatmapByDate.get(todayStr);
        if (todayHeatmap && todayHeatmap.total > 0 && todayHeatmap.completed >= todayHeatmap.total) streak = 1;
        for (let i = 1; i <= 90; i++) {
            const dateStr = format(subDays(today, i), 'yyyy-MM-dd');
            const day = heatmapByDate.get(dateStr);
            if (!day || day.total === 0) continue;
            if (day.completed >= day.total) streak++;
            else break;
        }

        // Adherence (last 30 days)
        const last30 = heatmapData.filter(d => {
            const daysAgo = Math.floor((today.getTime() - d.date.getTime()) / (1000 * 60 * 60 * 24));
            return daysAgo <= 30 && d.total > 0;
        });
        const totalExpected = last30.reduce((acc, d) => acc + d.total, 0);
        const totalCompleted = last30.reduce((acc, d) => acc + d.completed, 0);
        const adherenceRate = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;

        return { todayDoses, ringDoses, heatmapData, streak, adherenceRate, currentWindow };
    }, [protocols, inventory]);

    const handleLogDose = (dose: DueNowDose) => {
        if (!onLogDose) return;
        onLogDose.mutate({
            inventoryItemId: dose.vialId,
            itemId: dose.protocolItemId,
            status: 'taken',
        });
    };

    if (isLoading) {
        return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-60" /></div>;
    }

    const { todayDoses, ringDoses, heatmapData, streak, adherenceRate, currentWindow } = gamified;
    const hasData = todayDoses.length > 0 || (inventory && inventory.length > 0);

    if (!hasData) {
        return (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active inventory or protocols. Fulfill an order to see the client dashboard preview.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                <Eye className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-purple-600 dark:text-purple-400">
                    Previewing this client's gamified dashboard — exactly what they see when they log in
                </span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-card p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-orange-500 mb-1">
                        <Flame className="h-4 w-4" />
                        <span className="text-lg font-bold">{streak}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Day Streak</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-500 mb-1">
                        <Target className="h-4 w-4" />
                        <span className="text-lg font-bold">{adherenceRate}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Adherence</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-blue-500 mb-1">
                        <Pill className="h-4 w-4" />
                        <span className="text-lg font-bold">{todayDoses.filter(d => d.isTaken).length}/{todayDoses.length}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</p>
                </div>
            </div>

            {/* Peptide Rings */}
            {ringDoses.length > 0 && (
                <div className="flex justify-center">
                    <PeptideRings doses={ringDoses} size={160} />
                </div>
            )}

            {/* Due Now Cards */}
            {todayDoses.length > 0 && (
                <DueNowCards
                    doses={todayDoses}
                    currentWindow={currentWindow}
                    onLogDose={handleLogDose}
                    isLogging={onLogDose?.isPending}
                />
            )}

            {/* Compliance Heatmap */}
            {heatmapData.length > 0 && <ComplianceHeatmap data={heatmapData} />}

            {/* Supply Overview */}
            {inventory && inventory.length > 0 && (
                <SupplyOverview inventory={inventory} contactId={contactId} />
            )}
        </div>
    );
}
