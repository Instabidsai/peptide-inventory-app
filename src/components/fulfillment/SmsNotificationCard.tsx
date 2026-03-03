import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateTenantConfigCache } from '@/hooks/use-tenant-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Phone, Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface SmsPhoneEntry {
    phone: string;
    label: string;
    enabled: boolean;
}

export default function SmsNotificationCard({ orgId }: { orgId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [smsEnabled, setSmsEnabled] = useState(false);
    const [phones, setPhones] = useState<SmsPhoneEntry[]>([]);
    const [newPhone, setNewPhone] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [expanded, setExpanded] = useState(false);

    const { data: config, isLoading } = useQuery({
        queryKey: ['tenant-config-notifications', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tenant_config')
                .select('order_sms_enabled, order_sms_phones')
                .eq('org_id', orgId)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!orgId,
    });

    useEffect(() => {
        if (config) {
            setSmsEnabled(config.order_sms_enabled ?? false);
            setPhones(config.order_sms_phones ?? []);
        }
    }, [config]);

    const handleAddPhone = () => {
        const cleaned = newPhone.replace(/[^\d+]/g, '');
        if (!cleaned || cleaned.length < 10) {
            toast({ title: 'Invalid phone number', description: 'Enter a valid phone number with area code', variant: 'destructive' });
            return;
        }
        if (phones.some(p => p.phone === cleaned)) {
            toast({ title: 'Duplicate', description: 'This number is already in the list', variant: 'destructive' });
            return;
        }
        setPhones(prev => [...prev, { phone: cleaned, label: newLabel || 'Unlabeled', enabled: true }]);
        setNewPhone('');
        setNewLabel('');
    };

    const handleRemovePhone = (index: number) => {
        setPhones(prev => prev.filter((_, i) => i !== index));
    };

    const handleTogglePhone = (index: number) => {
        setPhones(prev => prev.map((p, i) => i === index ? { ...p, enabled: !p.enabled } : p));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('tenant_config')
                .update({ order_sms_enabled: smsEnabled, order_sms_phones: phones })
                .eq('org_id', orgId);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['tenant-config-notifications'] });
            invalidateTenantConfigCache();
            toast({ title: 'Notification settings saved' });
        } catch (err) {
            toast({ title: 'Failed to save', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const enabledCount = phones.filter(p => p.enabled).length;
    const hasUnsaved = JSON.stringify({ smsEnabled, phones }) !== JSON.stringify({
        smsEnabled: config?.order_sms_enabled ?? false,
        phones: config?.order_sms_phones ?? [],
    });

    if (isLoading) return <Skeleton className="h-16 w-full" />;

    return (
        <Card className={smsEnabled ? 'border-green-500/30 bg-green-500/5' : 'border-muted'}>
            <CardHeader className="pb-2 pt-4 px-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Order SMS Alerts
                        {smsEnabled ? (
                            <span className="text-xs font-normal text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                                ON — {enabledCount} number{enabledCount !== 1 ? 's' : ''}
                            </span>
                        ) : (
                            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">OFF</span>
                        )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={smsEnabled}
                            onCheckedChange={(checked) => {
                                setSmsEnabled(checked);
                                if (!expanded && checked) setExpanded(true);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="pt-2 px-4 pb-4 space-y-4">
                    {/* Phone list */}
                    {phones.length > 0 && (
                        <div className="space-y-2">
                            {phones.map((entry, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5 bg-secondary/30">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{entry.label}</p>
                                        <p className="text-xs text-muted-foreground">{entry.phone}</p>
                                    </div>
                                    <Switch
                                        checked={entry.enabled}
                                        onCheckedChange={() => handleTogglePhone(i)}
                                        aria-label={`Toggle ${entry.label}`}
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => handleRemovePhone(i)} className="shrink-0 h-8 w-8 text-destructive hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new phone */}
                    <div className="flex gap-2">
                        <Input
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            placeholder="Label (e.g. Justin)"
                            className="flex-1 h-9 text-sm"
                        />
                        <Input
                            value={newPhone}
                            onChange={e => setNewPhone(e.target.value)}
                            placeholder="+1 (555) 123-4567"
                            className="flex-1 h-9 text-sm"
                            onKeyDown={e => e.key === 'Enter' && handleAddPhone()}
                        />
                        <Button variant="outline" size="sm" onClick={handleAddPhone} disabled={!newPhone.trim()}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add
                        </Button>
                    </div>

                    {hasUnsaved && (
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                            Save
                        </Button>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
