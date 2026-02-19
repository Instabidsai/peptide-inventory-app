import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useTenants, useProvisionTenant, TenantSummary } from '@/hooks/use-tenants';
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
} from 'lucide-react';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
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
                        <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} className="h-8 w-12 rounded border cursor-pointer" />
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
                    Active
                </Badge>
            </TableCell>
        </TableRow>
    );
}

export default function VendorDashboard() {
    const { data: tenants, isLoading, refetch } = useTenants();
    const { user } = useAuth();

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

            {/* Tenant List */}
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
                            <p className="text-lg font-medium">No tenants yet</p>
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
        </div>
    );
}
