import { useParams, useNavigate } from 'react-router-dom';
import { useContact } from '@/hooks/use-contacts';
import { useProtocols } from '@/hooks/use-protocols';
import { usePeptides } from '@/hooks/use-peptides';
import { useMovements } from '@/hooks/use-movements';
import { supabase } from '@/integrations/sb_client/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Calculator, FlaskConical } from 'lucide-react';
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
    const { data: movements } = useMovements(id);

    const navigate = useNavigate();

    // Confirm dialog state (replaces browser confirm())
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(
        { open: false, title: '', description: '', action: () => {} }
    );

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
                        onClick={() => navigate(`/protocol-builder?contact=${id}`)}
                    >
                        <FlaskConical className="mr-2 h-4 w-4" />
                        Build Protocol
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
