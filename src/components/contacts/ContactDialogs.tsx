import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Calculator, ShoppingBag, Pill } from 'lucide-react';
import { AssignInventoryForm } from '@/components/forms/AssignInventoryForm';
import { parseVialSize } from '@/lib/supply-calculations';
import type { Protocol } from '@/types/regimen';
import type { Peptide } from '@/hooks/use-peptides';
import type { CalculationResult } from './types';
import { logger } from '@/lib/logger';

interface ContactDialogsProps {
    contactId: string;
    peptides: Peptide[] | undefined;
    assignedProtocols: Protocol[] | undefined;
    createProtocol: {
        mutateAsync: (args: {
            name: string;
            description?: string;
            contact_id?: string;
            items?: Array<{
                peptide_id: string;
                dosage_amount: number;
                dosage_unit: string;
                frequency: string;
                duration_days?: number;
                cost_multiplier?: number;
            }>;
        }) => Promise<Protocol | undefined>;
        isPending: boolean;
        mutate: (args: { name: string; description?: string; contact_id?: string }) => void;
    };
    updateProtocolItem: {
        mutateAsync: (args: {
            id: string;
            dosage_amount?: number;
            dosage_unit?: string;
            frequency?: string;
            duration_days?: number;
            cost_multiplier?: number;
        }) => Promise<unknown>;
        isPending: boolean;
    };
    addProtocolSupplement: {
        mutateAsync: (args: { protocol_id: string; supplement_id: string }) => Promise<unknown>;
    };
    templates: Protocol[] | undefined;
    onEditClick: (protocol: Protocol) => void;
}

export function ContactDialogs({
    contactId,
    peptides,
    assignedProtocols,
    createProtocol,
    updateProtocolItem,
    addProtocolSupplement,
    templates,
    onEditClick,
}: ContactDialogsProps) {
    const queryClient = useQueryClient();

    // Assign Inventory Dialog State
    const [isAssignInventoryOpen, setIsAssignInventoryOpen] = useState(false);

    // Add/Edit Peptide State
    const [isAddPeptideOpen, setIsAddPeptideOpen] = useState(false);
    const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    // Form State
    const [selectedPeptideId, setSelectedPeptideId] = useState<string>('');
    const [dosageAmount, setDosageAmount] = useState<string>('0');
    const [dosageUnit, setDosageUnit] = useState<string>('mg');
    const [frequency, setFrequency] = useState<string>('daily');
    const [durationValue, setDurationValue] = useState<string>('30');
    const [costMultiplier, setCostMultiplier] = useState<string>('1');
    const [vialSize, setVialSize] = useState<string>('5');
    const [autoAssignInventory, setAutoAssignInventory] = useState(false);
    const [tempPeptideIdForAssign, setTempPeptideIdForAssign] = useState<string | undefined>(undefined);
    const [tempQuantityForAssign, setTempQuantityForAssign] = useState<number | undefined>(undefined);
    const [tempProtocolItemIdForAssign, setTempProtocolItemIdForAssign] = useState<string | undefined>(undefined);

    // Add Protocol (Template) State
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

    // Suggestion State
    const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
    const [foundSuggestions, setFoundSuggestions] = useState<Array<{ id: string; supplement_id: string; reasoning?: string; supplements: { name: string; image_url?: string | null } }>>([]);
    const [relatedProtocolId, setRelatedProtocolId] = useState<string | null>(null);

    const resetCalculator = () => {
        setEditingProtocolId(null);
        setEditingItemId(null);
        setSelectedPeptideId('');
        setDosageAmount('0');
        setFrequency('daily');
        setDurationValue('30');
        setCostMultiplier('1');
        setVialSize('5');
    };

    const handleAddClick = () => {
        resetCalculator();
        setIsAddPeptideOpen(true);
    };

    // Calculations for the Dialog
    const calculations: CalculationResult = useMemo(() => {
        const amount = parseFloat(dosageAmount) || 0;
        const duration = parseInt(durationValue) || 0;
        const multiplier = parseFloat(costMultiplier) || 1;
        const userVialSize = parseFloat(vialSize) || 5;
        const peptide = peptides?.find(p => p.id === selectedPeptideId);

        let amountInMg = amount;
        if (dosageUnit === 'mcg') amountInMg = amount / 1000;

        let dailyUsageMg = amountInMg;
        if (frequency === 'weekly') {
            dailyUsageMg = amountInMg / 7;
        } else if (frequency === 'bid') {
            dailyUsageMg = amountInMg * 2;
        } else if (frequency === 'biweekly') {
            dailyUsageMg = (amountInMg * 2) / 7;
        } else if (frequency === 'monthly') {
            dailyUsageMg = amountInMg / 30;
        } else if (frequency === '5on2off') {
            dailyUsageMg = (amountInMg * 5) / 7;
        }

        const daysPerVial = dailyUsageMg > 0 ? (userVialSize / dailyUsageMg) : 0;
        const totalAmountNeededMg = dailyUsageMg * duration;
        const vialsNeeded = Math.ceil(totalAmountNeededMg / userVialSize);
        const unitCost = peptide?.avg_cost || 0;
        const totalCostEstimate = vialsNeeded * unitCost * multiplier;

        return {
            totalAmount: totalAmountNeededMg,
            displayUnit: dosageUnit === 'iu' ? 'IU' : 'mg',
            vialsNeeded,
            estimatedCost: totalCostEstimate,
            daysPerVial: daysPerVial
        };
    }, [dosageAmount, dosageUnit, frequency, durationValue, selectedPeptideId, costMultiplier, peptides, vialSize]);

    const handleSaveRegimen = async () => {
        if (!selectedPeptideId) return;

        const peptide = peptides?.find(p => p.id === selectedPeptideId);
        if (!peptide) return;

        try {
            if (editingItemId) {
                await updateProtocolItem.mutateAsync({
                    id: editingItemId,
                    dosage_amount: parseFloat(dosageAmount) || 0,
                    dosage_unit: dosageUnit,
                    frequency: frequency,
                    duration_days: parseInt(durationValue) || 30,
                    cost_multiplier: parseFloat(costMultiplier) || 1
                });
            } else {
                const createdProtocol = await createProtocol.mutateAsync({
                    name: `Regimen: ${peptide.name}`,
                    description: `Single peptide regimen`,
                    contact_id: contactId,
                    items: [{
                        peptide_id: peptide.id,
                        dosage_amount: parseFloat(dosageAmount) || 0,
                        dosage_unit: dosageUnit,
                        frequency: frequency,
                        duration_days: parseInt(durationValue) || 30,
                        cost_multiplier: parseFloat(costMultiplier) || 1
                    }]
                });

                if (selectedPeptideId) {
                    const suggestions = await supabase
                        .from('peptide_suggested_supplements')
                        .select('*, supplements(*)')
                        .eq('peptide_id', selectedPeptideId);

                    if (suggestions.data && suggestions.data.length > 0) {
                        setFoundSuggestions(suggestions.data);
                        setIsSuggestionDialogOpen(true);
                        setRelatedProtocolId(createdProtocol?.id || null);
                    }
                }
            }

            setIsAddPeptideOpen(false);
            resetCalculator();

            if (autoAssignInventory && selectedPeptideId) {
                setTempPeptideIdForAssign(selectedPeptideId);
                setTempQuantityForAssign(calculations.vialsNeeded);
                setTimeout(() => setIsAssignInventoryOpen(true), 300);
            }
        } catch (error) {
            logger.error("Failed to save regimen", error);
        }
    };

    const handleEditClick = (protocol: Protocol) => {
        if (!protocol.protocol_items?.[0]) return;

        const item = protocol.protocol_items[0];
        setEditingProtocolId(protocol.id);
        setEditingItemId(item.id);

        setSelectedPeptideId(item.peptide_id);
        const peptide = peptides?.find(p => p.id === item.peptide_id);

        setDosageAmount(item.dosage_amount.toString());
        setDosageUnit(item.dosage_unit);
        setFrequency(item.frequency);
        setDurationValue(item.duration_days?.toString() || (item.duration_weeks * 7).toString());
        setCostMultiplier(item.cost_multiplier?.toString() || '1');

        if (peptide) {
            setVialSize(parseVialSize(peptide.name).toString());
        }

        setIsAddPeptideOpen(true);
    };

    const handleAssignTemplate = async () => {
        if (!selectedTemplateId) return;
        const template = templates?.find(t => t.id === selectedTemplateId);
        if (!template) return;

        try {
            await createProtocol.mutateAsync({
                name: template.name,
                description: template.description || undefined,
                contact_id: contactId,
            });
            setIsAssignOpen(false);
            setSelectedTemplateId('');
        } catch { /* onError in hook shows toast */ }
    };

    // Expose functions for parent and child usage
    const openAssignInventory = (peptideId?: string, protocolItemId?: string) => {
        if (peptideId) setTempPeptideIdForAssign(peptideId);
        if (protocolItemId) setTempProtocolItemIdForAssign(protocolItemId);
        setIsAssignInventoryOpen(true);
    };

    return {
        // Exposed state and handlers for use in the parent
        handleEditClick,
        handleAddClick,
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

                {/* Add/Edit Peptide Dialog */}
                <Dialog open={isAddPeptideOpen} onOpenChange={(open) => {
                    setIsAddPeptideOpen(open);
                    if (!open) resetCalculator();
                }}>
                    <Button variant="secondary" onClick={handleAddClick}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Peptide
                    </Button>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingItemId ? 'Edit Regimen' : 'Add Peptide Regimen'}</DialogTitle>
                            <CardDescription>Configure dosage and frequency.</CardDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Peptide</Label>
                                <Select value={selectedPeptideId} onValueChange={(val) => {
                                    setSelectedPeptideId(val);
                                    const p = peptides?.find(pep => pep.id === val);
                                    if (p) {
                                        setVialSize(parseVialSize(p.name).toString());
                                    }
                                }} disabled={!!editingItemId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select peptide..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {peptides?.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Separator />

                            {/* Calculator Inputs */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Dosage</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            value={dosageAmount}
                                            onChange={(e) => setDosageAmount(e.target.value)}
                                        />
                                        <Select value={dosageUnit} onValueChange={setDosageUnit}>
                                            <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mg">mg</SelectItem>
                                                <SelectItem value="mcg">mcg</SelectItem>
                                                <SelectItem value="iu">IU</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Frequency</Label>
                                    <Select value={frequency} onValueChange={setFrequency}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="bid">Twice Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="biweekly">2x / Week</SelectItem>
                                            <SelectItem value="5on2off">5 days on, 2 days off</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Duration (Days)</Label>
                                    <Input
                                        type="number"
                                        value={durationValue}
                                        onChange={(e) => setDurationValue(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Vial Size (mg)</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={vialSize}
                                        onChange={(e) => setVialSize(e.target.value)}
                                        placeholder="e.g 5"
                                    />
                                </div>
                            </div>

                            {/* Calc Summary */}
                            <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-2 border border-border/40">
                                <div className="flex items-center gap-2 font-semibold border-b border-border pb-2">
                                    <Calculator className="h-4 w-4" />
                                    <span>Regimen Supply Plan</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                                    <div>Daily Dose: <span className="text-foreground">{dosageAmount}{dosageUnit}</span></div>
                                    <div>Freq: <span className="text-foreground capitalize">{frequency}</span></div>
                                    <div>Vial Lasts: <span className="text-foreground">{Math.floor(calculations.daysPerVial)} days</span></div>
                                    <div>Vials Needed: <span className="text-foreground font-semibold">{calculations.vialsNeeded}</span></div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddPeptideOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveRegimen} disabled={!selectedPeptideId || createProtocol.isPending}>
                                {createProtocol.isPending || updateProtocolItem.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : (editingItemId ? 'Update Regimen' : 'Create Regimen')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Suggestion Dialog */}
                <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Suggested Supplements</DialogTitle>
                            <DialogDescription>
                                We found supplements commonly paired with this peptide.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {foundSuggestions.map((s) => (
                                <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg bg-emerald-50/50 border-emerald-100">
                                    <div className="flex items-center gap-3">
                                        {s.supplements.image_url ? (
                                            <img src={s.supplements.image_url} alt={s.supplements.name} className="w-10 h-10 rounded object-cover" loading="lazy" />
                                        ) : (
                                            <div className="w-10 h-10 rounded bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <Pill className="h-5 w-5" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-medium text-sm">{s.supplements.name}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-1">{s.reasoning || "Recommended pairing"}</p>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={async () => {
                                        try {
                                            let suppProtocol = assignedProtocols?.find(p => p.name === 'Supplement Stack');
                                            if (!suppProtocol) {
                                                suppProtocol = await createProtocol.mutateAsync({ name: 'Supplement Stack', description: 'Daily supplements', contact_id: contactId });
                                            }
                                            if (suppProtocol?.id) {
                                                await addProtocolSupplement.mutateAsync({
                                                    protocol_id: suppProtocol.id,
                                                    supplement_id: s.supplement_id,
                                                });
                                                // toast handled by hook
                                            }
                                        } catch { /* onError in hook shows toast */ }
                                    }}>
                                        Add
                                    </Button>
                                </div>
                            ))}
                            <div className="text-xs text-muted-foreground">
                                Clicking "Add" will add the supplement to this contact's "Supplement Stack" protocol.
                            </div>
                            <Button className="w-full" onClick={() => setIsSuggestionDialogOpen(false)}>Done</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        ),
    };
}
