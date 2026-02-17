import { useState, useMemo } from 'react';
import { useProtocolBuilder } from '@/hooks/use-protocol-builder';
import { lookupKnowledge } from '@/data/protocol-knowledge';
import { TemplatePicker } from '@/components/protocol-builder/TemplatePicker';
import { ProtocolItemEditor } from '@/components/protocol-builder/ProtocolItemEditor';
import { RichProtocolPreview } from '@/components/protocol-builder/RichProtocolPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Search, Plus, X, Copy, Printer, Mail, Wand2, FlaskConical, Trash2,
} from 'lucide-react';

export default function ProtocolBuilder() {
    const builder = useProtocolBuilder();
    const [search, setSearch] = useState('');

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
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={builder.copyHtml}>
                            <Copy className="h-4 w-4 mr-1.5" /> Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={builder.printProtocol}>
                            <Printer className="h-4 w-4 mr-1.5" /> Print
                        </Button>
                        <Button size="sm" onClick={builder.openMailto} disabled={!builder.clientEmail}>
                            <Mail className="h-4 w-4 mr-1.5" /> Email {builder.clientName || 'Client'}
                        </Button>
                    </div>
                )}
            </div>

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
                    {builder.items.length > 0 && (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={builder.clearAll}>
                            <Trash2 className="h-3 w-3 mr-1" /> Clear All
                        </Button>
                    )}
                </div>
                <TemplatePicker
                    onSelect={builder.loadTemplate}
                    activeItemCount={builder.items.length}
                />
            </div>

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
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => builder.addPeptide(p)}
                                                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors text-left text-sm group"
                                            >
                                                <div className="min-w-0">
                                                    <span className="font-medium">{p.name}</span>
                                                    {knowledge && (
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            {knowledge.vialSizeMg}mg \u00B7 {knowledge.reconstitutionMl}mL water \u00B7 {knowledge.defaultDoseAmount}{knowledge.defaultDoseUnit}
                                                        </span>
                                                    )}
                                                    {!knowledge && p.default_dose_amount ? (
                                                        <span className="ml-2 text-xs text-muted-foreground">
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

                    {/* Protocol Items */}
                    {builder.items.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Protocol Items ({builder.items.length})
                            </h3>
                            {builder.items.map((item, idx) => (
                                <ProtocolItemEditor
                                    key={item.peptideId}
                                    item={item}
                                    index={idx}
                                    onUpdate={builder.updateItem}
                                    onRemove={builder.removeItem}
                                />
                            ))}
                        </div>
                    )}

                    {builder.items.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            Select a template above or click individual peptides to start building.
                        </div>
                    )}
                </div>

                {/* RIGHT: Rich Preview */}
                <div className="lg:col-span-2">
                    <RichProtocolPreview
                        html={builder.html}
                        itemCount={builder.items.length}
                        onCopy={builder.copyHtml}
                        onPrint={builder.printProtocol}
                        onEmail={builder.openMailto}
                        canEmail={!!builder.clientEmail}
                        clientName={builder.clientName}
                        hasClient={!!builder.selectedContactId}
                    />
                </div>
            </div>
        </div>
    );
}
