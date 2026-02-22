import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useChurnRisk, TenantHealth } from '@/hooks/use-vendor-analytics';
import { StatCard, HealthBadge } from './vendor-shared';
import { Activity, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function VendorHealth() {
    const { data: tenants, isLoading } = useChurnRisk();
    const navigate = useNavigate();

    const active = (tenants || []).filter((t: TenantHealth) => t.health === 'active');
    const warning = (tenants || []).filter((t: TenantHealth) => t.health === 'warning');
    const inactive = (tenants || []).filter((t: TenantHealth) => t.health === 'inactive');

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Tenant Health</h1>

            <div className="grid grid-cols-3 gap-4">
                <StatCard label="Active" value={active.length} icon={CheckCircle2} subtitle="Orders in last 7 days" />
                <StatCard label="Low Activity" value={warning.length} icon={AlertTriangle} subtitle="No orders in 7 days" />
                <StatCard label="Inactive" value={inactive.length} icon={XCircle} subtitle="No orders in 30 days" />
            </div>

            {isLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (
                <>
                    {/* Inactive — needs attention */}
                    {inactive.length > 0 && (
                        <Card className="border-red-500/20">
                            <CardHeader>
                                <CardTitle className="text-lg text-red-500">Inactive Tenants</CardTitle>
                                <CardDescription>No orders in the last 30 days — may need outreach</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {inactive.map((t: TenantHealth) => (
                                        <div
                                            key={t.org_id}
                                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                                            onClick={() => navigate(`/vendor/tenant/${t.org_id}`)}
                                        >
                                            <div>
                                                <p className="font-medium text-sm">{t.org_name}</p>
                                                <p className="text-xs text-muted-foreground">{t.active_users} users, {t.plan || 'Free'} plan</p>
                                            </div>
                                            <HealthBadge health={t.health} />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Warning */}
                    {warning.length > 0 && (
                        <Card className="border-yellow-500/20">
                            <CardHeader>
                                <CardTitle className="text-lg text-yellow-500">Low Activity</CardTitle>
                                <CardDescription>No orders in the last 7 days</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {warning.map((t: TenantHealth) => (
                                        <div
                                            key={t.org_id}
                                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                                            onClick={() => navigate(`/vendor/tenant/${t.org_id}`)}
                                        >
                                            <div>
                                                <p className="font-medium text-sm">{t.org_name}</p>
                                                <p className="text-xs text-muted-foreground">{t.active_users} users, {t.orders_30d} orders (30d)</p>
                                            </div>
                                            <HealthBadge health={t.health} />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Active */}
                    {active.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Active Tenants</CardTitle>
                                <CardDescription>Healthy — orders in the last 7 days</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {active.map((t: TenantHealth) => (
                                        <div
                                            key={t.org_id}
                                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                                            onClick={() => navigate(`/vendor/tenant/${t.org_id}`)}
                                        >
                                            <div>
                                                <p className="font-medium text-sm">{t.org_name}</p>
                                                <p className="text-xs text-muted-foreground">{t.active_users} users, {t.orders_7d} orders (7d), {t.orders_30d} orders (30d)</p>
                                            </div>
                                            <HealthBadge health={t.health} />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
