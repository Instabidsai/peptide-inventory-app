import React, { useMemo } from 'react';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Package, Plus, Check, Clock, FlaskConical } from 'lucide-react';
import { PROTOCOL_PACKAGES, type ProtocolPackage } from '@/data/protocol-packages';
import { ICON_MAP, CATEGORY_STYLES } from './constants';
import { matchPeptide } from './utils';
import type { Peptide } from '@/hooks/use-peptides';

interface ProtocolPackagesProps {
    peptides: Peptide[];
    cart: Array<{ peptide_id: string; quantity: number }>;
    isPartner: boolean;
    pricingMode: string;
    getClientPrice: (peptide: { id: string; retail_price?: number | null }) => number;
    addPackageToCart: (pkg: ProtocolPackage) => void;
}

/** Extract a clean short display name from DB peptide name (e.g. "NAD+ 10000mg SubQ Injectable" → "NAD+ 10000mg") */
function shortName(dbName: string): string {
    // Grab the base name + first dosage token (e.g. "20mg", "10000mg", "5mg")
    const m = dbName.match(/^(.+?\S)\s+(\d+\s*(?:mg|mcg|iu))\b/i);
    if (m) return `${m[1]} ${m[2]}`;
    return dbName;
}

export const ProtocolPackages = React.memo(function ProtocolPackages({
    peptides,
    cart,
    isPartner,
    pricingMode,
    getClientPrice,
    addPackageToCart,
}: ProtocolPackagesProps) {
    // Memoize peptide matching — only depends on peptides (from DB), not cart
    const resolvedPackages = useMemo(() =>
        PROTOCOL_PACKAGES.map(pkg => {
            const resolvedItems = pkg.items.map(item => ({
                ...item,
                peptide: matchPeptide(peptides, item.peptideName),
            }));
            return { pkg, resolvedItems, matchedItems: resolvedItems.filter(i => i.peptide) };
        }),
    [peptides]);

    return (
        <div>
            <div className="flex items-center gap-3 mb-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-brand flex items-center justify-center">
                    <Package className="h-4 w-4 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold tracking-tight">Full Cycle Protocols</h2>
                    <p className="text-xs text-muted-foreground/50">Complete protocol packages with exact vial quantities</p>
                </div>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 mt-4">
                {resolvedPackages.map(({ pkg, resolvedItems, matchedItems }) => {
                    const Icon = ICON_MAP[pkg.icon] || Package;
                    const catStyle = CATEGORY_STYLES[pkg.category] || CATEGORY_STYLES.healing;

                    // Calculate total price for this package
                    const totalPrice = matchedItems.reduce((sum, item) => {
                        return sum + getClientPrice(item.peptide!) * item.vialCount;
                    }, 0);

                    const totalRetail = matchedItems.reduce((sum, item) => {
                        return sum + Number(item.peptide!.retail_price || 0) * item.vialCount;
                    }, 0);

                    // Check if all items already in cart with enough quantity
                    const allInCart = matchedItems.length > 0 && matchedItems.every(item => {
                        const inCart = cart.find(c => c.peptide_id === item.peptide!.id);
                        return inCart && inCart.quantity >= item.vialCount;
                    });

                    // Actual matched vial count (may differ from declared if some peptides aren't in this org)
                    const actualVials = matchedItems.reduce((sum, i) => sum + i.vialCount, 0);

                    // Skip if no peptides matched at all
                    if (matchedItems.length === 0) return null;

                    const hasDiscount = totalPrice < totalRetail && totalRetail > 0;
                    const discountPct = hasDiscount ? Math.round((1 - totalPrice / totalRetail) * 100) : 0;
                    const discountLabel = hasDiscount
                        ? (!isPartner ? 'Friends & Family' : pricingMode === 'cost_plus' ? 'Preferred Pricing' : null)
                        : null;

                    return (
                        <div
                            key={pkg.id}
                            className="hover:-translate-y-1 active:scale-[0.98] transition-transform duration-200"
                        >
                            <GlassCard
                                className={`group ${catStyle.hoverGlow} ${catStyle.borderHover} hover:bg-muted/50 transition-all duration-300`}
                            >
                                {/* Gradient accent bar */}
                                <div className={`h-[3px] bg-gradient-to-r ${catStyle.gradient} opacity-50 group-hover:opacity-100 transition-opacity duration-300`} />

                                <CardContent className="p-6 space-y-4 relative">
                                    {/* Header: Icon + Name + Description */}
                                    <div className="flex items-start gap-4">
                                        <div className="relative">
                                            <div className={`absolute inset-0 rounded-2xl ${catStyle.iconBg} blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
                                            <div className={`relative h-12 w-12 rounded-2xl ${catStyle.iconBg} flex items-center justify-center shrink-0 shadow-xl ring-1 ring-white/20`}>
                                                <Icon className="h-6 w-6 text-white drop-shadow-sm" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0 pt-0.5">
                                            <p className="font-bold text-base tracking-tight group-hover:text-white transition-colors">{pkg.name}</p>
                                            <p className="text-xs text-muted-foreground/50 mt-1.5 leading-relaxed line-clamp-2">{pkg.description}</p>
                                        </div>
                                    </div>

                                    {/* Duration + Total Vials — prominent pills */}
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25">
                                            <Clock className="h-4 w-4 text-primary" />
                                            <span className="text-sm font-bold text-primary">{pkg.duration}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                                            <FlaskConical className="h-4 w-4 text-amber-400" />
                                            <span className="text-sm font-bold text-amber-400">{actualVials} vials</span>
                                        </div>
                                    </div>

                                    {/* Peptide items with vial counts */}
                                    <div className="flex flex-wrap gap-2">
                                        {resolvedItems.map((item) => (
                                            <Badge
                                                key={item.peptideName}
                                                variant="secondary"
                                                className={`text-[10px] px-3 py-1 bg-muted/50 border font-medium rounded-lg backdrop-blur-sm ${
                                                    item.peptide ? 'border-border/60' : 'border-destructive/30 text-destructive/60'
                                                }`}
                                            >
                                                {item.vialCount}x {item.peptide ? shortName(item.peptide.name || '') : item.peptideName}
                                            </Badge>
                                        ))}
                                    </div>

                                    {/* Dosing schedule lines */}
                                    <div className="space-y-1">
                                        {matchedItems.map(item => (
                                            <p key={item.peptideName} className="text-[10px] text-muted-foreground/40 leading-relaxed">
                                                <span className="font-medium text-muted-foreground/60">{shortName(item.peptide!.name || '')}:</span> {item.dosing}
                                            </p>
                                        ))}
                                    </div>

                                    {/* Price + Add button */}
                                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                                        <div>
                                            {hasDiscount && (
                                                <div className="mb-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/25 inline-block">
                                                    <span className="text-sm font-extrabold text-primary">{discountPct}% off</span>
                                                    {discountLabel && (
                                                        <span className="text-xs font-semibold text-primary/70 ml-1.5">· {discountLabel}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl font-extrabold text-gradient-primary">${totalPrice.toFixed(2)}</span>
                                                {hasDiscount && (
                                                    <span className="text-sm text-muted-foreground/40 line-through">${totalRetail.toFixed(2)}</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                                                full protocol package
                                            </p>
                                        </div>
                                        {allInCart ? (
                                            <div className="flex items-center gap-2 text-primary text-xs font-bold bg-primary/10 px-4 py-2 rounded-xl border border-primary/20">
                                                <Check className="h-4 w-4" />
                                                In Cart
                                            </div>
                                        ) : (
                                            <Button
                                                size="sm"
                                                className="rounded-xl px-5 h-11 font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all hover:scale-[1.02]"
                                                onClick={() => addPackageToCart(pkg)}
                                            >
                                                <Plus className="h-4 w-4 mr-1.5" />
                                                Add All
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </GlassCard>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
