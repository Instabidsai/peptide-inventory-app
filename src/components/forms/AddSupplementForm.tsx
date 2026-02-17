
import { useState } from "react";
import { useSupplements, Supplement } from "@/hooks/use-supplements";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type AddSupplementFormProps = {
    protocolId: string;
    onAdd: (data: { protocol_id: string, supplement_id: string, dosage: string, frequency: string, notes: string }) => Promise<void>;
    onCancel: () => void;
};

export function AddSupplementForm({ protocolId, onAdd, onCancel }: AddSupplementFormProps) {
    const { supplements, isLoading } = useSupplements();
    const [selectedId, setSelectedId] = useState<string>('');
    const [dosage, setDosage] = useState('');
    const [frequency, setFrequency] = useState('Daily');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSelect = (id: string) => {
        setSelectedId(id);
        const supp = supplements?.find(s => s.id === id);
        if (supp?.default_dosage) {
            setDosage(supp.default_dosage);
        }
    };

    const handleSubmit = async () => {
        if (!selectedId) return;
        setIsSubmitting(true);
        try {
            await onAdd({
                protocol_id: protocolId,
                supplement_id: selectedId,
                dosage,
                frequency,
                notes
            });
            onCancel();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to add supplement');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <Loader2 className="animate-spin" />;

    return (
        <div className="space-y-4 py-2">
            <div className="grid gap-2">
                <Label>Select Supplement</Label>
                <Select value={selectedId} onValueChange={handleSelect}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose a supplement..." />
                    </SelectTrigger>
                    <SelectContent>
                        {supplements?.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {supplements?.length === 0 && <p className="text-xs text-muted-foreground">No supplements in catalog. Add them in Admin &gt; Supplements.</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label>Dosage</Label>
                    <Input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 1 capsule" />
                </div>
                <div className="grid gap-2">
                    <Label>Frequency</Label>
                    <Input value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="e.g. Daily with food" />
                </div>
            </div>

            <div className="grid gap-2">
                <Label>Notes (Optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!selectedId || isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Add to Stack"}
                </Button>
            </div>
        </div>
    );
}
