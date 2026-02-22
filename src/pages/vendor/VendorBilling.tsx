import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAllSubscriptions, useBillingEvents, calculateMRR, BillingEvent } from '@/hooks/use-subscription';
import { BillingStatusBadge, StatCard } from './vendor-shared';
import { CreditCard, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function VendorBilling() {
    const { data: subscriptions, isLoading: subsLoading } = useAllSubscriptions();
    const { data: billingEvents, isLoading: eventsLoading } = useBillingEvents();
    const navigate = useNavigate();

    const activeCount = (subscriptions || []).filter(s => s.status === 'active').length;
    const trialingCount = (subscriptions || []).filter(s => s.status === 'trialing').length;
    const pastDueCount = (subscriptions || []).filter(s => s.status === 'past_due').length;
    const mrr = calculateMRR(subscriptions || []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Billing & Subscriptions</h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="MRR" value={`$${(mrr / 100).toFixed(0)}`} icon={DollarSign} />
                <StatCard label="Active" value={activeCount} icon={CreditCard} />
                <StatCard label="Trialing" value={trialingCount} icon={Clock} />
                <StatCard label="Past Due" value={pastDueCount} icon={AlertTriangle} />
            </div>

            {/* Active Subscriptions */}
            <Card>
                <CardHeader>
                    <CardTitle>Subscriptions</CardTitle>
                    <CardDescription>All tenant subscriptions and their current status</CardDescription>
                </CardHeader>
                <CardContent>
                    {subsLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : !subscriptions?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No subscriptions yet</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tenant</TableHead>
                                        <TableHead>Plan</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Stripe Customer</TableHead>
                                        <TableHead>Renews</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {subscriptions.map(s => (
                                        <TableRow
                                            key={s.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => navigate(`/vendor/tenant/${s.org_id}`)}
                                        >
                                            <TableCell className="font-medium">{s.org?.name || s.org_id.slice(0, 8) + '...'}</TableCell>
                                            <TableCell>{s.plan?.display_name || 'Unknown'}</TableCell>
                                            <TableCell className="capitalize">{s.billing_period}</TableCell>
                                            <TableCell><BillingStatusBadge status={s.status} /></TableCell>
                                            <TableCell className="font-mono text-xs">{s.stripe_customer_id || '—'}</TableCell>
                                            <TableCell className="text-xs">
                                                {s.current_period_end ? format(new Date(s.current_period_end), 'MMM d, yyyy') : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Billing Events */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Billing Events</CardTitle>
                    <CardDescription>Stripe webhook events across all tenants</CardDescription>
                </CardHeader>
                <CardContent>
                    {eventsLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !billingEvents?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No billing events recorded</p>
                    ) : (
                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {(billingEvents as BillingEvent[]).map((e) => (
                                <div key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            variant={e.event_type.includes('failed') ? 'destructive' : 'outline'}
                                            className="text-[10px]"
                                        >
                                            {e.event_type}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">{e.org?.name || '—'}</span>
                                        {e.amount_cents != null && (
                                            <span className="font-medium">${(e.amount_cents / 100).toFixed(2)}</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {format(new Date(e.created_at), 'MMM d, h:mm a')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
