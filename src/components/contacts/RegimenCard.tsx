import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
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
import { FlaskConical, Pencil, Trash2, CheckCircle2, Plus, Pill, ShoppingBag, AlertCircle, Package } from 'lucide-react';
import { useRestockInventory } from '@/hooks/use-restock';
import { useUpdateBottleQuantity } from '@/hooks/use-update-bottle-quantity';
import { useDeleteMovement, type Movement } from '@/hooks/use-movements';
import { calculateSupply, getSupplyStatusColor, getSupplyStatusLabel, parseVialSize } from '@/lib/supply-calculations';
import { ProtocolSyncBadge } from '@/components/regimen/ProtocolSyncBadge';
import { AddSupplementForm } from '@/components/forms/AddSupplementForm';
import type { Protocol } from '@/types/regimen';
import type { RegimenPeptide, ConfirmDialogState } from './types';

interface RegimenCardProps {
    protocol: Protocol;
    onDelete: (id: string) => void;
    onEdit: () => void;
    onLog: (args: { itemId: string }) => void;
    onAddSupplement: (args: { protocol_id: string; supplement_id: string; dosage: string; frequency: string; notes: string }) => Promise<void>;
    onDeleteSupplement: (id: string) => void;
    onAssignInventory: (id: string, itemId?: string) => void;
    peptides: RegimenPeptide[] | undefined;
    movements?: Movement[];
}

export function RegimenCard({ protocol, onDelete, onEdit, onLog, onAddSupplement, onDeleteSupplement, onAssignInventory, peptides, movements }: RegimenCardProps) {
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ open: false, title: '', description: '', action: () => {} });

    const openConfirm = (title: string, description: string, action: () => void) => {
        setConfirmDialog({ open: true, title, description, action });
    };

    // Determine Status Logic
    const { latestMovement, statusColor, statusLabel } = useMemo(() => {
        if (!movements || !protocol.protocol_items?.[0]) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No History' };

        const peptideId = protocol.protocol_items[0].peptide_id;

        const relevant = movements.filter(m =>
            m.movement_items?.some((item) => {
                const lot = item.bottles?.lots;
                return lot?.peptide_id === peptideId || lot?.peptides?.id === peptideId;
            })
        );

        if (relevant.length === 0) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No Orders' };

        const latest = relevant[0];
        let color = 'bg-muted text-muted-foreground border-border';
        let label = latest.payment_status;

        if (latest.type === 'giveaway') {
            color = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
            label = 'Giveaway';
        } else {
            if (latest.payment_status === 'paid') color = 'bg-green-500/15 text-green-500 border-green-500/30';
            if (latest.payment_status === 'unpaid') color = 'bg-amber-500/15 text-amber-500 border-amber-500/30';
            if (latest.payment_status === 'partial') color = 'bg-blue-500/15 text-blue-500 border-blue-500/30';
            if (latest.payment_status === 'commission_offset') { color = 'bg-violet-500/15 text-violet-500 border-violet-500/30'; label = 'Product Offset'; }
        }

        return { latestMovement: latest, statusColor: color, statusLabel: label };
    }, [movements, protocol]);

    const lastSoldDetails = useMemo(() => {
        if (!latestMovement || !protocol.protocol_items?.[0]) return null;
        const peptideId = protocol.protocol_items[0].peptide_id;
        const item = latestMovement.movement_items?.find((i) => {
            const lot = i.bottles?.lots;
            return lot?.peptide_id === peptideId || lot?.peptides?.id === peptideId;
        });
        return {
            price: item?.price_at_sale || 0,
            lot: item?.bottles?.lots?.lot_number,
            date: latestMovement.movement_date
        };
    }, [latestMovement, protocol]);

    const totalCost = useMemo(() => {
        if (!protocol.protocol_items || !peptides) return 0;
        return protocol.protocol_items.reduce((acc: number, item) => {
            const peptide = peptides.find(p => p.id === item.peptide_id);
            if (!peptide) return acc;

            const amount = parseFloat(String(item.dosage_amount)) || 0;
            const duration = item.duration_days || (item.duration_weeks * 7) || 0;
            const multiplier = parseFloat(String(item.cost_multiplier)) || 1;
            const unit = item.dosage_unit || 'mg';

            let amountInMg = amount;
            if (unit === 'mcg') amountInMg = amount / 1000;

            let totalAmountNeededMg = amountInMg * duration;
            if (item.frequency === 'weekly') {
                totalAmountNeededMg = amountInMg * (duration / 7);
            } else if (item.frequency === 'bid') {
                totalAmountNeededMg = amountInMg * 2 * duration;
            } else if (item.frequency === 'biweekly') {
                totalAmountNeededMg = amountInMg * 2 * (duration / 7);
            }

            const vialSizeMg = parseVialSize(peptide.name);
            const vialsNeeded = Math.ceil(totalAmountNeededMg / vialSizeMg);
            const unitCost = peptide.avg_cost || 0;

            return acc + (vialsNeeded * unitCost * multiplier);
        }, 0);
    }, [protocol, peptides]);

    const [isAddSuppOpen, setIsAddSuppOpen] = useState(false);
    const returnToStock = useRestockInventory();
    const updateBottleQuantity = useUpdateBottleQuantity();
    const deleteMovement = useDeleteMovement();

    const { data: assignedBottles } = useQuery({
        queryKey: ['regimen-bottles', protocol.id, protocol.contact_id],
        queryFn: async () => {
            if (!protocol.contact_id) return [];

            const protocolItems = protocol.protocol_items || [];
            if (protocolItems.length === 0) return [];

            const { data, error } = await supabase
                .from('client_inventory')
                .select(`
                    id,
                    peptide_id,
                    batch_number,
                    current_quantity_mg,
                    initial_quantity_mg,
                    movement_id,
                    created_at,
                    dose_amount_mg,
                    dose_frequency,
                    dose_interval,
                    protocol_item_id
                `)
                .eq('contact_id', protocol.contact_id)
                .in('peptide_id', protocolItems.map((item) => item.peptide_id));

            if (error) throw error;
            return data || [];
        },
        enabled: !!protocol.contact_id
    });

    const supplyCalculations = useMemo(() => {
        if (!protocol.protocol_items || !assignedBottles) return [];

        return protocol.protocol_items.map((item) => {
            const itemBottles = assignedBottles.filter(
                (b) => b.peptide_id === item.peptide_id
            );

            return {
                protocolItem: item,
                supply: calculateSupply({
                    dosage: item.dosage_amount,
                    dosage_unit: item.dosage_unit,
                    frequency: item.frequency
                }, itemBottles.map(b => ({
                    id: b.id,
                    uid: b.batch_number || 'Unknown',
                    batch_number: b.batch_number,
                    current_quantity_mg: b.current_quantity_mg,
                    initial_quantity_mg: b.initial_quantity_mg
                })))
            };
        });
    }, [protocol.protocol_items, assignedBottles]);

    if (!protocol?.protocol_items) return null;

    return (
        <>
        <Card className={`hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full ${!latestMovement ? 'border-l-4 border-l-amber-400' : ''}`} onClick={onEdit}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">{protocol.name}</CardTitle>
                        <CardDescription>{protocol.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" aria-label="Edit regimen" onClick={onEdit}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" aria-label="Delete regimen" className="text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setDeleteConfirmOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {protocol.protocol_items?.map((item) => {
                        const linkedVial = assignedBottles?.find(b =>
                            b.peptide_id === item.peptide_id && b.dose_frequency
                        ) || null;
                        return (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-card/50 rounded-lg border border-border/40 md:flex-row flex-col gap-2 md:gap-0 items-start md:items-center">
                            <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-full">
                                    <FlaskConical className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <div className="font-semibold">{item.peptides?.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {item.dosage_amount}{item.dosage_unit} &bull; {item.frequency} &bull; {item.duration_days || (item.duration_weeks * 7)} days
                                    </div>
                                    {linkedVial && (
                                        <ProtocolSyncBadge
                                            protocolItem={item}
                                            vial={linkedVial}
                                            compact
                                        />
                                    )}
                                </div>
                            </div>
                            <Button size="sm" variant="secondary" className="w-full md:w-auto" onClick={(e) => { e.stopPropagation(); onLog({ itemId: item.id }); }}>
                                <CheckCircle2 className="mr-2 h-3 w-3" /> Log Dose
                            </Button>
                        </div>
                        );
                    })}
                    {(!protocol.protocol_items || protocol.protocol_items.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No peptides in this regimen.</p>
                    )}
                </div>

                <div className="pt-2" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
                            <Pill className="h-3 w-3" /> Supplement Stack
                        </h4>
                        <Dialog open={isAddSuppOpen} onOpenChange={setIsAddSuppOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 text-xs">
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Supplement</DialogTitle>
                                    <DialogDescription>Add a supporting supplement to this stack.</DialogDescription>
                                </DialogHeader>
                                <AddSupplementForm
                                    protocolId={protocol.id}
                                    onAdd={onAddSupplement}
                                    onCancel={() => setIsAddSuppOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {protocol.protocol_supplements?.map((supp) => (
                            <div key={supp.id} className="relative group border border-border/60 rounded-lg p-3 hover:bg-accent/30 hover:shadow-card transition-all">
                                <div className="flex gap-3">
                                    {supp.supplements?.image_url ? (
                                        <img src={supp.supplements.image_url} className="h-10 w-10 rounded object-cover bg-muted" alt={supp.supplements.name} loading="lazy" />
                                    ) : (
                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                            <Pill className="h-5 w-5 opacity-20" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-medium text-sm">{supp.supplements?.name || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground">{supp.dosage} <span className="mx-1">&bull;</span> {supp.frequency}</div>
                                        {supp.notes && <div className="text-xs text-muted-foreground mt-1 italic">"{supp.notes}"</div>}
                                    </div>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Delete supplement"
                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); onDeleteSupplement(supp.id); }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-3 border-t grid gap-2">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Inventory & Billing</span>
                        {latestMovement && (
                            <Badge
                                variant={latestMovement.status === 'active' ? 'default' : 'outline'}
                                className={latestMovement.status === 'active' ? 'bg-green-500' : 'border-amber-500 text-amber-600'}
                            >
                                <Package className="h-3 w-3 mr-1" />
                                {latestMovement.status === 'active' ? 'Has Inventory' : 'Needs Inventory'}
                            </Badge>
                        )}
                    </div>

                    {latestMovement ? (
                        <div className="bg-slate-50 p-2 rounded border text-sm grid grid-cols-2 gap-2 relative group-billing">
                            <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">Status</span>
                                <Badge variant="outline" className={`${statusColor} capitalize font-normal border px-2 py-0 h-5`}>
                                    {statusLabel}
                                </Badge>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">Sold At</span>
                                <div className="flex items-center justify-end gap-2">
                                    <span className="font-mono font-medium">${lastSoldDetails?.price.toFixed(2)}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Void invoice"
                                        className="h-5 w-5 opacity-0 group-hover-billing:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                        title="Void Invoice / Delete Movement"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openConfirm(
                                                'Void Invoice',
                                                `Are you sure you want to void this ${latestMovement.type} record? This will return items to stock.`,
                                                () => deleteMovement.mutate(latestMovement.id)
                                            );
                                        }}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <div className="col-span-2 flex justify-between items-center border-t border-slate-200 pt-2 mt-1">
                                <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                                    <ShoppingBag className="h-3 w-3" />
                                    <span>From Inventory</span>
                                    {lastSoldDetails?.lot && <Badge variant="secondary" className="text-xs h-4 px-1 ml-1 bg-slate-200 text-slate-700">Lot {lastSoldDetails.lot}</Badge>}
                                </div>
                                <span className="text-xs text-muted-foreground">{lastSoldDetails?.date ? new Date(lastSoldDetails.date).toLocaleDateString('en-US') : '\u2014'}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-500/10 p-3 rounded border border-amber-500/20 text-sm flex justify-between items-center">
                            <div className="text-amber-400">
                                <p className="font-semibold text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No Billing Record</p>
                                <p className="text-xs opacity-80">Inventory not yet assigned.</p>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/30 bg-card hover:bg-amber-500/10 text-amber-400" onClick={(e) => {
                                e.stopPropagation();
                                const item = protocol.protocol_items?.[0];
                                if (item) onAssignInventory(item.peptide_id, item.id);
                            }}>
                                Assign Now
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1 pt-2 border-t border-dashed">
                    <span>Est. Monthly Usage Cost:</span>
                    <span className="font-medium">${totalCost.toFixed(2)}</span>
                </div>

                {/* Assigned Bottles & Supply Section */}
                <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            Assigned Bottles & Supply
                        </span>
                    </div>

                    {supplyCalculations.length === 0 || supplyCalculations.every(s => s.supply.bottles.length === 0) ? (
                        <div className="text-xs text-muted-foreground italic p-2.5 bg-muted/20 rounded-lg">
                            No bottles assigned yet. Click "Assign Inventory" above to link bottles to this regimen.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {supplyCalculations.filter(s => s.supply.bottles.length > 0).map(({ protocolItem, supply }) => (
                                <div key={protocolItem.id} className="border border-border/60 rounded-lg p-2 bg-card/50">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <div className="font-medium text-xs">
                                            {peptides?.find(p => p.id === protocolItem.peptide_id)?.name}
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={`${getSupplyStatusColor(supply.status)} text-white border-0 text-xs px-1.5 py-0`}
                                        >
                                            {getSupplyStatusLabel(supply.daysRemaining)}
                                        </Badge>
                                    </div>

                                    <div className="text-xs text-muted-foreground mb-1.5 grid grid-cols-2 gap-1">
                                        <div>Supply: {supply.totalSupplyMg.toFixed(1)} mg</div>
                                        <div>Usage: {supply.dailyUsageMg.toFixed(1)} mg/day</div>
                                    </div>

                                    <Accordion type="single" collapsible>
                                        <AccordionItem value="bottles" className="border-0">
                                            <AccordionTrigger className="py-1 text-xs hover:no-underline">
                                                {supply.bottles.length} bottle{supply.bottles.length !== 1 ? 's' : ''}
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="space-y-1 mt-1">
                                                    {supply.bottles.map(bottle => (
                                                        <div key={bottle.id} className="flex justify-between items-center text-xs bg-card p-1.5 rounded border">
                                                            <div className="flex-1">
                                                                <div className="font-mono text-xs">{bottle.uid}</div>
                                                                <div className="text-muted-foreground">
                                                                    {bottle.currentQuantityMg.toFixed(1)} mg
                                                                    {bottle.usagePercent > 0 && ` \u2022 ${bottle.usagePercent.toFixed(0)}% used`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Regimen</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete this regimen? All usage logs and history will be permanently removed.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(protocol.id)}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Confirm dialog for void invoice */}
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
        </>
    );
}
