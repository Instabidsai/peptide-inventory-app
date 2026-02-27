import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Package, Plus, Check } from 'lucide-react';
import { lookupKnowledge } from '@/data/protocol-knowledge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ICON_MAP, CATEGORY_STYLES } from './constants';
import type { CartItem, SelectedProtocol } from './types';

interface ProtocolDetailSheetProps {
    selectedProtocol: SelectedProtocol | null;
    onClose: () => void;
    cart: CartItem[];
    isPartner: boolean;
    pricingMode: string;
    getClientPrice: (peptide: { id: string; retail_price?: number | null }) => number;
    addToCart: (peptide: { id: string; name: string; retail_price?: number | null }) => void;
}

export function ProtocolDetailSheet({
    selectedProtocol,
    onClose,
    cart,
    isPartner,
    pricingMode,
    getClientPrice,
    addToCart,
}: ProtocolDetailSheetProps) {
    return (
        <Sheet open={!!selectedProtocol} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-y-auto border-t border-border/60">
                {selectedProtocol && (() => {
                    const { template, matched } = selectedProtocol;
                    const Icon = ICON_MAP[template.icon] || Package;
                    const catStyle = CATEGORY_STYLES[template.category] || CATEGORY_STYLES.healing;
                    const bundlePrice = matched.reduce((sum, p) => sum + getClientPrice(p), 0);
                    const uniqueMatched = [...new Map(matched.map(p => [p.id, p])).values()];
                    const qtyMap: Record<string, number> = {};
                    matched.forEach(p => { qtyMap[p.id] = (qtyMap[p.id] || 0) + 1; });
                    const allInCart = uniqueMatched.length > 0 && uniqueMatched.every(p => {
                        const inCart = cart.find(c => c.peptide_id === p.id);
                        return inCart && inCart.quantity >= (qtyMap[p.id] || 1);
                    });

                    return (
                        <>
                            {/* Gradient accent bar */}
                            <div className={`h-1 -mt-1 rounded-full mx-auto w-12 bg-gradient-to-r ${catStyle.gradient} opacity-80 mb-4`} />
                            <SheetHeader className="pb-5">
                                <div className="flex items-center gap-4">
                                    <div className={`h-14 w-14 rounded-2xl ${catStyle.iconBg} flex items-center justify-center shrink-0 shadow-xl`}>
                                        <Icon className="h-7 w-7 text-white" />
                                    </div>
                                    <div>
                                        <SheetTitle className="text-2xl font-extrabold tracking-tight text-left">
                                            {template.name}
                                        </SheetTitle>
                                        <p className="text-sm text-muted-foreground/60 mt-1 leading-relaxed">{template.description}</p>
                                    </div>
                                </div>
                            </SheetHeader>

                            <div className="space-y-5 pb-8">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.15em]">What's Included</p>
                                <div className="space-y-3">
                                    {uniqueMatched.map((p, idx) => {
                                        const qty = qtyMap[p.id] || 1;
                                        const price = getClientPrice(p) * qty;
                                        const knowledge = lookupKnowledge(p.name);
                                        return (
                                            <motion.div
                                                key={p.id}
                                                initial={{ opacity: 0, x: -12 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.08, duration: 0.3 }}
                                                className="p-4 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors space-y-2.5"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {qty > 1 && (
                                                            <span className="text-[10px] font-bold bg-muted/50 px-2 py-0.5 rounded-full">{qty}x</span>
                                                        )}
                                                        <p className="font-bold text-sm">{p.name}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-extrabold text-gradient-primary">${price.toFixed(2)}</span>
                                                        {(() => {
                                                            const itemRetail = Number(p.retail_price || 0) * qty;
                                                            const itemHasDiscount = price < itemRetail && itemRetail > 0;
                                                            const itemPct = itemHasDiscount ? Math.round((1 - price / itemRetail) * 100) : 0;
                                                            return itemHasDiscount ? (
                                                                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                                                    <span className="text-[11px] text-muted-foreground/40 line-through">${itemRetail.toFixed(2)}</span>
                                                                    <span className="text-[11px] font-bold text-primary">{itemPct}% off</span>
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                </div>
                                                {knowledge && (
                                                    <>
                                                        <p className="text-xs text-muted-foreground/60 leading-relaxed line-clamp-3">
                                                            {knowledge.description}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {[
                                                                { label: knowledge.defaultDoseAmount + ' ' + knowledge.defaultDoseUnit, },
                                                                { label: knowledge.defaultFrequency },
                                                                { label: knowledge.defaultTiming },
                                                                { label: knowledge.administrationRoute },
                                                            ].map((tag, i) => (
                                                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/50 font-medium">
                                                                    {tag.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                                {!knowledge && p.description && (
                                                    <p className="text-xs text-muted-foreground/60 leading-relaxed line-clamp-3">
                                                        {p.description}
                                                    </p>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* Total + Add All */}
                                <div className="border-t border-border/50 pt-5 space-y-4">
                                    {(() => {
                                        const sheetRetail = matched.reduce((sum, p) => sum + Number(p.retail_price || 0), 0);
                                        const sheetHasDiscount = bundlePrice < sheetRetail && sheetRetail > 0;
                                        const sheetPct = sheetHasDiscount ? Math.round((1 - bundlePrice / sheetRetail) * 100) : 0;
                                        const isCustomerSheet = !isPartner;
                                        const sheetLabel = sheetHasDiscount
                                            ? isCustomerSheet ? 'Friends & Family' : pricingMode === 'cost_plus' ? 'Preferred Pricing' : null
                                            : null;
                                        return (
                                            <>
                                                {sheetHasDiscount && (
                                                    <div className="flex justify-center">
                                                        <div className="px-4 py-2 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/25">
                                                            <span className="text-base font-extrabold text-primary">{sheetPct}% off</span>
                                                            {sheetLabel && (
                                                                <span className="text-sm font-semibold text-primary/70 ml-2">· {sheetLabel}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-muted-foreground/60 text-sm font-medium">Bundle Total</span>
                                                    <div className="text-right">
                                                        <span className="text-3xl font-extrabold text-gradient-primary">${bundlePrice.toFixed(2)}</span>
                                                        {sheetHasDiscount && (
                                                            <p className="text-sm text-muted-foreground/40 line-through">${sheetRetail.toFixed(2)}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}

                                    {allInCart ? (
                                        <div className="flex items-center justify-center gap-2.5 py-4 text-primary font-semibold bg-primary/[0.08] rounded-2xl border border-primary/20">
                                            <Check className="h-5 w-5" />
                                            All items in cart
                                        </div>
                                    ) : (
                                        <Button
                                            size="lg"
                                            className="w-full h-14 rounded-2xl text-base font-bold shadow-xl shadow-primary/25 bg-gradient-brand-r hover:opacity-90 border-0"
                                            onClick={() => {
                                                matched.forEach(p => addToCart(p));
                                            }}
                                        >
                                            <Plus className="h-5 w-5 mr-2" />
                                            Add All to Cart — ${bundlePrice.toFixed(2)}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </>
                    );
                })()}
            </SheetContent>
        </Sheet>
    );
}
