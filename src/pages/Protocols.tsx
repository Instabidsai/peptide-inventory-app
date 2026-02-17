import { useState } from 'react';
import { useProtocols } from '@/hooks/use-protocols';
import { usePeptides } from '@/hooks/use-peptides';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-error';
import { Loader2, Plus, Trash2, Calculator } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function Protocols() {
    const { protocols, isLoading, isError, refetch, createProtocol } = useProtocols();
    const { data: peptides } = usePeptides();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    // Builder State
    const [items, setItems] = useState<Array<{ peptideId: string; peptideName?: string; dosageAmount: string; dosageUnit: string; frequency: string; duration: string; costMultiplier: string }>>([]);

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

    const handleCreate = async () => {
        if (!name) return;

        try {
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

            setIsCreateOpen(false);
            setName('');
            setDescription('');
            setItems([]);
        } catch { /* onError in hook shows toast */ }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Protocols</h1>
                    <p className="text-muted-foreground">Manage protocol templates.</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Template
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create Protocol Template</DialogTitle>
                            <DialogDescription>Define a reusable protocol with multiple items.</DialogDescription>
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
                                <h4 className="text-sm font-medium">Protocol Items</h4>

                                {/* Item Builder Input */}
                                <div className="grid gap-4 border p-4 rounded-md bg-muted/50">
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
                                            <div key={`${item.peptideName}-${item.frequency}-${idx}`} className="flex items-center justify-between p-3 border rounded-md bg-card">
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
                            <Button onClick={handleCreate} disabled={!name}>
                                {createProtocol.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : 'Create Protocol'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading protocols...</div>
            ) : isError ? (
                <QueryError message="Failed to load protocols." onRetry={refetch} />
            ) : protocols?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    No protocol templates yet. Create your first one above.
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {protocols?.map((protocol) => {
                        const items = protocol.protocol_items || [];
                        const supps = protocol.protocol_supplements || [];
                        return (
                            <Card key={protocol.id}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">
                                        {protocol.name}
                                    </CardTitle>
                                    <Badge variant="secondary" className="text-xs">
                                        {items.length} item{items.length !== 1 ? 's' : ''}
                                    </Badge>
                                </CardHeader>
                                <CardContent>
                                    {protocol.description && (
                                        <div className="text-xs text-muted-foreground mb-3">{protocol.description}</div>
                                    )}
                                    {items.length > 0 && (
                                        <div className="space-y-1">
                                            {items.slice(0, 4).map((item) => (
                                                <div key={item.id} className="text-xs flex justify-between">
                                                    <span className="font-medium truncate mr-2">{item.peptides?.name || 'Unknown'}</span>
                                                    <span className="text-muted-foreground whitespace-nowrap">
                                                        {item.dosage_amount}{item.dosage_unit} · {item.frequency}
                                                    </span>
                                                </div>
                                            ))}
                                            {items.length > 4 && (
                                                <div className="text-xs text-muted-foreground">+{items.length - 4} more</div>
                                            )}
                                        </div>
                                    )}
                                    {supps.length > 0 && (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            + {supps.length} supplement{supps.length !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
