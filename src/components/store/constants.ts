import React from 'react';
import {
    Heart,
    TrendingUp,
    Flame,
    Brain,
    Moon,
    Sparkles,
    LayoutGrid,
    Shield,
} from 'lucide-react';
import type { CategoryStyle } from './types';

export const MAX_ITEM_QTY = 20;

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid, Shield,
};

// Short 2-3 sentence descriptions for every product card.
// Falls back to lookupKnowledge() descriptions, then DB description field.
export const PEPTIDE_CARD_DESCRIPTIONS: Record<string, string> = {
    // -- Healing & Recovery
    'BPC-157': 'A powerful healing peptide derived from gastric proteins that accelerates recovery of tendons, muscles, ligaments, and gut tissue. Promotes new blood vessel formation and reduces inflammation throughout the body.',
    'TB-500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'TB500': 'A synthetic fragment of Thymosin Beta-4 that drives cell migration to injury sites for rapid tissue repair. Reduces inflammation and is a staple in healing stacks for muscle, joint, and ligament recovery.',
    'BPC/TB500 Blend': 'A synergistic combination of BPC-157 and TB-500 in a single vial for maximum tissue repair. Combines gut-derived healing with cell-migration technology for comprehensive recovery support.',
    'Pentadecapeptide BPC-157 (Oral)': 'An oral formulation of BPC-157 designed for systemic healing benefits when taken by mouth. Particularly effective for gut healing, reducing intestinal inflammation, and supporting digestive health.',

    // -- Weight Loss & Metabolic
    'Retatrutide': 'A triple-action agonist targeting GLP-1, GIP, and glucagon receptors for powerful weight management. Suppresses appetite while boosting metabolism — one of the most effective weight loss peptides available.',
    'Tirzepatide': 'A dual GLP-1/GIP receptor agonist delivering exceptional glucose control and weight loss results. Improves insulin sensitivity through complementary incretin pathways with once-weekly dosing.',
    'Semaglutide': 'A GLP-1 receptor agonist that significantly reduces appetite and promotes sustained weight loss. Slows gastric emptying and signals satiety to the brain for effective metabolic management.',
    'Cagriniltide': 'A long-acting amylin analog that works alongside GLP-1 agonists to enhance weight loss outcomes. Reduces appetite by mimicking the satiety hormone amylin, supporting sustained metabolic improvement.',
    'MOTS-C': 'A mitochondrial-derived peptide that enhances insulin sensitivity and exercise capacity at the cellular level. Combats age-related metabolic decline and supports fat oxidation during physical activity.',
    'AOD-9604': 'A modified fragment of human growth hormone specifically designed to stimulate fat breakdown without affecting blood sugar. Targets stubborn fat deposits while preserving lean muscle mass.',
    '5-Amino 1MQ': 'A small molecule that inhibits the NNMT enzyme to boost cellular energy expenditure and fat metabolism. Supports healthy body composition by reversing metabolic slowdown at the cellular level.',

    // -- Growth Hormone & Body Composition
    'Tesamorelin': 'A growth hormone-releasing analog clinically proven to reduce stubborn visceral abdominal fat. Elevates IGF-1 levels to improve body composition, skin quality, and overall metabolic health.',
    'Ipamorelin': 'A selective growth hormone secretagogue that boosts GH release without spiking cortisol or appetite. Supports lean muscle growth, fat loss, and improved sleep quality with minimal side effects.',
    'Sermorelin': 'A bioidentical growth hormone-releasing hormone that stimulates your pituitary to produce GH naturally. Supports anti-aging, improved sleep, lean muscle, and recovery with a strong safety profile.',
    'CJC-1295': 'A growth hormone-releasing hormone analog that provides sustained GH elevation mimicking natural pulses. Enhances recovery, body composition, and sleep quality without sharp hormonal spikes.',
    'CJC (no DAC)': 'The short-acting version of CJC-1295 (Modified GRF 1-29) with a 30-minute half-life that mimics natural GH pulses. Often paired with Ipamorelin for a synergistic growth hormone boost.',
    'CJC (no DAC)/Ipamorelin': 'A pre-blended combination of CJC-1295 (no DAC) and Ipamorelin for convenient GH optimization. Delivers synergistic growth hormone release in a single injection for improved recovery and body composition.',
    'Tesamorelin/Ipamorelin Blnd': 'A powerful pre-mixed blend combining Tesamorelin\'s fat-reducing properties with Ipamorelin\'s clean GH release. Targets visceral fat while supporting lean muscle and sleep quality.',
    'Hexarelin': 'The most potent growth hormone-releasing peptide (GHRP), triggering significant GH release from the pituitary. Highly effective for body composition but requires cycling due to receptor adaptation.',

    // -- Skin, Hair & Anti-Aging
    'GHK-Cu': 'A naturally occurring copper peptide that stimulates collagen synthesis, wound healing, and skin regeneration. Potent anti-inflammatory and anti-aging properties make it ideal for skin rejuvenation and hair restoration.',
    'GHK-CU': 'A naturally occurring copper peptide that stimulates collagen synthesis, wound healing, and skin regeneration. Potent anti-inflammatory and anti-aging properties make it ideal for skin rejuvenation and hair restoration.',
    'Melanotan 2': 'A melanocortin receptor agonist that stimulates melanin production for enhanced skin pigmentation. Also supports libido and fat loss through central nervous system pathways.',
    'Epithalon': 'A telomerase-activating peptide that promotes cellular longevity by supporting telomere maintenance. Studied for anti-aging effects including improved sleep, immune function, and cellular resilience.',
    'FOXO4': 'A cell-targeting peptide that selectively clears senescent "zombie" cells to promote tissue rejuvenation. Supports the body\'s natural repair processes by removing damaged cells that accelerate aging.',

    // -- Cognitive & Mental Health
    'Semax': 'A nootropic peptide derived from ACTH that enhances focus, memory, and cognitive performance. Promotes neurogenesis and provides neuroprotective benefits without stimulant-like side effects.',
    'Selank': 'An anti-anxiety peptide that improves mental clarity and emotional balance without sedation. Modulates immune function and neurotransmitter activity for calm, focused performance.',
    'DSIP': 'A neuropeptide that regulates the sleep-wake cycle by promoting deep, restorative delta-wave sleep. Helps normalize cortisol levels and supports recovery from physical and mental stress.',
    'Oxytocin': 'Known as the "bonding hormone," this neuropeptide supports social connection, emotional well-being, and stress reduction. Also studied for its role in wound healing and anti-inflammatory effects.',

    // -- Immune & Cellular Health
    'NAD+': 'An essential coenzyme present in every cell that fuels energy production and DNA repair. Restoring NAD+ levels supports anti-aging pathways, cognitive function, and overall cellular vitality.',
    'Thymosin Alpha-1': 'A potent immune-modulating peptide that enhances T-cell function and strengthens the body\'s defense systems. Used to support immune health during chronic conditions and as an adjunct to recovery protocols.',
    'Thy Alpha 1': 'A potent immune-modulating peptide that enhances T-cell function and strengthens the body\'s defense systems. Used to support immune health during chronic conditions and as an adjunct to recovery protocols.',
    'KPV': 'A tripeptide with powerful anti-inflammatory properties, especially for gut health and intestinal healing. Derived from alpha-MSH, it reduces inflammation and supports the integrity of the gut lining.',
    'Glutathione': 'The body\'s master antioxidant, essential for detoxification, immune defense, and cellular protection. Supports liver health, skin brightness, and recovery from oxidative stress.',
    'LL-37': 'A naturally occurring antimicrobial peptide that provides broad-spectrum defense against bacteria, viruses, and fungi. Supports wound healing and modulates the immune response to fight infections.',
    'SS-31': 'A mitochondria-targeted peptide that protects cellular energy production and reduces oxidative damage. Supports cardiovascular health, exercise performance, and age-related cellular decline.',
    'ARA-290': 'An innate repair receptor agonist that promotes tissue healing and reduces neuropathic pain. Supports nerve regeneration and has shown promise in metabolic and inflammatory conditions.',

    // -- Sexual Function & Hormonal
    'PT-141': 'A melanocortin receptor agonist that enhances sexual desire and function through central nervous system pathways. Works on the brain to stimulate natural arousal — effective for both men and women.',
    'Kisspeptin': 'A neuropeptide that naturally stimulates GnRH release to support healthy testosterone and reproductive hormone levels. Plays a key role in puberty, fertility, and hormonal balance.',
    // -- Specialty
    'VIP': 'Vasoactive intestinal peptide that supports gut health, immune regulation, and respiratory function. Has neuroprotective properties and helps modulate inflammation throughout the body.',
};

// Category gradient config -- with hover glow colors
export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
    healing: { gradient: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(244,63,94,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600', borderHover: 'hover:border-rose-500/25' },
    gh_stack: { gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(139,92,246,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-violet-400 to-purple-600', borderHover: 'hover:border-violet-500/25' },
    weight_loss: { gradient: 'from-orange-500 to-amber-600', glow: 'shadow-orange-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(249,115,22,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-orange-400 to-amber-600', borderHover: 'hover:border-orange-500/25' },
    cognitive: { gradient: 'from-cyan-500 to-blue-600', glow: 'shadow-cyan-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(6,182,212,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-cyan-400 to-blue-600', borderHover: 'hover:border-cyan-500/25' },
    sleep: { gradient: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(99,102,241,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-indigo-400 to-violet-600', borderHover: 'hover:border-indigo-500/25' },
    anti_aging: { gradient: 'from-fuchsia-500 to-amber-400', glow: 'shadow-fuchsia-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(217,70,239,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-fuchsia-400 to-amber-400', borderHover: 'hover:border-fuchsia-500/25' },
    immune: { gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/8', hoverGlow: 'hover:shadow-[0_8px_40px_-8px_rgba(16,185,129,0.3),0_20px_60px_-12px_rgba(0,0,0,0.25)]', iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600', borderHover: 'hover:border-emerald-500/25' },
};
