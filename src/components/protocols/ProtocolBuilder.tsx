
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

// Pricing constants (example)
const TIER_MULTIPLIERS = {
    at_cost: 1,
    wholesale: 2,
    retail: 3 // "Full Price"
};

export function ProtocolBuilder() {
    const [items, setItems] = useState<any[]>([]);
    const [selectedTier, setSelectedTier] = useState<'at_cost' | 'wholesale' | 'retail'>('retail');

    // Helper to calculate total cost
    // This logic is currently a placeholder as we need real peptide pricing data
    const calculateTotal = () => {
        return items.reduce((acc, item) => acc + (item.base_cost * TIER_MULTIPLIERS[selectedTier]), 0);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Protocol Items</CardTitle>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Pricing Tier:</span>
                            <Select value={selectedTier} onValueChange={(v: any) => setSelectedTier(v)}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="at_cost">At Cost (1x)</SelectItem>
                                    <SelectItem value="wholesale">Wholesale (2x)</SelectItem>
                                    <SelectItem value="retail">Retail (Full Price)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Table of items would go here */}
                    <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md">
                        No items added. Select a peptide to begin.
                    </div>

                    <div className="mt-8 flex justify-end items-end flex-col">
                        <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total Estimated Cost</div>
                        <div className="text-3xl font-bold text-primary">
                            ${calculateTotal().toFixed(2)}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
