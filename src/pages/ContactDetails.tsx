import { useParams } from 'react-router-dom';
import { useContact } from '@/hooks/use-contacts';
import { useProtocols } from '@/hooks/use-protocols';
import { usePeptides } from '@/hooks/use-peptides';
import { useMovements } from '@/hooks/use-movements';
import { supabase } from '@/integrations/sb_client/client';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Calculator, Wand2 } from 'lucide-react';
import { autoGenerateProtocol } from '@/lib/auto-protocol';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from '@/hooks/use-toast';
import { FinancialOverview } from "@/components/regimen/FinancialOverview";
import { useState } from 'react';
import { Separator } from '@/components/ui/separator';

// Sub-components
import { ContactDetailsHeader } from '@/components/contacts/ContactDetailsHeader';
import { ContactInfoCard } from '@/components/contacts/ContactInfoCard';
import { ContactDialogs } from '@/components/contacts/ContactDialogs';
import { ResourcesCard } from '@/components/contacts/ResourcesCard';
import { HouseholdSection } from '@/components/contacts/HouseholdSection';
import { RegimensSection } from '@/components/contacts/RegimensSection';
import { NotesSection } from '@/components/contacts/NotesSection';
import { DigitalFridgeSection } from '@/components/contacts/DigitalFridgeSection';
import { ClientPortalCard } from '@/components/contacts/ClientPortalCard';
import { FeedbackSection } from '@/components/contacts/FeedbackSection';
import type { ConfirmDialogState } from '@/components/contacts/types';

export default function ContactDetails() {
    const { id } = useParams<{ id: string }>();
    const { data: contact, isLoading: isLoadingContact } = useContact(id!);
    const {
        protocols: assignedProtocols,
        isLoading: isLoadingProtocols,
        createProtocol,
        deleteProtocol,
        updateProtocolItem,
        logProtocolUsage,
        addProtocolSupplement,
        deleteProtocolSupplement
    } = useProtocols(id);
    const { protocols: templates } = useProtocols(undefined); // Fetch global templates
    const { data: peptides } = usePeptides();
    const queryClient = useQueryClient();
    const { data: movements } = useMovements(id);

    // Auth context for org_id
    const { profile: authProfile } = useAuth();

    // Confirm dialog state (replaces browser confirm())
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(
        { open: false, title: '', description: '', action: () => {} }
    );

    // Auto-generate protocol from sales orders
    const autoGenProtocol = useMutation({
        mutationFn: async () => {
            if (!id || !authProfile?.org_id) throw new Error('Missing contact or org');
            const { data: orders, error: ordErr } = await supabase
                .from('sales_orders')
                .select('id')
                .eq('client_id', id)
                .in('status', ['fulfilled', 'paid', 'completed']);
            if (ordErr) throw ordErr;
            if (!orders || orders.length === 0) throw new Error('No fulfilled orders found for this contact');

            const orderIds = orders.map(o => o.id);
            const { data: items, error: itemErr } = await supabase
                .from('sales_order_items')
                .select('peptide_id, peptides(name)')
                .in('order_id', orderIds);
            if (itemErr) throw itemErr;
            if (!items || items.length === 0) throw new Error('No peptide items found in orders');

            const seen = new Set<string>();
            const peptideItems: Array<{ peptideId: string; peptideName: string }> = [];
            for (const item of items) {
                if (item.peptide_id && !seen.has(item.peptide_id)) {
                    seen.add(item.peptide_id);
                    peptideItems.push({
                        peptideId: item.peptide_id,
                        peptideName: (item.peptides as { name: string } | null)?.name || 'Unknown',
                    });
                }
            }

            return autoGenerateProtocol({
                contactId: id,
                orgId: authProfile.org_id,
                items: peptideItems,
            });
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            if (result.created) {
                toast({ title: 'Protocol generated', description: `Created protocol with ${result.protocolItemMap.size} peptide(s) from orders.` });
            } else {
                toast({ title: 'Protocol already exists', description: 'A matching protocol was already found for this contact.' });
            }
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to generate protocol', description: error.message });
        },
    });

    // Customer order stats
    const { data: orderStats } = useQuery({
        queryKey: ['contact_order_stats', id],
        queryFn: async () => {
            if (!id) return null;
            const { data, error } = await supabase
                .from('sales_orders')
                .select('id, total_amount, created_at, status')
                .eq('client_id', id)
                .neq('status', 'cancelled');
            if (error) throw error;
            if (!data || data.length === 0) return null;
            const totalSpend = data.reduce((s, o) => s + Number(o.total_amount || 0), 0);
            const lastOrder = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            return {
                orderCount: data.length,
                totalSpend,
                avgOrderValue: totalSpend / data.length,
                lastOrderDate: lastOrder?.created_at,
            };
        },
        enabled: !!id,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    });

    // ContactDialogs is a "render hook" - returns handlers + JSX
    const {
        handleEditClick,
        handleAddClick,
        openAssignInventory,
        dialogsJSX,
    } = ContactDialogs({
        contactId: id!,
        peptides,
        assignedProtocols,
        createProtocol,
        updateProtocolItem,
        addProtocolSupplement,
        templates,
        onEditClick: () => {},
    });

    if (isLoadingContact) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (!contact) return <div className="p-8">Contact not found</div>;

    return (
        <div className="space-y-6">
            <ContactDetailsHeader contact={contact} orderStats={orderStats} />

            <div className="grid gap-6 md:grid-cols-2">
                <ContactInfoCard contact={contact} contactId={id!}>
                    {dialogsJSX}
                    <Button
                        variant="outline"
                        onClick={() => autoGenProtocol.mutate()}
                        disabled={autoGenProtocol.isPending}
                    >
                        {autoGenProtocol.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        Auto Protocol
                    </Button>
                </ContactInfoCard>

                <ResourcesCard contactId={id!} />
            </div>

            <Accordion type="single" collapsible defaultValue="financial" className="w-full space-y-4">
                <AccordionItem value="financial" className="border border-border/60 rounded-lg bg-card px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-muted-foreground" />
                            <span className="font-semibold text-lg">Account Status & Financials</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                        <FinancialOverview contactId={id!} />
                    </AccordionContent>
                </AccordionItem>

                <HouseholdSection contactId={id!} />

                <RegimensSection
                    contactId={id!}
                    isLoadingProtocols={isLoadingProtocols}
                    assignedProtocols={assignedProtocols}
                    peptides={peptides}
                    movements={movements}
                    onEditClick={handleEditClick}
                    onAddClick={handleAddClick}
                    onOpenAssignInventory={openAssignInventory}
                    deleteProtocol={deleteProtocol}
                    logProtocolUsage={logProtocolUsage}
                    addProtocolSupplement={addProtocolSupplement}
                    deleteProtocolSupplement={deleteProtocolSupplement}
                    createProtocol={createProtocol}
                />

                <NotesSection contactId={id!} />
            </Accordion>

            <Separator className="my-6" />

            <DigitalFridgeSection
                contactId={id!}
                contactName={contact?.name}
                assignedProtocols={assignedProtocols}
                logProtocolUsage={logProtocolUsage}
            />

            <ClientPortalCard contact={contact} />

            <FeedbackSection assignedProtocols={assignedProtocols} />

            <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            confirmDialog.action();
                            setConfirmDialog(prev => ({ ...prev, open: false }));
                        }}>
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
