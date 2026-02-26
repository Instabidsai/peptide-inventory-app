import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSubscriptionPlans, SubscriptionPlan } from '@/hooks/use-subscription';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/sb_client/client';
import { Zap, Pencil, Save, X, Plus } from 'lucide-react';

type PlanDraft = Partial<SubscriptionPlan> & { features_csv?: string };

function PlanEditor({ plan, onSave, onCancel }: { plan: PlanDraft; onSave: (d: PlanDraft) => void; onCancel: () => void }) {
    const [d, setD] = useState<PlanDraft>({
        ...plan,
        features_csv: (plan.features || []).join(', '),
    });
    const set = (k: string, v: string | number) => setD(prev => ({ ...prev, [k]: v }));

    return (
        <TableRow className="bg-muted/30">
            <TableCell><Input className="h-7 text-xs w-28" value={d.display_name || ''} onChange={e => set('display_name', e.target.value)} placeholder="Plan name" /></TableCell>
            <TableCell className="text-right"><Input className="h-7 text-xs w-20 text-right" type="number" value={d.price_monthly ?? 0} onChange={e => set('price_monthly', +e.target.value)} /></TableCell>
            <TableCell className="text-right"><Input className="h-7 text-xs w-20 text-right" type="number" value={d.price_yearly ?? 0} onChange={e => set('price_yearly', +e.target.value)} /></TableCell>
            <TableCell className="text-right"><Input className="h-7 text-xs w-16 text-right" type="number" value={d.max_users ?? -1} onChange={e => set('max_users', +e.target.value)} /></TableCell>
            <TableCell className="text-right"><Input className="h-7 text-xs w-16 text-right" type="number" value={d.max_peptides ?? -1} onChange={e => set('max_peptides', +e.target.value)} /></TableCell>
            <TableCell className="text-right"><Input className="h-7 text-xs w-16 text-right" type="number" value={d.max_orders_per_month ?? -1} onChange={e => set('max_orders_per_month', +e.target.value)} /></TableCell>
            <TableCell><Input className="h-7 text-xs w-40" value={d.features_csv || ''} onChange={e => set('features_csv', e.target.value)} placeholder="feat1, feat2" /></TableCell>
            <TableCell colSpan={2}>
                <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(d)}><Save className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function VendorSettings() {
    const { data: plans, isLoading } = useSubscriptionPlans();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    const savePlan = async (d: PlanDraft) => {
        const features = (d.features_csv || '').split(',').map(s => s.trim()).filter(Boolean);
        const name = (d.display_name || '').toLowerCase().replace(/\s+/g, '_');
        const row = {
            name,
            display_name: d.display_name || '',
            price_monthly: d.price_monthly ?? 0,
            price_yearly: d.price_yearly ?? 0,
            max_users: d.max_users ?? -1,
            max_peptides: d.max_peptides ?? -1,
            max_orders_per_month: d.max_orders_per_month ?? -1,
            features,
            active: true,
            sort_order: (plans?.length || 0) + 1,
        };

        const { error } = d.id
            ? await supabase.from('subscription_plans').update(row).eq('id', d.id)
            : await supabase.from('subscription_plans').insert(row);

        if (error) {
            toast({ variant: 'destructive', title: 'Save failed', description: error.message });
            return;
        }
        toast({ title: d.id ? 'Plan updated' : 'Plan created' });
        setEditingId(null);
        setAdding(false);
        queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Platform Settings</h1>

            {/* Subscription Plans */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg">Subscription Plans</CardTitle>
                        <CardDescription>Active pricing tiers available to tenants</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setAdding(true); setEditingId(null); }}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Plan
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                    ) : !plans?.length && !adding ? (
                        <p className="text-sm text-muted-foreground py-4">No plans configured</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Plan</TableHead>
                                        <TableHead className="text-right">Monthly (cents)</TableHead>
                                        <TableHead className="text-right">Yearly (cents)</TableHead>
                                        <TableHead className="text-right">Max Users</TableHead>
                                        <TableHead className="text-right">Max Peptides</TableHead>
                                        <TableHead className="text-right">Max Orders/mo</TableHead>
                                        <TableHead>Features</TableHead>
                                        <TableHead colSpan={2}>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(plans || []).map(p =>
                                        editingId === p.id ? (
                                            <PlanEditor key={p.id} plan={p} onSave={savePlan} onCancel={() => setEditingId(null)} />
                                        ) : (
                                            <TableRow key={p.id}>
                                                <TableCell className="font-medium">{p.display_name}</TableCell>
                                                <TableCell className="text-right">${(p.price_monthly / 100).toFixed(0)}/mo</TableCell>
                                                <TableCell className="text-right">${(p.price_yearly / 100).toFixed(0)}/yr</TableCell>
                                                <TableCell className="text-right">{p.max_users === -1 ? 'Unlimited' : p.max_users}</TableCell>
                                                <TableCell className="text-right">{p.max_peptides === -1 ? 'Unlimited' : p.max_peptides}</TableCell>
                                                <TableCell className="text-right">{p.max_orders_per_month === -1 ? 'Unlimited' : p.max_orders_per_month}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(p.features || []).map((f, i) => (
                                                            <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell colSpan={2}>
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(p.id); setAdding(false); }}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    )}
                                    {adding && (
                                        <PlanEditor
                                            plan={{ display_name: '', price_monthly: 0, price_yearly: 0, max_users: -1, max_peptides: -1, max_orders_per_month: -1, features: [] }}
                                            onSave={savePlan}
                                            onCancel={() => setAdding(false)}
                                        />
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Platform Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Platform Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Application</span>
                            <span className="font-medium">ThePeptideAI Platform</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Deployment</span>
                            <span className="font-medium">Vercel</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Database</span>
                            <span className="font-medium">Supabase (PostgreSQL)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Auth</span>
                            <span className="font-medium">Supabase Auth + RLS</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Payments</span>
                            <span className="font-medium">Zelle / Venmo / CashApp</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">AI Provider</span>
                            <span className="font-medium">OpenAI GPT-4o</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Edge Functions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Edge Functions</CardTitle>
                    <CardDescription>Deployed Supabase edge functions</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                            'provision-tenant',
                            'ai-builder',
                            'admin-chat',
                            'partner-chat',
                            'client-chat',
                            'chat-with-ai',
                            'automation-runner',
                            'send-email',
                            'commission-calculator',
                            'protocol-generator',
                            'pdf-generator',
                            'analytics-digest',
                            'notification-dispatcher',
                            'data-export',
                            'composio-connect',
                        ].map(fn => (
                            <div key={fn} className="flex items-center gap-2 p-2 border rounded text-xs">
                                <Zap className="h-3 w-3 text-green-500" />
                                <span className="font-mono">{fn}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
