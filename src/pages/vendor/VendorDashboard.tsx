import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useTenants, useProvisionTenant } from '@/hooks/use-tenants';
import { useAllSubscriptions, calculateMRR } from '@/hooks/use-subscription';
import { StatCard } from './vendor-shared';
import {
    Building2,
    Plus,
    Users,
    Package,
    ShoppingCart,
    CreditCard,
    DollarSign,
    ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
        // Business-in-a-Box v2
        plan_name: '',
        onboarding_path: 'new' as 'new' | 'existing',
        subdomain: '',
        seed_supplier_catalog: true,
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
                plan_name: form.plan_name || undefined,
                onboarding_path: form.onboarding_path,
                subdomain: form.subdomain || undefined,
                seed_supplier_catalog: form.seed_supplier_catalog,
            });

            toast({
                title: 'Tenant provisioned',
                description: `Created ${form.org_name} with org ID: ${result.org_id}`,
            });

            setForm({ org_name: '', admin_email: '', admin_name: '', admin_password: '', brand_name: '', support_email: '', primary_color: '#7c3aed', seed_sample_peptides: true, plan_name: '', onboarding_path: 'new', subdomain: '', seed_supplier_catalog: true });
            setOpen(false);
            onSuccess();
        } catch (err: unknown) {
            toast({ title: 'Provisioning failed', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
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

                    {/* Business-in-a-Box v2 Fields */}
                    <div className="border-t pt-4 mt-2">
                        <p className="text-sm font-medium mb-3">Business-in-a-Box Options</p>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Onboarding Path</Label>
                                    <Select value={form.onboarding_path} onValueChange={v => setForm(f => ({ ...f, onboarding_path: v as 'new' | 'existing' }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">New Business</SelectItem>
                                            <SelectItem value="existing">Existing Business</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Plan</Label>
                                    <Select value={form.plan_name} onValueChange={v => setForm(f => ({ ...f, plan_name: v }))}>
                                        <SelectTrigger><SelectValue placeholder="No plan" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="starter">Starter ($349/mo)</SelectItem>
                                            <SelectItem value="professional">Professional ($499/mo)</SelectItem>
                                            <SelectItem value="enterprise">Enterprise ($1,299/mo)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Subdomain</Label>
                                <div className="flex items-center gap-1">
                                    <Input value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="acmepeptides" className="flex-1" />
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">.thepeptideai.com</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch checked={form.seed_supplier_catalog} onCheckedChange={v => setForm(f => ({ ...f, seed_supplier_catalog: v }))} />
                                <Label>Seed supplier catalog (copy your peptide products into their account)</Label>
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={provision.isPending}>
                        {provision.isPending ? 'Provisioning...' : 'Create Tenant'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function VendorDashboard() {
    const { data: tenants, isLoading, refetch } = useTenants();
    const { data: subscriptions } = useAllSubscriptions();
    const navigate = useNavigate();

    const totalUsers = tenants?.reduce((sum, t) => sum + t.user_count, 0) || 0;
    const totalPeptides = tenants?.reduce((sum, t) => sum + t.peptide_count, 0) || 0;
    const totalOrders = tenants?.reduce((sum, t) => sum + t.order_count, 0) || 0;

    const activeCount = (subscriptions || []).filter(s => s.status === 'active').length;
    const mrr = calculateMRR(subscriptions || []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Platform Overview</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        At-a-glance metrics across all tenants.
                    </p>
                </div>
                <ProvisionDialog onSuccess={() => refetch()} />
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard label="Tenants" value={tenants?.length || 0} icon={Building2} />
                <StatCard label="Total Users" value={totalUsers} icon={Users} />
                <StatCard label="Total Peptides" value={totalPeptides} icon={Package} />
                <StatCard label="Total Orders" value={totalOrders} icon={ShoppingCart} />
                <StatCard label="Active Subscriptions" value={activeCount} icon={CreditCard} />
                <StatCard label="MRR" value={`$${(mrr / 100).toFixed(0)}`} icon={DollarSign} />
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/vendor/tenants')}>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="font-medium">Manage Tenants</p>
                            <p className="text-sm text-muted-foreground">{tenants?.length || 0} organizations</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/vendor/analytics')}>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="font-medium">Revenue Analytics</p>
                            <p className="text-sm text-muted-foreground">MRR, trends, churn</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/vendor/onboarding')}>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="font-medium">Onboarding Pipeline</p>
                            <p className="text-sm text-muted-foreground">Track tenant setup progress</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/vendor/supply-orders')}>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="font-medium">Supply Orders</p>
                            <p className="text-sm text-muted-foreground">Wholesale orders from merchants</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
            </div>

            {/* Recent Tenants */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Tenants</CardTitle>
                    <CardDescription>Latest 5 organizations. View all in Tenants tab.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : !tenants?.length ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="font-medium">No tenants yet</p>
                            <p className="text-sm">Click "New Tenant" to provision your first organization.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tenants.slice(0, 5).map(t => (
                                <div
                                    key={t.org_id}
                                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/vendor/tenant/${t.org_id}`)}
                                >
                                    <div className="flex items-center gap-3">
                                        {t.logo_url ? (
                                            <img src={t.logo_url} alt={t.brand_name || t.org_name} className="h-8 w-8 rounded object-cover" loading="lazy" />
                                        ) : (
                                            <div className="h-8 w-8 rounded flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: t.primary_color }}>
                                                {t.org_name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-medium text-sm">{t.brand_name}</p>
                                            <p className="text-xs text-muted-foreground">{t.user_count} users, {t.peptide_count} peptides, {t.order_count} orders</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {t.order_count > 0 ? 'Active' : 'New'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
