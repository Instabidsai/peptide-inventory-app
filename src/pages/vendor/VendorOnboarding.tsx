import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnboardingPipeline, OnboardingStatus } from '@/hooks/use-onboarding-pipeline';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Rocket, AlertTriangle } from 'lucide-react';

const stages = [
    { key: 'signed_up', label: 'Signed Up', color: 'bg-gray-500' },
    { key: 'configured', label: 'Configured', color: 'bg-blue-500' },
    { key: 'catalog_ready', label: 'Catalog Ready', color: 'bg-purple-500' },
    { key: 'customers_added', label: 'Customers Added', color: 'bg-orange-500' },
    { key: 'active', label: 'Active', color: 'bg-green-500' },
] as const;

const milestoneLabels: Record<string, string> = {
    signed_up: 'Account Created',
    configured_branding: 'Branding Configured',
    added_peptide: 'First Peptide Added',
    added_contact: 'First Contact Added',
    first_order: 'First Order Placed',
    payment_connected: 'Payment Connected',
    automation_enabled: 'Automation Enabled',
};

function TenantOnboardingCard({ tenant }: { tenant: OnboardingStatus }) {
    const navigate = useNavigate();
    const isStuck = tenant.daysSinceSignup > 7 && tenant.stage !== 'active';

    return (
        <div
            className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => navigate(`/vendor/tenant/${tenant.org_id}`)}
        >
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="font-medium">{tenant.brand_name}</p>
                        {isStuck && (
                            <Badge variant="destructive" className="text-[10px]">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Stuck {tenant.daysSinceSignup}d
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">{tenant.org_name} — {tenant.daysSinceSignup} days since signup</p>
                </div>
                <Badge variant="outline" className="text-xs">
                    {tenant.completedCount}/7 milestones
                </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
                {Object.entries(tenant.milestones).map(([key, done]) => (
                    <div key={key} className="flex items-center gap-1 text-xs">
                        {done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
                            {milestoneLabels[key] || key}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function VendorOnboarding() {
    const { data: pipeline, isLoading } = useOnboardingPipeline();

    const grouped = stages.reduce<Record<string, OnboardingStatus[]>>((acc, s) => {
        acc[s.key] = (pipeline || []).filter(t => t.stage === s.key);
        return acc;
    }, {});

    const stuckCount = (pipeline || []).filter(t => t.daysSinceSignup > 7 && t.stage !== 'active').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Onboarding Pipeline</h1>
                    <p className="text-sm text-muted-foreground mt-1">Track tenant setup progress through key milestones</p>
                </div>
                {stuckCount > 0 && (
                    <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {stuckCount} stuck
                    </Badge>
                )}
            </div>

            {/* Pipeline summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {stages.map(s => (
                    <Card key={s.key}>
                        <CardContent className="p-3 text-center">
                            <div className={`h-2 w-full rounded-full ${s.color} mb-2 opacity-70`} />
                            <p className="text-lg font-bold">{grouped[s.key]?.length || 0}</p>
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {isLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : !pipeline?.length ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Rocket className="h-10 w-10 mb-3 opacity-40" />
                        <p className="font-medium">No tenants in the pipeline</p>
                        <p className="text-sm">Provision a tenant to start tracking their onboarding</p>
                    </CardContent>
                </Card>
            ) : (
                stages.map(s => {
                    const tenants = grouped[s.key];
                    if (!tenants?.length) return null;
                    return (
                        <Card key={s.key}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <div className={`h-3 w-3 rounded-full ${s.color}`} />
                                    <CardTitle className="text-lg">{s.label}</CardTitle>
                                    <Badge variant="outline" className="text-xs ml-auto">{tenants.length}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {tenants.map(t => (
                                        <TenantOnboardingCard key={t.org_id} tenant={t} />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
