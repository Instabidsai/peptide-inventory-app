import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGlobalAuditLog, usePlatformStats, useFailedPayments } from '@/hooks/use-vendor-audit';
import { useTenants } from '@/hooks/use-tenants';
import { StatCard } from './vendor-shared';
import { Building2, Users, Package, ShoppingCart, FlaskConical, UserCheck, AlertTriangle, ScrollText } from 'lucide-react';
import { format } from 'date-fns';

interface OrgJoin { name: string }
interface AuditEntry {
    id: string; action: string; table_name: string; created_at: string;
    org: OrgJoin | null;
}
interface BillingEvent {
    id: string; event_type: string; amount_cents: number | null; created_at: string;
    org: OrgJoin | null;
}

function PlatformStatsGrid({ stats, isLoading }: { stats: ReturnType<typeof usePlatformStats>['data']; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Organizations" value={stats?.organizations || 0} icon={Building2} />
            <StatCard label="Users" value={stats?.profiles || 0} icon={Users} />
            <StatCard label="Peptides" value={stats?.peptides || 0} icon={FlaskConical} />
            <StatCard label="Bottles" value={stats?.bottles || 0} icon={Package} />
            <StatCard label="Orders" value={stats?.sales_orders || 0} icon={ShoppingCart} />
            <StatCard label="Contacts" value={stats?.contacts || 0} icon={UserCheck} />
        </div>
    );
}

function FailedPaymentsCard({ payments }: { payments: BillingEvent[] }) {
    if (!payments.length) return null;
    return (
        <Card className="border-red-500/20">
            <CardHeader>
                <CardTitle className="text-lg text-red-500">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    Failed Payments ({payments.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {payments.map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                            <div className="flex items-center gap-3">
                                <Badge variant="destructive" className="text-[10px]">{e.event_type}</Badge>
                                <span className="text-muted-foreground">{e.org?.name || 'Unknown'}</span>
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
            </CardContent>
        </Card>
    );
}

export default function VendorAudit() {
    const [orgFilter, setOrgFilter] = useState<string | undefined>(undefined);
    const [tableFilter, setTableFilter] = useState<string | undefined>(undefined);
    const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);

    const { data: auditLog, isLoading: auditLoading } = useGlobalAuditLog({
        orgId: orgFilter,
        tableName: tableFilter,
        action: actionFilter,
    });
    const { data: stats, isLoading: statsLoading } = usePlatformStats();
    const { data: failedPayments } = useFailedPayments();
    const { data: tenants } = useTenants();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">System & Audit</h1>
            <PlatformStatsGrid stats={stats} isLoading={statsLoading} />
            <FailedPaymentsCard payments={(failedPayments as BillingEvent[]) || []} />

            {/* Global Audit Log */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Global Audit Log</CardTitle>
                    <CardDescription>All database changes across all tenants</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <Select value={orgFilter || 'all'} onValueChange={v => setOrgFilter(v === 'all' ? undefined : v)}>
                            <SelectTrigger className="text-xs h-8">
                                <SelectValue placeholder="All Tenants" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tenants</SelectItem>
                                {(tenants || []).map(t => (
                                    <SelectItem key={t.org_id} value={t.org_id}>{t.org_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={tableFilter || 'all'} onValueChange={v => setTableFilter(v === 'all' ? undefined : v)}>
                            <SelectTrigger className="text-xs h-8">
                                <SelectValue placeholder="All Tables" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tables</SelectItem>
                                {['peptides', 'bottles', 'sales_orders', 'contacts', 'profiles', 'tenant_config', 'automation_modules'].map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={actionFilter || 'all'} onValueChange={v => setActionFilter(v === 'all' ? undefined : v)}>
                            <SelectTrigger className="text-xs h-8">
                                <SelectValue placeholder="All Actions" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Actions</SelectItem>
                                <SelectItem value="INSERT">INSERT</SelectItem>
                                <SelectItem value="UPDATE">UPDATE</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {auditLoading ? (
                        <div className="space-y-3">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !auditLog?.length ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p>No audit log entries match your filters</p>
                        </div>
                    ) : (
                        <div className="max-h-[500px] overflow-y-auto space-y-2">
                            {(auditLog as AuditEntry[]).map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            variant={entry.action === 'DELETE' ? 'destructive' : entry.action === 'INSERT' ? 'default' : 'outline'}
                                            className="text-[10px]"
                                        >
                                            {entry.action}
                                        </Badge>
                                        <span className="text-xs font-mono">{entry.table_name}</span>
                                        <span className="text-xs text-muted-foreground">{entry.org?.name || '—'}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                        {format(new Date(entry.created_at), 'MMM d, h:mm a')}
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
