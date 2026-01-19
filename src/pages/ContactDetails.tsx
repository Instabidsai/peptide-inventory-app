
import { useParams, useNavigate } from 'react-router-dom';
import { useContact } from '@/hooks/use-contacts';
import { useProtocols } from '@/hooks/use-protocols';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Mail, Phone, Building, Plus, FileText, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePeptides } from '@/hooks/use-peptides';
import { useProtocolItems } from '@/hooks/use-protocols';
import { Loader2 } from 'lucide-react';

export default function ContactDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { data: contact, isLoading: isLoadingContact } = useContact(id!);

    // Fetch Assigned Protocols
    const { protocols: assignedProtocols, isLoading: isLoadingProtocols, createProtocol } = useProtocols(id);

    // Fetch Templates (Global)
    const { protocols: templates } = useProtocols(undefined);

    // Fetch Peptides for "Add Peptide"
    const { data: peptides } = usePeptides();

    // Mutation helper for items (using 'undefined' ID is okay for mutation-only usage if we handle invalidation carefully)
    const { addItem } = useProtocolItems(undefined);

    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [isAddPeptideOpen, setIsAddPeptideOpen] = useState(false);

    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [selectedPeptideId, setSelectedPeptideId] = useState<string>('');

    const handleAssignTemplate = async () => {
        if (!selectedTemplateId) return;

        const template = templates?.find(t => t.id === selectedTemplateId);
        if (!template) return;

        try {
            await createProtocol.mutateAsync({
                name: template.name,
                description: template.description,
                contact_id: id
            });

            toast({ title: 'Protocol Added', description: 'Template copied to this contact.' });
            setIsAssignOpen(false);
            setSelectedTemplateId('');
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to assign protocol.' });
        }
    };

    const handleAddPeptide = async () => {
        if (!selectedPeptideId) return;
        const peptide = peptides?.find(p => p.id === selectedPeptideId);
        if (!peptide) return;

        try {
            // 1. Create a "Single Item" Protocol container
            const newProtocol = await createProtocol.mutateAsync({
                name: `Regimen: ${peptide.name}`,
                description: 'Single peptide regimen',
                contact_id: id
            });

            // 2. Add the item to it
            await addItem.mutateAsync({
                protocol_id: newProtocol.id,
                peptide_id: peptide.id,
                dosage_amount: 0, // Default placeholders
                dosage_unit: 'mg',
                frequency: 'Daily',
                duration_weeks: 4,
                price_tier: 'retail'
            });

            toast({ title: 'Peptide Added', description: 'Created new regimen for ' + peptide.name });
            setIsAddPeptideOpen(false);
            setSelectedPeptideId('');
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to add peptide regimen.' });
        }
    };

    const handleCustomProtocol = async () => {
        try {
            await createProtocol.mutateAsync({
                name: 'Custom Regimen',
                description: `Created on ${new Date().toLocaleDateString()}`,
                contact_id: id
            });
            toast({ title: 'Custom Protocol Created', description: 'You can now edit the details.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to create protocol.' });
        }
    };

    if (isLoadingContact) return <Skeleton className="h-96 w-full" />;
    if (!contact) return <div>Contact not found</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/contacts')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{contact.name}</h1>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="outline">{contact.type}</Badge>
                        {contact.company && <span>{contact.company}</span>}
                    </div>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Contact Info Card */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle className="text-lg">Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{contact.email || 'No email'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{contact.phone || 'No phone'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm mb-2">{contact.company || 'No company'}</span>
                        </div>
                        {contact.notes && (
                            <div className="pt-4 border-t">
                                <p className="text-xs text-muted-foreground font-semibold mb-1">NOTES</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Protocols Section */}
                <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Active Regimens</h2>
                        <div className="flex gap-2">
                            {/* Add Peptide Dialog */}
                            <Dialog open={isAddPeptideOpen} onOpenChange={setIsAddPeptideOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="secondary">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Peptide
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Peptide Regimen</DialogTitle>
                                        <DialogDescription>
                                            Select a peptide to create a single-item regimen.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <Label>Select Peptide</Label>
                                        <Select onValueChange={setSelectedPeptideId} value={selectedPeptideId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose a peptide..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {peptides?.filter(p => p.active)?.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleAddPeptide} disabled={!selectedPeptideId || createProtocol.isPending || addItem.isPending}>
                                            {(createProtocol.isPending || addItem.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Add Regimen
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {/* Add Protocol (Template) Dialog */}
                            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="outline">
                                        <FileText className="mr-2 h-4 w-4" />
                                        Add Protocol
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Protocol from Template</DialogTitle>
                                        <DialogDescription>
                                            Choose a pre-set protocol to assign to {contact.name}.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <Label>Select Template</Label>
                                        <Select onValueChange={setSelectedTemplateId} value={selectedTemplateId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose a protocol..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {templates?.map(t => (
                                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleAssignTemplate} disabled={!selectedTemplateId || createProtocol.isPending}>
                                            {createProtocol.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Add
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Button size="sm" onClick={handleCustomProtocol} disabled={createProtocol.isPending}>
                                {createProtocol.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                Custom Protocol
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {isLoadingProtocols ? (
                            <Skeleton className="h-24 w-full" />
                        ) : assignedProtocols?.length === 0 ? (
                            <Card className="border-dashed">
                                <CardContent className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                                    <FlaskConical className="h-8 w-8 mb-2 opacity-50" />
                                    <p>No active regimens</p>
                                </CardContent>
                            </Card>
                        ) : (
                            assignedProtocols?.map(protocol => (
                                <Card key={protocol.id} className="cursor-pointer hover:bg-muted/50">
                                    <CardHeader className="py-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-base">{protocol.name}</CardTitle>
                                                <CardDescription className="text-xs mt-1">{protocol.description}</CardDescription>
                                            </div>
                                            <Badge variant="secondary">{protocol.items_count} Items</Badge>
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
