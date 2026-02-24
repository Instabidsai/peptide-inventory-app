import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ShoppingCart, ChevronDown } from 'lucide-react';

interface FloatingCartPillProps {
    itemCount: number;
    cartTotal: number;
    visible: boolean;
    onScrollToCart: () => void;
}

export function FloatingCartPill({ itemCount, cartTotal, visible, onScrollToCart }: FloatingCartPillProps) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="fixed bottom-20 left-4 right-4 z-30 max-w-lg mx-auto"
                >
                    <Button
                        className="w-full h-14 rounded-2xl shadow-2xl shadow-primary/30 text-base font-bold bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 border-0"
                        size="lg"
                        onClick={onScrollToCart}
                    >
                        <ShoppingCart className="h-5 w-5 mr-2.5" />
                        <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <span className="mx-3 h-5 w-px bg-white/20" />
                        <span>${cartTotal.toFixed(2)}</span>
                        <ChevronDown className="h-4 w-4 ml-2 opacity-60" />
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
