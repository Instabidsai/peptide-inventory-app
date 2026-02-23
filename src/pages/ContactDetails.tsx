import { useParams, Link, useNavigate } from 'react-router-dom';
import { useContact, useUpdateContact } from '@/hooks/use-contacts';
import { useContactNotes, useCreateContactNote, useDeleteContactNote } from '@/hooks/use-contact-notes';
import { useProtocols } from '@/hooks/use-protocols';
import { AssignInventoryForm } from '@/components/forms/AssignInventoryForm';
import { usePeptides } from '@/hooks/use-peptides';
import { useBottles, type Bottle } from '@/hooks/use-bottles';
import { useCreateMovement, useMovements, useDeleteMovement, type Movement } from '@/hooks/use-movements';
import type { Protocol, ProtocolItem, ProtocolFeedback } from '@/types/regimen';
import { supabase } from '@/integrations/sb_client/client';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'; // Add this import
import { Skeleton } from '@/components/ui/skeleton';
// ... rest imports
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, FileText, FlaskConical, Calculator, Trash2, Pencil, CheckCircle2, Star, ShoppingBag, RefreshCcw, AlertCircle, MoreVertical, Package, Edit, Pill, Folder, MessageSquare, Send, ArrowLeft, Users, Copy, ExternalLink } from 'lucide-react';
import { useRestockInventory } from '@/hooks/use-restock'; // Import hook
import { calculateSupply, getSupplyStatusColor, getSupplyStatusLabel, parseVialSize } from '@/lib/supply-calculations';
import { ProtocolSyncBadge } from '@/components/regimen/ProtocolSyncBadge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
import { SimpleVials } from '@/components/regimen/SimpleVials';
import type { ClientInventoryItem } from '@/types/regimen';
import { AddSupplementForm } from '@/components/forms/AddSupplementForm';
import { FinancialOverview } from "@/components/regimen/FinancialOverview";
import { Textarea } from '@/components/ui/textarea';
import { useHouseholdMembers, useAddHouseholdMember, useInviteHouseholdMember } from '@/hooks/use-household';

export default function ContactDetails() {
    const navigate = useNavigate();
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

    // Contact Notes
    const { data: contactNotes, isLoading: isLoadingNotes } = useContactNotes(id);
    const createNote = useCreateContactNote();
    const deleteNote = useDeleteContactNote();
    const [newNoteContent, setNewNoteContent] = useState('');

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
    const [foundSuggestions, setFoundSuggestions] = useState<Array<{ id: string; supplement_id: string; reasoning?: string; supplements: { name: string; image_url?: string | null } }>>([]);
    const [relatedProtocolId, setRelatedProtocolId] = useState<string | null>(null);

    // Edit Details State
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', company: '', address: '' });

    // Confirm dialog state (replaces browser confirm())
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        description: string;
        action: () => void;
    }>({ open: false, title: '', description: '', action: () => {} });

    const openConfirm = (title: string, description: string, action: () => void) => {
        setConfirmDialog({ open: true, title, description, action });
    };

    const handleLinkUser = async () => {
        if (!linkEmail) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkEmail)) {
            toast({ variant: 'destructive', title: 'Invalid email', description: 'Please enter a valid email address.' });
            return;
        }
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
                    dosage_amount: parseFloat(dosageAmount) || 0,
                    dosage_unit: dosageUnit,
                    frequency: frequency,
                    duration_days: parseInt(durationValue) || 30,
                    cost_multiplier: parseFloat(costMultiplier) || 1
                    // Note: Ideally we should save vialSize too if we want to persist it, 
                    // but the schema doesn't have it yet. 
                    // The request didn't explicitly ask for persistence of this field, 
                    // just "calculate current cost". 
                    // We will rely on default parsing or user re-entry for now unless schema changes.
                });
            } else {
                // Create new protocol
                const createdProtocol = await createProtocol.mutateAsync({
                    name: `Regimen: ${peptide.name}`,
                    description: `Single peptide regimen for ${contact.name}`,
                    contact_id: id,
                    items: [{
                        peptide_id: peptide.id,
                        dosage_amount: parseFloat(dosageAmount) || 0,
                        dosage_unit: dosageUnit,
                        frequency: frequency,
                        duration_days: parseInt(durationValue) || 30,
                        cost_multiplier: parseFloat(costMultiplier) || 1
                    }]
                });

                // Check for suggestions after creating
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
            console.error("Failed to save regimen", error);
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

        // Try to set vial size from name + parsing, creating a "smart default"
        if (peptide) {
            setVialSize(parseVialSize(peptide.name).toString());
        }

        setIsAddPeptideOpen(true);
    };

    // Client Portal Invite State
    const [inviteTier, setInviteTier] = useState<'family' | 'network' | 'public'>('family');
    const [inviteLink, setInviteLink] = useState<string>('');
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);

    // Household State
    const { data: householdMembers, isLoading: isLoadingHousehold } = useHouseholdMembers(id);
    const addHouseholdMember = useAddHouseholdMember(id);
    const inviteHouseholdMember = useInviteHouseholdMember();
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [lastMemberInviteLink, setLastMemberInviteLink] = useState('');

    const handleAddHouseholdMember = async () => {
        if (!newMemberName.trim()) return;
        try {
            const newContactId = await addHouseholdMember.mutateAsync({
                name: newMemberName.trim(),
                email: newMemberEmail.trim() || undefined,
            });
            // Auto-invite if email provided
            if (newMemberEmail.trim()) {
                const result = await inviteHouseholdMember.mutateAsync({
                    contactId: newContactId,
                    email: newMemberEmail.trim(),
                });
                setLastMemberInviteLink(result.action_link);
            }
            setNewMemberName('');
            setNewMemberEmail('');
            if (!newMemberEmail.trim()) setIsAddMemberOpen(false);
        } catch {
            // Error already toasted by hooks
        }
    };

    const handleResendInvite = async (memberId: string, memberEmail: string) => {
        const result = await inviteHouseholdMember.mutateAsync({
            contactId: memberId,
            email: memberEmail,
        });
        setLastMemberInviteLink(result.action_link);
    };

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
                    redirect_origin: `${window.location.origin}/update-password`
                }
            });

            if (error) throw error;

            if (data?.action_link) {
                setInviteLink(data.action_link);
                toast({ title: 'Invite Link Generated', description: 'Copy and send this link to the client.' });
                // Optimistically update tier
                updateContact.mutate({ id: contact!.id, tier: inviteTier });
            } else {
                throw new Error(data?.error || 'No link returned');
            }

        } catch (err) {
            console.error('Invite failed:', err);
            // Fallback/Simulate for Dev without deployed function
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg?.includes('FunctionsFetchError') || errMsg?.includes('Failed to send request')) {
                toast({
                    variant: 'destructive',
                    title: 'Function Not Deployed',
                    description: 'Please run: npx tsx scripts/invite_user_local.ts ' + contact?.email,
                    duration: 10000
                });
            } else {
                // Try to extract more details from the Edge Function error
                let errorDetails = errMsg;
                const errObj = err as Record<string, unknown>;
                if (errObj.context && typeof errObj.context === 'object') {
                    errorDetails = JSON.stringify(errObj.context) || errMsg;
                }

                // If the error message is just "Edge Function returned a non-2xx status code",
                // we desperately need the body.
                // Note: The Supabase JS generic error is poor.
                // We will rely on our new backend logs if this frontend change isn't enough,
                // BUT, forcing the error into the title might help visibility on mobile.
                toast({
                    variant: 'destructive',
                    title: 'System Error',
                    description: `Details: ${errorDetails}. (Time: ${new Date().toLocaleTimeString('en-US')})`,
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

        try {
            await createProtocol.mutateAsync({
                name: template.name,
                description: template.description,
                contact_id: id,
            });
            setIsAssignOpen(false);
            setSelectedTemplateId('');
        } catch { /* onError in hook shows toast */ }
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
        staleTime: 60_000, // 1 minute
        gcTime: 5 * 60_000, // 5 minutes
    });

    if (isLoadingContact) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (!contact) return <div className="p-8">Contact not found</div>;

    return (
        <div className="space-y-6">
            <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Contacts
            </Button>
            <nav className="flex items-center text-sm text-muted-foreground">
                <Link to="/contacts" className="hover:text-foreground transition-colors">Contacts</Link>
                <span className="mx-2">/</span>
                <span className="text-foreground font-medium">{contact.name}</span>
            </nav>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{contact.name}</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant={contact.type === 'customer' ? 'default' : 'secondary'} className="text-md px-3 py-1 capitalize">
                            {contact.type}
                        </Badge>
                        {contact.source === 'woocommerce' && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                Website Customer
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer Stats */}
            {orderStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-primary">{orderStats.orderCount}</p>
                            <p className="text-xs text-muted-foreground">Total Orders</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold">${orderStats.totalSpend.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Lifetime Spend</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold">${orderStats.avgOrderValue.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Avg Order Value</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-muted-foreground">
                                {orderStats.lastOrderDate ? format(new Date(orderStats.lastOrderDate), 'MMM d') : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Last Order</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* Contact Info Card */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle>Details</CardTitle>
                        <div className="flex gap-2">
                            {isEditingDetails ? (
                                <>
                                    <Button size="sm" variant="ghost" onClick={() => setIsEditingDetails(false)}>Cancel</Button>
                                    <Button size="sm" onClick={() => {
                                        updateContact.mutate({
                                            id: id!,
                                            name: editForm.name,
                                            email: editForm.email,
                                            phone: editForm.phone,
                                            company: editForm.company,
                                            address: editForm.address
                                        });
                                        setIsEditingDetails(false);
                                    }}>Save</Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="icon" aria-label="Edit contact details" onClick={() => {
                                    setEditForm({
                                        name: contact.name || '',
                                        email: contact.email || '',
                                        phone: contact.phone || '',
                                        company: contact.company || '',
                                        address: contact.address || ''
                                    });
                                    setIsEditingDetails(true);
                                }}>
                                    <Edit className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isEditingDetails ? (
                            <div className="space-y-3">
                                <div className="grid gap-1">
                                    <Label>Name</Label>
                                    <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                </div>
                                <div className="grid gap-1">
                                    <Label>Email</Label>
                                    <Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                                </div>
                                <div className="grid gap-1">
                                    <Label>Phone</Label>
                                    <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                                </div>
                                <div className="grid gap-1">
                                    <Label>Company</Label>
                                    <Input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} />
                                </div>
                                <div className="grid gap-1">
                                    <Label>Address</Label>
                                    <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Enter address..." />
                                </div>
                            </div>
                        ) : (
                            <>
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
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <span className="font-semibold text-foreground">Address:</span>
                                    {contact.address || 'N/A'}
                                </div>
                            </>
                        )}
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
                                                    <img src={s.supplements.image_url} alt={s.supplements.name} className="w-10 h-10 rounded object-cover" />
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
                                                        suppProtocol = await createProtocol.mutateAsync({ name: 'Supplement Stack', description: 'Daily supplements', contact_id: id });
                                                    }
                                                    if (suppProtocol?.id) {
                                                        await addProtocolSupplement.mutateAsync({
                                                            protocol_id: suppProtocol.id,
                                                            supplement_id: s.supplement_id,
                                                        });
                                                        toast({ title: `${s.supplements.name} added to Supplement Stack` });
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
                                <AddResourceForm contactId={id!} onComplete={() => {}} />
                            </DialogContent>
                        </Dialog>

                        <div className="space-y-2">
                            <ResourceList contactId={id!} />
                        </div>
                    </CardContent>
                </Card>
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
                        {/* Financial Overview - Visible to Admins */}
                        <FinancialOverview contactId={id!} />
                    </AccordionContent>
                </AccordionItem>

                {/* ─── Household Members ─── */}
                <AccordionItem value="household" className="border border-border/60 rounded-lg bg-card px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <span className="font-semibold text-lg">Household</span>
                            {(householdMembers?.length ?? 0) > 0 && (
                                <Badge variant="secondary" className="ml-2">{householdMembers!.length} members</Badge>
                            )}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Household members share the same fridge inventory but have individual protocols.
                        </p>

                        {/* Member List */}
                        {isLoadingHousehold ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (householdMembers?.length ?? 0) > 0 ? (
                            <div className="space-y-2">
                                {householdMembers!.map(member => (
                                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="text-xs font-bold text-primary">
                                                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-sm truncate">{member.name}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {member.email || 'No email'}
                                                    {' · '}
                                                    <span className="capitalize">{member.household_role}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {member.is_linked ? (
                                                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Linked
                                                </Badge>
                                            ) : member.email ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-xs h-7"
                                                    onClick={() => handleResendInvite(member.id, member.email!)}
                                                    disabled={inviteHouseholdMember.isPending}
                                                >
                                                    <Send className="h-3 w-3 mr-1" />
                                                    {inviteHouseholdMember.isPending ? 'Sending...' : 'Send Invite'}
                                                </Button>
                                            ) : (
                                                <Badge variant="secondary" className="text-xs">No email</Badge>
                                            )}
                                            {member.id !== id && (
                                                <Link to={`/contacts/${member.id}`}>
                                                    <Button variant="ghost" size="sm" className="text-xs h-7">
                                                        <ExternalLink className="h-3 w-3 mr-1" /> View
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">
                                No household members yet. Add a member below to create a shared household.
                            </p>
                        )}

                        {/* Last generated invite link */}
                        {lastMemberInviteLink && (
                            <div className="p-3 rounded-lg border bg-muted/50 space-y-2">
                                <Label className="text-xs font-medium">Invite Link (send via Gmail)</Label>
                                <div className="flex gap-2">
                                    <code className="flex-1 p-2 bg-background rounded border text-xs break-all font-mono">
                                        {lastMemberInviteLink}
                                    </code>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            navigator.clipboard.writeText(lastMemberInviteLink);
                                            toast({ title: 'Copied!' });
                                        }}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Add Member Dialog */}
                        <Dialog open={isAddMemberOpen} onOpenChange={(open) => {
                            setIsAddMemberOpen(open);
                            if (!open) {
                                setNewMemberName('');
                                setNewMemberEmail('');
                                setLastMemberInviteLink('');
                            }
                        }}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Household Member
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Household Member</DialogTitle>
                                    <DialogDescription>
                                        Add a family member who shares the same fridge. They'll get their own protocol and login.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label>Name *</Label>
                                        <Input
                                            value={newMemberName}
                                            onChange={e => setNewMemberName(e.target.value)}
                                            placeholder="e.g. Gloria Thompson"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email (for invite link)</Label>
                                        <Input
                                            type="email"
                                            value={newMemberEmail}
                                            onChange={e => setNewMemberEmail(e.target.value)}
                                            placeholder="e.g. gloria@gmail.com"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            If provided, an invite link will be generated automatically.
                                        </p>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleAddHouseholdMember}
                                        disabled={!newMemberName.trim() || addHouseholdMember.isPending || inviteHouseholdMember.isPending}
                                    >
                                        {addHouseholdMember.isPending ? (
                                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding...</>
                                        ) : (
                                            <><Plus className="h-4 w-4 mr-2" /> Add Member</>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </AccordionContent>
                </AccordionItem>

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
                                        <Button variant="outline" onClick={handleAddClick}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Add Peptide Regimen
                                        </Button>
                                        <Button variant="outline" onClick={() => setIsAssignInventoryOpen(true)}>
                                            <ShoppingBag className="mr-2 h-4 w-4" />
                                            Just Add to Fridge
                                        </Button>
                                        <Button variant="outline" onClick={() => createProtocol.mutate({ name: 'Supplement Stack', description: 'Daily supplement regimen', contact_id: id })}>
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
                                            onAddSupplement={addProtocolSupplement.mutate}
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
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="notes" className="border border-border/60 rounded-lg bg-card px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-muted-foreground" />
                            <span className="font-semibold text-lg">Notes</span>
                            {contactNotes && contactNotes.length > 0 && (
                                <Badge variant="secondary" className="ml-2">{contactNotes.length}</Badge>
                            )}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                        {/* Add Note Input */}
                        <div className="flex gap-2 mb-4">
                            <Textarea
                                placeholder="Type a note..."
                                value={newNoteContent}
                                onChange={(e) => setNewNoteContent(e.target.value)}
                                className="min-h-[60px] resize-none"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && newNoteContent.trim()) {
                                        e.preventDefault();
                                        createNote.mutate({ contact_id: id!, content: newNoteContent.trim() });
                                        setNewNoteContent('');
                                    }
                                }}
                            />
                            <Button
                                size="sm"
                                className="self-end"
                                disabled={!newNoteContent.trim() || createNote.isPending}
                                onClick={() => {
                                    if (newNoteContent.trim()) {
                                        createNote.mutate({ contact_id: id!, content: newNoteContent.trim() });
                                        setNewNoteContent('');
                                    }
                                }}
                            >
                                {createNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>

                        {/* Notes List */}
                        {isLoadingNotes ? (
                            <div className="space-y-2">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        ) : contactNotes && contactNotes.length > 0 ? (
                            <div className="space-y-3">
                                {contactNotes.map((note) => (
                                    <div key={note.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {format(new Date(note.created_at), 'MMM d, yyyy • h:mm a')}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-muted-foreground hover:text-destructive shrink-0 h-7 w-7 p-0"
                                            onClick={() => deleteNote.mutate({ id: note.id, contact_id: id! })}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-30" />
                                <p className="text-sm text-muted-foreground/70">No notes yet. Add your first note above.</p>
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>



            {/* Client Inventory (Digital Fridge) Inspection */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Client Digital Fridge (Inventory)</h2>
                <Tabs defaultValue="client-view">
                    <TabsList>
                        <TabsTrigger value="client-view">Client View</TabsTrigger>
                        <TabsTrigger value="admin-manage">Admin Manage</TabsTrigger>
                    </TabsList>
                    <TabsContent value="client-view" className="mt-4">
                        <AdminClientFridgeView contactId={id!} />
                    </TabsContent>
                    <TabsContent value="admin-manage" className="mt-4">
                        <ClientInventoryList contactId={id!} contactName={contact?.name} assignedProtocols={assignedProtocols} />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Client Portal Access Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Client Portal Access
                        <Badge variant={contact.linked_user_id ? 'outline' : 'outline'} className={contact.linked_user_id ? 'bg-green-500/15 text-green-500 border-green-500/30' : ''}>
                            {contact.linked_user_id ? 'Active (Linked)' : 'Not Active'}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Generate a secure invite link to give this contact access to their Regimen Dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!contact.email ? (
                        <div className="flex flex-col gap-2 p-4 bg-amber-900/20 rounded-lg border border-amber-900/50">
                            <div className="text-amber-200 text-sm font-medium">Contact Missing Email</div>
                            <p className="text-amber-200/80 text-xs">An email is required to create a client portal account.</p>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter client email..."
                                    value={linkEmail}
                                    onChange={(e) => setLinkEmail(e.target.value)}
                                    className="border-amber-900/50 focus-visible:ring-amber-900"
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
                                <Select value={inviteTier} onValueChange={(v) => setInviteTier(v as typeof inviteTier)}>
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
                                disabled={isGeneratingLink}
                                className="w-full"
                                variant={contact.invite_link ? "outline" : "default"}
                            >
                                {isGeneratingLink ? (
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
                                        <code className="flex-1 p-2.5 bg-muted/50 rounded-lg border border-border/40 text-xs break-all font-mono">
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
                    {assignedProtocols?.flatMap(p => p.protocol_feedback || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map((fb) => (
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

interface RegimenPeptide {
    id: string;
    name: string;
    avg_cost?: number | null;
    [key: string]: unknown;
}

function RegimenCard({ protocol, onDelete, onEdit, onLog, onAddSupplement, onDeleteSupplement, onAssignInventory, peptides, movements }: { protocol: Protocol, onDelete: (id: string) => void, onEdit: () => void, onLog: (args: { itemId: string }) => void, onAddSupplement: (args: { protocol_id: string; supplement_id: string; dosage: string; frequency: string; notes: string }) => Promise<void>, onDeleteSupplement: (id: string) => void, onAssignInventory: (id: string, itemId?: string) => void, peptides: RegimenPeptide[] | undefined, movements?: Movement[] }) {
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    if (!protocol?.protocol_items) return null;

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
                                        {item.dosage_amount}{item.dosage_unit} • {item.frequency} • {item.duration_days || (item.duration_weeks * 7)} days
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
                                        <img src={supp.supplements.image_url} className="h-10 w-10 rounded object-cover bg-muted" alt={supp.supplements.name} />
                                    ) : (
                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                            <Pill className="h-5 w-5 opacity-20" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-medium text-sm">{supp.supplements?.name || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground">{supp.dosage} <span className="mx-1">•</span> {supp.frequency}</div>
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
                                <span className="text-xs text-muted-foreground">{lastSoldDetails?.date ? new Date(lastSoldDetails.date).toLocaleDateString('en-US') : '—'}</span>
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

                {/* NEW: Assigned Bottles & Supply Section */}
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
        </>
    );
}

//
function AddResourceForm({ contactId, onComplete }: { contactId: string, onComplete: () => void }) {
    const queryClient = useQueryClient();
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
            queryClient.invalidateQueries({ queryKey: ['resources', contactId] });
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
                <Select value={type} onValueChange={(v) => setType(v)}>
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
    const queryClient = useQueryClient();
    const { data: resources, isLoading } = useQuery({
        queryKey: ['resources', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('resources')
                .select('*')
                .eq('contact_id', contactId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!contactId,
    });

    const deleteResource = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('resources').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resources', contactId] });
            toast({ title: 'Resource removed' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove resource', description: error.message });
        },
    });

    if (isLoading) return <Skeleton className="h-8 w-full" />;

    if (!resources || resources.length === 0) {
        return <div className="text-xs text-muted-foreground text-center py-2">No assigned resources.</div>;
    }

    return (
        <div className="space-y-2">
            {resources.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2 border border-border/60 rounded-lg bg-muted/50 text-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                        {r.type === 'video' ? <FlaskConical className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        <span className="truncate">{r.title}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete resource"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        disabled={deleteResource.isPending}
                        onClick={() => deleteResource.mutate(r.id)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            ))}
        </div>
    );
}





function AdminClientFridgeView({ contactId }: { contactId: string }) {
    const { data: inventory, isLoading } = useQuery({
        queryKey: ['client-inventory-fridge-view', contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('client_inventory')
                .select(`
                    *,
                    peptide:peptides(name)
                `)
                .eq('contact_id', contactId)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []) as ClientInventoryItem[];
        },
    });

    if (isLoading) {
        return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
    }

    if (!inventory || inventory.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active inventory items. Fulfill an order to populate the fridge.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <Package className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400">
                    Previewing this client's fridge exactly as they see it
                </span>
            </div>
            <SimpleVials inventory={inventory} contactId={contactId} />
        </div>
    );
}

function ClientInventoryList({ contactId, contactName, assignedProtocols }: { contactId: string, contactName?: string, assignedProtocols?: Protocol[] }) {
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

    // Local confirm dialog state (this component is a separate function, not a child of ContactDetails)
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean; title: string; description: string; action: () => void;
    }>({ open: false, title: '', description: '', action: () => {} });

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

    // Grouping Logic for "Order History" (Existing)
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

    // Grouping Logic for "Current Stock" (New)
    const currentStock = useMemo(() => {
        if (!inventory) return {};

        // Filter: Active items only (Stock > 0, not returned/cancelled)
        const activeItems = inventory.filter((item) => {
            const status = item.movement?.status;
            const isInactive = status === 'returned' || status === 'cancelled';
            return item.current_quantity_mg > 0 && !isInactive && item.status !== 'archived';
        });

        // Group by Peptide Name
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

                {/* TAB 1: CURRENT STOCK (The "Stockpile" View) */}
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
                                            <FlaskConical className="h-4 w-4 text-emerald-600" />
                                            <span className="font-semibold text-sm">{peptideName}</span>
                                        </div>
                                        <div className="flex gap-3 text-xs">
                                            <div className="font-medium">
                                                {group.items.length} vial{group.items.length !== 1 && 's'}
                                            </div>
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
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
                                                            className="h-full bg-emerald-500"
                                                            style={{ width: `${Math.min((item.current_quantity_mg / item.vial_size_mg) * 100, 100)}%` }}
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
                                                                <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-500" /> Mark as Used Up
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

                {/* TAB 2: ORDER HISTORY (The Original View) */}
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
                                                        <div className={`absolute top-0 left-0 w-1 h-full ${item.status === 'archived' ? 'bg-muted-foreground' : item.current_quantity_mg > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />

                                                        {/* Action Menu (Same as before) */}
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
                                                                            <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-500" /> Mark as Used Up
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
                                                                        <div className="text-xs text-emerald-600 font-medium">
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
                                            onClick={() => linkToRegimen.mutate({ inventoryId: linkingItem.id, protocolItemId: item.id })}
                                            disabled={linkToRegimen.isPending}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="font-semibold text-sm">{p.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.dosage_amount}{item.dosage_unit} • {item.frequency}
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

            {/* Shared confirm dialog (replaces browser confirm()) */}
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
