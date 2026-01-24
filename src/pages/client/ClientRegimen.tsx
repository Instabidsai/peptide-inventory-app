
import { useEffect, useState } from "react";
import { useClientProfile } from "@/hooks/use-client-profile";
import { useProtocols } from "@/hooks/use-protocols";
import { supabase } from "@/integrations/sb_client/client";
import { ClientInventoryItem, ClientDailyLog, DailyProtocolTask } from "@/types/regimen";
import { DigitalFridge } from "@/components/regimen/DigitalFridge";
import { DailyProtocol } from "@/components/regimen/DailyProtocol";
import { HealthMetrics } from "@/components/regimen/HealthMetrics";
import { FinancialOverview } from "@/components/regimen/FinancialOverview";
import { SupplementStack, SupplementItem } from "@/components/regimen/SupplementStack";
import { SuggestedStack } from "@/components/regimen/SuggestedStack";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ClientRegimen() {
    const { data: contact, isLoading: profileLoading, isError: profileError, error: profileErrorObj } = useClientProfile();
    const { protocols } = useProtocols(contact?.id);
    const { toast } = useToast();

    const [inventory, setInventory] = useState<ClientInventoryItem[]>([]);
    const [dailyLogs, setDailyLogs] = useState<ClientDailyLog[]>([]);
    const [tasks, setTasks] = useState<DailyProtocolTask[]>([]);
    const [loading, setLoading] = useState(true);

    // Initial Data Fetch
    useEffect(() => {
        if (profileLoading) return;

        if (!contact) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Inventory
                const { data: invData } = await supabase
                    .from('client_inventory')
                    .select('*, peptide:peptides(name), movement:movements(movement_date, id)')
                    .eq('contact_id', contact.id);

                if (invData) setInventory(invData as any);

                // 2. Fetch Today's Log
                const today = format(new Date(), 'yyyy-MM-dd');
                const { data: logData } = await supabase
                    .from('client_daily_logs')
                    .select('*')
                    .eq('contact_id', contact.id)
                    .eq('log_date', today)
                    .maybeSingle();

                if (logData) setDailyLogs([logData as any]);

                // 3. Build Tasks from Protocols (Mocking/transforming for now)
                if (protocols) {
                    const protocolTasks: DailyProtocolTask[] = protocols.flatMap(p => {
                        const items = p.protocol_items?.map(item => ({
                            id: item.id,
                            type: 'peptide' as const,
                            label: `${p.name} (${item.dosage_amount}${item.dosage_unit})`,
                            detail: item.frequency,
                            is_completed: false
                        })) || [];

                        const supps = p.protocol_supplements?.map((s: any) => {
                            if (!s.supplements) return null;
                            return {
                                id: s.id,
                                type: 'supplement' as const,
                                label: `${s.supplements.name || 'Supplement'} (${s.dosage})`,
                                detail: s.frequency,
                                is_completed: false
                            };
                        }).filter(Boolean) || [];

                        return [...items, ...supps];
                    });

                    setTasks(protocolTasks);
                }

            } catch (error) {
                console.error("Error loading regimen data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [contact, protocols, profileLoading]);

    // Handlers
    const handleAddVial = async (data: any) => {
        if (!contact) return;

        // Calculate concentration if strictly following data model, but for now just saving the raw values
        // const concentration = data.vial_size_mg / data.water_added_ml;

        const { error } = await supabase.from('client_inventory').insert({
            contact_id: contact.id,
            peptide_id: data.peptide_id, // This needs to be passed safely, assuming ID or null for custom
            batch_number: data.batch_number || null,
            vial_size_mg: parseFloat(data.vial_size_mg),
            water_added_ml: parseFloat(data.water_added_ml),
            current_quantity_mg: parseFloat(data.vial_size_mg), // Starts full
            concentration_mg_ml: data.concentration_mg_ml || (parseFloat(data.vial_size_mg) / parseFloat(data.water_added_ml)),
            status: 'active'
        });

        if (error) {
            toast({ variant: "destructive", title: "Error adding vial", description: error.message });
        } else {
            toast({ title: "Inventory Updated", description: "New vial added to your fridge." });
            // Refresh data
            const { data: invData } = await supabase.from('client_inventory').select('*, peptide:peptides(name)').eq('contact_id', contact.id);
            if (invData) setInventory(invData as any);
        }
    };

    const handleLogSave = async (data: Partial<ClientDailyLog>) => {
        if (!contact) return;

        const { error } = await supabase.from('client_daily_logs').upsert({
            contact_id: contact.id,
            log_date: format(new Date(), 'yyyy-MM-dd'),
            weight_lbs: data.weight_lbs,
            notes: data.notes
            // body_fat_pct etc can be added here
        }, { onConflict: 'contact_id,log_date' });

        if (error) {
            toast({ variant: "destructive", title: "Error saving log", description: error.message });
        } else {
            toast({ title: "Metrics Logged", description: "Your health stats have been saved." });
        }
    };

    const handleTaskToggle = (id: string) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !t.is_completed } : t));
    };

    if (profileLoading) {
        return <div className="p-8 text-center animate-pulse text-muted-foreground">Loading Profile...</div>;
    }

    if (profileError) {
        return (
            <div className="p-8 text-center text-red-400 border-2 border-dashed border-red-900/20 rounded-xl m-8">
                <h2 className="text-xl font-semibold mb-2">Error Loading Profile</h2>
                <p>{profileErrorObj instanceof Error ? profileErrorObj.message : "Unknown error occurred"}</p>
            </div>
        );
    }

    if (loading && contact) {
        return <div className="p-8 text-center animate-pulse text-emerald-400">Loading Dashboard Data...</div>;
    }

    if (!contact) {
        return (
            <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl m-8">
                <h2 className="text-xl font-semibold mb-2">No Protocol Found</h2>
                <p>Please ask your administrator to link your user account to a Client Profile.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
                        Bio-Optimization Command Center
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Track your protocol, inventory, and health metrics in one place.
                    </p>
                </div>
            </div>

            {/* Financial Overview (if outstanding balance exists) */}
            {contact && <FinancialOverview contactId={contact.id} />}

            {/* Supplements Stack */}
            {/* Supplements Stack */}
            {(() => {
                try {
                    const supplementItems: SupplementItem[] = protocols?.flatMap(p =>
                        p.protocol_supplements?.map((s: any) => {
                            if (!s || !s.supplements) return null;
                            return {
                                id: s.id,
                                name: s.supplements.name || 'Unknown',
                                dosage: s.dosage || '',
                                frequency: s.frequency || '',
                                notes: s.notes,
                                image_url: s.supplements.image_url,
                                purchase_link: s.supplements.purchase_link,
                                description: s.supplements.description
                            };
                        }).filter(Boolean) as SupplementItem[]
                    ) || [];

                    return <SupplementStack items={supplementItems} />;
                } catch (err) {
                    console.error("Failed to render supplement stack", err);
                    return null;
                }
            })()}

            {/* Suggested For You - New Section */}
            {(() => {
                // 1. Get active peptide IDs from inventory/protocols
                const activePeptideIds = new Set([
                    ...inventory.map(i => i.peptide_id),
                    ...(protocols?.flatMap(p => p.protocol_items?.map(i => i.peptide_id)) || [])
                ].filter(Boolean));

                // 2. We need to fetch suggestions for these peptides. 
                // Since we can't do complex hooks inside this conditional block easily, 
                // we should move this logic up or use a separate component.
                // I'll extract it to a component <Suggestedstack />
                return <SuggestedStack activePeptideIds={Array.from(activePeptideIds) as string[]} existingSupplementIds={
                    protocols?.flatMap(p => p.protocol_supplements?.map(s => s.supplement_id)) || []
                } />;
            })()}

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[calc(100vh-200px)] min-h-[600px]">

                {/* Column 1: Daily Protocol (3 cols) */}
                <div className="md:col-span-3 h-full">
                    <DailyProtocol
                        tasks={tasks}
                        onToggle={handleTaskToggle}
                        hydration={dailyLogs[0]?.water_intake_oz || 0}
                        onAddWater={() => console.log('Add water')}
                    />
                </div>

                {/* Column 2: Inventory (5 cols) */}
                <div className="md:col-span-6 h-full">
                    <DigitalFridge
                        inventory={inventory}
                        protocols={protocols}
                        onAddVial={handleAddVial}
                        onReconstitute={() => { }}
                    />
                </div>

                {/* Column 3: Health Metrics (4 cols) */}
                <div className="md:col-span-3 h-full">
                    <HealthMetrics
                        todayLog={dailyLogs[0]}
                        onSaveLog={handleLogSave}
                    />
                </div>

            </div>
        </div>
    );
}
