import { useState, useRef } from 'react';
import { useProtocols } from '@/hooks/use-protocols';
import { usePeptides } from '@/hooks/use-peptides';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-error';
import { Loader2, Plus, Trash2, Pencil, FlaskConical } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';

const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
};
const staggerItem = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
};

export default function Protocols() {
    const { protocols, isLoading, isError, refetch, createProtocol, updateProtocol, deleteProtocol, updateProtocolItem } = useProtocols();
    const { data: peptides } = usePeptides();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);
    const [protocolToDelete, setProtocolToDelete] = useState<{ id: string; name: string } | null>(null);
    const originalItemIds = useRef<string[]>([]);

    // Builder State
    const [items, setItems] = useState<Array<{ peptideId: string; peptideName?: string; dosageAmount: string; dosageUnit: string; frequency: string; duration: string; costMultiplier: string; itemId?: string }>>([]);

    // Current Item State for Builder
    const [currentItem, setCurrentItem] = useState({
        peptideId: '',
        dosageAmount: '0',
        dosageUnit: 'mg',
        frequency: 'daily',
        duration: '30',
        costMultiplier: '1'
    });

    const addItem = () => {
        if (!currentItem.peptideId) return;
        const peptide = peptides?.find(p => p.id === currentItem.peptideId);

        setItems([...items, { ...currentItem, peptideName: peptide?.name }]);
        // Reset current item partially
        setCurrentItem(prev => ({ ...prev, peptideId: '', dosageAmount: '0' }));
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleEdit = (protocol: NonNullable<typeof protocols>[number]) => {
        if (!protocol) return;
        setEditingProtocolId(protocol.id);
        setName(protocol.name);
        setDescription(protocol.description || '');
        const mappedItems = (protocol.protocol_items || []).map(item => ({
            peptideId: item.peptide_id,
            peptideName: item.peptides?.name,
            dosageAmount: String(item.dosage_amount),
            dosageUnit: item.dosage_unit,
            frequency: item.frequency,
            duration: String(item.duration_days || (item.duration_weeks * 7) || 30),
            costMultiplier: String(item.cost_multiplier || 1),
            itemId: item.id,
        }));
        setItems(mappedItems);
        originalItemIds.current = mappedItems.map(i => i.itemId).filter(Boolean) as string[];
        setIsCreateOpen(true);
    };

    const resetForm = () => {
        setEditingProtocolId(null);
        setName('');
        setDescription('');
        setItems([]);
        originalItemIds.current = [];
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!name) return;
        setIsSaving(true);

        try {
            if (editingProtocolId) {
                // 1. Update protocol name/description
                await updateProtocol.mutateAsync({ id: editingProtocolId, name, description });

                // 2. Update existing items
                for (const item of items) {
                    if (item.itemId) {
                        await updateProtocolItem.mutateAsync({
                            id: item.itemId,
                            dosage_amount: parseFloat(item.dosageAmount) || 0,
                            dosage_unit: item.dosageUnit,
                            frequency: item.frequency,
                            duration_days: parseInt(item.duration) || 30,
                            cost_multiplier: parseFloat(item.costMultiplier) || 1,
                        });
                    }
                }

                // 3. Insert new items (no itemId = newly added during edit)
                const newItems = items.filter(i => !i.itemId);
                if (newItems.length > 0) {
                    await supabase.from('protocol_items').insert(
                        newItems.map(item => ({
                            protocol_id: editingProtocolId,
                            peptide_id: item.peptideId,
                            dosage_amount: parseFloat(item.dosageAmount) || 0,
                            dosage_unit: item.dosageUnit,
                            frequency: item.frequency,
                            duration_days: parseInt(item.duration) || 30,
                            duration_weeks: Math.ceil((parseInt(item.duration) || 30) / 7),
                            cost_multiplier: parseFloat(item.costMultiplier) || 1,
                        }))
                    );
                }

                // 4. Delete removed items (was in original but no longer in items list)
                const currentItemIds = items.map(i => i.itemId).filter(Boolean) as string[];
                const removedIds = originalItemIds.current.filter(id => !currentItemIds.includes(id));
                if (removedIds.length > 0) {
                    // Delete logs first (FK constraint), then items
                    await supabase.from('protocol_logs').delete().in('protocol_item_id', removedIds);
                    await supabase.from('protocol_items').delete().in('id', removedIds);
                }
            } else {
                await createProtocol.mutateAsync({
                    name,
                    description,
                    items: items.map(item => ({
                        peptide_id: item.peptideId,
                        dosage_amount: parseFloat(item.dosageAmount) || 0,
                        dosage_unit: item.dosageUnit,
                        frequency: item.frequency,
                        duration_days: parseInt(item.duration) || 30,
                        cost_multiplier: parseFloat(item.costMultiplier) || 1
                    }))
                });
            }

            setIsCreateOpen(false);
            resetForm();
            refetch();
        } catch { /* onError in hook shows toast */ }
        finally { setIsSaving(false); }
    };

    return (
        <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            <motion.div variants={staggerItem} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FlaskConical className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Protocol Templates</h1>
                        <p className="text-sm text-muted-foreground">Create reusable treatment plans you can assign to clients.</p>
                    </div>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Template
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingProtocolId ? 'Edit Protocol Template' : 'Create Protocol Template'}</DialogTitle>
                            <DialogDescription>{editingProtocolId ? 'Update the items in this protocol.' : 'Define a reusable protocol with multiple items.'}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Name</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Weight Loss - Beginner" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Description</Label>
                                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Protocol description..." />
                            </div>

                            <Separator className="my-2" />

                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold">Protocol Items</h4>

                                {/* Item Builder Input */}
                                <div className="grid gap-4 border border-border/60 p-4 rounded-lg bg-muted/50">
                                    <div className="grid gap-2">
                                        <Label>Peptide</Label>
                                        <Select
                                            value={currentItem.peptideId}
                                            onValueChange={(v) => setCurrentItem(prev => ({ ...prev, peptideId: v }))}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Select peptide..." /></SelectTrigger>
                                            <SelectContent>
                                                {peptides?.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Dosage</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="number"
                                                    value={currentItem.dosageAmount}
                                                    onChange={(e) => setCurrentItem(prev => ({ ...prev, dosageAmount: e.target.value }))}
                                                />
                                                <Select
                                                    value={currentItem.dosageUnit}
                                                    onValueChange={(v) => setCurrentItem(prev => ({ ...prev, dosageUnit: v }))}
                                                >
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
                                            <Select
                                                value={currentItem.frequency}
                                                onValueChange={(v) => setCurrentItem(prev => ({ ...prev, frequency: v }))}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="daily">Daily</SelectItem>
                                                    <SelectItem value="daily_am_pm">Daily (AM/PM)</SelectItem>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="biweekly">2x / Week</SelectItem>
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
                                                value={currentItem.duration}
                                                onChange={(e) => setCurrentItem(prev => ({ ...prev, duration: e.target.value }))}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Pricing</Label>
                                            <Select
                                                value={currentItem.costMultiplier}
                                                onValueChange={(v) => setCurrentItem(prev => ({ ...prev, costMultiplier: v }))}
                                            >
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">At Cost (1x)</SelectItem>
                                                    <SelectItem value="1.5">1.5x Cost</SelectItem>
                                                    <SelectItem value="2">2x Cost</SelectItem>
                                                    <SelectItem value="3">3x Cost</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <Button variant="secondary" onClick={addItem} disabled={!currentItem.peptideId} size="sm">
                                        <Plus className="mr-2 h-4 w-4" /> Add Item
                                    </Button>
                                </div>

                                {/* Items List */}
                                {items.length > 0 && (
                                    <div className="space-y-2">
                                        {items.map((item, idx) => (
                                            <div key={`${item.peptideName}-${item.frequency}-${idx}`} className="flex items-center justify-between p-3 border border-border/60 rounded-lg bg-card">
                                                <div className="text-sm">
                                                    <span className="font-semibold">{item.peptideName}</span>: {item.dosageAmount}{item.dosageUnit} {item.frequency} for {item.duration} days ({item.costMultiplier}x)
                                                </div>
                                                <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => removeItem(idx)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                        <DialogFooter>
                            <Button onClick={handleSave} disabled={!name || isSaving}>
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : editingProtocolId ? 'Save Changes' : 'Create Protocol'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </motion.div>

            <motion.div variants={staggerItem}>
            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading protocols...</div>
            ) : isError ? (
                <QueryError message="Failed to load protocols." onRetry={refetch} />
            ) : protocols?.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <p className="font-semibold text-foreground">No templates yet</p>
                        <p className="text-sm mt-1 max-w-sm mx-auto">Protocol templates let you define standard treatment plans (peptides, dosages, frequencies) that can be quickly assigned to new clients.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {protocols?.map((protocol) => {
                        const protocolItems = protocol.protocol_items || [];
                        const supps = protocol.protocol_supplements || [];
                        const freqLabel = (f: string) => ({
                            daily: 'Daily', daily_am_pm: '2x/day', weekly: 'Weekly',
                            biweekly: '2x/week', monthly: 'Monthly', every_other_day: 'EOD',
                        }[f] || f);
                        const totalDuration = protocolItems.length > 0
                            ? Math.max(...protocolItems.map(i => i.duration_days || (i.duration_weeks * 7) || 0))
                            : 0;
                        return (
                            <Card key={protocol.id} className="flex flex-col">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <CardTitle className="text-sm font-semibold leading-tight truncate">
                                            {protocol.name}
                                        </CardTitle>
                                        {protocol.description && (
                                            <CardDescription className="text-xs line-clamp-2">{protocol.description}</CardDescription>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                        <Badge variant="secondary" className="text-[10px]">
                                            {protocolItems.length} peptide{protocolItems.length !== 1 ? 's' : ''}
                                        </Badge>
                                        {totalDuration > 0 && (
                                            <Badge variant="outline" className="text-[10px]">
                                                {totalDuration}d
                                            </Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col">
                                    {protocolItems.length > 0 && (
                                        <div className="space-y-1.5 flex-1">
                                            {protocolItems.slice(0, 4).map((item) => (
                                                <div key={item.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-md bg-muted/30">
                                                    <span className="text-xs font-medium truncate">{item.peptides?.name || 'Unknown'}</span>
                                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                                        {item.dosage_amount}{item.dosage_unit} · {freqLabel(item.frequency)}
                                                    </span>
                                                </div>
                                            ))}
                                            {protocolItems.length > 4 && (
                                                <div className="text-[10px] text-muted-foreground pl-2">+{protocolItems.length - 4} more</div>
                                            )}
                                        </div>
                                    )}
                                    {protocolItems.length === 0 && (
                                        <div className="flex-1 flex items-center justify-center py-3">
                                            <span className="text-xs text-muted-foreground">No items added yet</span>
                                        </div>
                                    )}
                                    {supps.length > 0 && (
                                        <div className="mt-2 text-[10px] text-muted-foreground">
                                            + {supps.length} supplement{supps.length !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                    <div className="flex gap-1 mt-3 pt-2 border-t border-border/40">
                                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleEdit(protocol)}>
                                            <Pencil className="h-3 w-3 mr-1" /> Edit
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-destructive hover:text-destructive"
                                            onClick={() => setProtocolToDelete({ id: protocol.id, name: protocol.name })}
                                        >
                                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            </motion.div>

            {/* Delete Protocol Confirmation */}
            <AlertDialog open={!!protocolToDelete} onOpenChange={(open) => { if (!open) setProtocolToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Protocol</AlertDialogTitle>
                        <AlertDialogDescription>Delete "{protocolToDelete?.name}"? This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (protocolToDelete) { deleteProtocol.mutate(protocolToDelete.id); setProtocolToDelete(null); } }}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    );
}
