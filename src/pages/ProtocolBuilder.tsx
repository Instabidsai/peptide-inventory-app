import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useProtocolBuilder } from '@/hooks/use-protocol-builder';
import { useProtocols } from '@/hooks/use-protocols';
import { supabase } from '@/integrations/sb_client/client';
import { lookupKnowledge, RECOMMENDED_SUPPLIES, RECONSTITUTION_VIDEO_URL, CATEGORY_META } from '@/data/protocol-knowledge';
import { TemplatePicker } from '@/components/protocol-builder/TemplatePicker';
import { ProtocolItemEditor } from '@/components/protocol-builder/ProtocolItemEditor';
import { RichProtocolPreview } from '@/components/protocol-builder/RichProtocolPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
    Search, Plus, X, Copy, Printer, Mail, Wand2, FlaskConical, Trash2, Save, Check,
    ExternalLink, Play, ShoppingCart, Syringe, TestTubes, Package, FolderOpen, Droplets,
    CalendarPlus,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

export default function ProtocolBuilder() {
    const builder = useProtocolBuilder();
    const { createProtocol } = useProtocols(builder.selectedContactId || undefined);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [saved, setSaved] = useState(false);
    const [sentToCalendar, setSentToCalendar] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    const scrollToPreview = () => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleSaveProtocol = async () => {
        if (builder.items.length === 0) return;
        await createProtocol.mutateAsync({
            name: builder.protocolName,
            description: `${builder.items.length} peptide${builder.items.length > 1 ? 's' : ''} — built with Protocol Builder`,
            contact_id: builder.selectedContactId || undefined,
            items: builder.items.map(item => ({
                peptide_id: item.peptideId,
                dosage_amount: item.doseAmount,
                dosage_unit: item.doseUnit,
                frequency: item.frequency,
                timing: item.timing,
                notes: item.notes || undefined,
                duration_days: 56, // 8 weeks default
            })),
        });
        queryClient.invalidateQueries({ queryKey: ['saved-protocols-list'] });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleSendToCalendar = async () => {
        if (builder.items.length === 0) return;
        if (!builder.selectedContactId) {
            toast.error('Select a client first to send to their calendar');
            return;
        }
        const result = await createProtocol.mutateAsync({
            name: builder.protocolName,
            description: `${builder.items.length} peptide${builder.items.length > 1 ? 's' : ''} — built with Protocol Builder`,
            contact_id: builder.selectedContactId,
            items: builder.items.map(item => ({
                peptide_id: item.peptideId,
                dosage_amount: item.doseAmount,
                dosage_unit: item.doseUnit,
                frequency: item.frequency,
                timing: item.timing,
                notes: item.notes || undefined,
                duration_days: 56,
            })),
        });

        // Configure inventory items for Protocol Calendar tracking
        try {
            const createdItems = result?.protocol_items || [];
            if (createdItems.length > 0 && builder.selectedContactId) {
                // Fetch client's active inventory
                const { data: inventory } = await supabase
                    .from('client_inventory')
                    .select('id, peptide_id, concentration_mg_ml')
                    .eq('contact_id', builder.selectedContactId)
                    .eq('status', 'active');

                if (inventory && inventory.length > 0) {
                    // Map protocol frequency to inventory dose_frequency
                    const mapFrequency = (freq: string): { dose_frequency: string; dose_days?: string[]; dose_interval?: number } => {
                        const f = freq.toLowerCase().trim();
                        if (f === 'daily' || f === 'twice daily' || f === '2x daily') return { dose_frequency: 'daily' };
                        if (f === 'every other day') return { dose_frequency: 'every_other_day' };
                        if (f === '3x weekly' || f === 'three times weekly') return { dose_frequency: 'specific_days', dose_days: ['Mon', 'Wed', 'Fri'] };
                        if (f === 'weekly' || f === 'once weekly') return { dose_frequency: 'every_x_days', dose_interval: 7 };
                        if (f === '2x weekly' || f === 'twice weekly') return { dose_frequency: 'specific_days', dose_days: ['Mon', 'Thu'] };
                        if (f === '5x weekly') return { dose_frequency: 'specific_days', dose_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] };
                        return { dose_frequency: 'daily' }; // default
                    };

                    // For each protocol item, find matching inventory and update
                    for (const builderItem of builder.items) {
                        const protocolItem = createdItems.find((pi: { id: string; peptide_id: string }) => pi.peptide_id === builderItem.peptideId);
                        if (!protocolItem) continue;

                        const matchingVials = inventory.filter(v => v.peptide_id === builderItem.peptideId);
                        if (matchingVials.length === 0) continue;

                        const freqConfig = mapFrequency(builderItem.frequency);
                        const doseAmountMg = builderItem.doseUnit === 'mcg'
                            ? builderItem.doseAmount / 1000
                            : builderItem.doseAmount;

                        for (const vial of matchingVials) {
                            await supabase
                                .from('client_inventory')
                                .update({
                                    in_fridge: true,
                                    dose_amount_mg: doseAmountMg,
                                    dose_frequency: freqConfig.dose_frequency,
                                    ...(freqConfig.dose_days ? { dose_days: freqConfig.dose_days } : {}),
                                    ...(freqConfig.dose_interval ? { dose_interval: freqConfig.dose_interval } : {}),
                                    protocol_item_id: protocolItem.id,
                                })
                                .eq('id', vial.id);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to configure inventory for calendar:', e);
            // Non-blocking — protocol was still created successfully
        }

        queryClient.invalidateQueries({ queryKey: ['saved-protocols-list'] });
        queryClient.invalidateQueries({ queryKey: ['protocols'] });
        queryClient.invalidateQueries({ queryKey: ['client-inventory-calendar-view'] });
        setSentToCalendar(true);
        toast.success(`Protocol sent to ${builder.clientName || 'client'}'s calendar!`);
        setTimeout(() => {
            navigate(`/contacts/${builder.selectedContactId}`);
        }, 1500);
    };

    const SUPPLY_ICONS: Record<string, React.ElementType> = {
        droplets: Droplets,
        vial: TestTubes,
        syringe: Syringe,
        swab: Package,
    };

    // Filter available peptides by search
    const filteredPeptides = useMemo(() => {
        if (!search) return builder.availablePeptides;
        return builder.availablePeptides.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [builder.availablePeptides, search]);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Wand2 className="h-7 w-7 text-primary" />
                        Protocol Builder
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Build professional protocols with descriptions, reconstitution, and dosage instructions.
                    </p>
                </div>
                {builder.items.length > 0 && (
                    <Button
                        variant={saved ? 'outline' : 'default'}
                        size="sm"
                        onClick={handleSaveProtocol}
                        disabled={createProtocol.isPending || saved}
                    >
                        {saved ? <Check className="h-4 w-4 mr-1.5 text-green-500" /> : <Save className="h-4 w-4 mr-1.5" />}
                        {saved ? 'Saved!' : 'Save Protocol'}
                    </Button>
                )}
            </div>

            {/* Editable Protocol Name */}
            {builder.items.length > 0 && (
                <Input
                    value={builder.protocolName}
                    onChange={e => builder.setProtocolName(e.target.value)}
                    className="text-lg font-semibold border-dashed max-w-md"
                    aria-label="Protocol name"
                />
            )}

            {/* Client Picker */}
            <Card>
                <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Label className="shrink-0 font-medium">Client:</Label>
                        <Select value={builder.selectedContactId} onValueChange={builder.setSelectedContactId}>
                            <SelectTrigger className="max-w-xs" aria-label="Select client">
                                <SelectValue placeholder="Select a client (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {builder.contacts?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name} {c.email ? `(${c.email})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {builder.selectedContactId && (
                            <Button variant="ghost" size="sm" onClick={() => builder.setSelectedContactId('')}>
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        {builder.clientEmail && (
                            <Badge variant="secondary" className="text-xs">
                                <Mail className="h-3 w-3 mr-1" />
                                {builder.clientEmail}
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Template Picker */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Quick Templates
                    </h3>
                    <div className="flex items-center gap-1">
                        {builder.savedProtocols && builder.savedProtocols.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                                        <FolderOpen className="h-3 w-3 mr-1" /> Load Saved
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72">
                                    <DropdownMenuLabel className="text-xs">Recent Protocols</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {builder.savedProtocols.map(p => (
                                        <DropdownMenuItem
                                            key={p.id}
                                            onClick={() => builder.loadSavedProtocol(p.id)}
                                            className="flex flex-col items-start gap-0.5 cursor-pointer"
                                        >
                                            <span className="text-sm font-medium truncate w-full">{p.name}</span>
                                            <span className="text-[11px] text-muted-foreground">
                                                {p.itemCount} peptide{p.itemCount !== 1 ? 's' : ''}
                                                {' \u00B7 '}
                                                {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {builder.items.length > 0 && (
                            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={builder.clearAll}>
                                <Trash2 className="h-3 w-3 mr-1" /> Clear All
                            </Button>
                        )}
                    </div>
                </div>
                <TemplatePicker
                    onSelect={builder.loadTemplate}
                    activeItemCount={builder.items.length}
                />
            </div>

            {/* Supplies Needed Card */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Supplies Needed
                        <span className="text-xs text-muted-foreground font-normal ml-auto">These or something similar</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {RECOMMENDED_SUPPLIES.map((supply) => {
                            const Icon = SUPPLY_ICONS[supply.icon] || Package;
                            return (
                                <a
                                    key={supply.name}
                                    href={supply.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/30 hover:border-primary/30 transition-all group"
                                >
                                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium leading-tight">{supply.name}</p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{supply.description}</p>
                                    </div>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary flex-shrink-0 mt-0.5" />
                                </a>
                            );
                        })}
                    </div>
                    <a
                        href={RECONSTITUTION_VIDEO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 transition-all"
                    >
                        <Play className="h-5 w-5 text-red-500 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium">How to Reconstitute Peptides</p>
                            <p className="text-[11px] text-muted-foreground">Step-by-step video guide for mixing and preparing your peptides</p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-red-500/50 flex-shrink-0 ml-auto" />
                    </a>
                    <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                            id="include-supplies"
                            checked={builder.includeSupplies}
                            onCheckedChange={(checked) => builder.setIncludeSupplies(!!checked)}
                        />
                        <Label htmlFor="include-supplies" className="text-xs text-muted-foreground cursor-pointer">
                            Include supplies & video link in printed/emailed protocol
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-5">
                {/* LEFT: Peptide Picker + Items */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Peptide Search */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <FlaskConical className="h-4 w-4" />
                                Add Peptides
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* Category Legend */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                                    <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                                        {meta.label}
                                    </span>
                                ))}
                            </div>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search peptides..."
                                    className="pl-9"
                                    aria-label="Search peptides"
                                />
                            </div>
                            <ScrollArea className="max-h-[200px]">
                                <div className="space-y-1">
                                    {filteredPeptides.map(p => {
                                        const knowledge = lookupKnowledge(p.name);
                                        const catDot = knowledge?.category ? CATEGORY_META[knowledge.category]?.dot : '';
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => builder.addPeptide(p)}
                                                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/30 transition-colors text-left text-sm group"
                                            >
                                                <div className="min-w-0 flex items-center gap-2">
                                                    {catDot && <span className={`h-2 w-2 rounded-full flex-shrink-0 ${catDot}`} />}
                                                    <span className="font-medium">{p.name}</span>
                                                    {knowledge && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {knowledge.vialSizeMg}mg {'\u00B7'} {knowledge.reconstitutionMl}mL water {'\u00B7'} {knowledge.defaultDoseAmount}{knowledge.defaultDoseUnit}
                                                        </span>
                                                    )}
                                                    {!knowledge && p.default_dose_amount ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {p.default_dose_amount}{p.default_dose_unit} {p.default_frequency}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                            </button>
                                        );
                                    })}
                                    {filteredPeptides.length === 0 && (
                                        <div className="text-center py-4 text-sm text-muted-foreground">
                                            {search ? 'No matching peptides' : 'All peptides added'}
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Sticky Summary Bar */}
                    {builder.items.length >= 2 && (() => {
                        const injectable = builder.items.filter(i => i.administrationRoute !== 'oral' && i.administrationRoute !== 'topical');
                        const oral = builder.items.filter(i => i.administrationRoute === 'oral');
                        return (
                            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-lg p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                    <Badge variant="secondary">{builder.items.length} peptides</Badge>
                                    {injectable.length > 0 && (
                                        <Badge variant="outline" className="text-[11px]">
                                            <Syringe className="h-3 w-3 mr-1" />
                                            {injectable.length} injectable
                                        </Badge>
                                    )}
                                    {oral.length > 0 && (
                                        <Badge variant="outline" className="text-[11px]">
                                            {oral.length} oral
                                        </Badge>
                                    )}
                                </div>
                                <Button variant="ghost" size="sm" className="text-xs lg:hidden" onClick={scrollToPreview}>
                                    View Preview
                                </Button>
                            </div>
                        );
                    })()}

                    {/* Protocol Items */}
                    {builder.items.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Protocol Items ({builder.items.length})
                            </h3>
                            {builder.items.map((item, idx) => (
                                <ProtocolItemEditor
                                    key={item.instanceId}
                                    item={item}
                                    index={idx}
                                    onUpdate={builder.updateItem}
                                    onRemove={builder.removeItem}
                                    onSelectTier={builder.selectTier}
                                    onToggleSection={builder.toggleSection}
                                    onMoveUp={idx > 0 ? () => builder.moveItem(idx, idx - 1) : undefined}
                                    onMoveDown={idx < builder.items.length - 1 ? () => builder.moveItem(idx, idx + 1) : undefined}
                                    defaultExpanded={builder.items.length === 1 && idx === 0}
                                />
                            ))}
                        </div>
                    )}

                    {builder.items.length === 0 && (
                        <div className="text-center py-16 border-2 border-dashed rounded-lg space-y-4">
                            <Wand2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                            <div>
                                <p className="font-medium text-muted-foreground">Start Building a Protocol</p>
                                <p className="text-sm text-muted-foreground/70 mt-1">
                                    Choose a template above, or pick one below to get started.
                                </p>
                            </div>
                            <div className="flex justify-center gap-3 flex-wrap">
                                <Button variant="outline" size="sm" onClick={() => builder.loadTemplate('Healing Stack')}>
                                    Healing Stack
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => builder.loadTemplate('GH Stack (Evening)')}>
                                    GH Stack
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => builder.loadTemplate('Weight Loss')}>
                                    Weight Loss
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: Rich Preview */}
                <div className="lg:col-span-2" ref={previewRef}>
                    <RichProtocolPreview
                        html={builder.html}
                        itemCount={builder.items.length}
                    />
                </div>
            </div>

            {/* Bottom Action Bar */}
            {builder.items.length > 0 && (
                <Card className="sticky bottom-4 z-20 shadow-lg border-primary/20">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    onClick={handleSendToCalendar}
                                    disabled={createProtocol.isPending || sentToCalendar || !builder.selectedContactId}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    {sentToCalendar
                                        ? <><Check className="h-4 w-4 mr-1.5" /> Sent!</>
                                        : <><CalendarPlus className="h-4 w-4 mr-1.5" /> Send to {builder.clientName ? `${builder.clientName}'s` : "Client's"} Calendar</>
                                    }
                                </Button>
                                <Button
                                    variant={saved ? 'outline' : 'default'}
                                    onClick={handleSaveProtocol}
                                    disabled={createProtocol.isPending || saved}
                                >
                                    {saved ? <Check className="h-4 w-4 mr-1.5 text-green-500" /> : <Save className="h-4 w-4 mr-1.5" />}
                                    {saved ? 'Saved!' : 'Save Protocol'}
                                </Button>
                            </div>
                            <Separator orientation="vertical" className="h-8 hidden sm:block" />
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button variant="outline" onClick={builder.copyHtml}>
                                    <Copy className="h-4 w-4 mr-1.5" /> Copy
                                </Button>
                                <Button variant="outline" onClick={builder.printProtocol}>
                                    <Printer className="h-4 w-4 mr-1.5" /> Print
                                </Button>
                                <Button variant="outline" onClick={builder.openMailto} disabled={!builder.clientEmail}>
                                    <Mail className="h-4 w-4 mr-1.5" /> Email {builder.clientName || 'Client'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
