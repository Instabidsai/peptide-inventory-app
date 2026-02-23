
import { useEffect, useState } from "react";
import { useClientProfile } from "@/hooks/use-client-profile";
import { useProtocols } from "@/hooks/use-protocols";
import { useInventoryOwnerId } from "@/hooks/use-inventory-owner";
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
import { ClientRequestModal } from "@/components/client/ClientRequestModal";
import { calculateDoseUnits } from "@/utils/dose-utils";

export default function ClientRegimen() {
    const { data: contact, isLoading: profileLoading, isError: profileError, error: profileErrorObj } = useClientProfile();
    const { protocols, logProtocolUsage } = useProtocols(contact?.id);
    const inventoryOwnerId = useInventoryOwnerId(contact);
    const { toast } = useToast();

    const [inventory, setInventory] = useState<ClientInventoryItem[]>([]);
    const [dailyLogs, setDailyLogs] = useState<ClientDailyLog[]>([]);
    const [tasks, setTasks] = useState<DailyProtocolTask[]>([]);
    const [loading, setLoading] = useState(true);

    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [selectedRefillPeptide, setSelectedRefillPeptide] = useState<{ id: string, name: string } | undefined>(undefined);

    // Standalone inventory refresh — uses household owner's contact for shared fridge
    const refreshInventory = async () => {
        if (!inventoryOwnerId) return;
        const { data: invData } = await supabase
            .from('client_inventory')
            .select('*, peptide:peptides(name), movement:movements(movement_date, id)')
            .eq('contact_id', inventoryOwnerId);
        if (invData) setInventory(invData as ClientInventoryItem[]);
    };

    // Initial Data Fetch
    useEffect(() => {
        if (profileLoading) return;

        if (!contact) {
            setLoading(false);
            return;
        }

        let mounted = true;

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Inventory
                await refreshInventory();
                if (!mounted) return;

                // 2. Fetch Today's Log
                const today = format(new Date(), 'yyyy-MM-dd');
                const { data: logData } = await supabase
                    .from('client_daily_logs')
                    .select('*')
                    .eq('contact_id', contact.id)
                    .eq('log_date', today)
                    .maybeSingle();

                if (!mounted) return;
                if (logData) setDailyLogs([logData as ClientDailyLog]);

                // 3. Build Tasks from Protocols
                if (protocols) {
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    const protocolTasks: DailyProtocolTask[] = protocols.flatMap(p => {
                        const items = p.protocol_items?.map(item => {
                            const activeVial = inventory.find(v => v.peptide_id === item.peptide_id && v.status === 'active' && v.concentration_mg_ml);
                            const doseMg = item.dosage_unit === 'mcg' ? item.dosage_amount / 1000 : item.dosage_amount;

                            let unitsLabel = '';
                            if (activeVial?.concentration_mg_ml) {
                                const units = calculateDoseUnits(doseMg, activeVial.concentration_mg_ml);
                                unitsLabel = ` · ${units} units on syringe`;
                            }

                            // Check protocol_logs for today to set initial completion state
                            const isTakenToday = (item.protocol_logs || []).some(
                                log => format(new Date(log.created_at), 'yyyy-MM-dd') === todayStr
                            );

                            // Friendly frequency labels
                            const freqLabels: Record<string, string> = {
                                daily: 'Every day',
                                daily_am_pm: 'Twice daily (AM & PM)',
                                weekly: 'Once a week',
                                biweekly: 'Twice a week',
                                monthly: 'Once a month',
                                every_other_day: 'Every other day',
                            };

                            return {
                                id: item.id,
                                type: 'peptide' as const,
                                label: `${item.peptides?.name || p.name} — ${item.dosage_amount}${item.dosage_unit}${unitsLabel}`,
                                detail: freqLabels[item.frequency] || item.frequency,
                                is_completed: isTakenToday,
                            };
                        }) || [];

                        const supps = p.protocol_supplements?.map((s) => {
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

                    if (mounted) setTasks(protocolTasks);
                }

            } catch (error) {
                console.error("Error loading regimen data:", error);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchData();
        return () => { mounted = false; };
    }, [contact, protocols, profileLoading, inventoryOwnerId]);

    // Handlers
    const handleAddVial = async (data: Partial<ClientInventoryItem>) => {
        if (!contact) return;

        const { error } = await supabase.from('client_inventory').insert({
            contact_id: inventoryOwnerId || contact.id,
            peptide_id: data.peptide_id,
            batch_number: data.batch_number || null,
            vial_size_mg: Number(data.vial_size_mg),
            water_added_ml: Number(data.water_added_ml),
            current_quantity_mg: Number(data.vial_size_mg),
            concentration_mg_ml: data.concentration_mg_ml || (Number(data.vial_size_mg) / Number(data.water_added_ml)),
            status: 'active'
        });

        if (error) {
            toast({ variant: "destructive", title: "Error adding vial", description: error.message });
        } else {
            toast({ title: "Inventory Updated", description: "New vial added to your fridge." });
            await refreshInventory();
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
        const task = tasks.find(t => t.id === id);
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !t.is_completed } : t));
        // Persist to protocol_logs if marking as completed (not un-checking)
        if (task && !task.is_completed && task.type === 'peptide') {
            logProtocolUsage.mutate({ itemId: id });
        }
    };

    const handleDeleteVial = async (id: string) => {
        if (!contact) return;

        const { error } = await supabase
            .from('client_inventory')
            .update({ status: 'archived' })
            .eq('id', id);

        if (error) {
            toast({ variant: "destructive", title: "Error removing vial", description: error.message });
        } else {
            toast({ title: "Vial Removed", description: "Vial has been moved to archive." });
            setInventory(prev => prev.filter(item => item.id !== id));
        }
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
            <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl m-8 space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <h2 className="text-xl font-semibold">Getting Things Ready</h2>
                <p className="text-sm max-w-sm mx-auto">Your account hasn't been linked to a patient profile yet. Your provider will set this up for you — it usually takes less than a day.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
                        My Health Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Your daily wellness routine, supplies, and progress — all in one place.
                    </p>
                </div>
                <button
                    onClick={() => setRequestModalOpen(true)}
                    className="bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium px-5 py-2.5 rounded-xl transition-colors border border-primary/20 shrink-0 flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Contact My Provider
                </button>
            </div>

            {/* Financial Overview (if outstanding balance exists) */}
            {contact && <FinancialOverview contactId={contact.id} />}

            {/* Supplements Stack */}
            {(() => {
                try {
                    const supplementItems: SupplementItem[] = protocols?.flatMap(p =>
                        p.protocol_supplements?.map((s) => {
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:h-[calc(100vh-200px)] md:min-h-[600px]">

                {/* Column 1: Daily Protocol (3 cols) */}
                <div className="md:col-span-3 h-full">
                    <DailyProtocol
                        tasks={tasks}
                        onToggle={handleTaskToggle}
                        hydration={dailyLogs[0]?.water_intake_oz || 0}
                        onAddWater={() => toast({ title: 'Water tracking coming soon' })}
                    />
                </div>

                {/* Column 2: Inventory (5 cols) */}
                <div className="md:col-span-6 h-full">
                    <DigitalFridge
                        inventory={inventory}
                        protocols={protocols}
                        onAddVial={handleAddVial}
                        onReconstitute={() => toast({ title: 'Reconstitution guide coming soon' })}
                        onDelete={handleDeleteVial}
                        onRequestRefill={(peptide) => {
                            setSelectedRefillPeptide({ id: peptide.id, name: peptide.name });
                            setRequestModalOpen(true);
                        }}
                        onRefresh={refreshInventory}
                    />
                </div>

                {/* Column 3: Health Metrics (4 cols) */}
                <div className="md:col-span-3 h-full">
                    <HealthMetrics
                        todayLog={dailyLogs[0]}
                        onSaveLog={handleLogSave}
                    />
                </div>

                <ClientRequestModal
                    open={requestModalOpen}
                    onOpenChange={setRequestModalOpen}
                    defaultType="regimen_help"
                    context={!selectedRefillPeptide ? { type: 'regimen', id: contact.id, title: 'My Regimen' } : undefined}
                    prefillPeptide={selectedRefillPeptide}
                    onSuccess={() => setSelectedRefillPeptide(undefined)}
                />
            </div>

        </div>

    );
}
