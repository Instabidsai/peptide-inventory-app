import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSubscriptionPlans } from '@/hooks/use-subscription';
import { Settings, CreditCard, Palette, Zap } from 'lucide-react';

export default function VendorSettings() {
    const { data: plans, isLoading } = useSubscriptionPlans();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Platform Settings</h1>

            {/* Subscription Plans */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Subscription Plans</CardTitle>
                    <CardDescription>Active pricing tiers available to tenants</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                    ) : !plans?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No plans configured</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Plan</TableHead>
                                        <TableHead className="text-right">Monthly</TableHead>
                                        <TableHead className="text-right">Yearly</TableHead>
                                        <TableHead className="text-right">Max Users</TableHead>
                                        <TableHead className="text-right">Max Peptides</TableHead>
                                        <TableHead className="text-right">Max Orders/mo</TableHead>
                                        <TableHead>Features</TableHead>
                                        <TableHead>Stripe Monthly ID</TableHead>
                                        <TableHead>Stripe Yearly ID</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {plans.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.display_name}</TableCell>
                                            <TableCell className="text-right">${(p.price_monthly / 100).toFixed(0)}/mo</TableCell>
                                            <TableCell className="text-right">${(p.price_yearly / 100).toFixed(0)}/yr</TableCell>
                                            <TableCell className="text-right">{p.max_users === -1 ? 'Unlimited' : p.max_users}</TableCell>
                                            <TableCell className="text-right">{p.max_peptides === -1 ? 'Unlimited' : p.max_peptides}</TableCell>
                                            <TableCell className="text-right">{p.max_orders_per_month === -1 ? 'Unlimited' : p.max_orders_per_month}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {(p.features || []).map((f, i) => (
                                                        <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-[10px]">{p.stripe_monthly_price_id || '—'}</TableCell>
                                            <TableCell className="font-mono text-[10px]">{p.stripe_yearly_price_id || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Platform Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Platform Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Application</span>
                            <span className="font-medium">ThePeptideAI Platform</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Deployment</span>
                            <span className="font-medium">Vercel</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Database</span>
                            <span className="font-medium">Supabase (PostgreSQL)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Auth</span>
                            <span className="font-medium">Supabase Auth + RLS</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Payments</span>
                            <span className="font-medium">Stripe</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">AI Provider</span>
                            <span className="font-medium">OpenAI GPT-4o</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Edge Functions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Edge Functions</CardTitle>
                    <CardDescription>Deployed Supabase edge functions</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                            'provision-tenant',
                            'stripe-webhook',
                            'create-checkout',
                            'manage-subscription',
                            'admin-chat',
                            'partner-chat',
                            'automation-runner',
                            'send-email',
                            'client-chat',
                            'commission-calculator',
                            'protocol-generator',
                            'pdf-generator',
                            'analytics-digest',
                            'notification-dispatcher',
                            'data-export',
                        ].map(fn => (
                            <div key={fn} className="flex items-center gap-2 p-2 border rounded text-xs">
                                <Zap className="h-3 w-3 text-green-500" />
                                <span className="font-mono">{fn}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
