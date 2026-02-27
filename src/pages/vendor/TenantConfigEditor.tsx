import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Save, X } from 'lucide-react';
import type { TenantDetail } from '@/hooks/use-tenant-detail';

type Config = NonNullable<TenantDetail['config']>;

export default function TenantConfigEditor({ orgId, config }: { orgId: string; config: Config | null }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [form, setForm] = useState<Partial<Config>>({});

    const startEditing = () => {
        setForm({
            brand_name: config?.brand_name || '',
            admin_brand_name: config?.admin_brand_name || '',
            support_email: config?.support_email || '',
            app_url: config?.app_url || '',
            primary_color: config?.primary_color || '#7c3aed',
            secondary_color: config?.secondary_color || '',
            font_family: config?.font_family || '',
            ship_from_name: config?.ship_from_name || '',
            ship_from_city: config?.ship_from_city || '',
            ship_from_state: config?.ship_from_state || '',
            zelle_email: config?.zelle_email || '',
            venmo_handle: config?.venmo_handle || '',
            cashapp_handle: config?.cashapp_handle || '',
            ai_system_prompt_override: config?.ai_system_prompt_override || '',
            session_timeout_minutes: config?.session_timeout_minutes || 60,
        });
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('tenant_config')
                .update(form)
                .eq('org_id', orgId);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: 'Configuration updated' });
            setEditing(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof Config, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));

    if (!editing) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg">Configuration</CardTitle>
                    <Button variant="ghost" size="sm" onClick={startEditing}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                </CardHeader>
                <CardContent>
                    {config ? (
                        <div className="space-y-2 text-sm">
                            <Row label="Brand Name" value={config.brand_name} />
                            <Row label="Admin Brand" value={config.admin_brand_name} />
                            <Row label="Support Email" value={config.support_email} />
                            <Row label="App URL" value={config.app_url} />
                            <Row label="Primary Color">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 rounded border" style={{ backgroundColor: config.primary_color }} />
                                    <span className="font-mono text-xs">{config.primary_color}</span>
                                </div>
                            </Row>
                            {config.secondary_color && (
                                <Row label="Secondary Color">
                                    <div className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded border" style={{ backgroundColor: config.secondary_color }} />
                                        <span className="font-mono text-xs">{config.secondary_color}</span>
                                    </div>
                                </Row>
                            )}
                            {config.font_family && <Row label="Font" value={config.font_family} />}
                            <Row label="Ships From" value={[config.ship_from_city, config.ship_from_state].filter(Boolean).join(', ') || '—'} />
                            <Row label="Zelle" value={config.zelle_email || '—'} />
                            <Row label="Venmo" value={config.venmo_handle || '—'} />
                            <Row label="CashApp" value={config.cashapp_handle || '—'} />
                            <Row label="Session Timeout" value={`${config.session_timeout_minutes} min`} />
                            {config.ai_system_prompt_override && (
                                <div>
                                    <span className="text-muted-foreground">AI Prompt Override:</span>
                                    <p className="text-xs mt-1 bg-muted/50 p-2 rounded">{config.ai_system_prompt_override}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No configuration set</p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">Edit Configuration</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Brand Name" value={form.brand_name as string} onChange={v => set('brand_name', v)} />
                    <Field label="Admin Brand Name" value={form.admin_brand_name as string} onChange={v => set('admin_brand_name', v)} />
                    <Field label="Support Email" value={form.support_email as string} onChange={v => set('support_email', v)} type="email" />
                    <Field label="App URL" value={form.app_url as string} onChange={v => set('app_url', v)} />
                    <div>
                        <Label className="text-xs">Primary Color</Label>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="color"
                                value={form.primary_color as string}
                                onChange={e => set('primary_color', e.target.value)}
                                className="h-8 w-8 rounded cursor-pointer border"
                            />
                            <Input
                                value={form.primary_color as string}
                                onChange={e => set('primary_color', e.target.value)}
                                className="h-8 text-xs font-mono flex-1"
                            />
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs">Secondary Color</Label>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="color"
                                value={(form.secondary_color as string) || '#3b82f6'}
                                onChange={e => set('secondary_color', e.target.value)}
                                className="h-8 w-8 rounded cursor-pointer border"
                            />
                            <Input
                                value={(form.secondary_color as string) || ''}
                                onChange={e => set('secondary_color', e.target.value)}
                                className="h-8 text-xs font-mono flex-1"
                                placeholder="Auto if empty"
                            />
                        </div>
                    </div>
                    <Field label="Font Family" value={(form.font_family as string) || ''} onChange={v => set('font_family', v)} />
                    <Field label="Session Timeout (min)" value={String(form.session_timeout_minutes)} onChange={v => set('session_timeout_minutes', parseInt(v) || 60)} type="number" />
                    <Field label="Ship From City" value={form.ship_from_city as string} onChange={v => set('ship_from_city', v)} />
                    <Field label="Ship From State" value={form.ship_from_state as string} onChange={v => set('ship_from_state', v)} />
                    <Field label="Ship From Name" value={form.ship_from_name as string} onChange={v => set('ship_from_name', v)} />
                    <Field label="Zelle Email" value={form.zelle_email as string} onChange={v => set('zelle_email', v)} />
                    <Field label="Venmo Handle" value={form.venmo_handle as string} onChange={v => set('venmo_handle', v)} />
                    <Field label="CashApp Handle" value={form.cashapp_handle as string} onChange={v => set('cashapp_handle', v)} />
                    <div className="col-span-2">
                        <Label className="text-xs">AI System Prompt Override</Label>
                        <Textarea
                            value={form.ai_system_prompt_override as string}
                            onChange={e => set('ai_system_prompt_override', e.target.value)}
                            className="mt-1 text-xs h-20"
                            placeholder="Leave empty for default AI behavior"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{label}</span>
            {children || <span className="font-medium text-right truncate max-w-[200px]">{value || '—'}</span>}
        </div>
    );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <div>
            <Label className="text-xs">{label}</Label>
            <Input value={value} onChange={e => onChange(e.target.value)} type={type} className="h-8 text-xs mt-1" />
        </div>
    );
}
