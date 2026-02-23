import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useValidatedCheckout } from '@/hooks/use-checkout';
import { useCreateValidatedOrder } from '@/hooks/use-sales-orders';
import { useToast } from '@/hooks/use-toast';
import { useTenantConfig } from '@/hooks/use-tenant-config';
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
    AlertTriangle,
    Pill,
    Users,
    ChevronRight,
    Syringe,
    Clock,
    Repeat,
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

// Zelle + Venmo loaded from tenant config in component

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid,
};

// Short 2-3 sentence descriptions for every product card.
// Falls back to lookupKnowledge() descriptions, then DB description field.
const PEPTIDE_CARD_DESCRIPTIONS: Record<string, string> = {
    // ── Healing & Recovery ─────────────────────────────
    'BPC-157': 'A powerful healing peptide derived from gastric proteins that accelerates recovery of tendons, muscles, ligaments, and gut tissue. Promotes new blood vessel formation and reduces inflammation throughout the body.',
    'TB-500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'TB500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'BPC/TB500 Blend': 'A synergistic combination of BPC-157 and TB-500 in a single vial for maximum tissue repair. Combines gut-derived healing with cell-migration technology for comprehensive recovery support.',
    'Pentadecapeptide BPC-157 (Oral)': 'An oral formulation of BPC-157 designed for systemic healing benefits when taken by mouth. Particularly effective for gut healing, reducing intestinal inflammation, and supporting digestive health.',

    // ── Weight Loss & Metabolic ────────────────────────
    'Retatrutide': 'A triple-action agonist targeting GLP-1, GIP, and glucagon receptors for powerful weight management. Suppresses appetite while boosting metabolism — one of the most effective weight loss peptides available.',
    'Tirzepatide': 'A dual GLP-1/GIP receptor agonist delivering exceptional glucose control and weight loss results. Improves insulin sensitivity through complementary incretin pathways with once-weekly dosing.',
    'Semaglutide': 'A GLP-1 receptor agonist that significantly reduces appetite and promotes sustained weight loss. Slows gastric emptying and signals satiety to the brain for effective metabolic management.',
    'Cagriniltide': 'A long-acting amylin analog that works alongside GLP-1 agonists to enhance weight loss outcomes. Reduces appetite by mimicking the satiety hormone amylin, supporting sustained metabolic improvement.',
    'MOTS-C': 'A mitochondrial-derived peptide that enhances insulin sensitivity and exercise capacity at the cellular level. Combats age-related metabolic decline and supports fat oxidation during physical activity.',
    'AOD-9604': 'A modified fragment of human growth hormone specifically designed to stimulate fat breakdown without affecting blood sugar. Targets stubborn fat deposits while preserving lean muscle mass.',
    '5-Amino 1MQ': 'A small molecule that inhibits the NNMT enzyme to boost cellular energy expenditure and fat metabolism. Supports healthy body composition by reversing metabolic slowdown at the cellular level.',

    // ── Growth Hormone & Body Composition ──────────────
    'Tesamorelin': 'A growth hormone-releasing analog clinically proven to reduce stubborn visceral abdominal fat. Elevates IGF-1 levels to improve body composition, skin quality, and overall metabolic health.',
    'Ipamorelin': 'A selective growth hormone secretagogue that boosts GH release without spiking cortisol or appetite. Supports lean muscle growth, fat loss, and improved sleep quality with minimal side effects.',
    'Sermorelin': 'A bioidentical growth hormone-releasing hormone that stimulates your pituitary to produce GH naturally. Supports anti-aging, improved sleep, lean muscle, and recovery with a strong safety profile.',
    'CJC-1295': 'A growth hormone-releasing hormone analog that provides sustained GH elevation mimicking natural pulses. Enhances recovery, body composition, and sleep quality without sharp hormonal spikes.',
    'CJC (no DAC)': 'The short-acting version of CJC-1295 (Modified GRF 1-29) with a 30-minute half-life that mimics natural GH pulses. Often paired with Ipamorelin for a synergistic growth hormone boost.',
    'CJC (no DAC)/Ipamorelin': 'A pre-blended combination of CJC-1295 (no DAC) and Ipamorelin for convenient GH optimization. Delivers synergistic growth hormone release in a single injection for improved recovery and body composition.',
    'Tesamorelin/Ipamorelin Blnd': 'A powerful pre-mixed blend combining Tesamorelin\'s fat-reducing properties with Ipamorelin\'s clean GH release. Targets visceral fat while supporting lean muscle and sleep quality.',
    'Hexarelin': 'The most potent growth hormone-releasing peptide (GHRP), triggering significant GH release from the pituitary. Highly effective for body composition but requires cycling due to receptor adaptation.',

    // ── Skin, Hair & Anti-Aging ────────────────────────
    'GHK-Cu': 'A naturally occurring copper peptide that stimulates collagen synthesis, wound healing, and skin regeneration. Potent anti-inflammatory and anti-aging properties make it ideal for skin rejuvenation and hair restoration.',
    'GHK-CU': 'A naturally occurring copper peptide that stimulates collagen synthesis, wound healing, and skin regeneration. Potent anti-inflammatory and anti-aging properties make it ideal for skin rejuvenation and hair restoration.',
    'Melanotan 2': 'A melanocortin receptor agonist that stimulates melanin production for enhanced skin pigmentation. Also supports libido and fat loss through central nervous system pathways.',
    'Epithalon': 'A telomerase-activating peptide that promotes cellular longevity by supporting telomere maintenance. Studied for anti-aging effects including improved sleep, immune function, and cellular resilience.',
    'FOXO4': 'A cell-targeting peptide that selectively clears senescent "zombie" cells to promote tissue rejuvenation. Supports the body\'s natural repair processes by removing damaged cells that accelerate aging.',

    // ── Cognitive & Mental Health ──────────────────────
    'Semax': 'A nootropic peptide derived from ACTH that enhances focus, memory, and cognitive performance. Promotes neurogenesis and provides neuroprotective benefits without stimulant-like side effects.',
    'Selank': 'An anti-anxiety peptide that improves mental clarity and emotional balance without sedation. Modulates immune function and neurotransmitter activity for calm, focused performance.',
    'DSIP': 'A neuropeptide that regulates the sleep-wake cycle by promoting deep, restorative delta-wave sleep. Helps normalize cortisol levels and supports recovery from physical and mental stress.',
    'Oxytocin': 'Known as the "bonding hormone," this neuropeptide supports social connection, emotional well-being, and stress reduction. Also studied for its role in wound healing and anti-inflammatory effects.',

    // ── Immune & Cellular Health ───────────────────────
    'NAD+': 'An essential coenzyme present in every cell that fuels energy production and DNA repair. Restoring NAD+ levels supports anti-aging pathways, cognitive function, and overall cellular vitality.',
    'Thymosin Alpha-1': 'A potent immune-modulating peptide that enhances T-cell function and strengthens the body\'s defense systems. Used to support immune health during chronic conditions and as an adjunct to recovery protocols.',
    'Thy Alpha 1': 'A potent immune-modulating peptide that enhances T-cell function and strengthens the body\'s defense systems. Used to support immune health during chronic conditions and as an adjunct to recovery protocols.',
    'KPV': 'A tripeptide with powerful anti-inflammatory properties, especially for gut health and intestinal healing. Derived from alpha-MSH, it reduces inflammation and supports the integrity of the gut lining.',
    'Glutathione': 'The body\'s master antioxidant, essential for detoxification, immune defense, and cellular protection. Supports liver health, skin brightness, and recovery from oxidative stress.',
    'LL-37': 'A naturally occurring antimicrobial peptide that provides broad-spectrum defense against bacteria, viruses, and fungi. Supports wound healing and modulates the immune response to fight infections.',
    'SS-31': 'A mitochondria-targeted peptide that protects cellular energy production and reduces oxidative damage. Supports cardiovascular health, exercise performance, and age-related cellular decline.',
    'ARA-290': 'An innate repair receptor agonist that promotes tissue healing and reduces neuropathic pain. Supports nerve regeneration and has shown promise in metabolic and inflammatory conditions.',

    // ── Sexual Function & Hormonal ─────────────────────
    'PT-141': 'A melanocortin receptor agonist that enhances sexual desire and function through central nervous system pathways. Works on the brain to stimulate natural arousal — effective for both men and women.',
    'Kisspeptin': 'A neuropeptide that naturally stimulates GnRH release to support healthy testosterone and reproductive hormone levels. Plays a key role in puberty, fertility, and hormonal balance.',
    'TRT': 'Testosterone replacement therapy for optimizing male hormone levels, supporting muscle growth, energy, and vitality. Available by prescription — consult with your provider for proper dosing and monitoring.',

    // ── Specialty ──────────────────────────────────────
    'VIP': 'Vasoactive intestinal peptide that supports gut health, immune regulation, and respiratory function. Has neuroprotective properties and helps modulate inflammation throughout the body.',
};

function getPeptideDescription(peptideName: string): string | null {
    // Check our curated short descriptions first (strip dosage for lookup)
    const baseName = peptideName.replace(/\s+\d+mg(\/\d+mg)?$/i, '');
    if (PEPTIDE_CARD_DESCRIPTIONS[baseName]) return PEPTIDE_CARD_DESCRIPTIONS[baseName];
    if (PEPTIDE_CARD_DESCRIPTIONS[peptideName]) return PEPTIDE_CARD_DESCRIPTIONS[peptideName];
    // Try partial match (for blends like "BPC/TB500 Blend 5mg/5mg" → "BPC/TB500 Blend")
    for (const [key, desc] of Object.entries(PEPTIDE_CARD_DESCRIPTIONS)) {
        if (peptideName.toLowerCase().startsWith(key.toLowerCase())) return desc;
    }
    // Fall back to knowledge base
    const knowledge = lookupKnowledge(peptideName);
    if (knowledge?.description) return knowledge.description;
    return null;
}

// Visibility check: peptides with visible_to_user_ids set are restricted
// to those specific users (by profile.id) + admins. Null/empty = visible to all.
function canSeePeptide(peptide: { visible_to_user_ids?: string[] | null }, profileId?: string, role?: string): boolean {
    if (role === 'admin') return true;
    if (!peptide.visible_to_user_ids || peptide.visible_to_user_ids.length === 0) return true;
    return !!profileId && peptide.visible_to_user_ids.includes(profileId);
}

// Find protocol templates that include a given peptide, and return the other peptides in those stacks
function getRelatedStacks(peptideName: string, allPeptides: any[]): { templateName: string; category: string; icon: string; otherPeptides: string[] }[] {
    const baseName = peptideName.replace(/\s+\d+mg(\/\d+mg)?$/i, '').toLowerCase();
    const stacks: { templateName: string; category: string; icon: string; otherPeptides: string[] }[] = [];
    for (const template of PROTOCOL_TEMPLATES) {
        if (template.category === 'full') continue; // skip the mega-protocol
        if (template.defaultTierId) continue; // skip variant templates
        const matchIdx = template.peptideNames.findIndex(n => n.toLowerCase().startsWith(baseName) || baseName.startsWith(n.toLowerCase()));
        if (matchIdx === -1) continue;
        const others = [...new Set(template.peptideNames.filter((_, i) => i !== matchIdx))];
        // Map template names back to display names from allPeptides
        const otherDisplayNames = others.map(n => {
            const match = allPeptides?.find((p: any) => p.name?.toLowerCase().startsWith(n.toLowerCase()));
            return match?.name || n;
        });
        stacks.push({ templateName: template.name, category: template.category, icon: template.icon, otherPeptides: otherDisplayNames });
    }
    return stacks;
}

interface CartItem {
    peptide_id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function ClientStore() {
    const { user, userRole, profile: authProfile } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const checkout = useValidatedCheckout();
    const createOrder = useCreateValidatedOrder();
    const { toast } = useToast();
    const { zelle_email: ZELLE_EMAIL, venmo_handle: VENMO_HANDLE } = useTenantConfig();
    const navigate = useNavigate();
    const [cart, setCart] = useState<CartItem[]>(() => {
        try {
            const saved = localStorage.getItem('peptide_cart');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
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
    const [searchParams, setSearchParams] = useSearchParams();

    const MAX_ITEM_QTY = 10;

    // Persist cart to localStorage
    useEffect(() => {
        localStorage.setItem('peptide_cart', JSON.stringify(cart));
    }, [cart]);

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

    // Determine pricing profile: partners use their OWN profile settings,
    // customers use their own price_multiplier. assignedRep is for commission tracking only.
    const isPartner = contact?.type === 'partner';
    const pricingProfile = isPartner ? authProfile : assignedRep;
    const pricingMode = pricingProfile?.pricing_mode || 'percentage';

    // Fetch avg lot costs for cost-based pricing (cost_plus or cost_multiplier)
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
        enabled: isPartner && (pricingMode === 'cost_plus' || pricingMode === 'cost_multiplier'),
    });

    // Calculate client price:
    // - Customers: retail × their own price_multiplier (e.g. 0.80 = 20% off)
    // - Partners: use their OWN profile's pricing_mode / cost_plus_markup / price_multiplier
    const getClientPrice = (peptide: { id: string; retail_price?: number | null }): number => {
        const retail = Number(peptide.retail_price || 0);

        if (!isPartner) {
            const customerMultiplier = Number(authProfile?.price_multiplier) || 1.0;
            return Math.round(retail * customerMultiplier * 100) / 100;
        }

        // Partner pricing — from their OWN profile
        const mode = pricingProfile?.pricing_mode || 'percentage';
        const multiplier = Number(pricingProfile?.price_multiplier) || 1.0;
        const markup = Number(pricingProfile?.cost_plus_markup) || 0;

        if (mode === 'cost_plus' && lotCosts) {
            const avgCost = lotCosts[peptide.id] || 0;
            if (avgCost > 0) {
                return Math.round((avgCost + markup) * 100) / 100;
            }
        }

        if (mode === 'cost_multiplier' && lotCosts) {
            const avgCost = lotCosts[peptide.id] || 0;
            if (avgCost > 0) {
                return Math.round(avgCost * markup * 100) / 100;
            }
        }

        // percentage mode (fallback)
        return Math.round(retail * multiplier * 100) / 100;
    };

    const addToCart = (peptide: { id: string; name: string; retail_price?: number | null }) => {
        const price = getClientPrice(peptide);
        setCart(prev => {
            const existing = prev.find(i => i.peptide_id === peptide.id);
            if (existing) {
                if (existing.quantity >= MAX_ITEM_QTY) {
                    toast({ title: 'Quantity limit reached', description: `Maximum ${MAX_ITEM_QTY} per item.` });
                    return prev;
                }
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
                const newQty = Math.min(MAX_ITEM_QTY, Math.max(0, i.quantity + delta));
                return { ...i, quantity: newQty };
            }).filter(i => i.quantity > 0)
        );
    };

    const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

    // Pre-fill cart from ?reorder= URL param (e.g. from SupplyOverview or SimpleVials)
    useEffect(() => {
        const reorderParam = searchParams.get('reorder');
        if (!reorderParam || !peptides?.length) return;
        try {
            const items: { peptide_name?: string; peptide_id?: string; quantity?: number }[] =
                JSON.parse(decodeURIComponent(reorderParam));
            const added: string[] = [];
            for (const item of items) {
                const product = peptides.find((p: any) =>
                    p.id === item.peptide_id ||
                    (item.peptide_name && p.name?.toLowerCase().includes(item.peptide_name.toLowerCase()))
                );
                if (product) {
                    addToCart(product);
                    added.push(product.name);
                }
            }
            if (added.length) {
                toast({ title: 'Reorder items added', description: `${added.join(', ')} added to your cart.` });
            }
            // Clear the param so it doesn't re-trigger
            setSearchParams({}, { replace: true });
        } catch { /* ignore malformed param */ }
    }, [searchParams, peptides]);

    // Filter peptides by search query + visibility restrictions
    const filteredPeptides = peptides?.filter((p) => {
        if (!canSeePeptide(p, authProfile?.id, userRole?.role)) return false;
        if (!searchQuery) return true;
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const copyZelleEmail = () => {
        navigator.clipboard.writeText(ZELLE_EMAIL);
        setCopiedZelle(true);
        setTimeout(() => setCopiedZelle(false), 2000);
    };

    // Card checkout — validated server-side pricing + PsiFi payment redirect
    const handleCardCheckout = async () => {
        if (!user?.id) return;
        if (cart.length === 0) return;
        if (!shippingAddress.trim()) {
            toast({ variant: 'destructive', title: 'Shipping address required', description: 'Please enter a shipping address before checking out.' });
            return;
        }

        // Clear saved cart before redirect — user will see CheckoutSuccess on return
        localStorage.removeItem('peptide_cart');

        checkout.mutate({
            items: cart.map(i => ({
                peptide_id: i.peptide_id,
                quantity: i.quantity,
            })),
            shipping_address: shippingAddress || undefined,
            notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}.\n${notes}`,
        });
    };

    // Non-card checkout — server-validated pricing, creates order as awaiting payment
    const handleAlternativeCheckout = async () => {
        if (!contact?.id || cart.length === 0) return;
        if (!shippingAddress.trim()) {
            toast({ variant: 'destructive', title: 'Shipping address required', description: 'Please enter a shipping address before placing your order.' });
            return;
        }
        setPlacingOrder(true);

        const methodLabel = paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo';

        try {
            const result = await createOrder.mutateAsync({
                items: cart.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                })),
                shipping_address: shippingAddress || undefined,
                notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}. Payment via ${methodLabel}.\n${notes}`,
                payment_method: paymentMethod,
            });
            setOrderPlaced(true);
            setCart([]);
            setNotes('');
            toast({ title: 'Order placed!', description: `Send $${result.total_amount.toFixed(2)} via ${methodLabel} to complete your order.` });
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

            {/* Discount banner */}
            {Number(authProfile?.price_multiplier || 1) < 1 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] backdrop-blur-sm"
                >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
                        <Percent className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-xs text-emerald-300 leading-relaxed">
                        You're getting <strong className="text-emerald-200">{Math.round((1 - Number(authProfile?.price_multiplier)) * 100)}% off</strong> retail on all products.
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
                            const hasDiscount = price < retail;
                            const discountPct = hasDiscount ? Math.round((1 - price / retail) * 100) : 0;
                            // Determine discount label based on pricing mode
                            const isCustomer = !isPartner;
                            const discountLabel = hasDiscount
                                ? isCustomer
                                    ? 'Friends & Family'
                                    : pricingMode === 'cost_plus'
                                        ? 'Preferred Pricing'
                                        : null // cost_multiplier or percentage — just show "X% off"
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
                            <label className="text-sm font-semibold">Shipping Address</label>
                            <Textarea
                                placeholder="Enter your shipping address..."
                                value={shippingAddress}
                                onChange={e => setShippingAddress(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Notes (optional)</label>
                            <Input
                                placeholder="Any special instructions..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Payment Method Selection */}
                        {!orderPlaced ? (
                            <div className="space-y-3">
                                <label className="text-sm font-semibold">Payment Method</label>
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
                                            <code className="flex-1 text-sm font-mono bg-card/50 rounded-lg px-2 py-1 border border-border/60 truncate">
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
                                                        <div className="text-right">
                                                            <span className="text-sm font-extrabold text-gradient-primary">${price.toFixed(2)}</span>
                                                            {(() => {
                                                                const itemRetail = Number(p.retail_price || 0) * qty;
                                                                const itemHasDiscount = price < itemRetail && itemRetail > 0;
                                                                const itemPct = itemHasDiscount ? Math.round((1 - price / itemRetail) * 100) : 0;
                                                                return itemHasDiscount ? (
                                                                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                                                        <span className="text-[11px] text-muted-foreground/40 line-through">${itemRetail.toFixed(2)}</span>
                                                                        <span className="text-[11px] font-bold text-emerald-400">{itemPct}% off</span>
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
                                        {(() => {
                                            const sheetRetail = matched.reduce((sum: number, p: any) => sum + Number(p.retail_price || 0), 0);
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
                                                            <div className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/25">
                                                                <span className="text-base font-extrabold text-emerald-400">{sheetPct}% off</span>
                                                                {sheetLabel && (
                                                                    <span className="text-sm font-semibold text-emerald-400/70 ml-2">· {sheetLabel}</span>
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
                <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto border-t border-white/[0.1]">
                    {selectedPeptide && (() => {
                        const price = getClientPrice(selectedPeptide);
                        const retail = Number(selectedPeptide.retail_price || 0);
                        const hasDiscount = price < retail;
                        const inCart = cart.find(i => i.peptide_id === selectedPeptide.id);
                        const detailDesc = getPeptideDescription(selectedPeptide.name) || selectedPeptide.description;
                        const dk = lookupKnowledge(selectedPeptide.name);
                        const relatedStacks = getRelatedStacks(selectedPeptide.name, peptides || []);

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

                                    {/* ── Reconstitution Info ── */}
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

                                    {/* ── Dosing Tiers ── */}
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

                                    {/* ── Cycle Pattern ── */}
                                    {dk?.cyclePattern && (
                                        <div className="p-4 rounded-2xl bg-violet-500/[0.04] border border-violet-500/[0.1] space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Repeat className="h-3.5 w-3.5 text-violet-400/70" />
                                                <p className="text-[10px] font-semibold text-violet-400/60 uppercase tracking-[0.12em]">Cycle Pattern</p>
                                            </div>
                                            <p className="text-xs text-muted-foreground/60 leading-relaxed">{dk.cyclePattern}</p>
                                        </div>
                                    )}

                                    {/* ── Warning ── */}
                                    {dk?.warningText && (
                                        <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/[0.12] space-y-2">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
                                                <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-[0.12em]">Important Note</p>
                                            </div>
                                            <p className="text-xs text-amber-200/50 leading-relaxed">{dk.warningText}</p>
                                        </div>
                                    )}

                                    {/* ── Supplement Notes ── */}
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

                                    {/* ── Commonly Stacked With ── */}
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
                                                                if (template && peptides) {
                                                                    const matched = template.peptideNames
                                                                        .map(n => peptides.find((p: any) => p.name?.toLowerCase().startsWith(n.toLowerCase())))
                                                                        .filter(Boolean) as any[];
                                                                    if (matched.length > 0) {
                                                                        setSelectedPeptide(null);
                                                                        setTimeout(() => setSelectedProtocol({ template, matched }), 200);
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

                                    {/* ── Storage & Handling ── */}
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
