import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, CalendarDays, Eye } from 'lucide-react';
import { SimpleVials } from '@/components/regimen/SimpleVials';
import { ProtocolCalendar } from '@/components/regimen/ProtocolCalendar';
import { type Protocol, type ClientInventoryItem } from '@/types/regimen';
import { ClientInventoryList } from './ClientInventoryList';
import { ClientDashboardInner } from '@/pages/client/ClientDashboard';

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
                    <ClientDashboardInner contactId={contactId} isAdminPreview />
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

// AdminClientPreview removed — replaced by ClientDashboardInner from ClientDashboard.tsx
