import React from 'react';
import { motion } from 'framer-motion';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Layers, Package, Plus, Check } from 'lucide-react';
import { PROTOCOL_TEMPLATES } from '@/data/protocol-knowledge';
import { ICON_MAP, CATEGORY_STYLES } from './constants';
import type { CartItem, SelectedProtocol } from './types';

interface ProtocolBundlesProps {
    peptides: any[];
    cart: CartItem[];
    isPartner: boolean;
    pricingMode: string;
    getClientPrice: (peptide: { id: string; retail_price?: number | null }) => number;
    addToCart: (peptide: { id: string; name: string; retail_price?: number | null }) => void;
    onSelectProtocol: (protocol: SelectedProtocol) => void;
}

export function ProtocolBundles({
    peptides,
    cart,
    isPartner,
    pricingMode,
    getClientPrice,
    addToCart,
    onSelectProtocol,
}: ProtocolBundlesProps) {
    return (
        <div>
            <div className="flex items-center gap-3 mb-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold tracking-tight">Recommended Protocols</h2>
                    <p className="text-xs text-muted-foreground/50">Curated peptide stacks for your goals</p>
                </div>
            </div>
            <motion.div
                className="grid gap-4 grid-cols-1 sm:grid-cols-2 mt-4"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
            >
                {PROTOCOL_TEMPLATES
                    .filter(t => t.category !== 'full')
                    .filter(t => !t.defaultTierId)
                    .map(template => {
                        const Icon = ICON_MAP[template.icon] || Package;
                        const catStyle = CATEGORY_STYLES[template.category] || CATEGORY_STYLES.healing;
                        const matchedPeptides = template.peptideNames
                            .map(name => peptides.find(p => p.name?.toLowerCase().startsWith(name.toLowerCase())))
                            .filter(Boolean) as any[];
                        const uniqueMatched = [...new Map(matchedPeptides.map((p: any) => [p.id, p])).values()];
                        const bundlePrice = matchedPeptides.reduce((sum: number, p: any) => sum + getClientPrice(p), 0);
                        const expectedQty: Record<string, number> = {};
                        matchedPeptides.forEach((p: any) => { expectedQty[p.id] = (expectedQty[p.id] || 0) + 1; });
                        const allInCart = uniqueMatched.length > 0 && uniqueMatched.every(p => {
                            const inCart = cart.find(c => c.peptide_id === p.id);
                            return inCart && inCart.quantity >= (expectedQty[p.id] || 1);
                        });

                        if (matchedPeptides.length === 0) return null;

                        return (
                            <motion.div
                                key={template.name}
                                variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
                                whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                                whileTap={{ scale: 0.97 }}
                            >
                                <GlassCard
                                    className={`cursor-pointer group ${catStyle.hoverGlow} ${catStyle.borderHover} hover:bg-white/[0.07] transition-all duration-300`}
                                    onClick={() => onSelectProtocol({ template, matched: matchedPeptides })}
                                >
                                    {/* Gradient accent bar at top */}
                                    <div className={`h-[3px] bg-gradient-to-r ${catStyle.gradient} opacity-50 group-hover:opacity-100 transition-opacity duration-300`} />
                                    {/* Subtle category glow behind icon on hover */}
                                    <CardContent className="p-6 space-y-4 relative">
                                        <div className="flex items-start gap-4">
                                            <div className="relative">
                                                <div className={`absolute inset-0 rounded-2xl ${catStyle.iconBg} blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
                                                <div className={`relative h-12 w-12 rounded-2xl ${catStyle.iconBg} flex items-center justify-center shrink-0 shadow-xl ring-1 ring-white/20`}>
                                                    <Icon className="h-6 w-6 text-white drop-shadow-sm" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="font-bold text-base tracking-tight group-hover:text-white transition-colors">{template.name}</p>
                                                <p className="text-xs text-muted-foreground/50 mt-1.5 leading-relaxed line-clamp-2">{template.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {uniqueMatched.map((p: any) => (
                                                <Badge key={p.id} variant="secondary" className="text-[10px] px-3 py-1 bg-white/[0.06] border border-white/[0.08] font-medium rounded-lg backdrop-blur-sm">
                                                    {expectedQty[p.id] > 1 ? `${expectedQty[p.id]}x ` : ''}{p.name}
                                                </Badge>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                                            <div>
                                                {(() => {
                                                    const bundleRetail = matchedPeptides.reduce((sum: number, p: any) => sum + Number(p.retail_price || 0), 0);
                                                    const bundleHasDiscount = bundlePrice < bundleRetail && bundleRetail > 0;
                                                    const bundleDiscountPct = bundleHasDiscount ? Math.round((1 - bundlePrice / bundleRetail) * 100) : 0;
                                                    const isCustomerBundle = !isPartner;
                                                    const bundleDiscountLabel = bundleHasDiscount
                                                        ? isCustomerBundle ? 'Friends & Family' : pricingMode === 'cost_plus' ? 'Preferred Pricing' : null
                                                        : null;
                                                    return (
                                                        <>
                                                            {bundleHasDiscount && (
                                                                <div className="mb-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/25 inline-block">
                                                                    <span className="text-sm font-extrabold text-emerald-400">{bundleDiscountPct}% off</span>
                                                                    {bundleDiscountLabel && (
                                                                        <span className="text-xs font-semibold text-emerald-400/70 ml-1.5">· {bundleDiscountLabel}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-2xl font-extrabold text-gradient-primary">${bundlePrice.toFixed(2)}</span>
                                                                {bundleHasDiscount && (
                                                                    <span className="text-sm text-muted-foreground/40 line-through">${bundleRetail.toFixed(2)}</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">{uniqueMatched.length} peptide{uniqueMatched.length !== 1 ? 's' : ''}</p>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            {allInCart ? (
                                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                                                    <Check className="h-4 w-4" />
                                                    In Cart
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="rounded-xl px-5 h-11 font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all hover:scale-[1.02]"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        matchedPeptides.forEach((p: any) => addToCart(p));
                                                    }}
                                                >
                                                    <Plus className="h-4 w-4 mr-1.5" />
                                                    Add All
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </GlassCard>
                            </motion.div>
                        );
                    })}
            </motion.div>
        </div>
    );
}
