import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ShoppingBag } from 'lucide-react';
import { AssignInventoryForm } from '@/components/forms/AssignInventoryForm';

interface ContactDialogsProps {
    contactId: string;
}

export function ContactDialogs({
    contactId,
}: ContactDialogsProps) {
    const queryClient = useQueryClient();

    // Assign Inventory Dialog State
    const [isAssignInventoryOpen, setIsAssignInventoryOpen] = useState(false);
    const [tempPeptideIdForAssign, setTempPeptideIdForAssign] = useState<string | undefined>(undefined);
    const [tempQuantityForAssign, setTempQuantityForAssign] = useState<number | undefined>(undefined);
    const [tempProtocolItemIdForAssign, setTempProtocolItemIdForAssign] = useState<string | undefined>(undefined);

    // Expose functions for parent and child usage
    const openAssignInventory = (peptideId?: string, protocolItemId?: string) => {
        if (peptideId) setTempPeptideIdForAssign(peptideId);
        if (protocolItemId) setTempProtocolItemIdForAssign(protocolItemId);
        setIsAssignInventoryOpen(true);
    };

    return {
        openAssignInventory,
        isAssignInventoryOpen,

        // The dialogs JSX
        dialogsJSX: (
            <>
                {/* Assign Inventory Dialog */}
                <Dialog open={isAssignInventoryOpen} onOpenChange={setIsAssignInventoryOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <ShoppingBag className="mr-2 h-4 w-4" />
                            Assign Inventory
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Assign Inventory</DialogTitle>
                            <DialogDescription>Sell or assign bottles to this contact.</DialogDescription>
                        </DialogHeader>
                        <AssignInventoryForm
                            contactId={contactId}
                            defaultPeptideId={tempPeptideIdForAssign}
                            defaultQuantity={tempQuantityForAssign}
                            protocolItemId={tempProtocolItemIdForAssign}
                            onClose={() => {
                                queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
                                queryClient.invalidateQueries({ queryKey: ['movements'] });
                                queryClient.invalidateQueries({ queryKey: ['bottles'] });
                                setIsAssignInventoryOpen(false);
                                setTempPeptideIdForAssign(undefined);
                                setTempQuantityForAssign(undefined);
                                setTempProtocolItemIdForAssign(undefined);
                            }}
                        />
                    </DialogContent>
                </Dialog>
            </>
        ),
    };
}
