/**
 * Full Cycle Protocol Packages — complete protocol definitions
 * with exact vial quantities, dosing schedules, and durations.
 *
 * Each package represents a complete cycle that a customer can add
 * to their cart as a single unit (all required vials at once).
 *
 * Vial sizes match actual NextGen Research Labs inventory.
 * Fridge life (30-45 days after reconstitution) is factored into
 * vial count planning — multi-week protocols split into separate
 * vials per dosing phase so no single vial stays open too long.
 */

export interface ProtocolPackageItem {
    peptideName: string;    // Display name (also used for DB matching via startsWith)
    vialCount: number;      // Number of vials needed for the full cycle
    dosing: string;         // Human-readable dosing description
}

export interface ProtocolPackage {
    id: string;
    name: string;
    category: string;
    icon: string;
    description: string;
    duration: string;       // e.g. "28 days", "8 weeks", "12 weeks"
    totalVials: number;     // Sum of all item vialCounts
    items: ProtocolPackageItem[];
}

export const PROTOCOL_PACKAGES: ProtocolPackage[] = [
    // ── #1 Healing Stack ─────────────────────────────────────
    // TB500 20mg: 5mg/wk × 4 wk = 20mg → 1 vial (28 days open ✓)
    // BPC-157 20mg: 0.7mg/day × 28 = 19.6mg → 1 vial (28 days open ✓)
    {
        id: 'pkg-healing',
        name: 'Healing Stack',
        category: 'healing',
        icon: 'Heart',
        description: 'Foundation recovery protocol for tissue repair and inflammation reduction.',
        duration: '28 days',
        totalVials: 2,
        items: [
            { peptideName: 'TB500 20mg', vialCount: 1, dosing: '2.5mg twice per week' },
            { peptideName: 'BPC-157 20mg', vialCount: 1, dosing: '700mcg daily' },
        ],
    },

    // ── #2 Healing (Severe Injury) ───────────────────────────
    // TB500: 5mg every 4d × 20d = 5 doses = 25mg → 1×20mg (4 doses, 13d) + 1×10mg (dose 5)
    // BPC-157 20mg: 2mg/day × 20d = 40mg → 2 vials (each ~10 days ✓)
    // KPV 10mg: 0.5mg/day × 20d = 10mg → 1 vial (20 days ✓)
    {
        id: 'pkg-severe-injury',
        name: 'Healing (Severe Injury)',
        category: 'healing',
        icon: 'Heart',
        description: 'Aggressive healing protocol for major injuries with accelerated tissue repair.',
        duration: '20 days',
        totalVials: 5,
        items: [
            { peptideName: 'TB500 20mg', vialCount: 1, dosing: '5mg every 4 days (doses 1-4)' },
            { peptideName: 'TB500 10mg', vialCount: 1, dosing: '5mg final dose (day 17)' },
            { peptideName: 'BPC-157 20mg', vialCount: 2, dosing: '1mg morning + 1mg evening' },
            { peptideName: 'KPV 10mg', vialCount: 1, dosing: '500mcg daily' },
        ],
    },

    // ── #3 GH Stack ──────────────────────────────────────────
    // Tesamorelin 20mg: 2mg/day × 56d = 112mg → 6 vials (each ~10 days ✓)
    // Ipamorelin 10mg: 0.2mg/day × 56d = 11.2mg → 2 vials (each ~28 days ✓)
    {
        id: 'pkg-gh-stack',
        name: 'GH Stack',
        category: 'gh_stack',
        icon: 'TrendingUp',
        description: 'Growth hormone optimization for body composition, recovery, and anti-aging.',
        duration: '8 weeks',
        totalVials: 8,
        items: [
            { peptideName: 'Tesamorelin 20mg', vialCount: 6, dosing: '2mg daily' },
            { peptideName: 'Ipamorelin 10mg', vialCount: 2, dosing: '200mcg daily' },
        ],
    },

    // ── #4 Fat / Weight Loss (Retatrutide) ───────────────────
    // Reta split by fridge life:
    //   Wk 1-4: 2mg/wk × 4 = 8mg → 1×10mg (28 days ✓)
    //   Wk 5-8: 4mg/wk × 4 = 16mg → 1×20mg (28 days ✓)
    //   Wk 9-12: 4mg/wk × 4 = 16mg → 1×20mg (28 days ✓)
    // MOTS-C 40mg: 15mg/wk × 12 = 180mg → 5 vials (each ~19 days ✓)
    {
        id: 'pkg-fat-loss',
        name: 'Fat / Weight Loss',
        category: 'weight_loss',
        icon: 'Flame',
        description: 'Triple-agonist fat loss with metabolic enhancement for sustained results.',
        duration: '12 weeks',
        totalVials: 8,
        items: [
            { peptideName: 'Retatrutide 10mg', vialCount: 1, dosing: '2mg weekly (weeks 1-4)' },
            { peptideName: 'Retatrutide 20mg', vialCount: 2, dosing: '4mg weekly (weeks 5-12)' },
            { peptideName: 'MOTS-C 40mg', vialCount: 5, dosing: '5mg three times per week' },
        ],
    },

    // ── #5 MAX Weight Loss (Tirzepatide) ─────────────────────
    // Tirz split perfectly by dose tier + fridge life:
    //   Wk 1-4: 2.5mg/wk × 4 = 10mg → 1×10mg (28 days ✓)
    //   Wk 5-8: 5mg/wk × 4 = 20mg → 1×20mg (28 days ✓)
    //   Wk 9-12: 7.5mg/wk × 4 = 30mg → 1×30mg (28 days ✓)
    // MOTS-C 40mg: 15mg/wk × 8 wk = 120mg → 3 vials (each ~19 days ✓)
    {
        id: 'pkg-max-weight-loss',
        name: 'MAX Weight Loss',
        category: 'weight_loss',
        icon: 'Flame',
        description: 'Maximum intensity weight loss with tiered dosing and metabolic support.',
        duration: '12 weeks',
        totalVials: 6,
        items: [
            { peptideName: 'Tirzepatide 10mg', vialCount: 1, dosing: '2.5mg weekly (weeks 1-4)' },
            { peptideName: 'Tirzepatide 20mg', vialCount: 1, dosing: '5mg weekly (weeks 5-8)' },
            { peptideName: 'Tirzepatide 30mg', vialCount: 1, dosing: '7.5mg weekly (weeks 9-12)' },
            { peptideName: 'MOTS-C 40mg', vialCount: 3, dosing: '5mg 3x/week (weeks 5-12 only)' },
        ],
    },

    // ── #6 Cognitive Enhancement ─────────────────────────────
    // Semax 10mg: 0.5mg × 20 active days = 10mg → 1 vial (28 days ✓)
    // Selank 10mg: same → 1 vial (28 days ✓)
    // NAD+ 1000mg: 100mg × 19 doses = 1900mg → 2 vials (10d + 18d ✓)
    {
        id: 'pkg-cognitive',
        name: 'Cognitive Enhancement',
        category: 'cognitive',
        icon: 'Brain',
        description: 'Nootropic stack for focus, memory, and mental clarity with cellular energy support.',
        duration: '28 days',
        totalVials: 4,
        items: [
            { peptideName: 'Semax 10mg', vialCount: 1, dosing: '500mcg morning, 5 days on / 2 days off' },
            { peptideName: 'Selank 10mg', vialCount: 1, dosing: '500mcg morning, 5 days on / 2 days off' },
            { peptideName: 'NAD+ 1000mg', vialCount: 2, dosing: '100mg daily days 1-10, then every 2 days' },
        ],
    },

    // ── #7 Sleep & Recovery ──────────────────────────────────
    // DSIP 10mg: 0.2mg × 40 active nights = 8mg → 1 vial
    // NAD+ 1000mg: 100mg × ~28 doses = 2800mg → 3 vials (10d + 23d + 23d ✓)
    {
        id: 'pkg-sleep',
        name: 'Sleep & Recovery',
        category: 'sleep',
        icon: 'Moon',
        description: 'Deep restorative sleep with cellular repair for full-body recovery.',
        duration: '8 weeks',
        totalVials: 4,
        items: [
            { peptideName: 'DSIP 10mg', vialCount: 1, dosing: '200mcg nightly, 5 days on / 2 days off' },
            { peptideName: 'NAD+ 1000mg', vialCount: 3, dosing: '100mg daily days 1-10, then 3x/week' },
        ],
    },

    // ── #8 Anti-Aging (Full) — 7 peptides ────────────────────
    // Epithalon 40mg: 5mg × 10d = 50mg → 2 vials (8d + 2d ✓)
    // GHK-CU 100mg: 2mg × 50d = 100mg → 1 vial
    // NAD+ 1000mg: ~2800mg → 3 vials
    // MOTS-C 40mg: 120mg → 3 vials (each ~19d ✓)
    // TB500 20mg: 5mg every 5d × 56d ≈ 55mg → 3 vials (each ~20d ✓)
    // BPC-157 20mg: 0.7mg × 56d = 39.2mg → 2 vials (each ~29d ✓)
    // Reta split: wk 1-3 = 8mg → 1×10mg (21d ✓), wk 4-8 = 20mg → 1×20mg (35d ✓)
    {
        id: 'pkg-anti-aging',
        name: 'Anti-Aging (Full)',
        category: 'anti_aging',
        icon: 'Sparkles',
        description: 'Comprehensive age-reversal protocol — 7 peptides for cellular rejuvenation, telomere support, healing, and metabolic optimization.',
        duration: '8 weeks',
        totalVials: 16,
        items: [
            { peptideName: 'Epithalon 40mg', vialCount: 2, dosing: '5mg daily for 10 days' },
            { peptideName: 'GHK-CU 100mg', vialCount: 1, dosing: '2mg daily for 50 days' },
            { peptideName: 'NAD+ 1000mg', vialCount: 3, dosing: '100mg daily days 1-10, then 3x/week' },
            { peptideName: 'MOTS-C 40mg', vialCount: 3, dosing: '5mg three times per week' },
            { peptideName: 'TB500 20mg', vialCount: 3, dosing: '5mg every 5 days' },
            { peptideName: 'BPC-157 20mg', vialCount: 2, dosing: '700mcg daily' },
            { peptideName: 'Retatrutide 10mg', vialCount: 1, dosing: '2mg weekly (weeks 1-3)' },
            { peptideName: 'Retatrutide 20mg', vialCount: 1, dosing: '4mg weekly (weeks 4-8)' },
        ],
    },

    // ── #9 GLOW Skin ─────────────────────────────────────────
    // GHK-CU 100mg: 2mg × 56d = 112mg → 2 vials
    // BPC-157 20mg: 0.7mg × 56d = 39.2mg → 2 vials (each ~29d ✓)
    // TB500 20mg: 5mg every 5d ≈ 55mg → 3 vials (each ~20d ✓)
    {
        id: 'pkg-glow-skin',
        name: 'GLOW Skin',
        category: 'anti_aging',
        icon: 'Sparkles',
        description: 'Skin rejuvenation protocol for collagen synthesis, healing, and radiant complexion.',
        duration: '8 weeks',
        totalVials: 7,
        items: [
            { peptideName: 'GHK-CU 100mg', vialCount: 2, dosing: '2mg daily' },
            { peptideName: 'BPC-157 20mg', vialCount: 2, dosing: '700mcg daily' },
            { peptideName: 'TB500 20mg', vialCount: 3, dosing: '5mg every 5 days' },
        ],
    },

    // ── #10 Immune Boost ─────────────────────────────────────
    // Thy Alpha 1 10mg: 5mg/wk × 8 = 40mg → 4 vials (each ~14d ✓)
    // NAD+ 1000mg: ~2800mg → 3 vials
    {
        id: 'pkg-immune',
        name: 'Immune Boost',
        category: 'immune',
        icon: 'Shield',
        description: 'Immune system fortification with T-cell enhancement and cellular energy restoration.',
        duration: '8 weeks',
        totalVials: 7,
        items: [
            { peptideName: 'Thy Alpha 1 10mg', vialCount: 4, dosing: '2.5mg twice per week' },
            { peptideName: 'NAD+ 1000mg', vialCount: 3, dosing: '100mg daily days 1-10, then 3x/week' },
        ],
    },

    // ── #11 Longevity Blast ──────────────────────────────────
    // Epithalon 40mg: 5mg × 10d = 50mg → 2 vials (8d + 2d ✓)
    // NAD+ 1000mg: 100mg × 10d = 1000mg → 1 vial (10d ✓)
    {
        id: 'pkg-longevity',
        name: 'Longevity Blast',
        category: 'anti_aging',
        icon: 'Sparkles',
        description: 'Intensive 10-day telomere support burst with cellular energy restoration.',
        duration: '10 days',
        totalVials: 3,
        items: [
            { peptideName: 'Epithalon 40mg', vialCount: 2, dosing: '5mg daily for 10 days' },
            { peptideName: 'NAD+ 1000mg', vialCount: 1, dosing: '100mg daily for 10 days' },
        ],
    },

    // ── #12 Gut Healing ──────────────────────────────────────
    // TB500 20mg: 5mg every 5d × 40d = 8 doses = 40mg → 2 vials (each ~20d ✓)
    // BPC-157 20mg: 1mg × 40d = 40mg → 2 vials (each ~20d ✓)
    // KPV 10mg: 0.5mg × 40d = 20mg → 2 vials (each ~20d ✓)
    {
        id: 'pkg-gut-healing',
        name: 'Gut Healing',
        category: 'healing',
        icon: 'Heart',
        description: 'Targeted gut repair protocol for intestinal healing, inflammation, and gut lining integrity.',
        duration: '40 days',
        totalVials: 6,
        items: [
            { peptideName: 'TB500 20mg', vialCount: 2, dosing: '5mg every 5 days' },
            { peptideName: 'BPC-157 20mg', vialCount: 2, dosing: '1mg daily' },
            { peptideName: 'KPV 10mg', vialCount: 2, dosing: '500mcg daily' },
        ],
    },

    // ── #13 Full 10-Week Mitochondrial & Brain Rewire ────────
    // MOTS-C 40mg: 15mg/wk × 10 = 150mg → 4 vials (each ~19d ✓)
    // SS-31 50mg: 10mg/d × 35d = 350mg → 7 vials (each ~5d ✓)
    // Reta split: wk 1-4 = 8mg → 1×10mg (28d ✓), wk 5-10 = 24mg → 1×30mg (42d ✓)
    // BPC-157 20mg: 1mg × 70d = 70mg → 4 vials (each ~20d ✓)
    // GHK-CU 100mg: 2mg × 56d = 112mg → 2 vials
    // NAD+ 1000mg: ~3600mg → 4 vials
    // Semax 10mg: 1mg × 40 active d = 40mg → 4 vials (each ~14d ✓)
    // Selank 10mg: same → 4 vials (each ~14d ✓)
    {
        id: 'pkg-mito-brain-rewire',
        name: 'Mitochondrial & Brain Rewire',
        category: 'cognitive',
        icon: 'Brain',
        description: 'Comprehensive 10-week protocol targeting mitochondrial function, neuroplasticity, metabolic optimization, and cellular repair across 3 phases.',
        duration: '10 weeks',
        totalVials: 31,
        items: [
            { peptideName: 'MOTS-C 40mg', vialCount: 4, dosing: '5mg three times per week (all 10 weeks)' },
            { peptideName: 'SS-31 50mg', vialCount: 7, dosing: '10mg daily weeks 3-7, taper weeks 8-10' },
            { peptideName: 'Retatrutide 10mg', vialCount: 1, dosing: '2mg weekly (weeks 1-4)' },
            { peptideName: 'Retatrutide 30mg', vialCount: 1, dosing: '4mg weekly (weeks 5-10)' },
            { peptideName: 'BPC-157 20mg', vialCount: 4, dosing: '1mg daily (morning)' },
            { peptideName: 'GHK-CU 100mg', vialCount: 2, dosing: '2mg daily (weeks 3-10)' },
            { peptideName: 'NAD+ 1000mg', vialCount: 4, dosing: '100mg daily for 10 days, then 100mg 3x/week' },
            { peptideName: 'Semax 10mg', vialCount: 4, dosing: '1mg daily, 5 on / 2 off (weeks 3-10)' },
            { peptideName: 'Selank 10mg', vialCount: 4, dosing: '1mg daily, 5 on / 2 off (weeks 3-10)' },
        ],
    },
];
