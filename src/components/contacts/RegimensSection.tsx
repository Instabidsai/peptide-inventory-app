import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FlaskConical, Plus, ShoppingBag, Pill } from 'lucide-react';
import { RegimenCard } from './RegimenCard';
import type { Protocol } from '@/types/regimen';
import type { Peptide } from '@/hooks/use-peptides';
import type { Movement } from '@/hooks/use-movements';

interface RegimensSectionProps {
    contactId: string;
    isLoadingProtocols: boolean;
    assignedProtocols: Protocol[] | undefined;
    peptides: Peptide[] | undefined;
    movements: Movement[] | undefined;
    onEditClick: (protocol: Protocol) => void;
    onAddClick: () => void;
    onOpenAssignInventory: (peptideId?: string, protocolItemId?: string) => void;
    deleteProtocol: { mutate: (id: string) => void };
    logProtocolUsage: { mutate: (args: { itemId: string }) => void };
    addProtocolSupplement: { mutate: (args: { protocol_id: string; supplement_id: string; dosage: string; frequency: string; notes: string }) => Promise<void> };
    deleteProtocolSupplement: { mutate: (id: string) => void };
    createProtocol: { mutate: (args: { name: string; description?: string; contact_id?: string }) => void };
}

export function RegimensSection({
    contactId,
    isLoadingProtocols,
    assignedProtocols,
    peptides,
    movements,
    onEditClick,
    onAddClick,
    onOpenAssignInventory,
    deleteProtocol,
    logProtocolUsage,
    addProtocolSupplement,
    deleteProtocolSupplement,
    createProtocol,
}: RegimensSectionProps) {
    return (
        <AccordionItem value="regimens" className="border border-border/60 rounded-lg bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-lg">Active Regimens</span>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
                {
                    isLoadingProtocols ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24 w-full" />
                        </div>
                    ) : assignedProtocols?.length === 0 ? (

                        <div className="text-center py-12 border border-border/60 rounded-lg bg-card">
                            <FlaskConical className="mx-auto h-12 w-12 mb-4 opacity-30" />
                            <p className="text-lg font-semibold text-muted-foreground">No active regimens</p>
                            <p className="text-sm text-muted-foreground/70">Assign a protocol, create a supplement stack, or just add items to their inventory.</p>
                            <div className="flex justify-center flex-wrap gap-2 mt-4">
                                <Button variant="outline" onClick={onAddClick}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Peptide Regimen
                                </Button>
                                <Button variant="outline" onClick={() => onOpenAssignInventory()}>
                                    <ShoppingBag className="mr-2 h-4 w-4" />
                                    Just Add to Fridge
                                </Button>
                                <Button variant="outline" onClick={() => createProtocol.mutate({ name: 'Supplement Stack', description: 'Daily supplement regimen', contact_id: contactId })}>
                                    <Pill className="mr-2 h-4 w-4" />
                                    Create Supplement Stack
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {assignedProtocols?.map(protocol => (
                                <RegimenCard
                                    key={protocol.id}
                                    protocol={protocol}
                                    onDelete={deleteProtocol.mutate}
                                    onEdit={() => onEditClick(protocol)}
                                    onLog={logProtocolUsage.mutate}
                                    onAddSupplement={addProtocolSupplement.mutate}
                                    onDeleteSupplement={deleteProtocolSupplement.mutate}
                                    onAssignInventory={(peptideId, itemId) => {
                                        onOpenAssignInventory(peptideId, itemId);
                                    }}
                                    peptides={peptides}
                                    movements={movements}
                                />
                            ))}
                        </div>
                    )
                }
            </AccordionContent>
        </AccordionItem>
    );
}
