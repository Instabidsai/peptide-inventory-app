import { lookupKnowledge, PROTOCOL_TEMPLATES } from '@/data/protocol-knowledge';
import { PEPTIDE_CARD_DESCRIPTIONS } from './constants';
import type { Peptide } from '@/hooks/use-peptides';

/** Match a package/template peptide name against the DB peptides list (fuzzy). */
export function matchPeptide(peptides: Peptide[], name: string): Peptide | undefined {
    const lower = name.toLowerCase();
    // 1. Exact startsWith match
    const found = peptides.find(p => (p.name || '').toLowerCase().startsWith(lower));
    if (found) return found;
    // 2. Reverse startsWith (DB name is a prefix of the package name)
    const reverse = peptides.find(p => lower.startsWith((p.name || '').toLowerCase()));
    if (reverse) return reverse;
    // 3. Normalized match (strip hyphens/spaces)
    const norm = lower.replace(/[-\s]/g, '');
    return peptides.find(p => {
        const pNorm = (p.name || '').toLowerCase().replace(/[-\s]/g, '');
        return pNorm === norm || pNorm.startsWith(norm) || norm.startsWith(pNorm);
    });
}

export function getPeptideDescription(peptideName: string, knowledgeMap?: any): string | null {
    // Check our curated short descriptions first (strip dosage for lookup)
    const baseName = peptideName.replace(/\s+\d+mg(\/\d+mg)?$/i, '');
    if (PEPTIDE_CARD_DESCRIPTIONS[baseName]) return PEPTIDE_CARD_DESCRIPTIONS[baseName];
    if (PEPTIDE_CARD_DESCRIPTIONS[peptideName]) return PEPTIDE_CARD_DESCRIPTIONS[peptideName];
    // Try partial match (for blends like "BPC/TB500 Blend 5mg/5mg" -> "BPC/TB500 Blend")
    for (const [key, desc] of Object.entries(PEPTIDE_CARD_DESCRIPTIONS)) {
        if (peptideName.toLowerCase().startsWith(key.toLowerCase())) return desc;
    }
    // Fall back to knowledge base
    const knowledge = lookupKnowledge(peptideName, knowledgeMap);
    if (knowledge?.description) return knowledge.description;
    return null;
}

// Visibility check: peptides with visible_to_user_ids set are restricted
// to those specific users (by profile.id) + admins. Null/empty = visible to all.
export function canSeePeptide(peptide: { visible_to_user_ids?: string[] | null }, profileId?: string, role?: string): boolean {
    if (role === 'admin' || role === 'super_admin') return true;
    if (!peptide.visible_to_user_ids || peptide.visible_to_user_ids.length === 0) return true;
    return !!profileId && peptide.visible_to_user_ids.includes(profileId);
}

// Find protocol templates that include a given peptide, and return the other peptides in those stacks
export function getRelatedStacks(peptideName: string, allPeptides: Peptide[], templates: any[] = PROTOCOL_TEMPLATES): { templateName: string; category: string; icon: string; otherPeptides: string[] }[] {
    const baseName = peptideName.replace(/\s+\d+mg(\/\d+mg)?$/i, '').toLowerCase();
    const stacks: { templateName: string; category: string; icon: string; otherPeptides: string[] }[] = [];
    for (const template of templates) {
        if (template.category === 'full') continue; // skip the mega-protocol
        if (template.defaultTierId) continue; // skip variant templates
        const matchIdx = template.peptideNames.findIndex((n: string) => n.toLowerCase().startsWith(baseName) || baseName.startsWith(n.toLowerCase()));
        if (matchIdx === -1) continue;
        const others = [...new Set(template.peptideNames.filter((_: unknown, i: number) => i !== matchIdx))] as string[];
        // Map template names back to display names from allPeptides
        const otherDisplayNames = others.map((n: string) => {
            const match = allPeptides?.find(p => p.name?.toLowerCase().startsWith(n.toLowerCase()));
            return match?.name || n;
        });
        stacks.push({ templateName: template.name, category: template.category, icon: template.icon, otherPeptides: otherDisplayNames });
    }
    return stacks;
}

// Calculate client price based on pricing mode
// Priority: base_cost (admin-editable) > avg_cost (lot-derived) > retail fallback
export function calculateClientPrice(
    peptide: { id: string; retail_price?: number | null; base_cost?: number | null; avg_cost?: number | null },
    isPartner: boolean,
    authProfile: { price_multiplier?: number | null } | null | undefined,
    pricingProfile: { pricing_mode?: string | null; price_multiplier?: number | null; cost_plus_markup?: number | null } | null | undefined,
    lotCosts: Record<string, number> | null | undefined,
): number {
    const retail = Number(peptide.retail_price || 0);

    if (!isPartner) {
        // Every customer gets minimum 20% off retail — hardcoded floor.
        // If their profile has an even lower multiplier, use that instead.
        const profileMult = Number(authProfile?.price_multiplier) || 0.80;
        const customerMultiplier = Math.min(profileMult, 0.80);
        return Math.round(retail * customerMultiplier * 100) / 100;
    }

    // Partner pricing -- from their OWN profile
    // Prefer base_cost (admin edits this) over lot-derived avg_cost
    const mode = pricingProfile?.pricing_mode || 'percentage';
    const multiplier = Number(pricingProfile?.price_multiplier) || 1.0;
    const markup = Number(pricingProfile?.cost_plus_markup) || 0;
    const baseCost = Number(peptide.base_cost) || 0;
    const effectiveCost = baseCost > 0 ? baseCost : (Number(peptide.avg_cost) || (lotCosts ? (lotCosts[peptide.id] || 0) : 0));

    if (mode === 'cost_plus' && effectiveCost > 0) {
        return Math.round((effectiveCost + markup) * 100) / 100;
    }

    if (mode === 'cost_multiplier' && effectiveCost > 0) {
        return Math.round(effectiveCost * markup * 100) / 100;
    }

    // percentage mode (fallback)
    return Math.round(retail * multiplier * 100) / 100;
}
