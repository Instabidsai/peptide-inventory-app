// ── Protocol Knowledge Base ────────────────────────────────────
// Rich peptide protocol data for generating professional protocol documents.
// Keyed by peptide name (case-insensitive matching via lookup helper).
// This is the single source of truth for descriptions, reconstitution,
// warnings, supplement notes, and pre-built template combos.

export interface SupplementNote {
    name: string;
    dosage: string;
    reason: string;
    productLink?: string;
    productName?: string;
}

export interface PeptideKnowledge {
    description: string;
    vialSizeMg: number;
    reconstitutionMl: number;
    defaultDoseAmount: number;
    defaultDoseUnit: 'mg' | 'mcg' | 'iu';
    defaultFrequency: string;
    defaultTiming: string;
    administrationRoute: string;
    warningText?: string;
    cyclePattern?: string;
    stackGroup?: string;
    stackLabel?: string;
    supplementNotes?: SupplementNote[];
    dosageSchedule?: string;
}

export interface ProtocolTemplate {
    name: string;
    description: string;
    category: 'weight_loss' | 'healing' | 'gh_stack' | 'cognitive' | 'sleep' | 'anti_aging' | 'full';
    icon: string; // lucide icon name
    peptideNames: string[];
}

// ── Peptide Knowledge Map ──────────────────────────────────────

export const PROTOCOL_KNOWLEDGE: Record<string, PeptideKnowledge> = {
    'Retatrutide': {
        description: 'This triple agonist targets GLP-1, GIP, and glucagon receptors to facilitate significant weight loss and metabolic improvements. It primarily functions by suppressing appetite while simultaneously increasing the body\'s energy expenditure and insulin secretion.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 1,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'MOTS-C': {
        description: 'This mitochondrial peptide regulates metabolic stress responses and significantly enhances insulin sensitivity and exercise capacity. It is often utilized to combat age-related metabolic decline by promoting glucose uptake within muscle tissues.',
        vialSizeMg: 40,
        reconstitutionMl: 2,
        defaultDoseAmount: 5,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'every 3 days',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'GHK-Cu': {
        description: 'This naturally occurring copper complex is highly effective at promoting wound healing and stimulating collagen synthesis for skin repair. It also possesses strong anti-inflammatory properties that support tissue regeneration and potential hair growth.',
        vialSizeMg: 100,
        reconstitutionMl: 3,
        defaultDoseAmount: 2,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        warningText: 'GHK-Cu is known to cause a stinging or burning sensation at the injection site. If the pain is too intense, consider diluting further or applying a warm compress after injection.',
        supplementNotes: [{
            name: 'Zinc',
            dosage: '15\u201330mg daily',
            reason: 'Take a Zinc supplement daily to balance copper levels.',
            productName: 'Thorne Zinc Picolinate 15mg',
            productLink: 'https://www.amazon.com/dp/B000FGWDTM',
        }],
    },
    'NAD+': {
        description: 'As a vital coenzyme found in every cell, NAD+ is essential for cellular energy production and the repair of damaged DNA. Restoring these levels helps support overall metabolic health and activates pathways associated with longevity.',
        vialSizeMg: 1000,
        reconstitutionMl: 5,
        defaultDoseAmount: 100,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        dosageSchedule: 'Days 1\u201310: 100 mg daily.\nMaintenance: 100 mg every 3rd day.',
        supplementNotes: [{
            name: 'TMG (Trimethylglycine)',
            dosage: '500mg daily',
            reason: 'Take TMG daily to restore methyl groups depleted by NAD+ therapy.',
            productName: 'Life Extension TMG 500mg',
            productLink: 'https://www.amazon.com/dp/B00068LBJO',
        }],
    },
    'TB-500': {
        description: 'This synthetic version of Thymosin Beta-4 is known for its ability to reduce inflammation and accelerate the healing of various tissues. It promotes cell migration to injury sites, making it a staple for recovering from muscle or ligament damage.',
        vialSizeMg: 20,
        reconstitutionMl: 2,
        defaultDoseAmount: 5,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'every 5 days',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'BPC-157': {
        description: 'This peptide is derived from protective proteins in the stomach and is renowned for its versatile tissue-healing capabilities. It triggers the formation of new blood vessels and cellular repair to heal tendons, muscles, and even gut tissue.',
        vialSizeMg: 20,
        reconstitutionMl: 2,
        defaultDoseAmount: 1,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'Semax': {
        description: 'Derived from ACTH, this peptide provides neuroprotective benefits and is widely recognized for enhancing cognitive function and focus. It modulates neurotransmitters in the brain to promote neurogenesis and help recovery from cognitive stress.',
        vialSizeMg: 10,
        reconstitutionMl: 1,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'intranasal',
        dosageSchedule: '500 mcg \u2013 1 mg administered intranasally three times daily.\nTiming: Morning (AM), Afternoon, Early PM.',
    },
    'Tesamorelin': {
        description: 'This analog increases IGF-1 levels and is specifically utilized for its potent ability to reduce stubborn visceral fat. It works by mimicking growth hormone-releasing hormones to improve overall physical body composition.',
        vialSizeMg: 20,
        reconstitutionMl: 2,
        defaultDoseAmount: 2,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'daily',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
        stackGroup: 'Evening GH Stack',
        stackLabel: 'Evening Stack Part 1',
    },
    'Ipamorelin': {
        description: 'This selective growth hormone secretagogue stimulates the pituitary gland to release growth hormone without spiking cortisol levels. It is frequently used to support lean muscle growth and improve body composition through fat loss.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 200,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
        stackGroup: 'Evening GH Stack',
        stackLabel: 'Evening Stack Part 2',
    },
    'Selank': {
        description: 'This anxiolytic peptide is used to reduce anxiety levels and improve mental clarity without the sedative effects of traditional medications. It influences the immune response and neurotransmitter balance to provide a calming effect on the nervous system.',
        vialSizeMg: 10,
        reconstitutionMl: 1,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'intranasal',
        dosageSchedule: '500 mcg administered intranasally three times daily.\nTiming: AM, Afternoon, PM.',
    },
    'DSIP': {
        description: 'This neuropeptide helps regulate the sleep-wake cycle by encouraging deep, restorative delta-wave sleep stages. It also supports the body\'s recovery from stress by helping to normalize cortisol levels during the night.',
        vialSizeMg: 10,
        reconstitutionMl: 3,
        defaultDoseAmount: 200,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'Before bed',
        administrationRoute: 'subcutaneous',
        cyclePattern: '5 days ON, 2 days OFF (e.g., Mon\u2013Fri On, Sat\u2013Sun Off) to prevent tolerance.',
    },
    // ── Additional common peptides ──────────────────────────────
    'Tirzepatide': {
        description: 'A dual GLP-1/GIP receptor agonist that provides powerful glucose control and weight loss. It improves insulin sensitivity and reduces appetite through complementary incretin pathways.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 2.5,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'Semaglutide': {
        description: 'A GLP-1 receptor agonist that significantly reduces appetite and promotes weight loss by mimicking the incretin hormone. It slows gastric emptying and signals satiety to the brain.',
        vialSizeMg: 5,
        reconstitutionMl: 2,
        defaultDoseAmount: 0.25,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'CJC-1295': {
        description: 'A growth hormone-releasing hormone analog that provides sustained GH elevation without the sharp spikes of direct GH administration. It is often combined with Ipamorelin for synergistic body composition benefits.',
        vialSizeMg: 5,
        reconstitutionMl: 2,
        defaultDoseAmount: 200,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
        stackGroup: 'Evening GH Stack',
        stackLabel: 'Evening Stack Part 1 (Alt)',
    },
    'PT-141': {
        description: 'This melanocortin receptor agonist works through the central nervous system to enhance sexual desire and function. Unlike PDE5 inhibitors, it acts on the brain to stimulate natural arousal pathways.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 2,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'as needed',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
    },
    'Epithalon': {
        description: 'This telomerase-activating peptide supports cellular longevity by promoting the lengthening of telomeres. It has been studied for its potential anti-aging effects including improved sleep quality and immune function.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 5,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        cyclePattern: '10 days ON, 6 months OFF.',
    },
    'Thymosin Alpha-1': {
        description: 'A potent immune-modulating peptide that enhances the body\'s T-cell function and overall immune response. It is used to support immune health in chronic infections and as an adjunct to other therapies.',
        vialSizeMg: 5,
        reconstitutionMl: 1,
        defaultDoseAmount: 1.6,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'twice weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'KPV': {
        description: 'A tripeptide derived from alpha-MSH with potent anti-inflammatory properties, particularly for gut health. It helps reduce intestinal inflammation and supports the healing of the gut lining.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
    },
    'Pentadecapeptide BPC-157 (Oral)': {
        description: 'An oral formulation of BPC-157 designed to provide systemic healing benefits when taken by mouth. Particularly effective for gut healing and systemic anti-inflammatory support.',
        vialSizeMg: 500,
        reconstitutionMl: 0,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'oral',
    },
};

// ── Lookup Helper (case-insensitive, partial match) ────────────

export function lookupKnowledge(peptideName: string): PeptideKnowledge | null {
    // Exact match first (case-insensitive)
    const normalizedName = peptideName.trim();
    for (const [key, value] of Object.entries(PROTOCOL_KNOWLEDGE)) {
        if (key.toLowerCase() === normalizedName.toLowerCase()) return value;
    }
    // Partial match (name contains key or key contains name)
    for (const [key, value] of Object.entries(PROTOCOL_KNOWLEDGE)) {
        if (
            key.toLowerCase().includes(normalizedName.toLowerCase()) ||
            normalizedName.toLowerCase().includes(key.toLowerCase())
        ) {
            return value;
        }
    }
    return null;
}

// ── Pre-built Protocol Templates ───────────────────────────────

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
    {
        name: 'Healing Stack',
        description: 'TB-500 + BPC-157 for tissue repair and recovery',
        category: 'healing',
        icon: 'Heart',
        peptideNames: ['TB-500', 'BPC-157'],
    },
    {
        name: 'GH Stack (Evening)',
        description: 'Tesamorelin + Ipamorelin for growth hormone optimization',
        category: 'gh_stack',
        icon: 'TrendingUp',
        peptideNames: ['Tesamorelin', 'Ipamorelin'],
    },
    {
        name: 'Weight Loss',
        description: 'Retatrutide + MOTS-C for metabolic enhancement',
        category: 'weight_loss',
        icon: 'Flame',
        peptideNames: ['Retatrutide', 'MOTS-C'],
    },
    {
        name: 'Cognitive',
        description: 'Semax + Selank for focus and anxiety reduction',
        category: 'cognitive',
        icon: 'Brain',
        peptideNames: ['Semax', 'Selank'],
    },
    {
        name: 'Sleep & Recovery',
        description: 'DSIP + NAD+ for restorative sleep and cellular repair',
        category: 'sleep',
        icon: 'Moon',
        peptideNames: ['DSIP', 'NAD+'],
    },
    {
        name: 'Anti-Aging',
        description: 'GHK-Cu + NAD+ + MOTS-C for longevity and skin health',
        category: 'anti_aging',
        icon: 'Sparkles',
        peptideNames: ['GHK-Cu', 'NAD+', 'MOTS-C'],
    },
    {
        name: 'Full Protocol',
        description: 'Complete 11-peptide protocol: weight loss, healing, GH, cognitive, and sleep',
        category: 'full',
        icon: 'LayoutGrid',
        peptideNames: [
            'Retatrutide', 'MOTS-C', 'GHK-Cu', 'NAD+',
            'TB-500', 'BPC-157', 'Semax', 'Tesamorelin',
            'Ipamorelin', 'Selank', 'DSIP',
        ],
    },
];
