import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useCheckout } from '@/hooks/use-checkout';
import { useCreateSalesOrder } from '@/hooks/use-sales-orders';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShoppingCart,
    Package,
    Plus,
    Minus,
    CreditCard,
    Loader2,
    Search,
    Info,
    Percent,
    Shield,
    ChevronDown,
    X,
    Banknote,
    Smartphone,
    ExternalLink,
    Check,
    Copy,
    Heart,
    TrendingUp,
    Flame,
    Brain,
    Moon,
    Sparkles,
    LayoutGrid,
    Layers,
    Zap,
    Beaker,
    Dna,
} from 'lucide-react';
import { PROTOCOL_TEMPLATES, PROTOCOL_KNOWLEDGE, lookupKnowledge } from '@/data/protocol-knowledge';
import type { ProtocolTemplate } from '@/data/protocol-knowledge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

type PaymentMethod = 'card' | 'zelle' | 'cashapp' | 'venmo';

const ZELLE_EMAIL = 'admin@nextgenresearchlabs.com';
const VENMO_HANDLE = 'PureUSPeptide';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid,
};

// Short 2-3 sentence descriptions for product cards.
// Falls back to lookupKnowledge() descriptions, then DB description field.
const PEPTIDE_CARD_DESCRIPTIONS: Record<string, string> = {
    'BPC-157': 'A powerful healing peptide derived from gastric proteins that accelerates recovery of tendons, muscles, ligaments, and gut tissue. Promotes new blood vessel formation and reduces inflammation throughout the body.',
    'TB-500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'TB500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'Tesamorelin': 'A growth hormone-releasing analog clinically proven to reduce stubborn visceral abdominal fat. Elevates IGF-1 levels to improve body composition, skin quality, and overall metabolic health.',
    'Ipamorelin': 'A selective growth hormone secretagogue that boosts GH release without spiking cortisol or appetite. Supports lean muscle growth, fat loss, and improved sleep quality with minimal side effects.',
    'GHK-Cu': 'A naturally occurring copper peptide that stimulates collagen synthesis, wound healing, and skin regeneration. Potent anti-inflammatory and anti-aging properties make it ideal for skin rejuvenation and hair restoration.',
    'Retatrutide': 'A triple-action agonist targeting GLP-1, GIP, and glucagon receptors for powerful weight management. Suppresses appetite while boosting metabolism — one of the most effective weight loss peptides available.',
    'MOTS-C': 'A mitochondrial-derived peptide that enhances insulin sensitivity and exercise capacity at the cellular level. Combats age-related metabolic decline and supports fat oxidation during physical activity.',
    'NAD+': 'An essential coenzyme present in every cell that fuels energy production and DNA repair. Restoring NAD+ levels supports anti-aging pathways, cognitive function, and overall cellular vitality.',
    'Semax': 'A nootropic peptide derived from ACTH that enhances focus, memory, and cognitive performance. Promotes neurogenesis and provides neuroprotective benefits without stimulant-like side effects.',
    'Selank': 'An anti-anxiety peptide that improves mental clarity and emotional balance without sedation. Modulates immune function and neurotransmitter activity for calm, focused performance.',
    'DSIP': 'A neuropeptide that regulates the sleep-wake cycle by promoting deep, restorative delta-wave sleep. Helps normalize cortisol levels and supports recovery from physical and mental stress.',
    'Tirzepatide': 'A dual GLP-1/GIP receptor agonist delivering exceptional glucose control and weight loss results. Improves insulin sensitivity through complementary incretin pathways with once-weekly dosing.',
    'Semaglutide': 'A GLP-1 receptor agonist that significantly reduces appetite and promotes sustained weight loss. Slows gastric emptying and signals satiety to the brain for effective metabolic management.',
    'CJC-1295': 'A growth hormone-releasing hormone analog that provides sustained GH elevation mimicking natural pulses. Enhances recovery, body composition, and sleep quality without sharp hormonal spikes.',
    'PT-141': 'A melanocortin receptor agonist that enhances sexual desire and function through central nervous system pathways. Works on the brain to stimulate natural arousal — effective for both men and women.',
    'Epithalon': 'A telomerase-activating peptide that promotes cellular longevity by supporting telomere maintenance. Studied for anti-aging effects including improved sleep, immune function, and cellular resilience.',
    'Thymosin Alpha-1': 'A potent immune-modulating peptide that enhances T-cell function and strengthens the body\'s defense systems. Used to support immune health during chronic conditions and as an adjunct to recovery protocols.',
    'KPV': 'A tripeptide with powerful anti-inflammatory properties, especially for gut health and intestinal healing. Derived from alpha-MSH, it reduces inflammation and supports the integrity of the gut lining.',
    'Hexarelin': 'The most potent growth hormone-releasing peptide (GHRP), triggering significant GH release from the pituitary. Highly effective for body composition but requires cycling due to receptor adaptation.',
};

function getPeptideDescription(peptideName: string): string | null {
    // Check our curated short descriptions first (strip dosage for lookup)
    const baseName = peptideName.replace(/\s+\d+mg$/i, '');
    if (PEPTIDE_CARD_DESCRIPTIONS[baseName]) return PEPTIDE_CARD_DESCRIPTIONS[baseName];
    if (PEPTIDE_CARD_DESCRIPTIONS[peptideName]) return PEPTIDE_CARD_DESCRIPTIONS[peptideName];
    // Fall back to knowledge base
    const knowledge = lookupKnowledge(peptideName);
    if (knowledge?.description) return knowledge.description;
    return null;
}

interface CartItem {
    peptide_id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function ClientStore() {
    const { user } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const checkout = useCheckout();
    const createOrder = useCreateSalesOrder();
    const { toast } = useToast();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
    const [selectedPeptide, setSelectedPeptide] = useState<any>(null);
    const [selectedProtocol, setSelectedProtocol] = useState<{ template: ProtocolTemplate; matched: any[] } | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
    const [copiedZelle, setCopiedZelle] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const cartRef = React.useRef<HTMLDivElement>(null);

    // Auto-fill shipping address from contact profile
    useEffect(() => {
        if (contact && contact.address && !shippingAddress) {
            setShippingAddress(contact.address);
        }
    }, [contact]);

    // Get all active peptides
    const { data: peptides, isLoading, isError } = useQuery({
        queryKey: ['client_store_peptides'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('peptides')
                .select('*')
                .eq('active', true)
                .order('name');
            if (error) throw error;
            return data;
        },
    });

    // Get the assigned rep for this client (for commission tracking + pricing discount)
    const { data: assignedRep } = useQuery({
        queryKey: ['client_assigned_rep', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return null;
            // The contact's assigned_rep_id field links to a profile
            if (!contact.assigned_rep_id) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, commission_rate, price_multiplier, partner_tier, pricing_mode, cost_plus_markup')
                .eq('id', contact.assigned_rep_id)
                .single();
            return data;
        },
        enabled: !!contact?.id,
    });

    // Fetch avg lot costs for cost_plus pricing (only if rep uses cost_plus mode)
    const repPricingMode = assignedRep?.pricing_mode || 'percentage';
    const { data: lotCosts } = useQuery({
        queryKey: ['client_lot_costs'],
        queryFn: async () => {
            const { data: lots } = await supabase
                .from('lots')
                .select('peptide_id, cost_per_unit')
                .gt('cost_per_unit', 0);
            if (!lots) return {};
            const costMap: Record<string, { total: number; count: number }> = {};
            lots.forEach((l) => {
                const pid = l.peptide_id;
                if (!costMap[pid]) costMap[pid] = { total: 0, count: 0 };
                costMap[pid].total += Number(l.cost_per_unit);
                costMap[pid].count += 1;
            });
            const result: Record<string, number> = {};
            Object.entries(costMap).forEach(([pid, { total, count }]) => {
                result[pid] = total / count;
            });
            return result;
        },
        enabled: !!assignedRep && repPricingMode === 'cost_plus',
    });

    // Calculate client price: if rep assigned, apply rep's pricing model; otherwise retail
    const getClientPrice = (peptide: { id: string; retail_price?: number | null }): number => {
        const retail = Number(peptide.retail_price || 0);
        if (!assignedRep) return retail;

        const mode = assignedRep.pricing_mode || 'percentage';
        const multiplier = Number(assignedRep.price_multiplier) || 1.0;
        const markup = Number(assignedRep.cost_plus_markup) || 0;

        if (mode === 'cost_plus' && lotCosts) {
            const avgCost = lotCosts[peptide.id] || 0;
            if (avgCost > 0) {
                return Math.round((avgCost + markup) * 100) / 100;
            }
            // Fallback to percentage if no lot cost data
        }

        // percentage mode
        return Math.round(retail * multiplier * 100) / 100;
    };

    const addToCart = (peptide: { id: string; name: string; retail_price?: number | null }) => {
        const price = getClientPrice(peptide);
        setCart(prev => {
            const existing = prev.find(i => i.peptide_id === peptide.id);
            if (existing) {
                return prev.map(i =>
                    i.peptide_id === peptide.id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i
                );
            }
            return [...prev, {
                peptide_id: peptide.id,
                name: peptide.name,
                price,
                quantity: 1,
            }];
        });
    };

    const updateQuantity = (peptideId: string, delta: number) => {
        setCart(prev =>
            prev.map(i => {
                if (i.peptide_id !== peptideId) return i;
                const newQty = Math.max(0, i.quantity + delta);
                return { ...i, quantity: newQty };
            }).filter(i => i.quantity > 0)
        );
    };

    const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

    // Filter peptides by search query
    const filteredPeptides = peptides?.filter((p) => {
        if (!searchQuery) return true;
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const copyZelleEmail = () => {
        navigator.clipboard.writeText(ZELLE_EMAIL);
        setCopiedZelle(true);
        setTimeout(() => setCopiedZelle(false), 2000);
    };

    // Card checkout — PsiFi payment redirect
    const handleCardCheckout = async () => {
        if (!user?.id) return;
        if (cart.length === 0) return;

        const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, org_id')
            .eq('user_id', user.id)
            .single();

        if (!userProfile) return;
        const orgId = userProfile.org_id;
        if (!orgId) return;

        const repId = assignedRep ? assignedRep.id : null;

        checkout.mutate({
            org_id: orgId,
            client_id: contact?.id || null,
            rep_id: repId,
            total_amount: cartTotal,
            shipping_address: shippingAddress || undefined,
            notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}.\n${notes}`,
            items: cart.map(i => ({
                peptide_id: i.peptide_id,
                name: i.name,
                quantity: i.quantity,
                unit_price: i.price,
            })),
        });
    };

    // Non-card checkout — creates order as awaiting payment
    const handleAlternativeCheckout = async () => {
        if (!contact?.id || cart.length === 0) return;
        setPlacingOrder(true);

        const methodLabel = paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo';

        try {
            await createOrder.mutateAsync({
                client_id: contact.id,
                items: cart.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                    unit_price: i.price,
                })),
                shipping_address: shippingAddress || undefined,
                notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}. Payment via ${methodLabel}.\n${notes}`,
                payment_method: paymentMethod,
            });
            setOrderPlaced(true);
            setCart([]);
            setNotes('');
            toast({ title: 'Order placed!', description: `Send $${cartTotal.toFixed(2)} via ${methodLabel} to complete your order.` });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Order failed', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setPlacingOrder(false);
        }
    };

    const handleCheckout = () => {
        if (paymentMethod === 'card') {
            handleCardCheckout();
        } else {
            handleAlternativeCheckout();
        }
    };

    if (isLoadingContact) {
        return (
            <div className="space-y-6 pb-20">
                <div>
                    <Skeleton className="h-7 w-40 mb-2" />
                    <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="h-10 w-full rounded-md" />
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <GlassCard key={i}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-3 w-16" />
                                        <Skeleton className="h-6 w-20 mt-1" />
                                    </div>
                                    <Skeleton className="h-9 w-16 rounded-md" />
                                </div>
                            </CardContent>
                        </GlassCard>
                    ))}
                </div>
            </div>
        );
    }

    // Category gradient config — with hover glow colors
    const CATEGORY_STYLES: Record<string, { gradient: string; glow: string; hoverGlow: string; iconBg: string; borderHover: string }> = {
        healing: { gradient: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(244,63,94,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600', borderHover: 'hover:border-rose-500/25' },
        gh_stack: { gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(139,92,246,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600', borderHover: 'hover:border-violet-500/25' },
        weight_loss: { gradient: 'from-orange-500 to-amber-600', glow: 'shadow-orange-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(249,115,22,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-orange-400 to-amber-600', borderHover: 'hover:border-orange-500/25' },
        cognitive: { gradient: 'from-cyan-500 to-blue-600', glow: 'shadow-cyan-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(6,182,212,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-cyan-400 to-blue-600', borderHover: 'hover:border-cyan-500/25' },
        sleep: { gradient: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-indigo-400 to-violet-600', borderHover: 'hover:border-indigo-500/25' },
        anti_aging: { gradient: 'from-fuchsia-500 to-amber-400', glow: 'shadow-fuchsia-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(217,70,239,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-fuchsia-400 to-amber-400', borderHover: 'hover:border-fuchsia-500/25' },
    };

    return (
        <div className="space-y-8 pb-24">
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

            {/* Partner discount banner */}
            {assignedRep && Number(assignedRep.price_multiplier || 1) < 1 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] backdrop-blur-sm"
                >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
                        <Percent className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs text-emerald-300 leading-relaxed">
                        Partner pricing active — you're getting <strong className="text-emerald-200">{Math.round((1 - Number(assignedRep.price_multiplier)) * 100)}% off</strong> retail on all products.
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
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-white/[0.04] border-white/[0.08] backdrop-blur-sm placeholder:text-muted-foreground/40"
                />
            </div>

            {/* Protocol Bundles */}
            {!searchQuery && peptides && peptides.length > 0 && (
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
                                            onClick={() => setSelectedProtocol({ template, matched: matchedPeptides })}
                                        >
                                            {/* Gradient accent bar at top — thicker, more visible */}
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
                                                        <span className="text-2xl font-extrabold text-gradient-primary">${bundlePrice.toFixed(2)}</span>
                                                        <p className="text-[10px] text-muted-foreground/40 mt-0.5">{uniqueMatched.length} peptide{uniqueMatched.length !== 1 ? 's' : ''}</p>
                                                    </div>
                                                    {allInCart ? (
                                                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                                                            <Check className="h-4 w-4" />
                                                            In Cart
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            className="rounded-xl px-5 h-10 font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all hover:scale-[1.02]"
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
            )}

            {/* Product Grid */}
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
                            const hasDiscount = assignedRep && price < retail;
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
                                    onClick={() => setSelectedPeptide(peptide)}
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

                                        {/* Description — the 2-3 sentence write-up */}
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
                                                <div className="flex items-baseline gap-2">
                                                    <p className="text-2xl font-extrabold text-gradient-primary">
                                                        ${price.toFixed(2)}
                                                    </p>
                                                    {hasDiscount && (
                                                        <span className="text-xs text-muted-foreground/40 line-through">
                                                            ${retail.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                                {hasDiscount && (
                                                    <span className="inline-block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                                                        Save {Math.round((1 - price / retail) * 100)}%
                                                    </span>
                                                )}
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
                                                        className="rounded-xl px-5 h-10 font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.03] transition-all"
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

            {/* Cart Summary — Fixed Bottom Card */}
            <AnimatePresence>
            {cart.length > 0 && (
                <motion.div
                    ref={cartRef}
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 24, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                <GlassCard className="border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden">
                    {/* Gradient accent at top */}
                    <div className="h-[2px] bg-gradient-to-r from-primary via-emerald-300 to-cyan-400" />
                    <CardHeader className="pb-2 pt-5">
                        <CardTitle className="flex items-center gap-3 text-lg">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-lg shadow-primary/20">
                                <ShoppingCart className="h-4 w-4 text-white" />
                            </div>
                            Your Order
                        </CardTitle>
                        <CardDescription className="ml-12">
                            {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Cart items compact list */}
                        <div className="space-y-2">
                            {cart.map(item => (
                                <div key={item.peptide_id} className="flex items-center justify-between text-sm">
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate font-medium">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            ${item.price.toFixed(2)} × {item.quantity}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => updateQuantity(item.peptide_id, -1)}
                                            aria-label={`Decrease quantity of ${item.name}`}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => updateQuantity(item.peptide_id, 1)}
                                            aria-label={`Increase quantity of ${item.name}`}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="font-semibold w-16 text-right">
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="border-t pt-3 flex justify-between items-center">
                            <span className="text-muted-foreground">Total</span>
                            <span className="text-xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                        </div>

                        {/* Shipping */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Shipping Address</label>
                            <Textarea
                                placeholder="Enter your shipping address..."
                                value={shippingAddress}
                                onChange={e => setShippingAddress(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Notes (optional)</label>
                            <Input
                                placeholder="Any special instructions..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Payment Method Selection */}
                        {!orderPlaced ? (
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Payment Method</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
                                        { id: 'zelle' as PaymentMethod, label: 'Zelle', icon: Banknote },
                                        { id: 'cashapp' as PaymentMethod, label: 'Cash App', icon: Smartphone },
                                        { id: 'venmo' as PaymentMethod, label: 'Venmo', icon: Smartphone },
                                    ]).map(m => (
                                        <Button
                                            key={m.id}
                                            variant={paymentMethod === m.id ? 'default' : 'outline'}
                                            size="sm"
                                            className="justify-start"
                                            onClick={() => setPaymentMethod(m.id)}
                                        >
                                            <m.icon className="h-4 w-4 mr-2" />
                                            {m.label}
                                        </Button>
                                    ))}
                                </div>

                                {/* Zelle info */}
                                {paymentMethod === 'zelle' && (
                                    <div className="bg-purple-950/30 border border-purple-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-purple-300">Send payment via Zelle to:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-sm font-mono bg-background rounded px-2 py-1 border truncate">
                                                {ZELLE_EMAIL}
                                            </code>
                                            <Button variant="outline" size="sm" onClick={copyZelleEmail} className="shrink-0" aria-label="Copy Zelle email">
                                                {copiedZelle ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via your bank's Zelle. We'll confirm when received.
                                        </p>
                                    </div>
                                )}

                                {/* Cash App info */}
                                {paymentMethod === 'cashapp' && (
                                    <div className="bg-green-950/30 border border-green-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-green-300">Pay via Cash App</p>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via Cash App. We'll confirm when received.
                                        </p>
                                    </div>
                                )}

                                {/* Venmo info */}
                                {paymentMethod === 'venmo' && (
                                    <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-blue-300">Pay via Venmo to @{VENMO_HANDLE}</p>
                                        <a
                                            href={`https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Open Venmo — ${cartTotal.toFixed(2)}
                                        </a>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via the link above or search @{VENMO_HANDLE} in Venmo.
                                        </p>
                                    </div>
                                )}

                                <Button
                                    className="w-full shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                                    size="lg"
                                    onClick={() => {
                                        if (paymentMethod === 'card') {
                                            setShowCheckoutConfirm(true);
                                        } else {
                                            handleCheckout();
                                        }
                                    }}
                                    disabled={checkout.isPending || placingOrder || cart.length === 0}
                                >
                                    {(checkout.isPending || placingOrder) ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : paymentMethod === 'card' ? (
                                        <CreditCard className="h-4 w-4 mr-2" />
                                    ) : (
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                    )}
                                    {paymentMethod === 'card'
                                        ? `Pay with Card — $${cartTotal.toFixed(2)}`
                                        : `Place Order — $${cartTotal.toFixed(2)}`
                                    }
                                </Button>
                            </div>
                        ) : (
                            /* Order placed confirmation (non-card) */
                            <div className="text-center space-y-3 py-4">
                                <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                                    <Check className="h-6 w-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="font-semibold text-emerald-400">Order Placed!</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Send <strong>${cartTotal.toFixed(2)}</strong> via{' '}
                                        {paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo'}
                                        {paymentMethod === 'zelle' && (
                                            <> to <strong>{ZELLE_EMAIL}</strong></>
                                        )}
                                        {paymentMethod === 'venmo' && (
                                            <> to <strong>@{VENMO_HANDLE}</strong></>
                                        )}
                                    </p>
                                </div>
                                {paymentMethod === 'zelle' && (
                                    <Button variant="outline" size="sm" onClick={copyZelleEmail}>
                                        {copiedZelle ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                        Copy Zelle Email
                                    </Button>
                                )}
                                {paymentMethod === 'venmo' && (
                                    <a
                                        href={`https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <Button variant="outline" size="sm">
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            Open Venmo to Pay
                                        </Button>
                                    </a>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setOrderPlaced(false);
                                        setPaymentMethod('card');
                                    }}
                                >
                                    Start New Order
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </GlassCard>
                </motion.div>
            )}
            </AnimatePresence>

            {/* Info card */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                <div className="h-7 w-7 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
                <p className="text-xs text-muted-foreground/40 leading-relaxed">
                    You'll be redirected to our secure payment processor to complete your order.
                    Once payment is confirmed, your order will be processed and shipped.
                </p>
            </div>

            {/* Checkout confirmation dialog */}
            <AlertDialog open={showCheckoutConfirm} onOpenChange={setShowCheckoutConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            You're about to checkout with {itemCount} item{itemCount !== 1 ? 's' : ''} for <span className="font-semibold text-foreground">${cartTotal.toFixed(2)}</span>. You'll be redirected to our secure payment page.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCheckout}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            Proceed to Payment
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Floating cart pill — fixed bottom */}
            <AnimatePresence>
                {cart.length > 0 && (
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
                            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
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

            {/* Protocol detail Sheet */}
            <Sheet open={!!selectedProtocol} onOpenChange={(open) => { if (!open) setSelectedProtocol(null); }}>
                <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto border-t border-white/[0.1]">
                    {selectedProtocol && (() => {
                        const { template, matched } = selectedProtocol;
                        const Icon = ICON_MAP[template.icon] || Package;
                        const catStyle = CATEGORY_STYLES[template.category] || CATEGORY_STYLES.healing;
                        const bundlePrice = matched.reduce((sum: number, p: any) => sum + getClientPrice(p), 0);
                        const uniqueMatched = [...new Map(matched.map((p: any) => [p.id, p])).values()] as any[];
                        const qtyMap: Record<string, number> = {};
                        matched.forEach((p: any) => { qtyMap[p.id] = (qtyMap[p.id] || 0) + 1; });
                        const allInCart = uniqueMatched.length > 0 && uniqueMatched.every((p: any) => {
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
                                        {uniqueMatched.map((p: any, idx: number) => {
                                            const qty = qtyMap[p.id] || 1;
                                            const price = getClientPrice(p) * qty;
                                            const knowledge = lookupKnowledge(p.name);
                                            return (
                                                <motion.div
                                                    key={p.id}
                                                    initial={{ opacity: 0, x: -12 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: idx * 0.08, duration: 0.3 }}
                                                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors space-y-2.5"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {qty > 1 && (
                                                                <span className="text-[10px] font-bold bg-white/[0.08] px-2 py-0.5 rounded-full">{qty}x</span>
                                                            )}
                                                            <p className="font-bold text-sm">{p.name}</p>
                                                        </div>
                                                        <span className="text-sm font-extrabold text-gradient-primary">${price.toFixed(2)}</span>
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
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-muted-foreground/50 font-medium">
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
                                    <div className="border-t border-white/[0.06] pt-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground/60 text-sm font-medium">Bundle Total</span>
                                            <span className="text-3xl font-extrabold text-gradient-primary">${bundlePrice.toFixed(2)}</span>
                                        </div>
                                        {allInCart ? (
                                            <div className="flex items-center justify-center gap-2.5 py-4 text-emerald-400 font-semibold bg-emerald-500/[0.08] rounded-2xl border border-emerald-500/20">
                                                <Check className="h-5 w-5" />
                                                All items in cart
                                            </div>
                                        ) : (
                                            <Button
                                                size="lg"
                                                className="w-full h-14 rounded-2xl text-base font-bold shadow-xl shadow-primary/25 bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 border-0"
                                                onClick={() => {
                                                    matched.forEach((p: any) => addToCart(p));
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

            {/* Product detail Sheet */}
            <Sheet open={!!selectedPeptide} onOpenChange={(open) => { if (!open) setSelectedPeptide(null); }}>
                <SheetContent side="bottom" className="rounded-t-3xl max-h-[75vh] overflow-y-auto border-t border-white/[0.1]">
                    {selectedPeptide && (() => {
                        const price = getClientPrice(selectedPeptide);
                        const retail = Number(selectedPeptide.retail_price || 0);
                        const hasDiscount = assignedRep && price < retail;
                        const inCart = cart.find(i => i.peptide_id === selectedPeptide.id);
                        const detailDesc = getPeptideDescription(selectedPeptide.name) || selectedPeptide.description;
                        const detailKnowledge = lookupKnowledge(selectedPeptide.name);

                        return (
                            <>
                                <div className="h-1 rounded-full mx-auto w-12 bg-gradient-to-r from-primary to-emerald-400 opacity-60 mb-5 -mt-1" />
                                <SheetHeader className="pb-5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] text-emerald-400/80 font-semibold uppercase tracking-[0.15em]">Research Grade</span>
                                        {detailKnowledge?.administrationRoute && (
                                            <>
                                                <span className="text-white/10">|</span>
                                                <span className="text-[10px] text-muted-foreground/50 font-medium capitalize">{detailKnowledge.administrationRoute}</span>
                                            </>
                                        )}
                                    </div>
                                    <SheetTitle className="text-2xl font-extrabold tracking-tight text-left">
                                        {selectedPeptide.name}
                                    </SheetTitle>
                                </SheetHeader>

                                <div className="space-y-5 pb-8">
                                    {detailDesc && (
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            {detailDesc}
                                        </p>
                                    )}

                                    {/* Dosing quick-reference */}
                                    {detailKnowledge && (
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 border border-primary/15 text-primary/70 font-semibold">
                                                {detailKnowledge.defaultDoseAmount} {detailKnowledge.defaultDoseUnit}
                                            </span>
                                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                                {detailKnowledge.defaultFrequency}
                                            </span>
                                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                                {detailKnowledge.defaultTiming}
                                            </span>
                                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium capitalize">
                                                {detailKnowledge.administrationRoute}
                                            </span>
                                            {detailKnowledge.vialSizeMg && (
                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-muted-foreground/50 font-medium">
                                                    {detailKnowledge.vialSizeMg}mg vial
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Price */}
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-4xl font-extrabold text-gradient-primary">${price.toFixed(2)}</span>
                                        {hasDiscount && (
                                            <span className="text-lg text-muted-foreground/40 line-through">${retail.toFixed(2)}</span>
                                        )}
                                        {hasDiscount && (
                                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                                Save {Math.round((1 - price / retail) * 100)}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Quantity + Add to cart */}
                                    {inCart ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-12 w-12 rounded-xl border-white/[0.1]"
                                                    onClick={() => updateQuantity(selectedPeptide.id, -1)}
                                                >
                                                    <Minus className="h-5 w-5" />
                                                </Button>
                                                <span className="text-3xl font-extrabold w-14 text-center">{inCart.quantity}</span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-12 w-12 rounded-xl border-white/[0.1]"
                                                    onClick={() => updateQuantity(selectedPeptide.id, 1)}
                                                >
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

                                    {/* Storage info */}
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
        </div>
    );
}
