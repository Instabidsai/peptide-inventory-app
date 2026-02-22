import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Clock, Activity } from 'lucide-react';

export function StatCard({ label, value, icon: Icon, subtitle }: { label: string; value: number | string; icon: React.ElementType; subtitle?: string }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg bg-primary/10 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

export function BillingStatusBadge({ status }: { status: string }) {
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

export function HealthBadge({ health }: { health: string }) {
    switch (health) {
        case 'active':
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><Activity className="h-3 w-3 mr-1" />Active</Badge>;
        case 'warning':
            return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Low Activity</Badge>;
        default:
            return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Inactive</Badge>;
    }
}
