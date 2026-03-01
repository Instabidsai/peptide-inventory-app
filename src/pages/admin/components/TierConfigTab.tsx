import { useState } from 'react';
import { useTierConfig, useUpsertTierConfig, useDeleteTierConfig, tierToInfo, type TierConfig } from '@/hooks/use-tier-config';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, Settings2, Plus as PlusIcon, Trash2, Save } from 'lucide-react';

export default function TierConfigTab({ orgId }: { orgId?: string | null }) {
    const { data: tiers, isLoading } = useTierConfig(orgId);
    const upsertTier = useUpsertTierConfig();
    const deleteTier = useDeleteTierConfig();
    const { toast } = useToast();

    const [editing, setEditing] = useState<Partial<TierConfig> | null>(null);
    const [isNew, setIsNew] = useState(false);

    if (!orgId) return <p className="text-sm text-muted-foreground py-8 text-center">No organization found.</p>;

    const startEdit = (tier: TierConfig) => {
        setEditing({ ...tier });
        setIsNew(false);
    };

    const startNew = () => {
        setEditing({
            org_id: orgId,
            tier_key: '',
            label: '',
            emoji: '🔗',
            commission_rate: 0.10,
            price_multiplier: 2.0,
            pricing_mode: 'cost_multiplier',
            cost_plus_markup: 2.0,
            can_recruit: false,
            sort_order: (tiers?.length || 0) + 1,
            active: true,
        });
        setIsNew(true);
    };

    const handleSave = () => {
        if (!editing?.tier_key?.trim() || !editing?.label?.trim()) {
            toast({ variant: 'destructive', title: 'Tier key and label are required' });
            return;
        }
        upsertTier.mutate({
            ...editing,
            org_id: orgId,
            tier_key: editing.tier_key!.toLowerCase().replace(/\s+/g, '_'),
        } as any, {
            onSuccess: () => setEditing(null),
        });
    };

    const handleDelete = (tier: TierConfig) => {
        if (!confirm(`Delete tier "${tier.label}"? Partners with this tier will keep their current settings but the tier defaults will be removed.`)) return;
        deleteTier.mutate({ id: tier.id, org_id: tier.org_id });
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" /> Partner Tier Configuration
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Define commission rates, pricing, and recruitment permissions for each partner tier.
                        Changes here set the <strong>defaults</strong> when assigning a tier — existing partners keep their current rates until manually updated.
                    </p>
                </div>
                <Button size="sm" onClick={startNew} disabled={!!editing}>
                    <PlusIcon className="h-4 w-4 mr-1" /> Add Tier
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tier</TableHead>
                                <TableHead>Commission</TableHead>
                                <TableHead>Pricing</TableHead>
                                <TableHead>Can Recruit</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tiers?.map((tier) => (
                                <TableRow key={tier.id || tier.tier_key}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span>{tier.emoji}</span>
                                            <div>
                                                <span className="font-medium">{tier.label}</span>
                                                <p className="text-xs text-muted-foreground">{tier.tier_key}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>{(tier.commission_rate * 100).toFixed(1)}%</TableCell>
                                    <TableCell>{tierToInfo(tier).discount}</TableCell>
                                    <TableCell>{tier.can_recruit ? <Badge variant="default" className="text-xs">Yes</Badge> : <Badge variant="secondary" className="text-xs">No</Badge>}</TableCell>
                                    <TableCell>{tier.active ? <Badge variant="default" className="text-xs">Active</Badge> : <Badge variant="outline" className="text-xs">Inactive</Badge>}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => startEdit(tier)} disabled={!!editing}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(tier)} className="text-destructive hover:text-destructive">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!tiers || tiers.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                        No tiers configured. Click "Add Tier" to create one.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}

                {/* Inline editor */}
                {editing && (
                    <div className="mt-6 border rounded-lg p-4 space-y-4 bg-muted/30">
                        <h4 className="font-semibold text-sm">{isNew ? 'New Tier' : `Editing: ${editing.label}`}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs">Tier Key</Label>
                                <Input
                                    value={editing.tier_key || ''}
                                    onChange={(e) => setEditing(prev => ({ ...prev!, tier_key: e.target.value }))}
                                    placeholder="e.g. gold"
                                    disabled={!isNew}
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Label</Label>
                                <Input
                                    value={editing.label || ''}
                                    onChange={(e) => setEditing(prev => ({ ...prev!, label: e.target.value }))}
                                    placeholder="e.g. Gold Partner"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Emoji</Label>
                                <Input
                                    value={editing.emoji || ''}
                                    onChange={(e) => setEditing(prev => ({ ...prev!, emoji: e.target.value }))}
                                    placeholder="🥇"
                                    className="text-sm w-20"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Commission Rate (%)</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={((editing.commission_rate || 0) * 100).toFixed(1)}
                                    onChange={(e) => setEditing(prev => ({ ...prev!, commission_rate: parseFloat(e.target.value) / 100 || 0 }))}
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Pricing Mode</Label>
                                <Select
                                    value={editing.pricing_mode || 'cost_multiplier'}
                                    onValueChange={(v) => setEditing(prev => ({ ...prev!, pricing_mode: v }))}
                                >
                                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cost_multiplier">Cost Multiplier (e.g. 2x cost)</SelectItem>
                                        <SelectItem value="cost_plus">Cost Plus (cost + $X)</SelectItem>
                                        <SelectItem value="percentage">Percentage of Retail</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editing.pricing_mode === 'cost_multiplier' || editing.pricing_mode === 'percentage' ? (
                                <div className="space-y-1">
                                    <Label className="text-xs">{editing.pricing_mode === 'cost_multiplier' ? 'Multiplier' : 'Retail Multiplier'}</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={editing.price_multiplier ?? 2.0}
                                        onChange={(e) => setEditing(prev => ({ ...prev!, price_multiplier: parseFloat(e.target.value) || 1 }))}
                                        className="text-sm"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <Label className="text-xs">Markup ($)</Label>
                                    <Input
                                        type="number"
                                        step="0.5"
                                        value={editing.cost_plus_markup ?? 2.0}
                                        onChange={(e) => setEditing(prev => ({ ...prev!, cost_plus_markup: parseFloat(e.target.value) || 0 }))}
                                        className="text-sm"
                                    />
                                </div>
                            )}
                            <div className="flex items-end gap-4">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editing.can_recruit ?? false}
                                        onChange={(e) => setEditing(prev => ({ ...prev!, can_recruit: e.target.checked }))}
                                        className="rounded border-gray-300"
                                    />
                                    Can Recruit
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editing.active ?? true}
                                        onChange={(e) => setEditing(prev => ({ ...prev!, active: e.target.checked }))}
                                        className="rounded border-gray-300"
                                    />
                                    Active
                                </label>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Sort Order</Label>
                                <Input
                                    type="number"
                                    value={editing.sort_order ?? 0}
                                    onChange={(e) => setEditing(prev => ({ ...prev!, sort_order: parseInt(e.target.value) || 0 }))}
                                    className="text-sm w-20"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button size="sm" onClick={handleSave} disabled={upsertTier.isPending}>
                                {upsertTier.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                                Save Tier
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
