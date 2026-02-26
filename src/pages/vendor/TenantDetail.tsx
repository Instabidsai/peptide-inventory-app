import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantDetail, useTenantAuditLog } from '@/hooks/use-tenant-detail';
import { StatCard } from './vendor-shared';
import TenantConfigEditor from './TenantConfigEditor';
import TenantFeatureToggles from './TenantFeatureToggles';
import TenantUserList from './TenantUserList';
import TenantSubscriptionActions from './TenantSubscriptionActions';
import TenantNotes from './TenantNotes';
import { useImpersonation } from '@/contexts/ImpersonationContext';
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
    Eye,
    Video,
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
    const { startImpersonation } = useImpersonation();

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
                            <img src={tenant.config.logo_url} alt={tenant.config?.brand_name || tenant.org_name} className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
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
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            const name = encodeURIComponent(tenant.config?.brand_name || tenant.org_name);
                            window.open(`https://zoom.us/schedule?topic=ThePeptideAI+%E2%80%94+${name}+Check-in`, '_blank');
                        }}
                    >
                        <Video className="h-4 w-4 mr-2" />
                        Schedule Meeting
                    </Button>
                    <Button
                        onClick={() => {
                            startImpersonation(orgId!, tenant.config?.brand_name || tenant.org_name);
                            navigate('/');
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    >
                        <Eye className="h-4 w-4 mr-2" />
                        Enter as Admin
                    </Button>
                </div>
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
                {/* Subscription with actions */}
                <TenantSubscriptionActions orgId={orgId!} subscription={tenant.subscription} />

                {/* Editable Configuration */}
                <TenantConfigEditor orgId={orgId!} config={tenant.config} />

                {/* User Management */}
                <TenantUserList orgId={orgId!} />

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

            {/* Internal notes — full width */}
            <TenantNotes orgId={orgId!} />

            {/* Feature Flags — full width below the grid */}
            <TenantFeatureToggles orgId={orgId!} />
        </div>
    );
}
