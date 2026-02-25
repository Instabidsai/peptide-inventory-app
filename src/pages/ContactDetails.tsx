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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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

    // Order picker for "Build Protocol" flow
    const [orderPickerOpen, setOrderPickerOpen] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

    const { data: clientOrders } = useQuery({
        queryKey: ['contact_orders_for_protocol', id],
        queryFn: async () => {
            if (!id) return [];
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id, total_amount, created_at, status,
                    sales_order_items (
                        peptide_id,
                        quantity,
                        peptides ( name )
                    )
                `)
                .eq('client_id', id)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!id,
        staleTime: 60_000,
    });

    const openOrderPicker = () => {
        if (!clientOrders || clientOrders.length === 0) {
            // No orders — go straight to empty protocol builder
            navigate(`/protocol-builder?contact=${id}`);
            return;
        }
        // Pre-select all orders
        setSelectedOrderIds(clientOrders.map(o => o.id));
        setOrderPickerOpen(true);
    };

    const toggleOrder = (orderId: string) => {
        setSelectedOrderIds(prev =>
            prev.includes(orderId) ? prev.filter(x => x !== orderId) : [...prev, orderId]
        );
    };

    const handleBuildWithOrders = () => {
        setOrderPickerOpen(false);
        if (selectedOrderIds.length > 0) {
            navigate(`/protocol-builder?contact=${id}&orders=${selectedOrderIds.join(',')}`);
        } else {
            navigate(`/protocol-builder?contact=${id}`);
        }
    };

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
    if (!contact) return <div className="p-8">Customer not found</div>;

    return (
        <div className="space-y-6">
            <ContactDetailsHeader contact={contact} orderStats={orderStats} />

            <div className="grid gap-6 md:grid-cols-2">
                <ContactInfoCard contact={contact} contactId={id!}>
                    {dialogsJSX}
                    <Button
                        variant="outline"
                        onClick={openOrderPicker}
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

            {/* Order Picker Dialog */}
            <Dialog open={orderPickerOpen} onOpenChange={setOrderPickerOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Select Orders to Build Protocol From</DialogTitle>
                        <DialogDescription>
                            Choose which orders' peptides to load into the Protocol Builder. You can adjust everything after.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto py-2">
                        {clientOrders?.map(order => {
                            const peptideNames = (order.sales_order_items || [])
                                .map((item: { peptides?: { name: string } | null }) => item.peptides?.name)
                                .filter(Boolean);
                            const isSelected = selectedOrderIds.includes(order.id);
                            return (
                                <label
                                    key={order.id}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
                                    }`}
                                >
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleOrder(order.id)}
                                        className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium">
                                                {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {order.status}
                                            </Badge>
                                            {order.total_amount > 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    ${Number(order.total_amount).toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                        {peptideNames.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {peptideNames.map((name: string, i: number) => (
                                                    <Badge key={i} variant="secondary" className="text-[10px]">
                                                        {name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setOrderPickerOpen(false);
                                navigate(`/protocol-builder?contact=${id}`);
                            }}
                        >
                            Skip — Start Empty
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (selectedOrderIds.length === clientOrders?.length) {
                                    setSelectedOrderIds([]);
                                } else {
                                    setSelectedOrderIds(clientOrders?.map(o => o.id) || []);
                                }
                            }}
                        >
                            {selectedOrderIds.length === clientOrders?.length ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button onClick={handleBuildWithOrders} disabled={selectedOrderIds.length === 0}>
                            <FlaskConical className="mr-2 h-4 w-4" />
                            Build with {selectedOrderIds.length} Order{selectedOrderIds.length !== 1 ? 's' : ''}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
