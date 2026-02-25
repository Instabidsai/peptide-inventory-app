import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BillingStatusBadge } from './vendor-shared';
import { format, addDays } from 'date-fns';
import { CalendarPlus, RefreshCw, AlertTriangle } from 'lucide-react';

interface Sub {
    plan_name: string;
    status: string;
    billing_period: string;
    stripe_customer_id: string | null;
    current_period_end: string | null;
    trial_end: string | null;
}

export default function TenantSubscriptionActions({ orgId, subscription }: { orgId: string; subscription: Sub | null }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [busy, setBusy] = useState('');

    const { data: plans } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: async () => {
            const { data } = await supabase
                .from('subscription_plans')
                .select('id, name, display_name, monthly_price, annual_price')
                .eq('active', true)
                .order('monthly_price');
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
                                                    {p.display_name || p.name} — ${p.monthly_price}/mo
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
