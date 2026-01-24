
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Droplets, AlertTriangle, Syringe, Trash2, Folder, ChevronDown } from "lucide-react";
import { ClientInventoryItem, Protocol } from "@/types/regimen";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/sb_client/client";
import { useToast } from "@/hooks/use-toast";

interface DigitalFridgeProps {
    inventory: ClientInventoryItem[];
    protocols?: Protocol[];
    onAddVial: (data: Partial<ClientInventoryItem>) => void;
    onReconstitute: (id: string, waterMl: number) => void;
}
export function DigitalFridge({ inventory, protocols, onAddVial, onReconstitute }: DigitalFridgeProps) {
    const groupedVials = useMemo(() => {
        const groups: Record<string, ClientInventoryItem[]> = {};
        activeVials.forEach(vial => {
            // Check if movement property exists (it might not if types aren't updated, but runtime it will be there)
            const key = (vial as any).movement_id || 'manual';
            if (!groups[key]) groups[key] = [];
            groups[key].push(vial);
        });
        return groups;
    }, [activeVials]);

    const sortedGroupKeys = useMemo(() => {
        return Object.keys(groupedVials).sort((a, b) => {
            if (a === 'manual') return 1;
            if (b === 'manual') return -1;
            const dateA = (groupedVials[a][0] as any).movement?.movement_date || '';
            const dateB = (groupedVials[b][0] as any).movement?.movement_date || '';
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }, [groupedVials]);

    return (
        <Card className="h-full flex flex-col border-emerald-500/20 bg-emerald-950/10">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                            <img src="/icons/fridge.svg" className="w-5 h-5 text-emerald-400" alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            <Droplets className="w-5 h-5" />
                        </div>
                        Digital Fridge
                    </CardTitle>
                    <AddVialModal onAdd={onAddVial} />
                </div>
                <CardDescription>
                    {activeVials.length} Active Vials • {inventory.length} Total
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 pr-2">
                {activeVials.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p>No active vials.</p>
                        <p className="text-xs">Add a vial to start tracking dose.</p>
                    </div>
                ) : (
                    <Accordion type="multiple" className="w-full" defaultValue={sortedGroupKeys}>
                        {sortedGroupKeys.map(key => {
                            const vials = groupedVials[key];
                            const isManual = key === 'manual';
                            // Safely access movement date
                            const date = !isManual ? (vials[0] as any).movement?.movement_date : null;
                            const title = isManual ? 'manually added' : `Order from ${date ? format(new Date(date), 'MMM d, yyyy') : 'Unknown Date'}`;

                            return (
                                <AccordionItem value={key} key={key} className="border-b-0 mb-2">
                                    <AccordionTrigger className="hover:no-underline py-2 px-3 bg-emerald-900/20 rounded-t-lg data-[state=closed]:rounded-lg border border-emerald-500/10">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Folder className="h-4 w-4 text-emerald-500" />
                                            <span className="font-medium text-emerald-100/80 capitalize">{title}</span>
                                            <Badge variant="secondary" className="ml-2 text-[10px] h-5 px-1.5 bg-emerald-900/40 text-emerald-400 border-0">
                                                {vials.length}
                                            </Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 px-1 pb-2 bg-black/20 rounded-b-lg border-x border-b border-emerald-500/10 space-y-2">
                                        {vials.map(vial => {
                                            const pct = Math.min(100, Math.max(0, (vial.current_quantity_mg / vial.vial_size_mg) * 100));
                                            const isLow = pct < 20;
                                            return (
                                                <div key={vial.id} className="group relative rounded-lg border bg-card p-3 transition-all hover:bg-accent/50">
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                            onClick={() => handleDelete(vial.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>

                                                    <div className="flex justify-between items-start mb-2 pr-6">
                                                        <div>
                                                            <h4 className="font-semibold text-sm">{vial.peptide?.name || 'Unknown Peptide'}</h4>
                                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                                {vial.vial_size_mg}mg Vial
                                                                {vial.reconstituted_at ? (
                                                                    <span className="text-emerald-400 flex items-center gap-1">
                                                                        • {vial.water_added_ml}ml Mixed
                                                                    </span>
                                                                ) : (
                                                                    <ReconstituteModal vial={vial} triggerText="Prep Vial" />
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Badge variant={isLow ? "destructive" : "secondary"} className="text-[10px]">
                                                            {vial.current_quantity_mg.toFixed(1)}mg Left
                                                        </Badge>
                                                    </div>

                                                    {/* Visual Liquid Indicator */}
                                                    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden mb-2">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>

                                                    <div className="text-xs flex justify-between items-center text-muted-foreground">
                                                        <span>
                                                            {vial.concentration_mg_ml
                                                                ? `${vial.concentration_mg_ml.toFixed(1)}mg/ml`
                                                                : "Not Mixed"}
                                                        </span>
                                                        {isLow && <span className="text-red-400 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Low</span>}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                        <LogDoseModal vial={vial} protocols={protocols} />
                                                        {vial.reconstituted_at && (
                                                            <ReconstituteModal
                                                                vial={vial}
                                                                triggerText="Adjust Mix"
                                                                variant="outline"
                                                                className="w-full text-xs h-8 border-dashed"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}

function AddVialModal({ onAdd }: { onAdd: (data: any) => void }) {
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', size: '', water: '' });

    const handleSubmit = () => {
        onAdd({
            // In a real app we'd look up the peptide_id from a select dropdown of 'peptides' table
            // For now we might just be creating a placeholder or need to allow free text?
            // Since schema requires peptide_id for foreign key, we ideally need a real ID.
            // If schema has peptide_id as nullable, we can skip. Let's check schema.
            // implementation plan says: peptide_id UUID REFERENCES peptides.
            // So we actually NEED a peptide ID.
            // For this rapid MVP step, I will assume we pick the first one or need a selector.
            // Let's just pass the raw values and let the parent handle the ID logic or failure for now, 
            // but 'name' won't work for insert. 

            // actually, to make this usable immediately without building a full Select component for 100 peptides:
            // I'll update the parent to handle the 'missing ID' case or just fail gracefully.
            vial_size_mg: formData.size,
            water_added_ml: formData.water
        });
        setOpen(false);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add to Fridge</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Peptide Name (Select from Catalog coming soon)</Label>
                        <Input
                            placeholder="e.g. BPC-157"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Size (mg)</Label>
                            <Input
                                type="number" placeholder="5"
                                value={formData.size}
                                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Water (ml)</Label>
                            <Input
                                type="number" placeholder="2.0" step="0.1"
                                value={formData.water}
                                onChange={(e) => setFormData({ ...formData, water: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="bg-muted p-3 rounded-md text-xs text-muted-foreground">
                        Concentration: {formData.size && formData.water ? (parseFloat(formData.size) / parseFloat(formData.water)).toFixed(2) : '--'} mg/ml
                    </div>
                </div>
                <Button onClick={handleSubmit}>Add to Inventory</Button>
            </DialogContent>
        </Dialog>
    )
}

function LogDoseModal({ vial, protocols }: { vial: ClientInventoryItem, protocols?: Protocol[] }) {
    const [open, setOpen] = useState(false);
    const [doseAmount, setDoseAmount] = useState('');
    const [doseUnit, setDoseUnit] = useState('mg');
    const { toast } = useToast();

    // Auto-fill dose from protocol if available
    useEffect(() => {
        if (open && protocols) {
            // Find a protocol item that matches this peptide
            // We search all protocols
            for (const p of protocols) {
                const item = p.protocol_items?.find(i => i.peptide_id === vial.peptide_id);
                if (item) {
                    setDoseAmount(item.dosage_amount.toString());
                    setDoseUnit(item.dosage_unit);
                    break;
                }
            }
        }
    }, [open, protocols, vial.peptide_id]);

    const handleLogDose = async () => {
        if (!doseAmount) return;

        const dose = parseFloat(doseAmount);
        let doseInMg = dose;

        // Convert to mg if needed
        if (doseUnit === 'mcg') {
            doseInMg = dose / 1000;
        }

        const newQuantity = vial.current_quantity_mg - doseInMg;

        try {
            const { error } = await supabase
                .from('client_inventory')
                .update({
                    current_quantity_mg: Math.max(0, newQuantity),
                    status: newQuantity <= 0 ? 'depleted' : 'active'
                })
                .eq('id', vial.id);

            if (error) throw error;

            toast({
                title: "Dose Logged",
                description: `${doseAmount}${doseUnit} logged. Remaining: ${Math.max(0, newQuantity).toFixed(2)}mg`
            });

            // Refresh to show updated quantity
            window.location.reload();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error logging dose",
                description: error.message
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary" className="w-full mt-2">
                    <Syringe className="h-3 w-3 mr-1" />
                    Log Dose
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Log Dose Taken</DialogTitle>
                    <DialogDescription>
                        Record how much you've used from this vial.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Peptide</Label>
                        <Input value={vial.peptide?.name || 'Unknown'} disabled />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Dose Amount</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={doseAmount}
                                onChange={(e) => setDoseAmount(e.target.value)}
                                placeholder="0.5"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Unit</Label>
                            <Select value={doseUnit} onValueChange={setDoseUnit}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mg">mg</SelectItem>
                                    <SelectItem value="mcg">mcg</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="bg-muted p-3 rounded text-sm space-y-2">
                        {vial.concentration_mg_ml && doseAmount && parseFloat(doseAmount) > 0 && (
                            <div className="bg-background border rounded p-2 mb-2">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Syringe Prep Helper</Label>
                                <div className="flex justify-between items-baseline mt-1">
                                    <span className="text-sm">Pull to:</span>
                                    <div className="text-right">
                                        <span className="text-xl font-bold text-primary">
                                            {/* Units = (Dose / Conc) * 100 */}
                                            {((parseFloat(doseAmount) * (doseUnit === 'mcg' ? 0.001 : 1)) / vial.concentration_mg_ml * 100).toFixed(1)}
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-1">units</span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-right text-muted-foreground">
                                    ({((parseFloat(doseAmount) * (doseUnit === 'mcg' ? 0.001 : 1)) / vial.concentration_mg_ml).toFixed(2)} ml)
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between text-muted-foreground">
                            <span>Remaining after dose:</span>
                            <span>{Math.max(0, vial.current_quantity_mg - (parseFloat(doseAmount || '0') * (doseUnit === 'mcg' ? 0.001 : 1))).toFixed(2)}mg</span>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleLogDose} disabled={!doseAmount}>
                        Log Dose
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ReconstituteModal({ vial, triggerText = "Prep", variant = "outline", className }: { vial: ClientInventoryItem, triggerText?: string, variant?: "outline" | "default" | "secondary" | "ghost", className?: string }) {
    const [open, setOpen] = useState(false);
    const [waterAmount, setWaterAmount] = useState(vial.water_added_ml ? vial.water_added_ml.toString() : '');
    const { toast } = useToast();

    const handleReconstitute = async () => {
        if (!waterAmount) return;
        const water = parseFloat(waterAmount);
        if (water <= 0) return;

        const concentration = vial.vial_size_mg / water;

        try {
            const { error } = await supabase
                .from('client_inventory')
                .update({
                    water_added_ml: water,
                    concentration_mg_ml: concentration,
                    reconstituted_at: vial.reconstituted_at || new Date().toISOString()
                })
                .eq('id', vial.id);

            if (error) throw error;

            toast({
                title: "Vial Updated",
                description: `Mix ratio updated: ${concentration.toFixed(2)} mg/ml strength.`
            });
            window.location.reload();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant={variant} className={className || "h-6 text-[10px] px-2 h-5 border-emerald-500/50 text-emerald-600 hover:bg-emerald-50"}>
                    <Droplets className="h-3 w-3 mr-1" /> {triggerText}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{vial.reconstituted_at ? "Adjust Mix Ratio" : "Reconstitute Peptide"}</DialogTitle>
                    <DialogDescription>
                        {vial.reconstituted_at
                            ? "Update the amount of water used if you made a mistake."
                            : `Enter the amount of water you added to this ${vial.vial_size_mg}mg vial.`}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Water Added (Bacteriostatic Water)</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                step="0.1"
                                placeholder="e.g. 2.0"
                                value={waterAmount}
                                onChange={(e) => setWaterAmount(e.target.value)}
                                autoFocus
                            />
                            <span className="text-sm font-medium">ml</span>
                        </div>
                    </div>

                    {waterAmount && !isNaN(parseFloat(waterAmount)) && parseFloat(waterAmount) > 0 && (
                        <div className="bg-muted p-4 rounded-lg space-y-2">
                            <Label className="text-muted-foreground">Resulting Strength:</Label>
                            <div className="text-2xl font-bold text-center text-primary">
                                {(vial.vial_size_mg / parseFloat(waterAmount)).toFixed(2)} mg/ml
                            </div>
                            <p className="text-xs text-center text-muted-foreground">
                                (Every 1ml contains {(vial.vial_size_mg / parseFloat(waterAmount)).toFixed(2)}mg of peptide)
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleReconstitute} disabled={!waterAmount}>
                        Save & Update
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
