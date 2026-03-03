import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useUpdateSalesOrder } from '@/hooks/use-sales-orders';
import { useOrderCommissions } from '@/hooks/use-commissions';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Award, Check, DollarSign, Pencil, Save, Wand2 } from 'lucide-react';
import type { SalesOrder } from '@/types/database';

interface CommissionCardProps {
    order: Partial<SalesOrder>;
}

export function CommissionCard({ order }: CommissionCardProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const updateOrder = useUpdateSalesOrder();
    const { data: commissionRecords, isLoading: loadingCommissions } = useOrderCommissions(order.id!);

    const [showCommissionDetail, setShowCommissionDetail] = useState(false);
    const [editingCommId, setEditingCommId] = useState<string | null>(null);
    const [editCommAmount, setEditCommAmount] = useState<number>(0);
    const [editCommRate, setEditCommRate] = useState<number>(0);
    const [editCommStatus, setEditCommStatus] = useState<string>('pending');
    const [savingComm, setSavingComm] = useState(false);

    const isBusy = savingComm || updateOrder.isPending;

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                    <Award className="h-4 w-4" /> Commission
                </CardTitle>
                {(order.commission_amount ?? 0) > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setShowCommissionDetail(!showCommissionDetail)}
                    >
                        {showCommissionDetail ? 'Hide details' : 'View records'}
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {!showCommissionDetail ? (
                    <div>
                        <div className="text-2xl font-bold flex items-center text-green-600">
                            <DollarSign className="h-5 w-5 mr-1 text-green-600/70" />
                            {order.commission_amount?.toFixed(2) || '0.00'}
                        </div>
                        {order.rep_id ? (
                            <div className="mt-2 text-sm text-amber-600/80 bg-amber-500/10 p-2 rounded-md border border-amber-500/20">
                                Assigned to <span className="font-semibold text-amber-700/80">{order.profiles?.full_name || 'Sales Rep'}</span>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-1">No sales rep assigned</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Header row with total + done button */}
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-bold flex items-center text-green-600">
                                <DollarSign className="h-4 w-4 mr-1" />
                                {order.commission_amount?.toFixed(2) || '0.00'}
                                <span className="text-xs font-normal text-muted-foreground ml-2">total</span>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setShowCommissionDetail(false); setEditingCommId(null); }}
                            >
                                <Check className="h-3 w-3 mr-1" /> Done
                            </Button>
                        </div>

                        {/* Each person in the commission chain */}
                        {loadingCommissions ? (
                            <div className="text-sm text-muted-foreground animate-pulse py-2">Loading records...</div>
                        ) : commissionRecords && commissionRecords.length > 0 ? (
                            <div className="space-y-2">
                                {commissionRecords.map(rec => {
                                    const isEditing = editingCommId === rec.id;
                                    const typeLabel = rec.type === 'direct' ? 'Direct' : rec.type === 'second_tier_override' ? '2nd Tier' : '3rd Tier';
                                    const statusColor = rec.status === 'void' ? 'text-red-400' :
                                        rec.status === 'paid' ? 'text-green-400' :
                                            rec.status === 'available' ? 'text-blue-400' : 'text-amber-400';

                                    return (
                                        <div key={rec.id} className={`rounded-lg border p-3 space-y-2 ${isEditing ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border/40'}`}>
                                            {/* Row 1: Name, type, status */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm">{rec.profiles?.full_name || 'Unknown'}</span>
                                                    <Badge variant="outline" className="text-[10px] h-5">{typeLabel}</Badge>
                                                    <span className={`text-xs font-medium ${statusColor}`}>{rec.status}</span>
                                                </div>
                                                {!isEditing && (
                                                    <span className={`text-sm font-bold ${rec.status === 'void' ? 'line-through text-muted-foreground' : ''}`}>
                                                        {(rec.commission_rate * 100).toFixed(0)}% &middot; ${rec.amount.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Row 2: Either "edit row" controls or the edit pencil */}
                                            {isEditing ? (
                                                <>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-muted-foreground block mb-1">Amount ($)</label>
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                className="h-8 text-sm"
                                                                value={editCommAmount}
                                                                onChange={e => setEditCommAmount(parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-muted-foreground block mb-1">Rate (%)</label>
                                                            <Input
                                                                type="number"
                                                                step="1"
                                                                min="0"
                                                                max="100"
                                                                className="h-8 text-sm"
                                                                value={Math.round(editCommRate * 100)}
                                                                onChange={e => setEditCommRate((parseFloat(e.target.value) || 0) / 100)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-muted-foreground block mb-1">Status</label>
                                                            <Select value={editCommStatus} onValueChange={setEditCommStatus}>
                                                                <SelectTrigger className="h-8 text-sm">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="pending">Pending</SelectItem>
                                                                    <SelectItem value="available">Available</SelectItem>
                                                                    <SelectItem value="paid">Paid</SelectItem>
                                                                    <SelectItem value="void">Void</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between pt-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-xs text-amber-400 hover:text-amber-300 h-7 px-2"
                                                            onClick={() => setEditCommAmount(0)}
                                                        >
                                                            Set $0
                                                        </Button>
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingCommId(null)}>
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="h-7 px-3 text-xs"
                                                                disabled={savingComm}
                                                                onClick={async () => {
                                                                    if (savingComm) return;
                                                                    setSavingComm(true);
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('commissions')
                                                                            .update({
                                                                                amount: Math.round(editCommAmount * 100) / 100,
                                                                                commission_rate: editCommRate,
                                                                                status: editCommStatus,
                                                                            })
                                                                            .eq('id', rec.id);
                                                                        if (error) { toast({ variant: 'destructive', title: 'Failed to update commission', description: error.message }); return; }
                                                                        const updatedRecords = (commissionRecords || []).map(r =>
                                                                            r.id === rec.id
                                                                                ? { ...r, amount: editCommAmount, status: editCommStatus }
                                                                                : r
                                                                        );
                                                                        const commTotal = updatedRecords
                                                                            .filter(r => r.status !== 'void')
                                                                            .reduce((s, r) => s + r.amount, 0);
                                                                        await updateOrder.mutateAsync({ id: order.id, commission_amount: Math.round(commTotal * 100) / 100 });
                                                                        queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                                                        setEditingCommId(null);
                                                                        toast({ title: 'Commission updated' });
                                                                    } catch { toast({ variant: 'destructive', title: 'Failed to save commission' }); } finally { setSavingComm(false); }
                                                                }}
                                                            >
                                                                <Save className="h-3 w-3 mr-1" /> Save
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-1 justify-end">
                                                    {rec.status !== 'paid' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                            onClick={() => {
                                                                setEditingCommId(rec.id);
                                                                setEditCommAmount(rec.amount);
                                                                setEditCommRate(rec.commission_rate);
                                                                setEditCommStatus(rec.status);
                                                            }}
                                                        >
                                                            <Pencil className="h-3 w-3 mr-1" /> Edit
                                                        </Button>
                                                    )}
                                                    {rec.status !== 'void' && rec.status !== 'paid' && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
                                                                disabled={savingComm}
                                                                onClick={async () => {
                                                                    if (savingComm) return;
                                                                    setSavingComm(true);
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('commissions')
                                                                            .update({ amount: 0 })
                                                                            .eq('id', rec.id);
                                                                        if (error) { toast({ variant: 'destructive', title: 'Failed to zero commission', description: error.message }); return; }
                                                                        const remaining = (commissionRecords || []).map(r =>
                                                                            r.id === rec.id ? { ...r, amount: 0 } : r
                                                                        );
                                                                        const commTotal = remaining
                                                                            .filter(r => r.status !== 'void')
                                                                            .reduce((s, r) => s + r.amount, 0);
                                                                        await updateOrder.mutateAsync({ id: order.id, commission_amount: Math.round(commTotal * 100) / 100 });
                                                                        queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                                                        toast({ title: 'Commission set to $0' });
                                                                    } catch { toast({ variant: 'destructive', title: 'Failed to update commission' }); } finally { setSavingComm(false); }
                                                                }}
                                                            >
                                                                $0
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                                                                disabled={savingComm}
                                                                onClick={async () => {
                                                                    if (savingComm) return;
                                                                    setSavingComm(true);
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('commissions')
                                                                            .update({ status: 'void' })
                                                                            .eq('id', rec.id);
                                                                        if (error) { toast({ variant: 'destructive', title: 'Failed to void commission', description: error.message }); return; }
                                                                        const remaining = (commissionRecords || [])
                                                                            .filter(r => r.id !== rec.id && r.status !== 'void');
                                                                        const commTotal = remaining.reduce((s, r) => s + r.amount, 0);
                                                                        await updateOrder.mutateAsync({ id: order.id, commission_amount: Math.round(commTotal * 100) / 100 });
                                                                        queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                                                        toast({ title: 'Commission voided' });
                                                                    } catch { toast({ variant: 'destructive', title: 'Failed to void commission' }); } finally { setSavingComm(false); }
                                                                }}
                                                            >
                                                                Void
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (order.commission_amount ?? 0) > 0 && order.rep_id ? (
                            /* Rep exists, commission amount set, but no individual records — run RPC to generate them */
                            <div className="space-y-2">
                                <div className="rounded-lg border p-3 bg-amber-500/5 border-amber-500/30 space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        ${order.commission_amount?.toFixed(2)} commission for <span className="font-medium text-foreground">{order.profiles?.full_name || 'Sales Rep'}</span> — records missing from database.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-3 text-xs border-primary/40"
                                            onClick={async () => {
                                                const { error } = await supabase.rpc('process_sale_commission', { p_sale_id: order.id });
                                                if (error) {
                                                    toast({ title: 'Failed to generate records', description: error.message, variant: 'destructive' });
                                                } else {
                                                    queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                                    toast({ title: 'Commission records generated for the full chain' });
                                                }
                                            }}
                                        >
                                            <Wand2 className="h-3 w-3 mr-1" /> Generate Commission Records
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
                                            onClick={() => {
                                                updateOrder.mutate({ id: order.id, commission_amount: 0 });
                                                toast({ title: 'Commission zeroed' });
                                            }}
                                        >
                                            $0
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No commission on this order.</p>
                        )}

                        {/* Bulk actions at bottom */}
                        {commissionRecords && commissionRecords.some(r => r.status !== 'void' && r.status !== 'paid') && (
                            <div className="flex gap-2 pt-2 border-t border-border/40">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs flex-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                    disabled={isBusy}
                                    onClick={async () => {
                                        if (commissionRecords) {
                                            const idsToZero = commissionRecords
                                                .filter(r => r.status !== 'void' && r.status !== 'paid')
                                                .map(r => r.id);
                                            if (idsToZero.length > 0) {
                                                await supabase.from('commissions').update({ amount: 0 }).in('id', idsToZero);
                                            }
                                        }
                                        updateOrder.mutate({ id: order.id, commission_amount: 0 });
                                        queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                        toast({ title: 'All commissions zeroed' });
                                    }}
                                >
                                    Zero All
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
                                    disabled={isBusy}
                                    onClick={async () => {
                                        if (commissionRecords) {
                                            const idsToVoid = commissionRecords
                                                .filter(r => r.status !== 'paid')
                                                .map(r => r.id);
                                            if (idsToVoid.length > 0) {
                                                await supabase.from('commissions').update({ status: 'void' }).in('id', idsToVoid);
                                            }
                                        }
                                        updateOrder.mutate({ id: order.id, commission_amount: 0 });
                                        queryClient.invalidateQueries({ queryKey: ['order_commissions', order.id] });
                                        toast({ title: 'All commissions voided' });
                                    }}
                                >
                                    Void All
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
