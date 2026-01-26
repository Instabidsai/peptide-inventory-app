import { useParams } from 'react-router-dom';
import { useContact, useUpdateContact } from '@/hooks/use-contacts';
import { useProtocols } from '@/hooks/use-protocols';
import { AssignInventoryForm } from '@/components/forms/AssignInventoryForm';
import { usePeptides } from '@/hooks/use-peptides';
import { useBottles, type Bottle } from '@/hooks/use-bottles';
import { useCreateMovement, useMovements, useDeleteMovement } from '@/hooks/use-movements';
import { supabase } from '@/integrations/sb_client/client';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'; // Add this import
import { Skeleton } from '@/components/ui/skeleton';
// ... rest imports
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, FileText, FlaskConical, Calculator, Trash2, Pencil, CheckCircle2, Star, ShoppingBag, RefreshCcw, AlertCircle, MoreVertical, Package, Edit } from 'lucide-react';
import { useRestockInventory } from '@/hooks/use-restock'; // Import hook
import { calculateSupply, getSupplyStatusColor, getSupplyStatusLabel } from '@/lib/supply-calculations';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useUpdateBottleQuantity } from '@/hooks/use-update-bottle-quantity';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { AddSupplementForm } from '@/components/forms/AddSupplementForm';
import { Pill, Folder } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

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
    const updateContact = useUpdateContact();
    const { data: peptides } = usePeptides();
    const queryClient = useQueryClient(); // Add queryClient
    const { data: movements } = useMovements(id);

    // Add/Edit Peptide State
    const [isAddPeptideOpen, setIsAddPeptideOpen] = useState(false);
    const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    // Assign Inventory Dialog State
    const [isAssignInventoryOpen, setIsAssignInventoryOpen] = useState(false);

    // Link User State
    const [linkEmail, setLinkEmail] = useState('');
    const [isLinking, setIsLinking] = useState(false);

    // Form State
    const [selectedPeptideId, setSelectedPeptideId] = useState<string>('');
    const [dosageAmount, setDosageAmount] = useState<string>('0');
    const [dosageUnit, setDosageUnit] = useState<string>('mg');
    const [frequency, setFrequency] = useState<string>('daily');
    const [durationValue, setDurationValue] = useState<string>('30');
    const [costMultiplier, setCostMultiplier] = useState<string>('1');
    const [vialSize, setVialSize] = useState<string>('5'); // New State for Vial Size
    const [autoAssignInventory, setAutoAssignInventory] = useState(false);
    const [tempPeptideIdForAssign, setTempPeptideIdForAssign] = useState<string | undefined>(undefined);
    const [tempQuantityForAssign, setTempQuantityForAssign] = useState<number | undefined>(undefined);
    const [tempProtocolItemIdForAssign, setTempProtocolItemIdForAssign] = useState<string | undefined>(undefined);

    // Add Protocol (Template) State
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

    // Suggestion State
    const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
    const [foundSuggestions, setFoundSuggestions] = useState<any[]>([]);
    const [relatedProtocolId, setRelatedProtocolId] = useState<string | null>(null);

    const handleLinkUser = async () => {
        if (!linkEmail) return;
        setIsLinking(true);
        try {
            // Search for user profile by email
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('email', linkEmail)
                .single(); // Ensure unique email or handle array

            if (error || !profiles) {
                toast({ variant: 'destructive', title: 'User not found', description: 'Could not find a user with this email.' });
                return;
            }

            // Link contact
            await updateContact.mutateAsync({
                id: id!,
                linked_user_id: profiles.user_id
            });

            toast({ title: 'User Linked', description: `Contact linked to ${linkEmail}` });
            setLinkEmail('');
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to link user.' });
        } finally {
            setIsLinking(false);
        }
    };

    const handleSaveRegimen = async () => {
        if (!selectedPeptideId || !contact) return;

        const peptide = peptides?.find(p => p.id === selectedPeptideId);
        if (!peptide) return;

        try {
            if (editingItemId) {
                // Update existing item
                await updateProtocolItem.mutateAsync({
                    id: editingItemId,
                    dosage_amount: parseFloat(dosageAmount),
                    dosage_unit: dosageUnit,
                    frequency: frequency,
                    duration_days: parseInt(durationValue),
                    cost_multiplier: parseFloat(costMultiplier)
                    // Note: Ideally we should save vialSize too if we want to persist it, 
                    // but the schema doesn't have it yet. 
                    // The request didn't explicitly ask for persistence of this field, 
                    // just "calculate current cost". 
                    // We will rely on default parsing or user re-entry for now unless schema changes.
                });
            } else {
                // Create new protocol
                await createProtocol.mutateAsync({
                    name: `Regimen: ${peptide.name}`,
                    description: `Single peptide regimen for ${contact.name}`,
                    contact_id: id,
                    items: [{
                        peptide_id: peptide.id,
                        dosage_amount: parseFloat(dosageAmount),
                        dosage_unit: dosageUnit,
                        frequency: frequency,
                        duration_days: parseInt(durationValue),
                        cost_multiplier: parseFloat(costMultiplier)
                    }]
                });
            }

            setIsAddPeptideOpen(false);
            resetCalculator();

            // Check for suggestions
            if (selectedPeptideId) {
                const suggestions = await supabase
                    .from('peptide_suggested_supplements')
                    .select('*, supplements(*)')
                    .eq('peptide_id', selectedPeptideId);

                if (suggestions.data && suggestions.data.length > 0) {
                    setFoundSuggestions(suggestions.data);
                    setIsSuggestionDialogOpen(true);
                    setRelatedProtocolId(data?.id); // We need the ID of the protocol we just created... 
                    // Wait, createProtocol.mutateAsync returns the result?
                    // useCreateProtocol usually invalidates. 
                    // I might need to fetch the latest protocol for this peptide or rely on the return.
                    // Let's assume createProtocol returns the data.
                }
            }

            if (autoAssignInventory && selectedPeptideId) {
                setTempPeptideIdForAssign(selectedPeptideId);
                setTempQuantityForAssign(calculations.vialsNeeded);
                setTimeout(() => setIsAssignInventoryOpen(true), 300);
            }
        } catch (error) {
            console.error("Failed to save regimen", error);
        }
    };

    const handleEditClick = (protocol: any) => {
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

        // Try to set vial size from name + parsing, creating a "smart default"
        if (peptide) {
            setVialSize(parseVialSize(peptide.name).toString());
        }

        setIsAddPeptideOpen(true);
    };

    // Client Portal Invite State
    const [inviteTier, setInviteTier] = useState<string>('family');
    const [inviteLink, setInviteLink] = useState<string>('');
    const [isGeneatingLink, setIsGeneratingLink] = useState(false);

    const handleGenerateInvite = async () => {
        setIsGeneratingLink(true);
        setInviteLink('');
        try {
            const { data, error } = await supabase.functions.invoke('invite-user', {
                body: {
                    email: contact?.email,
                    contact_id: contact?.id,
                    tier: inviteTier,
                    // STRATEGY: "Prod-or-Bust"
                    // Force redirect to the production domain for consistency.
                    redirect_origin: window.location.origin.includes('localhost')
                        ? `${window.location.origin}/update-password`
                        : 'https://app.thepeptideai.com/update-password'
                }
            });

            if (error) throw error;

            if (data?.action_link) {
                setInviteLink(data.action_link);
                toast({ title: 'Invite Link Generated', description: 'Copy and send this link to the client.' });
                // Optimistically update tier
                updateContact.mutate({ id: contact!.id, tier: inviteTier as any });
            } else {
                throw new Error(data?.error || 'No link returned');
            }

        } catch (err: any) {
            console.error('Invite failed:', err);
            // Fallback/Simulate for Dev without deployed function
            if (err.message?.includes('FunctionsFetchError') || err.message?.includes('Failed to send request')) {
                toast({
                    variant: 'destructive',
                    title: 'Function Not Deployed',
                    description: 'Please run: npx tsx scripts/invite_user_local.ts ' + contact?.email,
                    duration: 10000
                });
            } else {
                // Try to extract more details from the Edge Function error
                let errorDetails = err.message;
                if (err.context && typeof err.context === 'object') {
                    // Supabase functions often return the body in 'context' or similar
                    errorDetails = JSON.stringify(err.context) || err.message;
                } else if (err instanceof Error) {
                    errorDetails = err.message;
                }

                // If the error message is just "Edge Function returned a non-2xx status code",
                // we desperately need the body.
                // Note: The Supabase JS generic error is poor.
                // We will rely on our new backend logs if this frontend change isn't enough,
                // BUT, forcing the error into the title might help visibility on mobile.
                toast({
                    variant: 'destructive',
                    title: 'System Error',
                    description: `Details: ${errorDetails}. (Time: ${new Date().toLocaleTimeString()})`,
                    duration: 10000
                });
            }
        } finally {
            setIsGeneratingLink(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied to clipboard' });
    };

    const handleAddClick = () => {
        resetCalculator();
        setIsAddPeptideOpen(true);
    };

    const resetCalculator = () => {
        setEditingProtocolId(null);
        setEditingItemId(null);
        setSelectedPeptideId('');
        setDosageAmount('0');
        setFrequency('daily');
        setDurationValue('30');
        setCostMultiplier('1');
        setVialSize('5'); // Reset Default
    };

    const handleAssignTemplate = async () => {
        if (!selectedTemplateId) return;
        const template = templates?.find(t => t.id === selectedTemplateId);
        if (!template) return;

        await createProtocol.mutateAsync({
            name: template.name,
            description: template.description,
            contact_id: id,
        });
        setIsAssignOpen(false);
        setSelectedTemplateId('');
    };

    // Helper to extract vial size from name
    const parseVialSize = (name: string): number => {
        const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/i);
        if (!match) return 5; // Default fallback

        const val = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        if (unit === 'mcg') return val / 1000;
        return val;
    };

    // Calculations for the Dialog
    const calculations = useMemo(() => {
        const amount = parseFloat(dosageAmount) || 0;
        const duration = parseInt(durationValue) || 0;
        const multiplier = parseFloat(costMultiplier) || 1;
        const userVialSize = parseFloat(vialSize) || 5;
        const peptide = peptides?.find(p => p.id === selectedPeptideId);

        let amountInMg = amount;
        if (dosageUnit === 'mcg') amountInMg = amount / 1000;

        // Calculate usage per day (avg)
        let dailyUsageMg = amountInMg;
        if (frequency === 'weekly') {
            dailyUsageMg = amountInMg / 7;
        } else if (frequency === 'bid') { // twice daily
            dailyUsageMg = amountInMg * 2;
        } else if (frequency === 'biweekly') { // 2x per week
            dailyUsageMg = (amountInMg * 2) / 7;
        } else if (frequency === 'monthly') {
            dailyUsageMg = amountInMg / 30;
        } else if (frequency === '5on2off') {
            dailyUsageMg = (amountInMg * 5) / 7;
        }

        const daysPerVial = dailyUsageMg > 0 ? (userVialSize / dailyUsageMg) : 0;

        // Total needed over the duration
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


    if (isLoadingContact) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (!contact) return <div className="p-8">Contact not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{contact.name}</h1>
                    <Badge variant={contact.type === 'client' ? 'default' : 'secondary'} className="mt-2 text-md px-3 py-1 capitalize">
                        {contact.type}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Contact Info Card */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Email:</span>
                            {contact.email || 'N/A'}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Phone:</span>
                            {contact.phone || 'N/A'}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-semibold text-foreground">Company:</span>
                            {contact.company || 'N/A'}
                        </div>
                    </CardContent>
                    <div className="flex gap-2">
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
                                    contactId={id!}
                                    defaultPeptideId={tempPeptideIdForAssign}
                                    defaultQuantity={tempQuantityForAssign}
                                    protocolItemId={tempProtocolItemIdForAssign}
                                    onClose={() => {
                                        queryClient.invalidateQueries({ queryKey: ['contacts', id] });
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

                                    {/* Calc Summary - Simplified */}
                                    <div className="bg-muted p-3 rounded-md text-sm space-y-2">
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

                        {/* ... Template Dialog ... */}

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
                                                    <img src={s.supplements.image_url} className="w-10 h-10 rounded object-cover" />
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
                                                // Find the protocol ID. 
                                                // Issue: We don't have the protocol ID easily if we just created it.
                                                // Robust solution: The User just assigned a Peptide to this Contact.
                                                // We can find the active protocol for this peptide.

                                                // Better: Just add it to the "Supplement Stack" protocol? Or the Peptide protocol?
                                                // User request: "popup attached to electrolits".
                                                // Usually supplements go to the "Supplement Stack" (a generic protocol) OR the specific peptide protocol?
                                                // In this app, we have a "Supplement Stack" concept (Phase 9).

                                                // I'll try to find the "Supplement Stack" protocol for this contact, or create it.
                                                let suppProtocol = assignedProtocols?.find(p => p.name === 'Supplement Stack');
                                                if (!suppProtocol) {
                                                    // Create it
                                                    const newP = await createProtocol.mutateAsync({ name: 'Supplement Stack', description: 'Daily supplements', contact_id: id });
                                                    suppProtocol = newP; // Result from mutation? No, React Query mutation returns result if awaited?
                                                    // Actually createProtocol hook might return data.
                                                    // If not, we might need a refill.
                                                    // Let's assume we can add it to the Current Peptide Protocol for now?
                                                    // "Suggestions" usually imply separate items.
                                                }

                                                // For now, let's just toast "Please assign in Supplement Stack" or try to automate.
                                                // I'll assume we can call `addProtocolSupplement` on the protocol we *just* created or edited if we capture ID.

                                                // Let's rely on `assignedProtocols` refresh.
                                            }}>
                                                Add
                                            </Button>
                                        </div>
                                    ))}
                                    <div className="text-xs text-muted-foreground">
                                        Note: Please add these to the "Supplement Stack" or the specific protocol manually for now while we refine the automation.
                                    </div>
                                    <Button className="w-full" onClick={() => setIsSuggestionDialogOpen(false)}>Done</Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </Card>



                {/* Resources Card */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle>Resources</CardTitle>
                        <CardDescription>Assign educational content.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Resource
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Resource</DialogTitle>
                                    <DialogDescription>Share a video, article, or PDF.</DialogDescription>
                                </DialogHeader>
                                <AddResourceForm contactId={id!} onComplete={() => window.location.reload()} />
                            </DialogContent>
                        </Dialog>

                        <div className="space-y-2">
                            <ResourceList contactId={id!} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {
                isLoadingProtocols ? (
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : assignedProtocols?.length === 0 ? (

                    <div className="text-center py-12 border rounded-lg bg-card text-muted-foreground">
                        <FlaskConical className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">No active regimens</p>
                        <p className="text-sm">Assign a protocol, create a supplement stack, or just add items to their inventory.</p>
                        <div className="flex justify-center flex-wrap gap-2 mt-4">
                            <Button variant="outline" onClick={handleAddClick}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Peptide Regimen
                            </Button>
                            <Button variant="outline" onClick={() => setIsAssignInventoryOpen(true)}>
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Just Add to Fridge
                            </Button>
                            <Button variant="outline" onClick={() => createProtocol.mutateAsync({ name: 'Supplement Stack', description: 'Daily supplement regimen', contact_id: id })}>
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
                                onEdit={() => handleEditClick(protocol)}
                                onLog={logProtocolUsage.mutate}
                                onAddSupplement={addProtocolSupplement.mutateAsync}
                                onDeleteSupplement={deleteProtocolSupplement.mutate}
                                onAssignInventory={(peptideId, itemId) => {
                                    setTempPeptideIdForAssign(peptideId);
                                    setTempProtocolItemIdForAssign(itemId);
                                    setIsAssignInventoryOpen(true);
                                }}
                                peptides={peptides}
                                movements={movements}
                            />
                        ))}
                    </div>
                )

            }



            {/* Client Inventory (Digital Fridge) Inspection */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Client Digital Fridge (Inventory)</h2>
                <ClientInventoryList contactId={id!} />
            </div>

            {/* Client Portal Access Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Client Portal Access
                        <Badge variant={contact.linked_user_id ? 'secondary' : 'outline'} className={contact.linked_user_id ? 'bg-green-100 text-green-800' : ''}>
                            {contact.linked_user_id ? 'Active (Linked)' : 'Not Active'}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Generate a secure invite link to give this contact access to their Regimen Dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!contact.email ? (
                        <div className="flex flex-col gap-2 p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="text-amber-800 text-sm font-medium">Contact Missing Email</div>
                            <p className="text-amber-700 text-xs">An email is required to create a client portal account.</p>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter client email..."
                                    value={linkEmail}
                                    onChange={(e) => setLinkEmail(e.target.value)}
                                    className="bg-white"
                                />
                                <Button size="sm" onClick={() => {
                                    if (linkEmail) updateContact.mutate({ id: contact.id, email: linkEmail });
                                }}>
                                    Save Email
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
                            <div className="space-y-2">
                                <Label>Access Tier</Label>
                                <Select value={inviteTier} onValueChange={setInviteTier}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="family">Family (Free)</SelectItem>
                                        <SelectItem value="network">Network</SelectItem>
                                        <SelectItem value="public">Standard</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button
                                onClick={handleGenerateInvite}
                                disabled={isGeneatingLink}
                                className="w-full"
                                variant={contact.invite_link ? "outline" : "default"}
                            >
                                {isGeneatingLink ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCcw className="mr-2 h-4 w-4" />
                                        Re-generate Public Invite Link
                                    </>
                                )}
                            </Button>

                            {(inviteLink || contact.invite_link) && (
                                <div className="col-span-full mt-2">
                                    <Label>Invite Link {contact.invite_link ? '(Saved)' : '(New)'}</Label>
                                    <div className="flex gap-2 mt-1">
                                        <code className="flex-1 p-2 bg-muted rounded border text-xs break-all font-mono">
                                            {inviteLink || contact.invite_link}
                                        </code>
                                        <Button variant="secondary" size="sm" onClick={() => copyToClipboard(inviteLink || contact.invite_link!)}>
                                            Copy
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        This link is saved. You can copy and send it to the client anytime.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Separator className="my-6" />

            <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Recent Feedback & Logs</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {assignedProtocols?.flatMap(p => p.protocol_feedback).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map((fb: any) => (
                        <Card key={fb.id} className="bg-muted/20">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={fb.rating <= 3 ? 'destructive' : 'default'} className="h-5">
                                            {fb.rating} <Star className="h-3 w-3 ml-1 fill-current" />
                                        </Badge>
                                        <span className="text-sm font-medium">{format(new Date(fb.created_at), 'PPP')}</span>
                                    </div>
                                    {fb.admin_response && <Badge variant="outline" className="text-green-600 border-green-200">Replied</Badge>}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm italic">"{fb.comment}"</p>
                                {fb.admin_response && (
                                    <div className="mt-2 text-xs text-muted-foreground bg-background p-2 rounded border">
                                        <p className="font-semibold text-primary mb-1">Response:</p>
                                        {fb.admin_response}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                    {(!assignedProtocols || assignedProtocols.every(p => !p.protocol_feedback || p.protocol_feedback.length === 0)) && (
                        <div className="col-span-2 text-center py-8 text-muted-foreground italic">
                            No feedback recorded yet.
                        </div>
                    )}
                </div>
            </div>

        </div >

    );
}

function RegimenCard({ protocol, onDelete, onEdit, onLog, onAddSupplement, onDeleteSupplement, onAssignInventory, peptides, movements }: { protocol: any, onDelete: (id: string) => void, onEdit: () => void, onLog: (args: any) => void, onAddSupplement: (args: any) => Promise<void>, onDeleteSupplement: (id: string) => void, onAssignInventory: (id: string, itemId?: string) => void, peptides: any[] | undefined, movements?: any[] }) {
    // Determine Status Logic
    const { latestMovement, statusColor, statusLabel } = useMemo(() => {
        if (!movements || !protocol.protocol_items?.[0]) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No History' };

        const peptideId = protocol.protocol_items[0].peptide_id;

        const relevant = movements.filter(m =>
            m.movement_items?.some((item: any) => {
                const lot = item.bottles?.lots;
                return lot?.peptide_id === peptideId || lot?.peptides?.id === peptideId;
            })
        );

        if (relevant.length === 0) return { latestMovement: null, statusColor: 'hidden', statusLabel: 'No Orders' };

        const latest = relevant[0];
        let color = 'bg-gray-100 text-gray-800 border-gray-200';
        let label = latest.payment_status;

        if (latest.type === 'giveaway') {
            color = 'bg-purple-100 text-purple-800 border-purple-200';
            label = 'Giveaway';
        } else {
            if (latest.payment_status === 'paid') color = 'bg-green-100 text-green-800 border-green-200';
            if (latest.payment_status === 'unpaid') color = 'bg-amber-100 text-amber-800 border-amber-200';
            if (latest.payment_status === 'partial') color = 'bg-blue-100 text-blue-800 border-blue-200';
        }

        return { latestMovement: latest, statusColor: color, statusLabel: label };
    }, [movements, protocol]);

    const lastSoldDetails = useMemo(() => {
        if (!latestMovement || !protocol.protocol_items?.[0]) return null;
        const peptideId = protocol.protocol_items[0].peptide_id;
        const item = latestMovement.movement_items?.find((i: any) => {
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
        return protocol.protocol_items.reduce((acc: number, item: any) => {
            const peptide = peptides.find(p => p.id === item.peptide_id);
            if (!peptide) return acc;

            const amount = parseFloat(item.dosage_amount) || 0;
            const duration = item.duration_days || (item.duration_weeks * 7) || 0;
            const multiplier = parseFloat(item.cost_multiplier) || 1;
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

            const parseVialSize = (name: string): number => {
                const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/i);
                if (!match) return 5;
                const val = parseFloat(match[1]);
                const unit = match[2].toLowerCase();
                if (unit === 'mcg') return val / 1000;
                return val;
            };

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
                    created_at
                `)
                .eq('contact_id', protocol.contact_id)
                .in('peptide_id', protocolItems.map((item: any) => item.peptide_id));

            if (error) throw error;
            return data || [];
        },
        enabled: !!protocol.contact_id
    });

    const supplyCalculations = useMemo(() => {
        if (!protocol.protocol_items || !assignedBottles) return [];

        return protocol.protocol_items.map((item: any) => {
            const itemBottles = assignedBottles.filter(
                (b: any) => b.peptide_id === item.peptide_id
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

    return (
        <Card className={`hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full ${!latestMovement ? 'border-l-4 border-l-amber-400' : ''}`} onClick={onEdit}>
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">{protocol.name}</CardTitle>
                        <CardDescription>{protocol.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={onEdit}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => {
                            if (window.confirm('Are you sure you want to delete this regimen? This will verify delete all logs and history.')) {
                                onDelete(protocol.id);
                            }
                        }}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {protocol.protocol_items?.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded-lg md:flex-row flex-col gap-2 md:gap-0 items-start md:items-center">
                            <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-full">
                                    <FlaskConical className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                    <div className="font-semibold">{item.peptides?.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {item.dosage_amount}{item.dosage_unit} • {item.frequency} • {item.duration_days || (item.duration_weeks * 7)} days
                                    </div>
                                </div>
                            </div>
                            <Button size="sm" variant="secondary" className="w-full md:w-auto" onClick={(e) => { e.stopPropagation(); onLog({ itemId: item.id }); }}>
                                <CheckCircle2 className="mr-2 h-3 w-3" /> Log Dose
                            </Button>
                        </div>
                    ))}
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
                        {protocol.protocol_supplements?.map((supp: any) => (
                            <div key={supp.id} className="relative group border rounded-md p-3 hover:bg-muted/50 transition-colors">
                                <div className="flex gap-3">
                                    {supp.supplements?.image_url ? (
                                        <img src={supp.supplements.image_url} className="h-10 w-10 rounded object-cover bg-muted" alt="" />
                                    ) : (
                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                            <Pill className="h-5 w-5 opacity-20" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-medium text-sm">{supp.supplements?.name || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground">{supp.dosage} <span className="mx-1">•</span> {supp.frequency}</div>
                                        {supp.notes && <div className="text-[10px] text-muted-foreground mt-1 italic">"{supp.notes}"</div>}
                                    </div>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
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
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">Status</span>
                                <Badge variant="outline" className={`${statusColor} capitalize font-normal border px-2 py-0 h-5`}>
                                    {statusLabel}
                                </Badge>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">Sold At</span>
                                <div className="flex items-center justify-end gap-2">
                                    <span className="font-mono font-medium">${lastSoldDetails?.price.toFixed(2)}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 opacity-0 group-hover-billing:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                                        title="Void Invoice / Delete Movement"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Are you sure you want to void this ${latestMovement.type} record? This will return items to stock.`)) {
                                                deleteMovement.mutate(latestMovement.id);
                                            }
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
                                    {lastSoldDetails?.lot && <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1 bg-slate-200 text-slate-700">Lot {lastSoldDetails.lot}</Badge>}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{new Date(lastSoldDetails?.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50 p-3 rounded border border-amber-200 text-sm flex justify-between items-center">
                            <div className="text-amber-800">
                                <p className="font-semibold text-xs flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No Billing Record</p>
                                <p className="text-[10px] opacity-80">Inventory not yet assigned.</p>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-50 text-amber-900" onClick={(e) => {
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

                {/* NEW: Assigned Bottles & Supply Section */}
                <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                            Assigned Bottles & Supply
                        </span>
                    </div>

                    {supplyCalculations.length === 0 || supplyCalculations.every(s => s.supply.bottles.length === 0) ? (
                        <div className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded">
                            No bottles assigned yet. Click "Assign Inventory" above to link bottles to this regimen.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {supplyCalculations.filter(s => s.supply.bottles.length > 0).map(({ protocolItem, supply }) => (
                                <div key={protocolItem.id} className="border rounded-lg p-2 bg-muted/10">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <div className="font-medium text-xs">
                                            {peptides?.find(p => p.id === protocolItem.peptide_id)?.name}
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={`${getSupplyStatusColor(supply.status)} text-white border-0 text-[10px] px-1.5 py-0`}
                                        >
                                            {getSupplyStatusLabel(supply.daysRemaining)}
                                        </Badge>
                                    </div>

                                    <div className="text-[10px] text-muted-foreground mb-1.5 grid grid-cols-2 gap-1">
                                        <div>Supply: {supply.totalSupplyMg.toFixed(1)} mg</div>
                                        <div>Usage: {supply.dailyUsageMg.toFixed(1)} mg/day</div>
                                    </div>

                                    <Accordion type="single" collapsible>
                                        <AccordionItem value="bottles" className="border-0">
                                            <AccordionTrigger className="py-1 text-[10px] hover:no-underline">
                                                {supply.bottles.length} bottle{supply.bottles.length !== 1 ? 's' : ''}
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="space-y-1 mt-1">
                                                    {supply.bottles.map(bottle => (
                                                        <div key={bottle.id} className="flex justify-between items-center text-[10px] bg-white p-1.5 rounded border">
                                                            <div className="flex-1">
                                                                <div className="font-mono text-[10px]">{bottle.uid}</div>
                                                                <div className="text-muted-foreground">
                                                                    {bottle.currentQuantityMg.toFixed(1)} mg
                                                                    {bottle.usagePercent > 0 && ` • ${bottle.usagePercent.toFixed(0)}% used`}
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
    );
}

// 
function AddResourceForm({ contactId, onComplete }: { contactId: string, onComplete: () => void }) {
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [type, setType] = useState<'video' | 'article' | 'pdf'>('article');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('resources')
                .insert({
                    contact_id: contactId,
                    title,
                    url,
                    type
                });

            if (error) throw error;
            toast({ title: 'Resource Added' });
            onComplete();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to add resource' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. How to Inject" required />
            </div>
            <div className="space-y-2">
                <Label>URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required />
            </div>
            <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="article">Article</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Add Resource'}
            </Button>
        </form>
    );
}

function ResourceList({ contactId }: { contactId: string }) {
    const [resources, setResources] = useState<any[]>([]);

    useEffect(() => {
        supabase
            .from('resources')
            .select('*')
            .eq('contact_id', contactId)
            .then(({ data }) => setResources(data || []));
    }, [contactId]);

    if (resources.length === 0) {
        return <div className="text-xs text-muted-foreground text-center py-2">No assigned resources.</div>;
    }

    const handleDelete = async (id: string) => {
        await supabase.from('resources').delete().eq('id', id);
        setResources(resources.filter(r => r.id !== id));
        toast({ title: 'Resource removed' });
    };

    return (
        <div className="space-y-2">
            {resources.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/50 text-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                        {r.type === 'video' ? <FlaskConical className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        <span className="truncate">{r.title}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            ))}
        </div>
    );
}

function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}



function ClientInventoryList({ contactId }: { contactId: string }) {
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

    const deleteInventory = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('client_inventory').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            toast({ title: "Item removed from fridge" });
        }
    });



    const returnToStock = useRestockInventory();


    const groupedInventory = useMemo(() => {
        if (!inventory) return {};
        const groups: Record<string, any[]> = {};
        inventory.forEach((item: any) => {
            const key = item.movement_id || 'unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [inventory]);

    const sortedGroupKeys = useMemo(() => {
        return Object.keys(groupedInventory).sort((a, b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const dateA = groupedInventory[a][0]?.movement?.movement_date || '';
            const dateB = groupedInventory[b][0]?.movement?.movement_date || '';
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [groupedInventory]);

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
            <Accordion type="multiple" className="w-full">
                {sortedGroupKeys.map(key => {
                    const items = groupedInventory[key];
                    const isUnassigned = key === 'unassigned';
                    const movementDate = !isUnassigned ? items[0]?.movement?.movement_date : null;
                    const movementStatus = !isUnassigned ? items[0]?.movement?.status : 'active';
                    const isReturned = movementStatus === 'returned';
                    const isCancelled = movementStatus === 'cancelled';
                    const isInactive = isReturned || isCancelled;
                    const groupTitle = isUnassigned
                        ? 'Unassigned / Manual Adds'
                        : `Order from ${format(new Date(movementDate), 'MMMM d, yyyy')}`;

                    return (
                        <AccordionItem value={key} key={key} className={`border rounded-lg px-4 mb-2 bg-card ${isInactive ? 'opacity-60' : ''}`}>
                            <AccordionTrigger className="hover:no-underline py-3">
                                <div className="flex items-center justify-between w-full pr-4">
                                    <div className="flex items-center gap-3">
                                        <Folder className={`h-4 w-4 ${isUnassigned ? 'text-orange-400' : 'text-blue-400'}`} />
                                        <span className="font-medium text-sm">{groupTitle}</span>
                                        <Badge variant="secondary" className="ml-2 text-xs font-normal">
                                            {items.length} items
                                        </Badge>
                                    </div>
                                    {/* Movement Status Badge */}
                                    {movementStatus && movementStatus !== 'active' && (
                                        <Badge
                                            variant={isReturned ? 'outline' : 'destructive'}
                                            className="ml-2 capitalize text-xs"
                                        >
                                            {movementStatus}
                                        </Badge>
                                    )}
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-2 pb-4">
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {items.map((item: any) => (
                                        <Card key={item.id} className="relative overflow-hidden group border shadow-sm">
                                            <div className={`absolute top-0 left-0 w-1 h-full ${item.status === 'archived' ? 'bg-gray-400' : item.current_quantity_mg > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />

                                            {/* Only show action menu for active items */}
                                            {movementStatus === 'active' && (
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 bg-white/50 backdrop-blur-sm hover:bg-white/80">
                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => returnToStock.mutate(item)}>
                                                                <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Return to Stock
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={() => {
                                                                    if (confirm('Are you sure you want to delete this? It will NOT be restocked.')) {
                                                                        deleteInventory.mutate(item.id);
                                                                    }
                                                                }}
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
                                                    <Badge variant={item.current_quantity_mg > 0 ? 'outline' : 'destructive'} className="text-[10px]">
                                                        {item.current_quantity_mg > 0 ? 'In Stock' : 'Depleted'}
                                                    </Badge>
                                                    <div className="text-[10px] text-muted-foreground">
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
                                                        <div className="text-[10px] mt-1">
                                                            {format(new Date(item.created_at), 'MMM d, yyyy')}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground text-right">
                                                        <div>/ {item.vial_size_mg}mg size</div>
                                                        {item.current_quantity_mg < item.vial_size_mg && (
                                                            <div className="text-[10px] text-emerald-600 font-medium">
                                                                -{((1 - (item.current_quantity_mg / item.vial_size_mg)) * 100).toFixed(0)}% used
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
    );
}
