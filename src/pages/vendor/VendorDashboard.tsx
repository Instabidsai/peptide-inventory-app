import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useTenants, useProvisionTenant, TenantSummary } from '@/hooks/use-tenants';
import { useAllSubscriptions, useBillingEvents } from '@/hooks/use-subscription';
import { useAuth } from '@/contexts/AuthContext';
import {
    Building2,
    Plus,
    Users,
    Package,
    ShoppingCart,
    Globe,
    Mail,
    Palette,
    Copy,
    ExternalLink,
    Shield,
    CreditCard,
    Activity,
    DollarSign,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Clock,
} from 'lucide-react';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ElementType }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg bg-primary/10 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function ProvisionDialog({ onSuccess }: { onSuccess: () => void }) {
    const provision = useProvisionTenant();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        org_name: '',
        admin_email: '',
        admin_name: '',
        admin_password: '',
        brand_name: '',
        support_email: '',
        primary_color: '#7c3aed',
        seed_sample_peptides: true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.org_name || !form.admin_email || !form.admin_name) {
            toast({ title: 'Missing fields', description: 'Organization name, admin email, and admin name are required.', variant: 'destructive' });
            return;
        }

        try {
            const result = await provision.mutateAsync({
                org_name: form.org_name,
                admin_email: form.admin_email,
                admin_name: form.admin_name,
                admin_password: form.admin_password || undefined,
                brand_name: form.brand_name || undefined,
                support_email: form.support_email || undefined,
                primary_color: form.primary_color,
                seed_sample_peptides: form.seed_sample_peptides,
            });

            toast({
                title: 'Tenant provisioned',
                description: `Created ${form.org_name} with org ID: ${result.org_id}`,
            });

            setForm({ org_name: '', admin_email: '', admin_name: '', admin_password: '', brand_name: '', support_email: '', primary_color: '#7c3aed', seed_sample_peptides: true });
            setOpen(false);
            onSuccess();
        } catch (err: any) {
            toast({ title: 'Provisioning failed', description: err.message, variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New Tenant</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Provision New Tenant</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Organization Name *</Label>
                        <Input value={form.org_name} onChange={e => setForm(f => ({ ...f, org_name: e.target.value }))} placeholder="Acme Peptides" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Admin Name *</Label>
                            <Input value={form.admin_name} onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))} placeholder="John Smith" />
                        </div>
                        <div className="space-y-2">
                            <Label>Admin Email *</Label>
                            <Input type="email" value={form.admin_email} onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} placeholder="admin@acme.com" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Admin Password (optional — sends magic link if blank)</Label>
                        <Input type="password" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} placeholder="Leave blank for magic link" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Brand Name</Label>
                            <Input value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} placeholder="Same as org name if blank" />
                        </div>
                        <div className="space-y-2">
                            <Label>Support Email</Label>
                            <Input type="email" value={form.support_email} onChange={e => setForm(f => ({ ...f, support_email: e.target.value }))} placeholder="Uses admin email if blank" />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Label>Brand Color</Label>
                        <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="h-11 w-14 rounded-lg border border-input bg-card/50 cursor-pointer shadow-inset" />
                        <span className="text-xs text-muted-foreground">{form.primary_color}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Switch checked={form.seed_sample_peptides} onCheckedChange={v => setForm(f => ({ ...f, seed_sample_peptides: v }))} />
                        <Label>Seed sample peptides (BPC-157, TB-500, Semaglutide, CJC-1295, Ipamorelin)</Label>
                    </div>
                    <Button type="submit" className="w-full" disabled={provision.isPending}>
                        {provision.isPending ? 'Provisioning...' : 'Create Tenant'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function TenantRow({ tenant }: { tenant: TenantSummary }) {
    const copyId = () => {
        navigator.clipboard.writeText(tenant.org_id);
        toast({ title: 'Copied', description: 'Org ID copied to clipboard' });
    };

    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-3">
                    {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                        <div className="h-8 w-8 rounded flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: tenant.primary_color }}>
                            {tenant.org_name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <p className="font-medium">{tenant.brand_name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.org_name}</p>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                    {tenant.org_id.slice(0, 8)}...
                    <button onClick={copyId} className="hover:text-foreground">
                        <Copy className="h-3 w-3" />
                    </button>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.user_count}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.peptide_count}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                    {tenant.order_count}
                </div>
            </TableCell>
            <TableCell>
                {tenant.support_email && (
                    <span className="text-xs text-muted-foreground">{tenant.support_email}</span>
                )}
            </TableCell>
            <TableCell>
                <span className="text-xs text-muted-foreground">
                    {format(new Date(tenant.created_at), 'MMM d, yyyy')}
                </span>
            </TableCell>
            <TableCell>
                <Badge variant="outline" className="text-xs">
                    {tenant.order_count > 0 ? 'Active' : 'New'}
                </Badge>
            </TableCell>
        </TableRow>
    );
}

function BillingStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'active':
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
        case 'past_due':
            return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Past Due</Badge>;
        case 'canceled':
            return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Canceled</Badge>;
        case 'trialing':
            return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Clock className="h-3 w-3 mr-1" />Trial</Badge>;
        default:
            return <Badge variant="outline">Free</Badge>;
    }
}

function HealthBadge({ health }: { health: string }) {
    switch (health) {
        case 'active':
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><Activity className="h-3 w-3 mr-1" />Active</Badge>;
        case 'warning':
            return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Low Activity</Badge>;
        default:
            return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Inactive</Badge>;
    }
}

function BillingTab({ tenants }: { tenants: TenantSummary[] }) {
    const { data: subscriptions } = useAllSubscriptions();
    const { data: events } = useBillingEvents();

    const subMap = new Map(
        (subscriptions || []).map(s => [s.org_id, s])
    );

    const activeCount = (subscriptions || []).filter(s => s.status === 'active').length;
    const mrr = (subscriptions || []).reduce((sum, s) => {
        if (s.status !== 'active' || !s.plan) return sum;
        const plan = s.plan as any;
        return sum + (s.billing_period === 'yearly' ? Math.round(plan.price_yearly / 12) : plan.price_monthly);
    }, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
                <StatCard label="Active Subscriptions" value={activeCount} icon={CreditCard} />
                <StatCard label="Monthly Revenue" value={`$${(mrr / 100).toFixed(2)}`} icon={DollarSign} />
                <StatCard label="Free Tier" value={(tenants?.length || 0) - activeCount} icon={Building2} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Tenant Billing</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead>Renews</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tenants?.map(t => {
                                const sub = subMap.get(t.org_id);
                                return (
                                    <TableRow key={t.org_id}>
                                        <TableCell className="font-medium">{t.brand_name}</TableCell>
                                        <TableCell>{(sub?.plan as any)?.display_name || 'Free'}</TableCell>
                                        <TableCell><BillingStatusBadge status={sub?.status || 'none'} /></TableCell>
                                        <TableCell className="text-sm capitalize">{sub?.billing_period || '—'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {sub?.current_period_end
                                                ? format(new Date(sub.current_period_end), 'MMM d, yyyy')
                                                : '—'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {events && events.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Billing Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {events.slice(0, 10).map((evt: any) => (
                                <div key={evt.id} className="flex items-center justify-between text-sm border-b pb-2">
                                    <span className="font-mono text-xs text-muted-foreground">{evt.event_type}</span>
                                    {evt.amount_cents != null && <span className="font-medium">${(evt.amount_cents / 100).toFixed(2)}</span>}
                                    <span className="text-xs text-muted-foreground">{format(new Date(evt.created_at), 'MMM d, h:mm a')}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function HealthTab({ tenants }: { tenants: TenantSummary[] }) {
    const { session } = useAuth();
    const [healthData, setHealthData] = useState<any[]>([]);
    const [systemHealth, setSystemHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHealth() {
            setLoading(true);
            try {
                // Fetch system health
                const sysRes = await fetch('/api/health');
                if (sysRes.ok) setSystemHealth(await sysRes.json());

                // Fetch tenant health
                if (session?.access_token) {
                    const tenantRes = await fetch('/api/health/tenant-status', {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    if (tenantRes.ok) {
                        const data = await tenantRes.json();
                        setHealthData(data.tenants || []);
                    }
                }
            } catch (err) {
                console.error('Health fetch error:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchHealth();
    }, [session?.access_token]);

    return (
        <div className="space-y-4">
            {/* System Health */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        System Health
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!systemHealth ? (
                        <Skeleton className="h-20 w-full" />
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(systemHealth.checks || {}).map(([name, check]: [string, any]) => (
                                <div key={name} className="flex items-center gap-2 p-3 rounded-lg border">
                                    {check.status === 'ok'
                                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        : <XCircle className="h-4 w-4 text-red-500" />}
                                    <div>
                                        <p className="text-sm font-medium capitalize">{name}</p>
                                        {check.latency_ms && <p className="text-xs text-muted-foreground">{check.latency_ms}ms</p>}
                                        {check.error && <p className="text-xs text-red-400">{check.error}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {systemHealth && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Version: {systemHealth.version} | Total latency: {systemHealth.total_latency_ms}ms | {systemHealth.timestamp}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Per-Tenant Health */}
            <Card>
                <CardHeader>
                    <CardTitle>Tenant Health</CardTitle>
                    <CardDescription>Activity-based health monitoring. Active = orders in last 7 days.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tenant</TableHead>
                                    <TableHead>Health</TableHead>
                                    <TableHead>Orders (7d)</TableHead>
                                    <TableHead>Orders (30d)</TableHead>
                                    <TableHead>Users</TableHead>
                                    <TableHead>Plan</TableHead>
                                    <TableHead>Billing</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {healthData.map((t: any) => (
                                    <TableRow key={t.org_id}>
                                        <TableCell className="font-medium">{t.org_name}</TableCell>
                                        <TableCell><HealthBadge health={t.health} /></TableCell>
                                        <TableCell>{t.orders_7d}</TableCell>
                                        <TableCell>{t.orders_30d}</TableCell>
                                        <TableCell>{t.active_users}</TableCell>
                                        <TableCell className="text-sm">{t.plan_name}</TableCell>
                                        <TableCell><BillingStatusBadge status={t.subscription_status} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function VendorDashboard() {
    const { data: tenants, isLoading, refetch } = useTenants();
    const { user, session } = useAuth();

    const totalUsers = tenants?.reduce((sum, t) => sum + t.user_count, 0) || 0;
    const totalPeptides = tenants?.reduce((sum, t) => sum + t.peptide_count, 0) || 0;
    const totalOrders = tenants?.reduce((sum, t) => sum + t.order_count, 0) || 0;

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="h-6 w-6 text-primary" />
                        Vendor Control Panel
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage all tenants, provision new organizations, and monitor platform health.
                    </p>
                </div>
                <ProvisionDialog onSuccess={() => refetch()} />
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Tenants" value={tenants?.length || 0} icon={Building2} />
                <StatCard label="Total Users" value={totalUsers} icon={Users} />
                <StatCard label="Total Peptides" value={totalPeptides} icon={Package} />
                <StatCard label="Total Orders" value={totalOrders} icon={ShoppingCart} />
            </div>

            {/* Tabbed Content */}
            <Tabs defaultValue="tenants">
                <TabsList>
                    <TabsTrigger value="tenants"><Building2 className="h-4 w-4 mr-1.5" />Tenants</TabsTrigger>
                    <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-1.5" />Billing</TabsTrigger>
                    <TabsTrigger value="health"><Activity className="h-4 w-4 mr-1.5" />Health</TabsTrigger>
                </TabsList>

                <TabsContent value="tenants">
                    <Card>
                        <CardHeader>
                            <CardTitle>All Tenants</CardTitle>
                            <CardDescription>
                                Each tenant is a fully isolated organization with its own users, inventory, and branding.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-3">
                                    {[...Array(3)].map((_, i) => (
                                        <Skeleton key={i} className="h-12 w-full" />
                                    ))}
                                </div>
                            ) : !tenants?.length ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
                                    <p className="text-lg font-semibold">No tenants yet</p>
                                    <p className="text-sm">Click "New Tenant" to provision your first organization.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tenant</TableHead>
                                                <TableHead>Org ID</TableHead>
                                                <TableHead>Users</TableHead>
                                                <TableHead>Peptides</TableHead>
                                                <TableHead>Orders</TableHead>
                                                <TableHead>Support</TableHead>
                                                <TableHead>Created</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tenants.map(tenant => (
                                                <TenantRow key={tenant.org_id} tenant={tenant} />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="billing">
                    <BillingTab tenants={tenants || []} />
                </TabsContent>

                <TabsContent value="health">
                    <HealthTab tenants={tenants || []} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
