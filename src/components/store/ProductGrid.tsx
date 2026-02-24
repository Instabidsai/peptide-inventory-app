import React from 'react';
import { motion } from 'framer-motion';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Plus, Minus, Search, Dna } from 'lucide-react';
import { lookupKnowledge } from '@/data/protocol-knowledge';
import { getPeptideDescription } from './utils';
import type { CartItem } from './types';

interface ProductGridProps {
    peptides: any[] | undefined;
    filteredPeptides: any[] | undefined;
    isLoading: boolean;
    isError: boolean;
    searchQuery: string;
    cart: CartItem[];
    isPartner: boolean;
    pricingMode: string;
    getClientPrice: (peptide: { id: string; retail_price?: number | null }) => number;
    addToCart: (peptide: { id: string; name: string; retail_price?: number | null }) => void;
    updateQuantity: (peptideId: string, delta: number) => void;
    onSelectPeptide: (peptide: any) => void;
}

export function ProductGrid({
    filteredPeptides,
    isLoading,
    isError,
    searchQuery,
    cart,
    isPartner,
    pricingMode,
    getClientPrice,
    addToCart,
    updateQuantity,
    onSelectPeptide,
}: ProductGridProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/80 to-emerald-600 flex items-center justify-center">
                        <Package className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight">Our Collection</h2>
                </div>
                {filteredPeptides && (
                    <Badge variant="secondary" className="text-xs bg-white/[0.06] border-white/[0.08]">
                        {filteredPeptides.length} items
                    </Badge>
                )}
            </div>

            {isLoading ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <GlassCard key={i}>
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 space-y-2.5">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-20" />
                                        <Skeleton className="h-7 w-24 mt-1" />
                                    </div>
                                    <Skeleton className="h-10 w-20 rounded-full" />
                                </div>
                            </CardContent>
                        </GlassCard>
                    ))}
                </div>
            ) : isError ? (
                <div className="text-center py-16 text-muted-foreground">
                    <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <Package className="h-8 w-8 text-red-400/60" />
                    </div>
                    <p className="text-sm font-medium">Failed to load products</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">Please try refreshing the page</p>
                </div>
            ) : filteredPeptides?.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <div className="h-16 w-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                        <Search className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium">{searchQuery ? 'No results found' : 'No peptides available'}</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">
                        {searchQuery ? `Nothing matches "${searchQuery}"` : 'Check back soon'}
                    </p>
                </div>
            ) : (
                <motion.div
                    className="grid gap-4 grid-cols-1 sm:grid-cols-2"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                >
                    {filteredPeptides?.map((peptide) => {
                        const price = getClientPrice(peptide);
                        const retail = Number(peptide.retail_price || 0);
                        const hasDiscount = price < retail;
                        const discountPct = hasDiscount ? Math.round((1 - price / retail) * 100) : 0;
                        // Determine discount label based on pricing mode
                        const isCustomer = !isPartner;
                        const discountLabel = hasDiscount
                            ? isCustomer
                                ? 'Friends & Family'
                                : pricingMode === 'cost_plus'
                                    ? 'Preferred Pricing'
                                    : null // cost_multiplier or percentage -- just show "X% off"
                            : null;
                        const inCart = cart.find(i => i.peptide_id === peptide.id);
                        const description = getPeptideDescription(peptide.name) || peptide.description;
                        const knowledge = lookupKnowledge(peptide.name);

                        if (price <= 0 && retail <= 0) return null;

                        return (
                            <motion.div
                                key={peptide.id}
                                variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
                                whileHover={{ y: -5, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                                whileTap={{ scale: 0.97 }}
                            >
                            <GlassCard
                                className="group cursor-pointer hover:bg-white/[0.09] hover:border-emerald-500/20 hover:shadow-[0_8px_40px_-8px_rgba(16,185,129,0.25),0_24px_60px_-12px_rgba(0,0,0,0.3)] transition-all duration-300"
                                onClick={() => onSelectPeptide(peptide)}
                            >
                                {/* Top accent bar */}
                                <div className="h-[2px] bg-gradient-to-r from-emerald-500/40 via-primary/60 to-cyan-500/40 opacity-40 group-hover:opacity-100 transition-opacity duration-300" />
                                {/* Shimmer overlay on hover */}
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-cyan-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                                <CardContent className="p-5 relative space-y-3">
                                    {/* Header row: icon + name + badge */}
                                    <div className="flex items-start gap-3.5">
                                        <div className="relative shrink-0">
                                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-emerald-400 blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-500" />
                                            <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-500/10 border border-white/[0.08] flex items-center justify-center group-hover:border-primary/20 transition-colors">
                                                <Dna className="h-5 w-5 text-primary/70 group-hover:text-primary transition-colors" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-[15px] tracking-tight truncate group-hover:text-white transition-colors duration-200">{peptide.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                                                <span className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-[0.1em]">Research Grade</span>
                                                {knowledge?.administrationRoute && (
                                                    <>
                                                        <span className="text-white/10">|</span>
                                                        <span className="text-[10px] text-muted-foreground/40 font-medium capitalize">{knowledge.administrationRoute}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {description && (
                                        <p className="text-xs text-muted-foreground/55 leading-relaxed line-clamp-3">
                                            {description}
                                        </p>
                                    )}

                                    {/* Dosing hint tags */}
                                    {knowledge && (
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/45 font-medium">
                                                {knowledge.defaultDoseAmount} {knowledge.defaultDoseUnit}
                                            </span>
                                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/45 font-medium">
                                                {knowledge.defaultFrequency}
                                            </span>
                                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/45 font-medium">
                                                {knowledge.defaultTiming}
                                            </span>
                                        </div>
                                    )}

                                    {/* Price + actions row */}
                                    <div className="flex items-end justify-between pt-2 border-t border-white/[0.05]">
                                        <div>
                                            {hasDiscount && (
                                                <div className="mb-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/25">
                                                    <span className="text-sm font-extrabold text-emerald-400">
                                                        {discountPct}% off
                                                    </span>
                                                    {discountLabel && (
                                                        <span className="text-xs font-semibold text-emerald-400/70 ml-1.5">
                                                            · {discountLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-baseline gap-2">
                                                <p className="text-2xl font-extrabold text-gradient-primary">
                                                    ${price.toFixed(2)}
                                                </p>
                                                {hasDiscount && (
                                                    <span className="text-sm text-muted-foreground/40 line-through">
                                                        ${retail.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end" onClick={e => e.stopPropagation()}>
                                            {inCart ? (
                                                <div className="flex items-center gap-0.5 bg-white/[0.06] rounded-xl p-1 border border-white/[0.08]">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 rounded-lg hover:bg-white/[0.1]"
                                                        onClick={() => updateQuantity(peptide.id, -1)}
                                                        aria-label={`Decrease quantity of ${peptide.name}`}
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <span className="w-8 text-center text-sm font-extrabold">
                                                        {inCart.quantity}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 rounded-lg hover:bg-white/[0.1]"
                                                        onClick={() => updateQuantity(peptide.id, 1)}
                                                        aria-label={`Increase quantity of ${peptide.name}`}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="rounded-xl px-5 h-11 font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.03] transition-all"
                                                    onClick={() => addToCart(peptide)}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" />
                                                    Add
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </GlassCard>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}
        </div>
    );
}
