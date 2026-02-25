import React from 'react';
import { Button } from '@/components/ui/button';
import {
    Package,
    Plus,
    Minus,
    Shield,
    Beaker,
    Syringe,
    AlertTriangle,
    Pill,
    Users,
    ChevronRight,
    Clock,
    Repeat,
} from 'lucide-react';
import { lookupKnowledge, PROTOCOL_TEMPLATES, type ProtocolTemplate } from '@/data/protocol-knowledge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ICON_MAP, CATEGORY_STYLES } from './constants';
import { getPeptideDescription, getRelatedStacks } from './utils';
import type { CartItem, SelectedProtocol } from './types';
import type { Peptide } from '@/hooks/use-peptides';

interface ProductDetailSheetProps {
    selectedPeptide: Peptide | null;
    onClose: () => void;
    allPeptides: Peptide[] | undefined;
    cart: CartItem[];
    isPartner: boolean;
    pricingMode: string;
    getClientPrice: (peptide: { id: string; retail_price?: number | null }) => number;
    addToCart: (peptide: { id: string; name: string; retail_price?: number | null }) => void;
    updateQuantity: (peptideId: string, delta: number) => void;
    onSelectProtocol: (protocol: SelectedProtocol) => void;
}

export function ProductDetailSheet({
    selectedPeptide,
    onClose,
    allPeptides,
    cart,
    isPartner,
    pricingMode,
    getClientPrice,
    addToCart,
    updateQuantity,
    onSelectProtocol,
}: ProductDetailSheetProps) {
    return (
        <Sheet open={!!selectedPeptide} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto border-t border-white/[0.1]">
                {selectedPeptide && (() => {
                    const price = getClientPrice(selectedPeptide);
                    const retail = Number(selectedPeptide.retail_price || 0);
                    const hasDiscount = price < retail;
                    const inCart = cart.find(i => i.peptide_id === selectedPeptide.id);
                    const detailDesc = getPeptideDescription(selectedPeptide.name) || selectedPeptide.description;
                    const dk = lookupKnowledge(selectedPeptide.name);
                    const relatedStacks = getRelatedStacks(selectedPeptide.name, allPeptides || []);

                    return (
                        <>
                            <div className="h-1 rounded-full mx-auto w-12 bg-gradient-to-r from-primary to-emerald-400 opacity-60 mb-5 -mt-1" />
                            <SheetHeader className="pb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] text-emerald-400/80 font-semibold uppercase tracking-[0.15em]">Research Grade</span>
                                    {dk?.administrationRoute && (
                                        <>
                                            <span className="text-white/10">|</span>
                                            <span className="text-[10px] text-muted-foreground/50 font-medium capitalize">{dk.administrationRoute}</span>
                                        </>
                                    )}
                                </div>
                                <SheetTitle className="text-2xl font-extrabold tracking-tight text-left">
                                    {selectedPeptide.name}
                                </SheetTitle>
                            </SheetHeader>

                            <div className="space-y-5 pb-8">
                                {/* Description */}
                                {detailDesc && (
                                    <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                        {detailDesc}
                                    </p>
                                )}

                                {/* Quick-reference pills */}
                                {dk && (
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/15 text-primary/70 font-semibold">
                                            {dk.defaultDoseAmount} {dk.defaultDoseUnit}
                                        </span>
                                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                            {dk.defaultFrequency}
                                        </span>
                                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                            {dk.defaultTiming}
                                        </span>
                                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium capitalize">
                                            {dk.administrationRoute}
                                        </span>
                                        {dk.vialSizeMg > 0 && (
                                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                                {dk.vialSizeMg}mg vial
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Price */}
                                <div className="space-y-2">
                                    {hasDiscount && (() => {
                                        const detailPct = Math.round((1 - price / retail) * 100);
                                        const isCustomerDetail = !isPartner;
                                        const detailLabel = isCustomerDetail ? 'Friends & Family' : pricingMode === 'cost_plus' ? 'Preferred Pricing' : null;
                                        return (
                                            <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/25 inline-flex items-center">
                                                <span className="text-lg font-extrabold text-emerald-400">{detailPct}% off</span>
                                                {detailLabel && (
                                                    <span className="text-sm font-semibold text-emerald-400/70 ml-2">· {detailLabel}</span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-4xl font-extrabold text-gradient-primary">${price.toFixed(2)}</span>
                                        {hasDiscount && (
                                            <span className="text-lg text-muted-foreground/40 line-through">${retail.toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Add to cart / quantity */}
                                {inCart ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                                            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl border-white/[0.1]" onClick={() => updateQuantity(selectedPeptide.id, -1)}>
                                                <Minus className="h-5 w-5" />
                                            </Button>
                                            <span className="text-3xl font-extrabold w-14 text-center">{inCart.quantity}</span>
                                            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl border-white/[0.1]" onClick={() => updateQuantity(selectedPeptide.id, 1)}>
                                                <Plus className="h-5 w-5" />
                                            </Button>
                                        </div>
                                        <p className="text-center text-sm text-muted-foreground/60">
                                            Subtotal: <span className="font-bold text-foreground">${(price * inCart.quantity).toFixed(2)}</span>
                                        </p>
                                    </div>
                                ) : (
                                    <Button
                                        size="lg"
                                        className="w-full h-14 rounded-2xl text-base font-bold shadow-xl shadow-primary/25 bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 border-0"
                                        onClick={() => addToCart(selectedPeptide)}
                                    >
                                        <Plus className="h-5 w-5 mr-2" />
                                        Add to Cart — ${price.toFixed(2)}
                                    </Button>
                                )}

                                {/* Reconstitution Info */}
                                {dk && dk.vialSizeMg > 0 && dk.reconstitutionMl > 0 && (
                                    <div className="p-4 rounded-2xl bg-cyan-500/[0.04] border border-cyan-500/[0.1] space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Beaker className="h-3.5 w-3.5 text-cyan-400/70" />
                                            <p className="text-[10px] font-semibold text-cyan-400/60 uppercase tracking-[0.12em]">Reconstitution</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground/60 leading-relaxed">
                                            Add <strong className="text-foreground/80">{dk.reconstitutionMl}mL</strong> of bacteriostatic water to the <strong className="text-foreground/80">{dk.vialSizeMg}mg</strong> vial.
                                            {dk.reconstitutionMl > 0 && dk.vialSizeMg > 0 && (
                                                <> Concentration: <strong className="text-foreground/80">{(dk.vialSizeMg / dk.reconstitutionMl).toFixed(1)}mg/mL</strong>.</>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Dosing Tiers */}
                                {dk?.dosingTiers && dk.dosingTiers.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Syringe className="h-3.5 w-3.5 text-primary/60" />
                                            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em]">Dosing Protocols</p>
                                        </div>
                                        <div className="space-y-2">
                                            {dk.dosingTiers.map((tier, idx) => (
                                                <div key={tier.id} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-bold text-foreground/90">{tier.label}</p>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary/70 font-semibold">
                                                            {tier.doseAmount} {tier.doseUnit}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/45">
                                                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tier.frequency}</span>
                                                        <span>{tier.timing}</span>
                                                    </div>
                                                    {tier.notes && (
                                                        <p className="text-[11px] text-muted-foreground/55 leading-relaxed">{tier.notes}</p>
                                                    )}
                                                    {tier.dosageSchedule && (
                                                        <p className="text-[10px] text-muted-foreground/40 leading-relaxed whitespace-pre-line font-mono bg-white/[0.02] rounded-lg p-2 border border-white/[0.04]">
                                                            {tier.dosageSchedule}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cycle Pattern */}
                                {dk?.cyclePattern && (
                                    <div className="p-4 rounded-2xl bg-violet-500/[0.04] border border-violet-500/[0.1] space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Repeat className="h-3.5 w-3.5 text-violet-400/70" />
                                            <p className="text-[10px] font-semibold text-violet-400/60 uppercase tracking-[0.12em]">Cycle Pattern</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground/60 leading-relaxed">{dk.cyclePattern}</p>
                                    </div>
                                )}

                                {/* Warning */}
                                {dk?.warningText && (
                                    <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/[0.12] space-y-2">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
                                            <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-[0.12em]">Important Note</p>
                                        </div>
                                        <p className="text-xs text-amber-200/50 leading-relaxed">{dk.warningText}</p>
                                    </div>
                                )}

                                {/* Supplement Notes */}
                                {dk?.supplementNotes && dk.supplementNotes.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Pill className="h-3.5 w-3.5 text-emerald-400/60" />
                                            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em]">Recommended Supplements</p>
                                        </div>
                                        <div className="space-y-2">
                                            {dk.supplementNotes.map((supp, idx) => (
                                                <div key={idx} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-start gap-3">
                                                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                                        <Pill className="h-3.5 w-3.5 text-emerald-400/60" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-foreground/80">{supp.name}</p>
                                                        <p className="text-[10px] text-primary/60 font-semibold">{supp.dosage}</p>
                                                        <p className="text-[11px] text-muted-foreground/50 leading-relaxed mt-0.5">{supp.reason}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Commonly Stacked With */}
                                {relatedStacks.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Users className="h-3.5 w-3.5 text-primary/60" />
                                            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em]">Commonly Stacked With</p>
                                        </div>
                                        <div className="space-y-2">
                                            {relatedStacks.map((stack, idx) => {
                                                const StackIcon = ICON_MAP[stack.icon] || Package;
                                                const catStyle = CATEGORY_STYLES[stack.category] || CATEGORY_STYLES.healing;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            // Find and open this protocol template
                                                            const template = PROTOCOL_TEMPLATES.find(t => t.name === stack.templateName);
                                                            if (template && allPeptides) {
                                                                const matched = template.peptideNames
                                                                    .map(n => allPeptides.find(p => p.name?.toLowerCase().startsWith(n.toLowerCase())))
                                                                    .filter((p): p is Peptide => !!p);
                                                                if (matched.length > 0) {
                                                                    onClose();
                                                                    setTimeout(() => onSelectProtocol({ template, matched }), 200);
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`h-9 w-9 rounded-xl ${catStyle.iconBg} flex items-center justify-center shrink-0 shadow-lg`}>
                                                                <StackIcon className="h-4 w-4 text-white" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-foreground/80">{stack.templateName}</p>
                                                                <p className="text-[10px] text-muted-foreground/45 mt-0.5 truncate">
                                                                    {stack.otherPeptides.join(' + ')}
                                                                </p>
                                                            </div>
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Storage & Handling */}
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Shield className="h-3.5 w-3.5 text-emerald-400/60" />
                                        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em]">Storage & Handling</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground/50 leading-relaxed">
                                        Store unreconstituted vials at room temperature or refrigerated. After reconstitution, store refrigerated (2-8°C) and use within 30 days.
                                    </p>
                                </div>
                            </div>
                        </>
                    );
                })()}
            </SheetContent>
        </Sheet>
    );
}
