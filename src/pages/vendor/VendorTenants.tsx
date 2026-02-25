import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useTenants, TenantSummary } from '@/hooks/use-tenants';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Building2, Users, Package, ShoppingCart, Copy, Search, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { format } from 'date-fns';
import { useState } from 'react';

function TenantRow({ tenant }: { tenant: TenantSummary }) {
    const navigate = useNavigate();
    const { startImpersonation } = useImpersonation();

    const copyId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(tenant.org_id);
        toast({ title: 'Copied', description: 'Org ID copied to clipboard' });
    };

    const enterTenant = (e: React.MouseEvent) => {
        e.stopPropagation();
        startImpersonation(tenant.org_id, tenant.brand_name || tenant.org_name);
        navigate('/');
    };

    return (
        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/vendor/tenant/${tenant.org_id}`)}>
            <TableCell>
                <div className="flex items-center gap-3">
                    {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt={tenant.brand_name || tenant.org_name} className="h-8 w-8 rounded object-cover" loading="lazy" />
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
            <TableCell>
                <Button size="sm" variant="outline" onClick={enterTenant} className="h-7 px-2 text-xs gap-1 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-600">
                    <Eye className="h-3 w-3" /> Enter
                </Button>
            </TableCell>
        </TableRow>
    );
}

export default function VendorTenants() {
    const { data: tenants, isLoading } = useTenants();
    const [search, setSearch] = useState('');

    const filtered = (tenants || []).filter(t => {
        if (!search) return true;
        const q = search.toLowerCase();
        return t.org_name.toLowerCase().includes(q)
            || t.brand_name.toLowerCase().includes(q)
            || (t.support_email || '').toLowerCase().includes(q);
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">All Tenants</h1>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search tenants..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organizations ({filtered.length})</CardTitle>
                    <CardDescription>
                        Click any tenant to view detailed usage and configuration. Each tenant is fully isolated.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : !tenants?.length ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-semibold">No tenants yet</p>
                            <p className="text-sm">Provision your first organization from the Overview page.</p>
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
                                        <TableHead className="w-[70px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map(tenant => (
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
