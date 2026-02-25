import { lookupKnowledge, PROTOCOL_TEMPLATES } from '@/data/protocol-knowledge';
import { PEPTIDE_CARD_DESCRIPTIONS } from './constants';
import type { Peptide } from '@/hooks/use-peptides';

export function getPeptideDescription(peptideName: string): string | null {
    // Check our curated short descriptions first (strip dosage for lookup)
    const baseName = peptideName.replace(/\s+\d+mg(\/\d+mg)?$/i, '');
    if (PEPTIDE_CARD_DESCRIPTIONS[baseName]) return PEPTIDE_CARD_DESCRIPTIONS[baseName];
    if (PEPTIDE_CARD_DESCRIPTIONS[peptideName]) return PEPTIDE_CARD_DESCRIPTIONS[peptideName];
    // Try partial match (for blends like "BPC/TB500 Blend 5mg/5mg" -> "BPC/TB500 Blend")
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
export function canSeePeptide(peptide: { visible_to_user_ids?: string[] | null }, profileId?: string, role?: string): boolean {
    if (role === 'admin') return true;
    if (!peptide.visible_to_user_ids || peptide.visible_to_user_ids.length === 0) return true;
    return !!profileId && peptide.visible_to_user_ids.includes(profileId);
}

// Find protocol templates that include a given peptide, and return the other peptides in those stacks
export function getRelatedStacks(peptideName: string, allPeptides: Peptide[]): { templateName: string; category: string; icon: string; otherPeptides: string[] }[] {
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
            const match = allPeptides?.find(p => p.name?.toLowerCase().startsWith(n.toLowerCase()));
            return match?.name || n;
        });
        stacks.push({ templateName: template.name, category: template.category, icon: template.icon, otherPeptides: otherDisplayNames });
    }
    return stacks;
}

// Calculate client price based on pricing mode
export function calculateClientPrice(
    peptide: { id: string; retail_price?: number | null },
    isPartner: boolean,
    authProfile: { price_multiplier?: number | null } | null | undefined,
    pricingProfile: { pricing_mode?: string | null; price_multiplier?: number | null; cost_plus_markup?: number | null } | null | undefined,
    lotCosts: Record<string, number> | null | undefined,
): number {
    const retail = Number(peptide.retail_price || 0);

    if (!isPartner) {
        const customerMultiplier = Number(authProfile?.price_multiplier) || 1.0;
        return Math.round(retail * customerMultiplier * 100) / 100;
    }

    // Partner pricing -- from their OWN profile
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
}
