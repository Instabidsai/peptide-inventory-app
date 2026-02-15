import { useState, useMemo } from 'react';
import { usePeptides, Peptide } from '@/hooks/use-peptides';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
    Search, Plus, X, Copy, Mail, Wand2, FlaskConical, Calculator, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────
interface ProtocolItem {
    peptideId: string;
    peptideName: string;
    doseAmount: number;
    doseUnit: string;
    frequency: string;
    timing: string;
    concentrationMgMl: number;
    notes: string;
}

// ── Helpers ────────────────────────────────────────────
function calcMl(item: ProtocolItem): number | null {
    if (!item.concentrationMgMl || item.concentrationMgMl <= 0) return null;
    const doseMg = item.doseUnit === 'mcg' ? item.doseAmount / 1000 : item.doseAmount;
    return doseMg / item.concentrationMgMl;
}

function calcUnits(ml: number | null): number | null {
    if (ml === null) return null;
    return Math.round(ml * 100);
}

function formatMl(ml: number | null): string {
    if (ml === null) return '—';
    return ml < 0.01 ? ml.toFixed(3) : ml.toFixed(2);
}

function formatFrequency(freq: string): string {
    const map: Record<string, string> = {
        'daily': 'Daily',
        'daily_am_pm': 'Daily (AM & PM)',
        'twice daily': 'Twice Daily',
        'every 3 days': 'Every 3 Days',
        'every 5 days': 'Every 5 Days',
        'weekly': 'Weekly',
        'twice weekly': 'Twice Weekly',
        'biweekly': '2x / Week',
        'monthly': 'Monthly',
        'as needed': 'As Needed',
    };
    return map[freq] || freq;
}

const FREQUENCIES = [
    'daily', 'daily_am_pm', 'twice daily', 'every 3 days', 'every 5 days',
    'weekly', 'twice weekly', 'monthly', 'as needed',
];

const TIMINGS = ['AM', 'PM', 'Before bed', 'With meals', ''];

// ── Format protocol for email ──────────────────────────
function generateEmailText(items: ProtocolItem[], clientName: string): string {
    const lines: string[] = [];
    lines.push(`Hi ${clientName || 'there'},`);
    lines.push('');
    lines.push("Here's your peptide protocol:");
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const item of items) {
        lines.push('');
        lines.push(item.peptideName);
        const ml = calcMl(item);
        const units = calcUnits(ml);
        let doseLine = `  Dose: ${item.doseAmount} ${item.doseUnit}`;
        if (ml !== null && units !== null) {
            doseLine += ` (${formatMl(ml)} mL / ${units} units)`;
        }
        lines.push(doseLine);

        let freqLine = `  Frequency: ${formatFrequency(item.frequency)}`;
        if (item.timing) freqLine += ` — ${item.timing}`;
        lines.push(freqLine);

        if (item.notes) {
            lines.push(`  Notes: ${item.notes}`);
        }
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('Storage: Refrigerate all reconstituted peptides.');
    lines.push('Syringes: 1 mL insulin syringes (100 unit markings).');
    lines.push('');
    lines.push('Questions? Reply to this email anytime.');
    lines.push('');
    lines.push('- NextGen Research Labs');

    return lines.join('\n');
}

// ── Component ──────────────────────────────────────────
export default function ProtocolBuilder() {
    const { data: peptides } = usePeptides();
    const { profile } = useAuth();
    const { toast } = useToast();

    // Client picker
    const { data: contacts } = useQuery({
        queryKey: ['contacts-list', profile?.org_id],
        queryFn: async () => {
            const { data } = await supabase
                .from('contacts')
                .select('id, name, email')
                .eq('org_id', profile!.org_id!)
                .eq('type', 'customer')
                .order('name');
            return data || [];
        },
        enabled: !!profile?.org_id,
    });

    const [selectedContactId, setSelectedContactId] = useState('');
    const [items, setItems] = useState<ProtocolItem[]>([]);
    const [search, setSearch] = useState('');
    const [showPreview, setShowPreview] = useState(false);

    const selectedContact = contacts?.find(c => c.id === selectedContactId);
    const clientName = selectedContact?.name?.split(' ')[0] || '';
    const clientEmail = selectedContact?.email || '';

    // Filter peptides not already added
    const availablePeptides = useMemo(() => {
        const addedIds = new Set(items.map(i => i.peptideId));
        return (peptides || [])
            .filter(p => p.active && !addedIds.has(p.id))
            .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
    }, [peptides, items, search]);

    // Add peptide with defaults
    const addPeptide = (p: Peptide) => {
        setItems(prev => [...prev, {
            peptideId: p.id,
            peptideName: p.name,
            doseAmount: p.default_dose_amount || 0,
            doseUnit: p.default_dose_unit || 'mcg',
            frequency: p.default_frequency || 'daily',
            timing: p.default_timing || '',
            concentrationMgMl: p.default_concentration_mg_ml || 0,
            notes: '',
        }]);
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const updateItem = (idx: number, field: keyof ProtocolItem, value: any) => {
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    };

    // Generate email text
    const emailText = useMemo(() => generateEmailText(items, clientName), [items, clientName]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(emailText);
        toast({ title: 'Copied to clipboard!' });
    };

    const handleEmail = () => {
        const subject = encodeURIComponent('Your Peptide Protocol');
        const body = encodeURIComponent(emailText);
        window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Wand2 className="h-7 w-7 text-primary" />
                        Protocol Builder
                    </h1>
                    <p className="text-muted-foreground">Build a protocol and email it to your client.</p>
                </div>
                {items.length > 0 && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                            <Copy className="h-4 w-4 mr-1.5" /> Copy
                        </Button>
                        <Button size="sm" onClick={handleEmail} disabled={!clientEmail}>
                            <Mail className="h-4 w-4 mr-1.5" /> Email {clientName || 'Client'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Client Picker */}
            <Card>
                <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-4">
                        <Label className="shrink-0 font-medium">Client:</Label>
                        <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                            <SelectTrigger className="max-w-xs">
                                <SelectValue placeholder="Select a client (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {contacts?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name} {c.email ? `(${c.email})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedContactId && (
                            <Button variant="ghost" size="sm" onClick={() => setSelectedContactId('')}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-5">
                {/* LEFT: Peptide Picker + Selected Items */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Peptide Picker */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <FlaskConical className="h-4 w-4" />
                                Add Peptides
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search peptides..."
                                    className="pl-9"
                                />
                            </div>
                            <ScrollArea className="max-h-[200px]">
                                <div className="space-y-1">
                                    {availablePeptides.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => addPeptide(p)}
                                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors text-left text-sm group"
                                        >
                                            <div>
                                                <span className="font-medium">{p.name}</span>
                                                {p.default_dose_amount ? (
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {p.default_dose_amount}{p.default_dose_unit} {p.default_frequency}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                    {availablePeptides.length === 0 && (
                                        <div className="text-center py-4 text-sm text-muted-foreground">
                                            {search ? 'No matching peptides' : 'All peptides added'}
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Selected Items Editor */}
                    {items.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Protocol Items ({items.length})
                            </h3>
                            {items.map((item, idx) => {
                                const ml = calcMl(item);
                                const units = calcUnits(ml);
                                return (
                                    <Card key={item.peptideId} className="relative">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 h-7 w-7"
                                            onClick={() => removeItem(idx)}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                        <CardContent className="pt-4 pb-3">
                                            <div className="font-semibold text-sm mb-3">{item.peptideName}</div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {/* Dose */}
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Dose</Label>
                                                    <div className="flex gap-1">
                                                        <Input
                                                            type="number"
                                                            value={item.doseAmount || ''}
                                                            onChange={e => updateItem(idx, 'doseAmount', parseFloat(e.target.value) || 0)}
                                                            className="h-8 text-sm"
                                                        />
                                                        <Select value={item.doseUnit} onValueChange={v => updateItem(idx, 'doseUnit', v)}>
                                                            <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="mcg">mcg</SelectItem>
                                                                <SelectItem value="mg">mg</SelectItem>
                                                                <SelectItem value="iu">IU</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* Frequency */}
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Frequency</Label>
                                                    <Select value={item.frequency} onValueChange={v => updateItem(idx, 'frequency', v)}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {FREQUENCIES.map(f => (
                                                                <SelectItem key={f} value={f}>{formatFrequency(f)}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* Timing */}
                                                <div className="space-y-1">
                                                    <Label className="text-xs">Timing</Label>
                                                    <Select value={item.timing} onValueChange={v => updateItem(idx, 'timing', v)}>
                                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                                                        <SelectContent>
                                                            {TIMINGS.map(t => (
                                                                <SelectItem key={t || 'none'} value={t || 'none'}>
                                                                    {t || 'No preference'}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* Concentration + mL calc */}
                                                <div className="space-y-1">
                                                    <Label className="text-xs flex items-center gap-1">
                                                        <Calculator className="h-3 w-3" /> mg/mL
                                                    </Label>
                                                    <Input
                                                        type="number"
                                                        value={item.concentrationMgMl || ''}
                                                        onChange={e => updateItem(idx, 'concentrationMgMl', parseFloat(e.target.value) || 0)}
                                                        className="h-8 text-sm"
                                                        placeholder="e.g. 5"
                                                    />
                                                </div>
                                            </div>

                                            {/* mL/Units display + notes */}
                                            <div className="flex items-center justify-between mt-2">
                                                {ml !== null && units !== null ? (
                                                    <Badge variant="secondary" className="text-xs font-mono">
                                                        <ChevronRight className="h-3 w-3 mr-1" />
                                                        {formatMl(ml)} mL / {units} units
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Set concentration for mL calc</span>
                                                )}
                                                <Input
                                                    value={item.notes}
                                                    onChange={e => updateItem(idx, 'notes', e.target.value)}
                                                    placeholder="Notes (optional)"
                                                    className="h-7 text-xs max-w-[200px]"
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {items.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            Click peptides above to start building a protocol.
                        </div>
                    )}
                </div>

                {/* RIGHT: Preview */}
                <div className="lg:col-span-2">
                    <Card className="sticky top-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center justify-between">
                                Email Preview
                                {items.length > 0 && (
                                    <Badge variant="outline" className="text-xs">{items.length} items</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {items.length > 0 ? (
                                <>
                                    <Textarea
                                        value={emailText}
                                        readOnly
                                        className="min-h-[400px] font-mono text-xs leading-relaxed resize-none bg-muted/30"
                                    />
                                    <Separator className="my-3" />
                                    <div className="flex gap-2">
                                        <Button className="flex-1" variant="outline" onClick={handleCopy}>
                                            <Copy className="h-4 w-4 mr-1.5" /> Copy
                                        </Button>
                                        <Button className="flex-1" onClick={handleEmail} disabled={!clientEmail}>
                                            <Mail className="h-4 w-4 mr-1.5" /> Email
                                        </Button>
                                    </div>
                                    {!clientEmail && selectedContactId && (
                                        <p className="text-xs text-amber-500 mt-2">No email on file for this client.</p>
                                    )}
                                    {!selectedContactId && (
                                        <p className="text-xs text-muted-foreground mt-2">Select a client to enable email.</p>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-12 text-sm text-muted-foreground">
                                    Add peptides to see the protocol preview.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
