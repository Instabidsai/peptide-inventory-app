import { useState } from 'react';
import type { EnrichedProtocolItem } from '@/lib/protocol-html-generator';
import { calcMl, calcUnits, formatMl, formatFrequencyShort } from '@/lib/protocol-html-generator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    X, ChevronDown, ChevronUp, Calculator, ChevronRight, AlertTriangle, Pill, Droplets,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FREQUENCIES = [
    'daily', 'daily_am_pm', 'twice daily', 'every other day', 'every 3 days', 'every 5 days',
    'weekly', 'twice weekly', '3x weekly', 'monthly', 'as needed',
];

const TIMINGS = ['AM', 'PM', 'Before bed', 'With meals', 'none'];

const ROUTES = ['subcutaneous', 'intranasal', 'intramuscular', 'oral', 'topical'];

interface ProtocolItemEditorProps {
    item: EnrichedProtocolItem;
    index: number;
    onUpdate: (index: number, field: keyof EnrichedProtocolItem, value: string | number | null) => void;
    onRemove: (index: number) => void;
    onSelectTier: (index: number, tierId: string) => void;
}

export function ProtocolItemEditor({ item, index, onUpdate, onRemove, onSelectTier }: ProtocolItemEditorProps) {
    const [expanded, setExpanded] = useState(false);
    const ml = calcMl(item);
    const units = calcUnits(ml);

    return (
        <Card className="relative group">
            {/* Remove button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7 opacity-50 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${item.peptideName}`}
            >
                <X className="h-3.5 w-3.5" />
            </Button>

            <CardContent className="pt-4 pb-3">
                {/* Header row: name + badges */}
                <div className="flex items-center gap-2 mb-3 pr-8">
                    <span className="font-semibold text-sm">{item.peptideName}</span>
                    {item.vialSizeMg && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            {item.vialSizeMg}mg
                        </Badge>
                    )}
                    {item.stackLabel && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {item.stackLabel}
                        </Badge>
                    )}
                    {item.warningText && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                </div>

                {/* Dosing Tier Selector */}
                {item.availableTiers.length > 1 && (
                    <div className="mb-3">
                        <Label className="text-xs text-muted-foreground mb-1 block">Dosing Tier</Label>
                        <div className="flex gap-1.5 flex-wrap">
                            {item.availableTiers.map(tier => (
                                <button
                                    key={tier.id}
                                    onClick={() => onSelectTier(index, tier.id)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                                        item.selectedTierId === tier.id
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                    )}
                                >
                                    {tier.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Core fields: dose, frequency, timing, reconstitution */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {/* Dose */}
                    <div className="space-y-1">
                        <Label className="text-xs">Dose</Label>
                        <div className="flex gap-1">
                            <Input
                                type="number"
                                value={item.doseAmount || ''}
                                onChange={e => onUpdate(index, 'doseAmount', parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                            />
                            <Select value={item.doseUnit} onValueChange={v => onUpdate(index, 'doseUnit', v)}>
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
                        <Select value={item.frequency} onValueChange={v => onUpdate(index, 'frequency', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {FREQUENCIES.map(f => (
                                    <SelectItem key={f} value={f}>{formatFrequencyShort(f)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Timing */}
                    <div className="space-y-1">
                        <Label className="text-xs">Timing</Label>
                        <Select value={item.timing} onValueChange={v => onUpdate(index, 'timing', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {TIMINGS.map(t => (
                                    <SelectItem key={t} value={t}>
                                        {t === 'none' ? 'No preference' : t}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Reconstitution Water */}
                    <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                            <Droplets className="h-3 w-3" /> Water (mL)
                        </Label>
                        <Input
                            type="number"
                            value={item.reconstitutionMl || ''}
                            onChange={e => onUpdate(index, 'reconstitutionMl', parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                            step="0.5"
                        />
                    </div>

                    {/* Route */}
                    <div className="space-y-1">
                        <Label className="text-xs">Route</Label>
                        <Select value={item.administrationRoute} onValueChange={v => onUpdate(index, 'administrationRoute', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ROUTES.map(r => (
                                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Calc display */}
                <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-2">
                        {ml !== null && units !== null ? (
                            <Badge variant="secondary" className="text-xs font-mono gap-1">
                                <ChevronRight className="h-3 w-3" />
                                {formatMl(ml)} mL / {units} units
                            </Badge>
                        ) : (
                            <span className="text-[11px] text-muted-foreground">
                                {item.administrationRoute === 'oral' ? 'Oral — no injection calc' : 'Set vial size + water for draw calc'}
                            </span>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-muted-foreground"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        {expanded ? 'Less' : 'More'}
                    </Button>
                </div>

                {/* Expanded section */}
                {expanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                        {/* Description */}
                        {item.protocolDescription && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Description</Label>
                                <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                                    {item.protocolDescription}
                                </p>
                            </div>
                        )}

                        {/* Tier notes */}
                        {item.selectedTierId && item.availableTiers.find(t => t.id === item.selectedTierId)?.notes && (
                            <div className="p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
                                <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                    <span className="font-medium">Protocol Notes:</span>{' '}
                                    {item.availableTiers.find(t => t.id === item.selectedTierId)!.notes}
                                </p>
                            </div>
                        )}

                        {/* Warning */}
                        {item.warningText && (
                            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                    {item.warningText}
                                </p>
                            </div>
                        )}

                        {/* Cycle pattern */}
                        {item.cyclePattern && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Cycle Pattern</Label>
                                <p className="text-xs mt-0.5">{item.cyclePattern}</p>
                            </div>
                        )}

                        {/* Dosage schedule */}
                        {item.dosageSchedule && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Dosage Schedule</Label>
                                <p className="text-xs mt-0.5 whitespace-pre-line">{item.dosageSchedule}</p>
                            </div>
                        )}

                        {/* Supplements */}
                        {item.supplements.length > 0 && (
                            <div>
                                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Pill className="h-3 w-3" /> Recommended Supplements
                                </Label>
                                <div className="space-y-1.5 mt-1">
                                    {item.supplements.map((supp, sIdx) => (
                                        <div key={sIdx} className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs">
                                            <span className="font-medium">{supp.name}</span>
                                            <span className="text-muted-foreground"> — {supp.dosage}</span>
                                            {supp.productName && (
                                                <span className="block text-muted-foreground mt-0.5">
                                                    Product: {supp.productName}
                                                    {supp.productLink && (
                                                        <a
                                                            href={supp.productLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="ml-1 text-blue-500 underline"
                                                        >
                                                            (Amazon)
                                                        </a>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-1">
                            <Label className="text-xs">Custom Notes</Label>
                            <Input
                                value={item.notes}
                                onChange={e => onUpdate(index, 'notes', e.target.value)}
                                placeholder="Additional notes for this peptide..."
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
