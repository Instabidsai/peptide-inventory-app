import { useState, useMemo } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { FlaskConical, Trash2, CheckCircle2, Plus, RefreshCcw, MoreVertical, Folder } from 'lucide-react';
import { format } from 'date-fns';
import { useRestockInventory } from '@/hooks/use-restock';
import { toast } from '@/hooks/use-toast';
import type { Protocol } from '@/types/regimen';
import type { ConfirmDialogState } from './types';

interface ClientInventoryListProps {
    contactId: string;
    contactName?: string;
    assignedProtocols?: Protocol[];
}

export function ClientInventoryList({ contactId, contactName, assignedProtocols }: ClientInventoryListProps) {
    const queryClient = useQueryClient();
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['client-inventory-admin', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_inventory')
                .select(`
                    *,
                    peptide:peptides(name),
                    movement:movements(movement_date, id, status)
                `)
                .eq('contact_id', contactId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const [linkingItem, setLinkingItem] = useState<{ id: string; peptide_id: string; peptide?: { name: string } | null; [key: string]: unknown } | null>(null);

    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ open: false, title: '', description: '', action: () => {} });

    const openConfirm = (title: string, description: string, action: () => void) => {
        setConfirmDialog({ open: true, title, description, action });
    };

    const linkToRegimen = useMutation({
        mutationFn: async ({ inventoryId, protocolItemId }: { inventoryId: string, protocolItemId: string }) => {
            const { error } = await supabase
                .from('client_inventory')
                .update({ protocol_item_id: protocolItemId })
                .eq('id', inventoryId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            queryClient.invalidateQueries({ queryKey: ['regimen-bottles'] });
            toast({ title: "Item linked to regimen" });
            setLinkingItem(null);
        }
    });

    const deleteInventory = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('client_inventory').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            toast({ title: "Item removed from fridge" });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete item', description: error.message });
        },
    });

    const markAsUsed = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('client_inventory')
                .update({ current_quantity_mg: 0, status: 'depleted' })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            queryClient.invalidateQueries({ queryKey: ['regimen-bottles'] });
            toast({ title: "Vial marked as used up", description: "Moved to order history." });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to mark as used', description: error.message });
        },
    });

    const returnToStock = useRestockInventory();

    // Grouping Logic for "Order History"
    const groupedByOrder = useMemo(() => {
        if (!inventory) return {};
        const groups: Record<string, typeof inventory> = {};
        inventory.forEach((item) => {
            if (!item.peptide_id) return;
            const key = item.movement_id || 'unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [inventory]);

    const sortedOrderKeys = useMemo(() => {
        return Object.keys(groupedByOrder).sort((a, b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const dateA = groupedByOrder[a][0]?.movement?.movement_date || '';
            const dateB = groupedByOrder[b][0]?.movement?.movement_date || '';
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [groupedByOrder]);

    // Grouping Logic for "Current Stock"
    const currentStock = useMemo(() => {
        if (!inventory) return {};

        const activeItems = inventory.filter((item) => {
            const status = item.movement?.status;
            const isInactive = status === 'returned' || status === 'cancelled';
            return item.current_quantity_mg > 0 && !isInactive && item.status !== 'archived';
        });

        const groups: Record<string, { totalMg: number; items: typeof activeItems }> = {};

        activeItems.forEach((item) => {
            const name = item.peptide?.name || 'Unknown';
            if (!groups[name]) {
                groups[name] = { totalMg: 0, items: [] };
            }
            groups[name].items.push(item);
            groups[name].totalMg += item.current_quantity_mg;
        });

        return groups;
    }, [inventory]);

    const sortedStockKeys = useMemo(() => Object.keys(currentStock).sort(), [currentStock]);

    if (isLoading) return <Skeleton className="h-32 w-full" />;

    if (!inventory?.length) {
        return (
            <Card className="bg-muted/20 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <FlaskConical className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">Fridge is empty.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Tabs defaultValue="stock" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="stock">Current Stock</TabsTrigger>
                    <TabsTrigger value="history">Order History</TabsTrigger>
                </TabsList>

                {/* TAB 1: CURRENT STOCK */}
                <TabsContent value="stock" className="space-y-4">
                    {sortedStockKeys.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border border-border/60 rounded-lg bg-card/50">
                            <p>No active inventory in stock.</p>
                        </div>
                    ) : (
                        sortedStockKeys.map(peptideName => {
                            const group = currentStock[peptideName];
                            return (
                                <Card key={peptideName} className="overflow-hidden">
                                    <div className="bg-muted/30 px-4 py-3 border-b flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <FlaskConical className="h-4 w-4 text-primary" />
                                            <span className="font-semibold text-sm">{peptideName}</span>
                                        </div>
                                        <div className="flex gap-3 text-xs">
                                            <div className="font-medium">
                                                {group.items.length} vial{group.items.length !== 1 && 's'}
                                            </div>
                                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                                {group.totalMg.toFixed(1)}mg Total
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="divide-y">
                                        {group.items.map((item) => (
                                            <div key={item.id} className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="text-xs font-mono text-muted-foreground">
                                                        Lot: {item.batch_number || 'N/A'}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Exp: {item.expiration_date ? format(new Date(item.expiration_date), 'MM/yyyy') : 'N/A'}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {/* Visual Bar */}
                                                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                                        <div
                                                            className="h-full bg-primary"
                                                            style={{ width: `${item.vial_size_mg > 0 ? Math.min((item.current_quantity_mg / item.vial_size_mg) * 100, 100) : 0}%` }}
                                                        />
                                                    </div>

                                                    <div className="text-right">
                                                        <div className="text-sm font-medium">{item.current_quantity_mg}mg</div>
                                                        <div className="text-xs text-muted-foreground">of {item.vial_size_mg}mg</div>
                                                    </div>

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" aria-label="More options" className="h-6 w-6">
                                                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            {!item.protocol_item_id && (
                                                                <DropdownMenuItem onClick={() => setLinkingItem(item)}>
                                                                    <Plus className="mr-2 h-3.5 w-3.5" /> Attach to Regimen
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem onClick={() => openConfirm(
                                                                'Mark as Used',
                                                                'Mark this vial as fully used? It will be removed from current stock.',
                                                                () => markAsUsed.mutate(item.id)
                                                            )}>
                                                                <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-primary" /> Mark as Used Up
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => returnToStock.mutate(item)}>
                                                                <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Return to Stock
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-destructive"
                                                                onClick={() => openConfirm(
                                                                    'Delete Vial',
                                                                    'Delete this vial? This action cannot be undone.',
                                                                    () => deleteInventory.mutate(item.id)
                                                                )}
                                                            >
                                                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </TabsContent>

                {/* TAB 2: ORDER HISTORY */}
                <TabsContent value="history">
                    <div className="space-y-4">
                        <Accordion type="multiple" className="w-full">
                            {sortedOrderKeys.map(key => {
                                const items = groupedByOrder[key];
                                const isUnassigned = key === 'unassigned';
                                const movementDate = !isUnassigned ? items[0]?.movement?.movement_date : null;
                                const movementStatus = !isUnassigned ? items[0]?.movement?.status : 'active';
                                const isReturned = movementStatus === 'returned';
                                const isCancelled = movementStatus === 'cancelled';
                                const isInactive = isReturned || isCancelled;
                                const groupTitle = isUnassigned
                                    ? 'Unassigned / Manual Adds'
                                    : `Order from ${movementDate ? format(new Date(movementDate), 'MMMM d, yyyy') : 'Unknown date'}`;

                                const peptideNames = Array.from(new Set(items.map((i) => i.peptide?.name))).filter(Boolean);

                                return (
                                    <AccordionItem value={key} key={key} className={`border border-border/60 rounded-lg px-4 mb-2 bg-card ${isInactive ? 'opacity-60' : ''}`}>
                                        <AccordionTrigger className="hover:no-underline py-3">
                                            <div className="flex items-center justify-between w-full pr-4">
                                                <div className="flex items-center overflow-hidden gap-3">
                                                    <Folder className={`h-4 w-4 shrink-0 ${isUnassigned ? 'text-orange-400' : 'text-blue-400'}`} />
                                                    <div className="flex flex-col items-start truncate">
                                                        <span className="font-medium text-sm">{groupTitle}</span>
                                                        <span className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-md">
                                                            {peptideNames.join(', ')}
                                                        </span>
                                                    </div>
                                                    <Badge variant="secondary" className="ml-2 text-xs font-normal shrink-0">
                                                        {items.length} vial{items.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                {movementStatus && movementStatus !== 'active' && (
                                                    <Badge variant={isReturned ? 'outline' : 'destructive'} className="ml-2 capitalize text-xs">
                                                        {movementStatus}
                                                    </Badge>
                                                )}
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2 pb-4">
                                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                                {items.map((item) => (
                                                    <Card key={item.id} className="relative overflow-hidden group border border-border/60 shadow-card">
                                                        <div className={`absolute top-0 left-0 w-1 h-full ${item.status === 'archived' ? 'bg-muted-foreground' : item.current_quantity_mg > 0 ? 'bg-primary' : 'bg-red-500'}`} />

                                                        {/* Action Menu */}
                                                        {movementStatus === 'active' && (
                                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" aria-label="More options" className="h-6 w-6 bg-card/50 backdrop-blur-sm hover:bg-card/80">
                                                                            <MoreVertical className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                        {!item.protocol_item_id && (
                                                                            <DropdownMenuItem onClick={() => setLinkingItem(item)}>
                                                                                <Plus className="mr-2 h-3.5 w-3.5" /> Attach to Regimen
                                                                            </DropdownMenuItem>
                                                                        )}
                                                                        <DropdownMenuItem onClick={() => openConfirm(
                                                                            'Mark as Used',
                                                                            'Mark this vial as fully used? It will be removed from current stock.',
                                                                            () => markAsUsed.mutate(item.id)
                                                                        )}>
                                                                            <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-primary" /> Mark as Used Up
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => returnToStock.mutate(item)}>
                                                                            <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Return to Stock
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            className="text-destructive focus:text-destructive"
                                                                            onClick={() => openConfirm(
                                                                                'Delete Permanently',
                                                                                'Are you sure you want to delete this? It will NOT be restocked.',
                                                                                () => deleteInventory.mutate(item.id)
                                                                            )}
                                                                        >
                                                                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Forever
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        )}

                                                        <CardHeader className="pb-2 pl-6 pr-8">
                                                            <div className="flex justify-between items-start">
                                                                <CardTitle className="text-sm font-medium leading-tight truncate pr-2">
                                                                    {item.peptide?.name || 'Unknown Item'}
                                                                </CardTitle>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Badge variant={item.current_quantity_mg > 0 ? 'outline' : 'destructive'} className="text-xs">
                                                                    {item.current_quantity_mg > 0 ? 'In Stock' : 'Depleted'}
                                                                </Badge>
                                                                <div className="text-xs text-muted-foreground">
                                                                    Lot: {item.batch_number || 'N/A'}
                                                                </div>
                                                            </div>
                                                        </CardHeader>
                                                        <CardContent className="pl-6 pb-3">
                                                            <div className="flex justify-between items-end text-sm">
                                                                <div className="text-muted-foreground">
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className={item.current_quantity_mg < 2 ? "text-red-500 font-bold" : "text-foreground font-semibold"}>
                                                                            {item.current_quantity_mg}mg
                                                                        </span>
                                                                        <span className="text-xs">remaining</span>
                                                                    </div>
                                                                    <div className="text-xs mt-1">
                                                                        {format(new Date(item.created_at), 'MMM d, yyyy')}
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs text-muted-foreground text-right">
                                                                    <div>/ {item.vial_size_mg}mg size</div>
                                                                    {item.current_quantity_mg < item.vial_size_mg && (
                                                                        <div className="text-xs text-primary font-medium">
                                                                            -{(item.vial_size_mg > 0 ? (1 - (item.current_quantity_mg / item.vial_size_mg)) * 100 : 0).toFixed(0)}% used
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Link to Regimen Dialog */}
            <Dialog open={!!linkingItem} onOpenChange={() => setLinkingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Attach to Regimen</DialogTitle>
                        <DialogDescription>
                            Link this {linkingItem?.peptide?.name} vial to one of {contactName}'s active regimens.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Label>Select Protocol Item</Label>
                        <div className="space-y-2">
                            {assignedProtocols?.flatMap(p =>
                                p.protocol_items
                                    ?.filter((item) => item.peptide_id === linkingItem?.peptide_id)
                                    .map((item) => (
                                        <Button
                                            key={item.id}
                                            variant="outline"
                                            className="w-full justify-start text-left h-auto py-3"
                                            onClick={() => linkToRegimen.mutate({ inventoryId: linkingItem!.id, protocolItemId: item.id })}
                                            disabled={linkToRegimen.isPending}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="font-semibold text-sm">{p.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.dosage_amount}{item.dosage_unit} &bull; {item.frequency}
                                                </div>
                                            </div>
                                        </Button>
                                    ))
                            )}

                            {/* If no matching protocol items found */}
                            {(!assignedProtocols || assignedProtocols.every(p => !p.protocol_items?.some((i) => i.peptide_id === linkingItem?.peptide_id))) && (
                                <div className="text-sm text-amber-400 bg-amber-500/10 p-4 rounded-lg border border-amber-500/20">
                                    No active regimen found for <strong>{linkingItem?.peptide?.name}</strong>.
                                    Please create a regimen for this peptide first.
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Shared confirm dialog */}
            <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => { confirmDialog.action(); setConfirmDialog(prev => ({ ...prev, open: false })); }}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
