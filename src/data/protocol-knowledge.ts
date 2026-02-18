// ── Protocol Knowledge Base ────────────────────────────────────
// Rich peptide protocol data for generating professional protocol documents.
// Keyed by peptide name (case-insensitive matching via lookup helper).
// This is the single source of truth for descriptions, reconstitution,
// warnings, supplement notes, dosing tiers, and pre-built template combos.
//
// Dosing data sourced from:
//   - Dr. Trevor Bachmeyer RAG knowledge base (742 YouTube video chunks)
//   - FDA labels (Tirzepatide, Semaglutide, Tesamorelin)
//   - Clinical research publications (NEJM, PubMed)
//   - Peptide practitioner protocols (2025-2026)

export interface SupplementNote {
    name: string;
    dosage: string;
    reason: string;
    productLink?: string;
    productName?: string;
}

export interface DosingTier {
    id: string;          // 'conservative', 'standard', 'aggressive', 'loading', 'maintenance'
    label: string;       // Display label: "Conservative Start", "Standard Protocol", etc.
    doseAmount: number;
    doseUnit: 'mg' | 'mcg' | 'iu';
    frequency: string;
    timing: string;
    notes?: string;
    dosageSchedule?: string;
    cyclePattern?: string;
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
    dosingTiers?: DosingTier[];
}

export interface ProtocolTemplate {
    name: string;
    description: string;
    category: 'weight_loss' | 'healing' | 'gh_stack' | 'cognitive' | 'sleep' | 'anti_aging' | 'full';
    icon: string; // lucide icon name
    peptideNames: string[];
    defaultTierId?: string; // optional: auto-select this tier for template items
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
        dosageSchedule: 'Weeks 1\u20132: 0.5 mg weekly\nWeeks 3\u20134: 1 mg weekly\nWeeks 5\u20136: 1.5 mg weekly\nWeeks 7\u20138: 2 mg weekly\nWeeks 9\u201310: 2.5\u20134 mg weekly',
        dosingTiers: [
            {
                id: 'gentle',
                label: 'Gentle Start (Anti-Nausea)',
                doseAmount: 0.5,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Extra-cautious approach for GI-sensitive individuals. Stay at 0.5 mg for 2\u20134 weeks before escalating.',
                dosageSchedule: 'Weeks 1\u20134: 0.5 mg weekly\nWeeks 5\u20138: 1 mg weekly\nWeeks 9\u201312: 1.5 mg weekly\nWeeks 13\u201316: 2 mg weekly\nWeeks 17+: 2.5\u20134 mg weekly',
            },
            {
                id: 'standard',
                label: 'Standard Titration',
                doseAmount: 1,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Phase 2 clinical trial schedule. Dose-response plateaus between 4\u20138 mg (17.5% vs 18% weight loss). Most benefit at 4 mg with significantly fewer side effects than 8 mg.',
                dosageSchedule: 'Weeks 1\u20132: 1 mg weekly\nWeeks 3\u20134: 2 mg weekly\nWeeks 5\u20138: 4 mg weekly\nWeeks 9+: 4\u20138 mg weekly (maintenance)',
            },
            {
                id: 'aggressive',
                label: 'Aggressive Titration',
                doseAmount: 1,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Maximum studied dose is 12 mg weekly. GI side effects nearly double when skipping titration steps. 68% adverse effects at 8 mg. Requires close monitoring.',
                dosageSchedule: 'Weeks 1\u20134: 1 mg weekly\nWeeks 5\u20138: 2 mg weekly\nWeeks 9\u201312: 4 mg weekly\nWeeks 13\u201316: 8 mg weekly\nWeeks 17+: 12 mg weekly (maximum studied)',
            },
        ],
    },
    'MOTS-C': {
        description: 'This mitochondrial peptide regulates metabolic stress responses and significantly enhances insulin sensitivity and exercise capacity. It is often utilized to combat age-related metabolic decline by promoting glucose uptake within muscle tissues.',
        vialSizeMg: 40,
        reconstitutionMl: 2,
        defaultDoseAmount: 5,
        defaultDoseUnit: 'mg',
        defaultFrequency: '3x weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 2.5,
                doseUnit: 'mg',
                frequency: 'twice weekly',
                timing: 'AM',
                notes: 'Starting dose for metabolic support. 5 mg total per week.',
            },
            {
                id: 'standard',
                label: 'Standard Protocol',
                doseAmount: 5,
                doseUnit: 'mg',
                frequency: '3x weekly',
                timing: 'AM',
                notes: 'Most common protocol. 10\u201315 mg total per week. Dr. Bachmeyer recommends 2.5\u20135 mg every other day or combined with NAD+ every second day.',
            },
            {
                id: 'aggressive',
                label: 'Aggressive / Daily',
                doseAmount: 5,
                doseUnit: 'mg',
                frequency: 'every other day',
                timing: 'AM',
                notes: 'Short-term metabolic reset. 4\u20136 week duration recommended. Some protocols use daily 5 mg for maximum metabolic impact.',
            },
        ],
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
            dosage: '15\u201330 mg daily',
            reason: 'Take a Zinc supplement daily to balance copper levels.',
            productName: 'Thorne Zinc Picolinate 15mg',
            productLink: 'https://www.amazon.com/dp/B000FGWDTM',
        }],
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative (Anti-Aging)',
                doseAmount: 1,
                doseUnit: 'mg',
                frequency: '3x weekly',
                timing: 'AM',
                notes: 'Lower dose sufficient for anti-aging and skin health. 3 mg total per week.',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
            {
                id: 'standard',
                label: 'Standard Protocol',
                doseAmount: 2,
                doseUnit: 'mg',
                frequency: 'daily',
                timing: 'AM',
                notes: 'Dr. Bachmeyer recommends 2\u20133 mg daily. Standard for wound healing and tissue repair. 5 days on, 2 days off.',
                cyclePattern: '5 days ON, 2 days OFF. 8\u201316 week cycles.',
            },
            {
                id: 'aggressive',
                label: 'Aggressive (Wound Healing)',
                doseAmount: 2,
                doseUnit: 'mg',
                frequency: 'daily',
                timing: 'AM',
                notes: 'Daily dosing for active wound healing or immune support. Cap at 2 mg per injection. Contains copper \u2014 individuals with copper sensitivity should use caution.',
                cyclePattern: 'Daily for 8\u201312 weeks, then reassess.',
            },
        ],
    },
    'NAD+': {
        description: 'As a vital coenzyme found in every cell, NAD+ is essential for cellular energy production and the repair of damaged DNA. Restoring these levels helps support overall metabolic health and activates pathways associated with longevity.',
        vialSizeMg: 1000,
        reconstitutionMl: 5,
        defaultDoseAmount: 100,
        defaultDoseUnit: 'mg',
        defaultFrequency: '3x weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        supplementNotes: [{
            name: 'TMG (Trimethylglycine)',
            dosage: '500 mg daily',
            reason: 'Take TMG daily to restore methyl groups depleted by NAD+ therapy.',
            productName: 'Life Extension TMG 500mg',
            productLink: 'https://www.amazon.com/dp/B00068LBJO',
        }],
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative Start',
                doseAmount: 50,
                doseUnit: 'mg',
                frequency: 'twice weekly',
                timing: 'AM',
                notes: 'Start here for 2\u20134 weeks to assess tolerance. Minimal side effects expected. Dr. Bachmeyer notes oral NAD+ is ineffective \u2014 subcutaneous only.',
            },
            {
                id: 'standard',
                label: 'Standard Protocol',
                doseAmount: 100,
                doseUnit: 'mg',
                frequency: '3x weekly',
                timing: 'AM',
                notes: 'Most common clinical protocol. Administer when energy demands are high (before workouts, during stress). Can stack with CoQ10 and alpha-lipoic acid.',
            },
            {
                id: 'loading',
                label: 'Loading Phase',
                doseAmount: 200,
                doseUnit: 'mg',
                frequency: 'daily',
                timing: 'AM',
                notes: 'Saturates depleted cellular reserves. 7\u201310 day loading phase, then drop to standard maintenance. Doses above 200 mg require medical supervision.',
                dosageSchedule: 'Days 1\u201310: 200 mg daily (loading)\nDay 11+: 100 mg 2\u20133x/week (maintenance)',
            },
        ],
    },
    'TB-500': {
        description: 'This synthetic version of Thymosin Beta-4 is known for its ability to reduce inflammation and accelerate the healing of various tissues. It promotes cell migration to injury sites, making it a staple for recovering from muscle or ligament damage.',
        vialSizeMg: 20,
        reconstitutionMl: 2,
        defaultDoseAmount: 2.5,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'twice weekly',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 2,
                doseUnit: 'mg',
                frequency: 'twice weekly',
                timing: 'AM',
                notes: '4 mg/week loading for 4\u20136 weeks, then 2 mg every 1\u20132 weeks for maintenance.',
                dosageSchedule: 'Weeks 1\u20136: 2 mg twice weekly (loading)\nWeek 7+: 2 mg every 2 weeks (maintenance)',
                cyclePattern: '6 weeks loading, then maintenance. 6 weeks off between full loading cycles.',
            },
            {
                id: 'standard',
                label: 'Standard Loading + Maintenance',
                doseAmount: 2.5,
                doseUnit: 'mg',
                frequency: 'twice weekly',
                timing: 'AM',
                notes: 'Dr. Bachmeyer recommends 2.5\u20135 mg doses, twice per week for 6 weeks. At least 5 mg total per week recommended for effectiveness.',
                dosageSchedule: 'Weeks 1\u20136: 2.5 mg twice weekly (loading)\nWeek 7+: 2.5 mg weekly (maintenance)',
                cyclePattern: '6 weeks loading, then maintenance. 6 weeks off between full loading cycles.',
            },
            {
                id: 'aggressive',
                label: 'Aggressive Loading',
                doseAmount: 5,
                doseUnit: 'mg',
                frequency: 'twice weekly',
                timing: 'AM',
                notes: 'High-dose loading for severe injuries. 10 mg/week. TB-500 works by saturating tissue \u2014 loading phase is more important than with most peptides.',
                dosageSchedule: 'Weeks 1\u20134: 5 mg twice weekly (loading)\nWeek 5+: 2.5 mg weekly (maintenance)',
                cyclePattern: '4 weeks aggressive loading, then standard maintenance.',
            },
        ],
    },
    'BPC-157': {
        description: 'This peptide is derived from protective proteins in the stomach and is renowned for its versatile tissue-healing capabilities. It triggers the formation of new blood vessels and cellular repair to heal tendons, muscles, and even gut tissue.',
        vialSizeMg: 20,
        reconstitutionMl: 2,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        dosingTiers: [
            {
                id: 'maintenance',
                label: 'Maintenance / Prevention',
                doseAmount: 250,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'AM',
                notes: 'General maintenance and prevention. Inject subcutaneously. Under 150 lbs: 200\u2013300 mcg. Over 200 lbs: 400\u2013500 mcg.',
                cyclePattern: '4\u20138 weeks on, 2\u20134 weeks off.',
            },
            {
                id: 'standard',
                label: 'Standard Recovery',
                doseAmount: 500,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'AM',
                notes: 'Dr. Bachmeyer: 250\u2013500 mcg daily, 1 mg for optimal results. Inject as close to the injury site as safely possible for localized healing. Max 2 mg daily.',
                cyclePattern: '4\u20138 weeks on, 2\u20134 weeks off.',
            },
            {
                id: 'injury',
                label: 'Injury Loading (2x Daily)',
                doseAmount: 500,
                doseUnit: 'mcg',
                frequency: 'daily_am_pm',
                timing: 'AM',
                notes: '500 mcg morning + 500 mcg evening (1 mg total daily). For acute/severe injuries. Best stacked with TB-500 for synergistic healing.',
                dosageSchedule: 'Morning: 500 mcg near injury site\nEvening: 500 mcg near injury site\nTotal: 1 mg daily',
                cyclePattern: '8\u201312 weeks for severe injuries, then reassess.',
            },
        ],
    },
    'Semax': {
        description: 'Derived from ACTH, this peptide provides neuroprotective benefits and is widely recognized for enhancing cognitive function and focus. It modulates neurotransmitters in the brain to promote neurogenesis and help recovery from cognitive stress.',
        vialSizeMg: 10,
        reconstitutionMl: 1,
        defaultDoseAmount: 300,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'twice daily',
        defaultTiming: 'AM',
        administrationRoute: 'intranasal',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'AM',
                notes: '100\u2013200 mcg once or twice daily. Morning dosing only. Effects noticeable within 15\u201330 minutes.',
                cyclePattern: '10\u201314 days on, 7 days off.',
            },
            {
                id: 'standard',
                label: 'Standard Cognitive',
                doseAmount: 300,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '300\u2013600 mcg/day split into 2\u20133 doses (AM + early PM). Avoid evening dosing \u2014 may cause overstimulation/insomnia.',
                dosageSchedule: 'Morning: 200\u2013300 mcg intranasal\nEarly PM: 100\u2013300 mcg intranasal',
                cyclePattern: '10\u201314 days on, 7 days off.',
            },
            {
                id: 'aggressive',
                label: 'High-Dose Nootropic',
                doseAmount: 600,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '600\u2013900 mcg/day split into 2\u20133 doses. Up to 30 days at 900 mcg; up to 60 days at 600 mcg. For N-Acetyl Semax Amidate, reduce doses by 30\u201340% due to improved bioavailability.',
                dosageSchedule: 'Morning: 300 mcg intranasal\nAfternoon: 300 mcg intranasal\nOptional early PM: 300 mcg intranasal',
                cyclePattern: 'Up to 30 days on, then 7\u201314 days off.',
            },
        ],
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
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Week 1 Assessment',
                doseAmount: 1,
                doseUnit: 'mg',
                frequency: 'daily',
                timing: 'PM',
                notes: 'FDA: Start at 1 mg daily for week 1 to assess tolerability, then increase to 2 mg.',
            },
            {
                id: 'standard',
                label: 'Standard (FDA-Approved)',
                doseAmount: 2,
                doseUnit: 'mg',
                frequency: 'daily',
                timing: 'PM',
                notes: 'FDA-approved dose (Egrifta). Abdomen-only injection site per FDA label. Evening administration preferred to coincide with nocturnal GH release. Empty stomach recommended.',
            },
        ],
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
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 100,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: 'Starter dose. Fasted 2+ hours. Under 150 lbs: 100\u2013150 mcg. Evening dosing aligns with natural GH pulse during sleep.',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
            {
                id: 'standard',
                label: 'Standard Nightly',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: 'Dr. Bachmeyer: 200\u2013300 mcg per administration. Fasted, 30\u201360 minutes before bed on empty stomach. Administer Ipamorelin first, wait 15\u201320 min, then CJC-1295.',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
            {
                id: 'aggressive',
                label: 'Twice Daily',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily_am_pm',
                timing: 'AM',
                notes: '200\u2013300 mcg AM (fasted) + 200\u2013300 mcg pre-bed (fasted). Bell-shaped dose-response curve: exceeding ~300 mcg per injection yields diminishing returns.',
                dosageSchedule: 'AM (fasted): 200 mcg subcutaneous\nPre-bed (fasted): 200 mcg subcutaneous',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
        ],
    },
    'Selank': {
        description: 'This anxiolytic peptide is used to reduce anxiety levels and improve mental clarity without the sedative effects of traditional medications. It influences the immune response and neurotransmitter balance to provide a calming effect on the nervous system.',
        vialSizeMg: 10,
        reconstitutionMl: 1,
        defaultDoseAmount: 500,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'twice daily',
        defaultTiming: 'AM',
        administrationRoute: 'intranasal',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 250,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'AM',
                notes: '250\u2013400 mcg intranasal once daily. Anxiolytic effect comparable to low-dose benzodiazepines WITHOUT the sedation/addiction profile.',
                cyclePattern: '2 weeks on, 1 week off.',
            },
            {
                id: 'standard',
                label: 'Standard Protocol',
                doseAmount: 500,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '600\u2013750 mcg/day split into 2\u20133 doses. Clinical trials have used up to 2700 mcg/day intranasally for 21 days.',
                dosageSchedule: 'Morning: 250\u2013400 mcg intranasal\nAfternoon: 250\u2013400 mcg intranasal',
                cyclePattern: '2 weeks on, 1 week off.',
            },
            {
                id: 'aggressive',
                label: 'High-Dose Anxiolytic',
                doseAmount: 750,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '750\u20131000 mcg/day split into 2\u20133 doses. Up to 21 days continuous use. Subcutaneous route (250\u2013500 mcg) has better dose consistency than intranasal.',
                cyclePattern: 'Up to 21 days, then 7\u201314 days off.',
            },
        ],
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
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 100,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: '30\u201360 minutes before bed. Start here for 1\u20132 weeks to assess response. Dr. Bachmeyer describes DSIP as a "neuroregenerator" that normalizes HPA axis.',
                cyclePattern: '5 days ON, 2 days OFF.',
            },
            {
                id: 'standard',
                label: 'Standard Sleep Protocol',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: '200\u2013300 mcg, 30\u201360 min before bed. Most commonly reported effective range. Intermittent use (5 on / 2 off) preferred over nightly.',
                cyclePattern: '5 days ON, 2 days OFF.',
            },
            {
                id: 'aggressive',
                label: 'High-Dose (Severe Insomnia)',
                doseAmount: 500,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: '400\u2013500 mcg nightly for severe insomnia. Short-term use recommended. Short half-life \u2014 timing 30\u201360 min pre-bed is critical.',
                cyclePattern: 'Nightly for 2\u20134 weeks, then reassess. Do not exceed 4 weeks continuous.',
            },
        ],
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
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative (Stay at 5 mg)',
                doseAmount: 2.5,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Many patients see significant results at 5 mg. Start at 2.5 mg for 4 weeks, then 5 mg maintenance.',
                dosageSchedule: 'Weeks 1\u20134: 2.5 mg once weekly\nWeeks 5+: 5 mg once weekly (maintenance)',
            },
            {
                id: 'standard',
                label: 'Standard FDA Titration',
                doseAmount: 2.5,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'FDA-approved (Mounjaro). 4-week minimum between dose escalations. If GI side effects are intolerable, delay escalation by 4 additional weeks.',
                dosageSchedule: 'Weeks 1\u20134: 2.5 mg weekly\nWeeks 5\u20138: 5 mg weekly\nWeeks 9\u201312: 7.5 mg weekly\nWeeks 13\u201316: 10 mg weekly',
            },
            {
                id: 'aggressive',
                label: 'Maximum Dose Titration',
                doseAmount: 2.5,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Full titration to 15 mg. Maximum FDA-approved dose. DEXA scans show tirzepatide spares muscle better than other GLP-1 agonists.',
                dosageSchedule: 'Weeks 1\u20134: 2.5 mg weekly\nWeeks 5\u20138: 5 mg weekly\nWeeks 9\u201312: 7.5 mg weekly\nWeeks 13\u201316: 10 mg weekly\nWeeks 17\u201320: 12.5 mg weekly\nWeeks 21+: 15 mg weekly (maximum)',
            },
        ],
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
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative (Stay at 0.5 mg)',
                doseAmount: 0.25,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Effective for many patients at 0.5 mg. Patients who track caloric intake lose 16% vs 8% without tracking.',
                dosageSchedule: 'Weeks 1\u20134: 0.25 mg weekly\nWeeks 5+: 0.5 mg weekly (maintenance)',
            },
            {
                id: 'standard',
                label: 'Standard Wegovy Titration',
                doseAmount: 0.25,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'FDA-approved (Wegovy). Same day each week. Can change injection day if last dose was 2+ days ago.',
                dosageSchedule: 'Weeks 1\u20134: 0.25 mg weekly\nWeeks 5\u20138: 0.5 mg weekly\nWeeks 9\u201312: 1.0 mg weekly\nWeeks 13\u201316: 1.7 mg weekly\nWeeks 17+: 2.4 mg weekly (target)',
            },
            {
                id: 'aggressive',
                label: 'Maximum Dose (2.4 mg)',
                doseAmount: 0.25,
                doseUnit: 'mg',
                frequency: 'weekly',
                timing: 'AM',
                notes: 'Maximum FDA-approved dose. Dr. Bachmeyer notes semaglutide weight loss may include significant muscle tissue \u2014 combine with resistance training.',
                dosageSchedule: 'Weeks 1\u20134: 0.25 mg weekly\nWeeks 5\u20138: 0.5 mg weekly\nWeeks 9\u201312: 1.0 mg weekly\nWeeks 13\u201316: 1.7 mg weekly\nWeeks 17+: 2.4 mg weekly (maximum)',
            },
        ],
    },
    'CJC-1295': {
        description: 'A growth hormone-releasing hormone analog that provides sustained GH elevation without the sharp spikes of direct GH administration. This is the "no DAC" (Modified GRF 1-29) version with a 30-minute half-life that mimics natural GH pulses.',
        vialSizeMg: 5,
        reconstitutionMl: 2,
        defaultDoseAmount: 200,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'daily',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
        stackGroup: 'Evening GH Stack',
        stackLabel: 'Evening Stack Part 1 (Alt)',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 100,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: 'Starter dose. Fasted 2+ hours. For CJC-1295 WITH DAC, use 2 mg once weekly instead (8-day half-life).',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
            {
                id: 'standard',
                label: 'Standard (No DAC)',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'Before bed',
                notes: 'Most common no-DAC protocol. Fasted, before bed. Dr. Bachmeyer: Administer Ipamorelin first, wait 15\u201320 min, then CJC-1295. Food (especially carbs) blunts GH response.',
                cyclePattern: '8\u201312 weeks on, 4 weeks off.',
            },
            {
                id: 'aggressive',
                label: 'Twice Daily',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'daily_am_pm',
                timing: 'AM',
                notes: '200\u2013300 mcg AM (fasted) + 200\u2013300 mcg pre-bed (fasted) for enhanced GH pulsatility. Combined with Ipamorelin is the most popular GH secretagogue stack.',
                dosageSchedule: 'AM (fasted): 200 mcg subcutaneous\nPre-bed (fasted): 200 mcg subcutaneous',
                cyclePattern: '8\u201316 weeks on, 4 weeks off.',
            },
        ],
    },
    'PT-141': {
        description: 'This melanocortin receptor agonist works through the central nervous system to enhance sexual desire and function. Unlike PDE5 inhibitors, it acts on the brain to stimulate natural arousal pathways.',
        vialSizeMg: 10,
        reconstitutionMl: 2,
        defaultDoseAmount: 1.75,
        defaultDoseUnit: 'mg',
        defaultFrequency: 'as needed',
        defaultTiming: 'PM',
        administrationRoute: 'subcutaneous',
        warningText: 'Maximum 1 dose per 24 hours. Maximum 8 doses per month. Can cause temporary skin darkening. Not for use with uncontrolled hypertension.',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'First-Time / Test Dose',
                doseAmount: 0.5,
                doseUnit: 'mg',
                frequency: 'as needed',
                timing: 'PM',
                notes: 'Test dose to assess response and nausea risk. Inject 45+ min before activity. Peak plasma ~1 hour post-injection. Effects last 6\u201312 hours.',
            },
            {
                id: 'standard',
                label: 'Standard (FDA-Approved)',
                doseAmount: 1.75,
                doseUnit: 'mg',
                frequency: 'as needed',
                timing: 'PM',
                notes: 'FDA-approved dose (Vyleesi). Sweet spot for efficacy vs. side effects. Common side effect: nausea and skin flush for ~30 min. Not a daily peptide \u2014 use on-demand only.',
            },
        ],
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
    'Hexarelin': {
        description: 'The most potent growth hormone-releasing peptide (GHRP), Hexarelin stimulates significant GH release from the pituitary. It is highly effective but requires strict cycling due to receptor desensitization.',
        vialSizeMg: 5,
        reconstitutionMl: 2,
        defaultDoseAmount: 100,
        defaultDoseUnit: 'mcg',
        defaultFrequency: 'twice daily',
        defaultTiming: 'AM',
        administrationRoute: 'subcutaneous',
        warningText: 'Hexarelin is the MOST prone to desensitization among GHRPs. Strict cycling is non-negotiable. Can elevate cortisol and prolactin. Must be taken fasted.',
        dosingTiers: [
            {
                id: 'conservative',
                label: 'Conservative',
                doseAmount: 100,
                doseUnit: 'mcg',
                frequency: 'daily',
                timing: 'AM',
                notes: '100 mcg once daily fasted (1 hour before meals or 3 hours after). Tolerance assessment week.',
                cyclePattern: '8\u201312 weeks on, 4\u20136 weeks off. MANDATORY break.',
            },
            {
                id: 'standard',
                label: 'Standard (2\u20133x Daily)',
                doseAmount: 100,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '100 mcg 2\u20133x daily (200\u2013300 mcg total). Empty stomach required for each dose. Short half-life (30\u201345 min) \u2014 consistent timing matters.',
                cyclePattern: '8\u201312 weeks on, 4\u20136 weeks off. MANDATORY break \u2014 desensitization is reversible after 4 weeks off.',
            },
            {
                id: 'aggressive',
                label: 'High-Dose (Short-Term)',
                doseAmount: 200,
                doseUnit: 'mcg',
                frequency: 'twice daily',
                timing: 'AM',
                notes: '200 mcg 2\u20133x daily (400\u2013600 mcg total). Short-term only. Higher desensitization risk. Fasted administration essential.',
                cyclePattern: 'Maximum 8 weeks, then 6 weeks off.',
            },
        ],
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
        description: 'TB-500 20mg + BPC-157 20mg for tissue repair and recovery',
        category: 'healing',
        icon: 'Heart',
        peptideNames: ['TB500 20mg', 'BPC-157 20mg'],
    },
    {
        name: 'Healing Stack (Injury)',
        description: 'TB-500 20mg aggressive loading + BPC-157 20mg 2x daily for acute injuries',
        category: 'healing',
        icon: 'Heart',
        peptideNames: ['TB500 20mg', 'BPC-157 20mg'],
        defaultTierId: 'injury',
    },
    {
        name: 'GH Stack (Evening)',
        description: '2x Tesamorelin 20mg + Ipamorelin for growth hormone optimization',
        category: 'gh_stack',
        icon: 'TrendingUp',
        peptideNames: ['Tesamorelin 20mg', 'Tesamorelin 20mg', 'Ipamorelin'],
    },
    {
        name: 'Weight Loss',
        description: 'Retatrutide + MOTS-C for metabolic enhancement',
        category: 'weight_loss',
        icon: 'Flame',
        peptideNames: ['Retatrutide', 'MOTS-C'],
    },
    {
        name: 'Weight Loss (Gentle)',
        description: 'Retatrutide gentle start + MOTS-C conservative for GI-sensitive clients',
        category: 'weight_loss',
        icon: 'Flame',
        peptideNames: ['Retatrutide', 'MOTS-C'],
        defaultTierId: 'gentle',
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
        name: 'GLOW',
        description: 'GHK-Cu + BPC-157 20mg + TB-500 20mg for skin rejuvenation, collagen synthesis, and tissue repair',
        category: 'anti_aging',
        icon: 'Sparkles',
        peptideNames: ['GHK-Cu', 'BPC-157 20mg', 'TB500 20mg'],
    },
    {
        name: 'KLOW',
        description: 'GLOW stack + KPV for enhanced anti-inflammatory support and immune modulation',
        category: 'anti_aging',
        icon: 'Sparkles',
        peptideNames: ['GHK-Cu', 'BPC-157 20mg', 'TB500 20mg', 'KPV'],
    },
    {
        name: 'Full Protocol',
        description: 'Complete 11-peptide protocol: weight loss, healing, GH, cognitive, and sleep',
        category: 'full',
        icon: 'LayoutGrid',
        peptideNames: [
            'Retatrutide', 'MOTS-C', 'GHK-Cu', 'NAD+',
            'TB500', 'BPC-157', 'Semax', 'Tesamorelin',
            'Ipamorelin', 'Selank', 'DSIP',
        ],
    },
];
