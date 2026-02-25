import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Percent, Search } from 'lucide-react';

interface StoreHeaderProps {
    priceMultiplier: number;
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

function StoreHeaderBase({ priceMultiplier, searchQuery, onSearchChange }: StoreHeaderProps) {
    return (
        <>
            {/* Header */}
            <div className="relative">
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary/[0.07] rounded-full blur-[100px] pointer-events-none" />
                <h1 className="text-3xl font-extrabold tracking-tight text-gradient-hero">
                    Peptide Collection
                </h1>
                <p className="text-muted-foreground/70 text-sm mt-1.5 font-medium">
                    Premium research compounds delivered to your door
                </p>
            </div>

            {/* Discount banner */}
            {priceMultiplier < 1 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] backdrop-blur-sm"
                >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
                        <Percent className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs text-emerald-300 leading-relaxed">
                        You're getting <strong className="text-emerald-200">{Math.round((1 - priceMultiplier) * 100)}% off</strong> retail on all products.
                    </p>
                </motion.div>
            )}

            {/* Search */}
            <div className="relative group">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/10 via-transparent to-primary/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl" />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
                <Input
                    aria-label="Search store"
                    placeholder="Search peptides..."
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-white/[0.04] border-white/[0.08] backdrop-blur-sm placeholder:text-muted-foreground/40"
                />
            </div>
        </>
    );
}

export const StoreHeader = memo(StoreHeaderBase);
