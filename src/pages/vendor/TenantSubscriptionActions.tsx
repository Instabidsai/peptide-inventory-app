import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BillingStatusBadge } from './vendor-shared';
import { useOrgInvoices, useUpdateMonthlyRate, TenantInvoice } from '@/hooks/use-tenant-invoices';
import { format, addDays } from 'date-fns';
import { CalendarPlus, RefreshCw, AlertTriangle, DollarSign, CheckCircle2, Clock, Ban } from 'lucide-react';

interface Sub {
    plan_name: string;
    status: string;
    billing_period: string;
    stripe_customer_id: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    monthly_rate_cents?: number;
}

function MiniInvoiceStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'paid':
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Paid</Badge>;
        case 'pending':
            return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Pending</Badge>;
        case 'overdue':
            return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Overdue</Badge>;
        case 'waived':
            return <Badge variant="secondary" className="text-[10px]"><Ban className="h-2.5 w-2.5 mr-0.5" />Waived</Badge>;
        default:
            return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
}

export default function TenantSubscriptionActions({ orgId, subscription }: { orgId: string; subscription: Sub | null }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [busy, setBusy] = useState('');

    // Monthly rate
    const [rateInput, setRateInput] = useState<string>(
        subscription?.monthly_rate_cents ? String(subscription.monthly_rate_cents / 100) : ''
    );
    const updateRate = useUpdateMonthlyRate();

    // Recent invoices for this tenant
    const { data: recentInvoices } = useOrgInvoices(orgId, 6);

    const { data: plans } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: async () => {
            const { data } = await supabase
                .from('subscription_plans')
                .select('id, name, display_name, price_monthly, price_yearly')
                .eq('active', true)
                .order('price_monthly');
            return data || [];
        },
    });

    const updateSubscription = async (field: string, value: any) => {
        setBusy(field);
        try {
            const { error } = await supabase
                .from('tenant_subscriptions')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('org_id', orgId);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: 'Subscription updated' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed', description: err.message });
        } finally {
            setBusy('');
        }
    };

    const changePlan = async (planId: string) => {
        setBusy('plan');
        try {
            const { error } = await supabase
                .from('tenant_subscriptions')
                .update({ plan_id: planId, updated_at: new Date().toISOString() })
                .eq('org_id', orgId);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: 'Plan changed' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed', description: err.message });
        } finally {
            setBusy('');
        }
    };

    const extendTrial = async (days: number) => {
        setBusy('trial');
        try {
            const baseDate = subscription?.trial_end ? new Date(subscription.trial_end) : new Date();
            const newEnd = addDays(baseDate, days);
            const { error } = await supabase
                .from('tenant_subscriptions')
                .update({
                    trial_end: newEnd.toISOString(),
                    current_period_end: newEnd.toISOString(),
                    status: 'trialing',
                    updated_at: new Date().toISOString(),
                })
                .eq('org_id', orgId);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: `Trial extended by ${days} days` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed', description: err.message });
        } finally {
            setBusy('');
        }
    };

    const createSubscription = async () => {
        if (!plans?.length) return;
        setBusy('create');
        try {
            const starterPlan = plans.find(p => p.name === 'starter') || plans[0];
            const trialEnd = addDays(new Date(), 14);
            const { error } = await supabase
                .from('tenant_subscriptions')
                .insert({
                    org_id: orgId,
                    plan_id: starterPlan.id,
                    status: 'trialing',
                    billing_period: 'monthly',
                    trial_end: trialEnd.toISOString(),
                    current_period_start: new Date().toISOString(),
                    current_period_end: trialEnd.toISOString(),
                });
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: 'Subscription created with 14-day trial' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed', description: err.message });
        } finally {
            setBusy('');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Subscription</CardTitle>
            </CardHeader>
            <CardContent>
                {subscription ? (
                    <div className="space-y-4">
                        {/* Current status */}
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-sm text-muted-foreground">Plan</span>
                                <span className="font-medium">{subscription.plan_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-muted-foreground">Billing Period</span>
                                <span className="capitalize">{subscription.billing_period}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <BillingStatusBadge status={subscription.status} />
                            </div>
                            {subscription.current_period_end && (
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Renews</span>
                                    <span className="text-sm">{format(new Date(subscription.current_period_end), 'MMM d, yyyy')}</span>
                                </div>
                            )}
                            {subscription.stripe_customer_id && (
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Stripe ID</span>
                                    <span className="font-mono text-xs">{subscription.stripe_customer_id}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="border-t pt-3 space-y-3">
                            {/* Change Plan */}
                            {plans && plans.length > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm">Change Plan</span>
                                    <Select
                                        onValueChange={changePlan}
                                        disabled={busy === 'plan'}
                                    >
                                        <SelectTrigger className="h-7 w-[140px] text-xs">
                                            <SelectValue placeholder="Select plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {plans.map(p => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                                    {p.display_name || p.name} — ${p.price_monthly}/mo
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Extend Trial */}
                            {subscription.status === 'trialing' && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm flex items-center gap-1.5">
                                        <CalendarPlus className="h-3.5 w-3.5" /> Extend Trial
                                    </span>
                                    <div className="flex gap-1.5">
                                        {[7, 14, 30].map(d => (
                                            <Button
                                                key={d}
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs px-2"
                                                disabled={busy === 'trial'}
                                                onClick={() => extendTrial(d)}
                                            >
                                                +{d}d
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Change Status */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm flex items-center gap-1.5">
                                    <RefreshCw className="h-3.5 w-3.5" /> Status
                                </span>
                                <Select
                                    value={subscription.status}
                                    onValueChange={v => updateSubscription('status', v)}
                                    disabled={!!busy}
                                >
                                    <SelectTrigger className="h-7 w-[120px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {['trialing', 'active', 'past_due', 'canceled', 'paused'].map(s => (
                                            <SelectItem key={s} value={s} className="text-xs capitalize">
                                                {s.replace(/_/g, ' ')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Toggle Billing Period */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm">Billing Period</span>
                                <Select
                                    value={subscription.billing_period}
                                    onValueChange={v => updateSubscription('billing_period', v)}
                                    disabled={!!busy}
                                >
                                    <SelectTrigger className="h-7 w-[120px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                                        <SelectItem value="annual" className="text-xs">Annual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* ── Monthly Rate (Manual Billing) ─────────────────── */}
                        <div className="border-t pt-3 space-y-2">
                            <Label className="text-sm flex items-center gap-1.5">
                                <DollarSign className="h-3.5 w-3.5" /> Monthly SaaS Rate (Zelle/Venmo/CashApp)
                            </Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    className="h-8 w-28 text-sm"
                                    value={rateInput}
                                    onChange={e => setRateInput(e.target.value)}
                                />
                                <span className="text-sm text-muted-foreground">/ mo</span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    disabled={updateRate.isPending}
                                    onClick={() => {
                                        const cents = Math.round(parseFloat(rateInput || '0') * 100);
                                        updateRate.mutate({ orgId, rateCents: cents }, {
                                            onSuccess: () => toast({ title: `Monthly rate set to $${(cents / 100).toFixed(2)}` }),
                                            onError: (err: Error) => toast({ variant: 'destructive', title: 'Failed', description: err.message }),
                                        });
                                    }}
                                >
                                    {updateRate.isPending ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                            {subscription.monthly_rate_cents ? (
                                <p className="text-xs text-muted-foreground">Current: ${(subscription.monthly_rate_cents / 100).toFixed(2)}/mo</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">No rate set — invoices won't be generated for this tenant.</p>
                            )}
                        </div>

                        {/* ── Recent Invoices ──────────────────────────────── */}
                        {recentInvoices && recentInvoices.length > 0 && (
                            <div className="border-t pt-3 space-y-2">
                                <Label className="text-sm">Recent Invoices</Label>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs h-7">Period</TableHead>
                                            <TableHead className="text-xs h-7 text-right">Amount</TableHead>
                                            <TableHead className="text-xs h-7">Status</TableHead>
                                            <TableHead className="text-xs h-7">Paid</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentInvoices.map(inv => (
                                            <TableRow key={inv.id}>
                                                <TableCell className="text-xs py-1.5">{format(new Date(inv.period_start), 'MMM yyyy')}</TableCell>
                                                <TableCell className="text-xs py-1.5 text-right">${(inv.amount_cents / 100).toFixed(2)}</TableCell>
                                                <TableCell className="py-1.5"><MiniInvoiceStatusBadge status={inv.status} /></TableCell>
                                                <TableCell className="text-xs py-1.5">{inv.paid_at ? format(new Date(inv.paid_at), 'MMM d') : '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-4">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">No subscription — Free tier</p>
                        <Button size="sm" onClick={createSubscription} disabled={busy === 'create'}>
                            {busy === 'create' ? 'Creating...' : 'Start 14-day Trial'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
