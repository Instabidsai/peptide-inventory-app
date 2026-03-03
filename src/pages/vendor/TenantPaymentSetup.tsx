import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Wallet, Eye, EyeOff, Save, Loader2, Check, AlertCircle, Pencil, X, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import type { TenantDetail } from '@/hooks/use-tenant-detail';

type Config = NonNullable<TenantDetail['config']>;

interface SavedKey {
    service: string;
    api_key_masked: string;
    updated_at: string;
}

const PAYMENT_SERVICES = [
    {
        service: 'psifi_api_key',
        label: 'PsiFi API Key',
        placeholder: 'psifi_...',
        group: 'psifi',
    },
    {
        service: 'psifi_webhook_secret',
        label: 'PsiFi Webhook Secret',
        placeholder: 'whsec_...',
        group: 'psifi',
    },
    {
        service: 'paygate365_wallet_address',
        label: 'PayGate365 Wallet Address',
        placeholder: '0x...',
        group: 'paygate365',
    },
] as const;

export default function TenantPaymentSetup({ orgId, config }: { orgId: string; config: Config | null }) {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [visible, setVisible] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [editingManual, setEditingManual] = useState(false);
    const [savingManual, setSavingManual] = useState(false);
    const [manualForm, setManualForm] = useState({ zelle_email: '', venmo_handle: '', cashapp_handle: '' });
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: savedKeys } = useQuery({
        queryKey: ['tenant-api-keys', orgId, 'payment'],
        queryFn: async () => {
            const services = PAYMENT_SERVICES.map((s) => s.service);
            const { data, error } = await supabase
                .from('tenant_api_keys')
                .select('service, api_key_masked, updated_at')
                .eq('org_id', orgId)
                .in('service', services);
            if (error && error.code !== 'PGRST116') throw error;
            return (data || []) as SavedKey[];
        },
        enabled: !!orgId,
    });

    const savedMap = new Map(savedKeys?.map((k) => [k.service, k]) || []);

    const hasPsiFi = savedMap.has('psifi_api_key');
    const hasPaygate = savedMap.has('paygate365_wallet_address');
    const hasZelle = !!config?.zelle_email;
    const hasVenmo = !!config?.venmo_handle;
    const hasCashApp = !!config?.cashapp_handle;
    const hasManual = hasZelle || hasVenmo || hasCashApp;
    const hasAnyEdits = Object.values(keys).some((v) => v.trim());

    const handleSaveKeys = async () => {
        const entries = Object.entries(keys).filter(([, v]) => v.trim());
        if (entries.length === 0) return;

        setSaving(true);
        try {
            for (const [service, apiKey] of entries) {
                const trimmed = apiKey.trim();
                const masked =
                    trimmed.length > 11
                        ? trimmed.slice(0, 7) + '...' + trimmed.slice(-4)
                        : trimmed.slice(0, 4) + '...';
                const { error } = await supabase
                    .from('tenant_api_keys')
                    .upsert(
                        {
                            org_id: orgId,
                            service,
                            api_key: trimmed,
                            api_key_masked: masked,
                        },
                        { onConflict: 'org_id,service' }
                    );
                if (error) throw error;
            }
            queryClient.invalidateQueries({ queryKey: ['tenant-api-keys'] });
            setKeys({});
            toast({ title: 'Payment configuration saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    const startEditingManual = () => {
        setManualForm({
            zelle_email: config?.zelle_email || '',
            venmo_handle: config?.venmo_handle || '',
            cashapp_handle: config?.cashapp_handle || '',
        });
        setEditingManual(true);
    };

    const handleSaveManual = async () => {
        setSavingManual(true);
        try {
            const { error } = await supabase
                .from('tenant_config')
                .update(manualForm)
                .eq('org_id', orgId);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-detail', orgId] });
            toast({ title: 'Manual payment methods updated' });
            setEditingManual(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err.message });
        } finally {
            setSavingManual(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Payment Setup
                        </CardTitle>
                        <CardDescription>Card processors &amp; manual payment methods</CardDescription>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                        {hasPsiFi && (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">
                                <Check className="h-3 w-3 mr-1" /> PsiFi
                            </Badge>
                        )}
                        {hasPaygate && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px]">
                                <Check className="h-3 w-3 mr-1" /> PayGate
                            </Badge>
                        )}
                        {hasManual && (
                            <Badge variant="outline" className="text-purple-600 border-purple-300 text-[10px]">
                                <Check className="h-3 w-3 mr-1" /> Manual
                            </Badge>
                        )}
                        {!hasPsiFi && !hasPaygate && !hasManual && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                                <AlertCircle className="h-3 w-3 mr-1" /> None configured
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* PsiFi Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        PsiFi (Card Payments)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        Debit/credit card checkout.{' '}
                        <a href="https://dashboard.psifi.app" target="_blank" rel="noopener noreferrer" className="underline">
                            Get API keys
                        </a>
                    </p>
                    {PAYMENT_SERVICES.filter((s) => s.group === 'psifi').map((svc) => {
                        const saved = savedMap.get(svc.service);
                        return (
                            <div key={svc.service} className="space-y-1">
                                <Label className="text-xs">{svc.label}</Label>
                                <div className="relative">
                                    <Input
                                        type={visible[svc.service] ? 'text' : 'password'}
                                        placeholder={saved ? `Current: ${saved.api_key_masked}` : svc.placeholder}
                                        value={keys[svc.service] || ''}
                                        onChange={(e) => setKeys((prev) => ({ ...prev, [svc.service]: e.target.value }))}
                                        className="pr-10 font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full"
                                        onClick={() => setVisible((prev) => ({ ...prev, [svc.service]: !prev[svc.service] }))}
                                    >
                                        {visible[svc.service] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                {saved && (
                                    <p className="text-[10px] text-muted-foreground">
                                        Updated {format(new Date(saved.updated_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="border-t" />

                {/* PayGate365 Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        PayGate365 (Alt Card Processor)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        Card payments settled as USDC. Enter Polygon wallet address.
                    </p>
                    {PAYMENT_SERVICES.filter((s) => s.group === 'paygate365').map((svc) => {
                        const saved = savedMap.get(svc.service);
                        return (
                            <div key={svc.service} className="space-y-1">
                                <Label className="text-xs">{svc.label}</Label>
                                <div className="relative">
                                    <Input
                                        type={visible[svc.service] ? 'text' : 'password'}
                                        placeholder={saved ? `Current: ${saved.api_key_masked}` : svc.placeholder}
                                        value={keys[svc.service] || ''}
                                        onChange={(e) => setKeys((prev) => ({ ...prev, [svc.service]: e.target.value }))}
                                        className="pr-10 font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full"
                                        onClick={() => setVisible((prev) => ({ ...prev, [svc.service]: !prev[svc.service] }))}
                                    >
                                        {visible[svc.service] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                {saved && (
                                    <p className="text-[10px] text-muted-foreground">
                                        Updated {format(new Date(saved.updated_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Save API keys button */}
                {hasAnyEdits && (
                    <div className="flex justify-end">
                        <Button size="sm" onClick={handleSaveKeys} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Keys
                        </Button>
                    </div>
                )}

                <div className="border-t" />

                {/* Manual Payment Methods (Zelle, Venmo, CashApp) */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            Manual Payments
                        </h4>
                        {!editingManual && (
                            <Button variant="ghost" size="sm" onClick={startEditingManual}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Zelle, Venmo, CashApp handles shown to customers on checkout page.
                    </p>

                    {editingManual ? (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Zelle Email / Phone</Label>
                                <Input
                                    value={manualForm.zelle_email}
                                    onChange={(e) => setManualForm((p) => ({ ...p, zelle_email: e.target.value }))}
                                    placeholder="email@example.com or phone"
                                    className="text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Venmo Handle</Label>
                                <Input
                                    value={manualForm.venmo_handle}
                                    onChange={(e) => setManualForm((p) => ({ ...p, venmo_handle: e.target.value }))}
                                    placeholder="@username"
                                    className="text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">CashApp Handle</Label>
                                <Input
                                    value={manualForm.cashapp_handle}
                                    onChange={(e) => setManualForm((p) => ({ ...p, cashapp_handle: e.target.value }))}
                                    placeholder="$cashtag"
                                    className="text-xs"
                                />
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                                <Button variant="ghost" size="sm" onClick={() => setEditingManual(false)} disabled={savingManual}>
                                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                                <Button size="sm" onClick={handleSaveManual} disabled={savingManual}>
                                    {savingManual ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    Save
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Zelle</span>
                                <span className="font-medium">{config?.zelle_email || <span className="text-muted-foreground italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Venmo</span>
                                <span className="font-medium">{config?.venmo_handle || <span className="text-muted-foreground italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">CashApp</span>
                                <span className="font-medium">{config?.cashapp_handle || <span className="text-muted-foreground italic">Not set</span>}</span>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
