import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantDetail, useTenantAuditLog } from '@/hooks/use-tenant-detail';
import { StatCard, BillingStatusBadge } from './vendor-shared';
import {
    ArrowLeft,
    Users,
    Package,
    ShoppingCart,
    FlaskConical,
    UserCheck,
    DollarSign,
    Bot,
    MessageCircle,
    Zap,
    Mail,
    Palette,
    Globe,
    MapPin,
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditEntry {
    id: string; action: string; table_name: string; created_at: string;
}

export default function TenantDetail() {
    const { orgId } = useParams<{ orgId: string }>();
    const navigate = useNavigate();
    const { data: tenant, isLoading } = useTenantDetail(orgId);
    const { data: auditLog } = useTenantAuditLog(orgId);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <div className="grid grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="text-center py-12">
                <p className="text-lg font-medium">Tenant not found</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/vendor/tenants')}>
                    Back to Tenants
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" aria-label="Back to tenants" onClick={() => navigate('/vendor/tenants')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        {tenant.config?.logo_url ? (
                            <img src={tenant.config.logo_url} alt={tenant.config?.brand_name || tenant.org_name} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                            <div className="h-12 w-12 rounded-lg flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: tenant.config?.primary_color || '#7c3aed' }}>
                                {tenant.org_name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl font-bold">{tenant.config?.brand_name || tenant.org_name}</h1>
                            <p className="text-sm text-muted-foreground">
                                {tenant.org_name} — Created {format(new Date(tenant.created_at), 'MMM d, yyyy')}
                            </p>
                        </div>
                    </div>
                </div>
                {tenant.subscription && (
                    <BillingStatusBadge status={tenant.subscription.status} />
                )}
            </div>

            {/* Usage Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard label="Users" value={tenant.counts.users} icon={Users} />
                <StatCard label="Peptides" value={tenant.counts.peptides} icon={FlaskConical} />
                <StatCard label="Bottles" value={tenant.counts.bottles} icon={Package} />
                <StatCard label="Contacts" value={tenant.counts.contacts} icon={UserCheck} />
                <StatCard label="Orders" value={tenant.counts.orders} icon={ShoppingCart} />
                <StatCard label="Commissions" value={tenant.counts.commissions} icon={DollarSign} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscription */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Subscription</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {tenant.subscription ? (
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Plan</span>
                                    <span className="font-medium">{tenant.subscription.plan_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Billing Period</span>
                                    <span className="capitalize">{tenant.subscription.billing_period}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Status</span>
                                    <BillingStatusBadge status={tenant.subscription.status} />
                                </div>
                                {tenant.subscription.current_period_end && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Renews</span>
                                        <span className="text-sm">{format(new Date(tenant.subscription.current_period_end), 'MMM d, yyyy')}</span>
                                    </div>
                                )}
                                {tenant.subscription.stripe_customer_id && (
                                    <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Stripe ID</span>
                                        <span className="font-mono text-xs">{tenant.subscription.stripe_customer_id}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No subscription — Free tier</p>
                        )}
                    </CardContent>
                </Card>

                {/* Config */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {tenant.config ? (
                            <div className="space-y-2.5 text-sm">
                                {tenant.config.support_email && (
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-muted-foreground">Support:</span>
                                        <span>{tenant.config.support_email}</span>
                                    </div>
                                )}
                                {tenant.config.app_url && (
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-muted-foreground">URL:</span>
                                        <span className="truncate">{tenant.config.app_url}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-muted-foreground">Color:</span>
                                    <div className="h-4 w-4 rounded" style={{ backgroundColor: tenant.config.primary_color }} />
                                    <span className="font-mono text-xs">{tenant.config.primary_color}</span>
                                </div>
                                {(tenant.config.ship_from_city || tenant.config.ship_from_state) && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-muted-foreground">Ships from:</span>
                                        <span>{[tenant.config.ship_from_city, tenant.config.ship_from_state].filter(Boolean).join(', ')}</span>
                                    </div>
                                )}
                                {(tenant.config.zelle_email || tenant.config.venmo_handle || tenant.config.cashapp_handle) && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-muted-foreground">Payments:</span>
                                        {tenant.config.zelle_email && <Badge variant="outline" className="text-xs">Zelle</Badge>}
                                        {tenant.config.venmo_handle && <Badge variant="outline" className="text-xs">Venmo</Badge>}
                                        {tenant.config.cashapp_handle && <Badge variant="outline" className="text-xs">CashApp</Badge>}
                                    </div>
                                )}
                                {tenant.config.ai_system_prompt_override && (
                                    <div className="flex items-start gap-2">
                                        <Bot className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                                        <span className="text-muted-foreground">AI Override:</span>
                                        <span className="text-xs truncate max-w-[200px]">{tenant.config.ai_system_prompt_override}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No configuration set</p>
                        )}
                    </CardContent>
                </Card>

                {/* AI & Automation Usage */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">AI & Automations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Admin AI Chats</span>
                                </div>
                                <Badge variant="outline">{tenant.ai_message_counts.admin_chats}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm">Partner AI Chats</span>
                                </div>
                                <Badge variant="outline">{tenant.ai_message_counts.partner_chats}</Badge>
                            </div>
                            {tenant.automations.length > 0 ? (
                                tenant.automations.map((a) => (
                                    <div key={a.module_type} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm capitalize">{a.module_type.replace(/_/g, ' ')}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={a.enabled ? 'default' : 'secondary'} className="text-xs">
                                                {a.enabled ? 'On' : 'Off'}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">{a.run_count} runs</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No automations configured</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Audit Log */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                        <CardDescription>Last 30 audit log entries</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!auditLog?.length ? (
                            <p className="text-sm text-muted-foreground">No audit log entries</p>
                        ) : (
                            <div className="max-h-[300px] overflow-y-auto space-y-2">
                                {(auditLog as AuditEntry[]).map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] capitalize">{entry.action}</Badge>
                                            <span className="text-xs text-muted-foreground">{entry.table_name}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
