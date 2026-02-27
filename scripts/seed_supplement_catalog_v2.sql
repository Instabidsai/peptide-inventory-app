-- ═══════════════════════════════════════════════════════════════
-- Supplement Catalog v2 — Comprehensive Peptide Support Stack
-- ═══════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor.
-- Uses INSERT ... WHERE NOT EXISTS to avoid duplicates.
-- Amazon search URLs (always work). Update image_url via Admin UI
-- with actual product photos from Amazon listings.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Update existing supplements with better links ─────────

UPDATE supplements
SET purchase_link = 'https://www.amazon.com/dp/B000FGWDTM',
    description = 'Highly absorbable Zinc Picolinate by Thorne. Essential for immune function, GH production, testosterone synthesis, and balancing copper from GHK-Cu therapy. 15mg per capsule.'
WHERE name ILIKE '%Zinc Picolinate%';

UPDATE supplements
SET purchase_link = 'https://www.amazon.com/dp/B00068LBJO',
    description = 'Trimethylglycine (Betaine) by Life Extension. REQUIRED with NAD+ therapy to replenish methyl groups depleted during NAD+ metabolism. Prevents elevated homocysteine. 500mg per capsule.'
WHERE name ILIKE '%TMG%';

UPDATE supplements
SET purchase_link = 'https://www.amazon.com/s?k=Sports+Research+Triple+Strength+Omega+3+Fish+Oil+from+Wild+Alaska+Pollock',
    description = 'Triple Strength Wild Alaskan Fish Oil (1250mg) by Sports Research. Sustainably sourced, IFOS 5-Star certified. Supports brain, heart, joints, and reduces neuroinflammation. Essential for cognitive peptides and tissue repair.'
WHERE name ILIKE '%Omega%';

-- ── 2. Insert new supplements ────────────────────────────────

-- Vitamin D3 + K2
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Thorne Vitamin D3 + K2 Liquid',
       'Vitamin D3 (1000 IU) + K2 (200 mcg MK-7) liquid drops by Thorne. D3 regulates 200+ genes for immune function, bone metabolism, and hormone production. K2 directs calcium to bones instead of arteries. Essential for tissue repair peptides (TB-500), GH stacks, and anti-aging protocols.',
       NULL,
       'https://www.amazon.com/s?k=Thorne+Vitamin+D+K2+Liquid',
       '2 drops (2000 IU D3)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%D3%K2%');

-- Magnesium Glycinate
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Doctor''s Best Magnesium Glycinate 200mg',
       'High absorption chelated magnesium glycinate. Cofactor for 600+ enzymatic reactions, ATP function, sleep quality, and GH release. Best general-purpose magnesium — well-tolerated, calming, excellent for evening dosing with GH peptides.',
       NULL,
       'https://www.amazon.com/s?k=Doctors+Best+High+Absorption+Magnesium+Glycinate+Lysinate',
       '2 tablets (200mg elemental)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Magnesium Glycinate%');

-- Magnesium L-Threonate
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Life Extension Neuro-Mag Magnesium L-Threonate',
       'The ONLY magnesium form clinically shown to cross the blood-brain barrier and increase brain magnesium levels. Enhances NMDA receptor function and synaptic density. Specifically recommended for cognitive peptides (Selank, Semax, Dihexa).',
       NULL,
       'https://www.amazon.com/s?k=Life+Extension+Neuro+Mag+Magnesium+L-Threonate',
       '3 capsules (2000mg Magtein)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Magnesium L-Threonate%' OR name ILIKE '%Neuro-Mag%');

-- B-Complex
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Thorne Basic B Complex',
       'Active-form B vitamins: methylcobalamin (B12), methylfolate, P5P (B6), riboflavin-5-phosphate (B2). Bypasses genetic polymorphisms (MTHFR). Supports methylation, neurotransmitter synthesis, energy metabolism. Recommended for NAD+ therapy and cognitive peptides.',
       NULL,
       'https://www.amazon.com/s?k=Thorne+Basic+B+Complex',
       '1 capsule daily'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%B Complex%' OR name ILIKE '%B-Complex%');

-- NAC
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods NAC 600mg',
       'N-Acetyl Cysteine — rate-limiting precursor for glutathione (the body''s master antioxidant). Supports liver detoxification, reduces oxidative stress. Essential for Glutathione protocols, LL-37 antimicrobial protocols, and Dihexa liver protection.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+NAC+600mg+N-Acetyl+Cysteine',
       '1 capsule 2x daily (1200mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%NAC%');

-- CoQ10 / Ubiquinol
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Jarrow Formulas QH-Absorb Ubiquinol 100mg',
       'Enhanced absorption ubiquinol (reduced CoQ10) — the electron carrier between mitochondrial complexes I/II and III. Directly synergistic with SS-31, MOTS-c, and other mitochondrial peptides. Ubiquinol form has 3-8x better absorption than ubiquinone.',
       NULL,
       'https://www.amazon.com/s?k=Jarrow+Formulas+QH-Absorb+Ubiquinol+100mg',
       '1 softgel daily (100mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Ubiquinol%' OR name ILIKE '%CoQ10%');

-- PQQ
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Life Extension PQQ Caps 20mg',
       'Pyrroloquinoline Quinone — stimulates mitochondrial biogenesis (creation of new mitochondria) via PGC-1alpha activation. Paired with SS-31 which optimizes existing mitochondria. Together they address both quality and quantity of the mitochondrial pool.',
       NULL,
       'https://www.amazon.com/s?k=Life+Extension+PQQ+Caps+20mg',
       '1 capsule daily (20mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%PQQ%');

-- Electrolytes (for GLP-1 agonists)
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'LMNT Zero-Sugar Electrolytes',
       'REQUIRED for GLP-1 agonist users (Semaglutide, Tirzepatide, Retatrutide, Cagrilintide). These peptides reduce food/fluid intake and slow gastric emptying, depleting sodium, potassium, and magnesium. Prevents muscle cramps, fatigue, dizziness, and cardiac arrhythmias.',
       NULL,
       'https://www.amazon.com/s?k=LMNT+Zero+Sugar+Electrolytes+Variety+Pack',
       '1 packet daily in water'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%LMNT%' OR name ILIKE '%Electrolyte%');

-- Vitamin B12 Sublingual (for GLP-1 users)
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Jarrow Formulas Methyl B-12 1000mcg Sublingual',
       'Methylcobalamin sublingual lozenge — bypasses gastric absorption (critical for GLP-1 users since these peptides reduce gastric acid). GLP-1 agonists impair B12 absorption long-term. B12 deficiency causes peripheral neuropathy, fatigue, and cognitive impairment.',
       NULL,
       'https://www.amazon.com/s?k=Jarrow+Formulas+Methyl+B12+1000+mcg+Sublingual',
       '1 lozenge daily (sublingual)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%B-12%' OR name ILIKE '%B12%Sublingual%');

-- Collagen/Protein (for GLP-1 users)
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Vital Proteins Collagen Peptides',
       'Grass-fed, pasture-raised collagen peptides. CRITICAL for GLP-1 agonist users — rapid weight loss causes 20-40% lean mass loss without adequate protein. Also supports connective tissue healing for BPC-157 and TB-500 protocols. Dissolves in hot or cold liquids.',
       NULL,
       'https://www.amazon.com/s?k=Vital+Proteins+Collagen+Peptides+Unflavored',
       '2 scoops daily (20g protein)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Collagen%Peptides%');

-- L-Glutamine
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods L-Glutamine 1000mg',
       'Primary fuel source for intestinal lining cells (enterocytes). Synergistic with BPC-157 and KPV for gut healing — peptides provide repair signals, glutamine provides building material. Also supports immune function during healing protocols.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+L-Glutamine+1000mg+Capsules',
       '2-3 capsules 2x daily (4-6g)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%L-Glutamine%');

-- Vitamin C
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods Vitamin C-1000 with Rose Hips',
       'Essential cofactor for collagen synthesis (prolyl and lysyl hydroxylase). Critical for tissue-repair peptides (BPC-157, TB-500, GHK-Cu). Also supports immune function, antioxidant defense, and recycles oxidized glutathione back to active form.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+Vitamin+C+1000+Rose+Hips',
       '1 tablet 1-2x daily (1000-2000mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Vitamin C%');

-- Alpha-Lipoic Acid
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods Alpha-Lipoic Acid 600mg',
       'Mitochondrial antioxidant that works in both water and fat environments. Recycles glutathione, vitamin C, and vitamin E. Supports insulin sensitivity. Key companion for SS-31, MOTS-c, Humanin, and Glutathione protocols.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+Alpha+Lipoic+Acid+600mg',
       '1 capsule daily (600mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Alpha-Lipoic%' OR name ILIKE '%Alpha Lipoic%');

-- Probiotics
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Garden of Life Dr. Formulated Probiotics 50 Billion',
       'Multi-strain shelf-stable probiotic. Primary companion for KPV (anti-inflammatory gut peptide) and BPC-157 oral protocols. KPV reduces NF-kB gut inflammation; probiotics restore healthy microbiome in the healed environment.',
       NULL,
       'https://www.amazon.com/s?k=Garden+of+Life+Dr+Formulated+Probiotics+Once+Daily+50+Billion',
       '1 capsule daily'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Probiotic%');

-- Ginger Root
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'New Chapter Ginger Force',
       'Supercritical ginger extract — acts on 5-HT3 receptors to reduce central nausea. Take 30 minutes before PT-141 or Melanotan 2 injection to prevent nausea (reported in ~40% of users). Also helpful during GLP-1 titration phases.',
       NULL,
       'https://www.amazon.com/s?k=New+Chapter+Ginger+Force',
       '1 liquid phyto-cap 30 min before injection'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Ginger%');

-- Berberine
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Thorne Berberine 1000mg',
       'Natural AMPK activator — lowers fasting blood glucose comparably to metformin. STRONGLY recommended for MK-677 users (which significantly raises blood glucose and reduces insulin sensitivity). Also synergistic with MOTS-c for metabolic optimization.',
       NULL,
       'https://www.amazon.com/s?k=Thorne+Berberine+1000mg',
       '1 capsule with meals (500mg 2x daily)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Berberine%');

-- Acetyl L-Carnitine
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods Acetyl L-Carnitine 500mg',
       'Transports long-chain fatty acids into mitochondria for beta-oxidation (fuel delivery). SS-31 optimizes the electron transport chain; ALCAR ensures adequate fuel supply to the optimized mitochondria. Also crosses blood-brain barrier for cognitive support.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+Acetyl+L-Carnitine+500mg',
       '1-2 capsules daily (500-1000mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Acetyl%Carnitine%' OR name ILIKE '%ALCAR%');

-- Lion's Mane
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Real Mushrooms Lion''s Mane Extract',
       'Dual-extracted (hot water + alcohol) lion''s mane mushroom. Contains hericenones and erinacines that stimulate NGF synthesis. Synergistic with Semax (which also upregulates NGF) and Dihexa for neurotrophic support. Verified beta-glucan content.',
       NULL,
       'https://www.amazon.com/s?k=Real+Mushrooms+Lions+Mane+Extract+Capsules',
       '2 capsules daily (1000mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Lion%Mane%');

-- Alpha-GPC
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'NOW Foods Alpha-GPC 300mg',
       'Choline donor for acetylcholine production and phosphatidylcholine membrane synthesis. New synaptic connections (from Dihexa, Semax) require choline for neurotransmitter signaling and membrane construction. Also supports GH release.',
       NULL,
       'https://www.amazon.com/s?k=NOW+Foods+Alpha+GPC+300mg',
       '1-2 capsules daily (300-600mg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Alpha-GPC%' OR name ILIKE '%Alpha GPC%');

-- Chromium Picolinate (for MK-677)
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Nutricost Chromium Picolinate 200mcg',
       'Enhances insulin receptor sensitivity and GLUT4 glucose transporter activity. Partially counteracts MK-677''s glucose-raising effects. Budget-friendly and well-tolerated. Take with meals.',
       NULL,
       'https://www.amazon.com/s?k=Nutricost+Chromium+Picolinate+200mcg',
       '1 capsule with meals (200mcg)'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Chromium%');

-- Psyllium Husk / Fiber (for GLP-1 users)
INSERT INTO supplements (name, description, image_url, purchase_link, default_dosage)
SELECT 'Metamucil Psyllium Fiber Supplement',
       'Soluble fiber supplement. GLP-1 agonists reduce food volume (= less fiber) and slow gastric motility, causing severe constipation in many users. Psyllium husk adds bulk to prevent this common side effect. Take with plenty of water.',
       NULL,
       'https://www.amazon.com/s?k=Metamucil+Psyllium+Fiber+Sugar+Free+Powder',
       '1 serving daily with 8oz water'
WHERE NOT EXISTS (SELECT 1 FROM supplements WHERE name ILIKE '%Psyllium%' OR name ILIKE '%Fiber Supplement%');


-- ═══════════════════════════════════════════════════════════════
-- PEPTIDE → SUPPLEMENT LINKS (peptide_suggested_supplements)
-- ═══════════════════════════════════════════════════════════════
-- These power the "Suggested For You" section in client view.
-- Uses ON CONFLICT DO NOTHING to be idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── GHK-Cu → Zinc (REQUIRED) ────────────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: GHK-Cu delivers copper into the body. Without zinc supplementation, copper accumulates and depletes zinc stores, causing headaches, nausea, and immune suppression. Take zinc 2+ hours apart from GHK-Cu.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%GHK-Cu%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Vitamin C is a cofactor for collagen synthesis, which is the primary effect GHK-Cu promotes. Also regulates copper metabolism.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%GHK-Cu%' AND s.name ILIKE '%Vitamin C%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── NAD+ → TMG (REQUIRED) ───────────────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: NAD+ therapy depletes methyl groups via NNMT enzyme activity. TMG donates 3 methyl groups to replenish the pool. Without it, homocysteine rises and DNA methylation suffers.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%NAD+%' AND s.name ILIKE '%TMG%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'B-vitamins (methylated forms) are co-factors in the methionine cycle that recycles homocysteine. Work synergistically with TMG during NAD+ therapy.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%NAD+%' AND s.name ILIKE '%B Complex%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Sirtuin activation (the primary pathway of elevated NAD+) is magnesium-dependent. NAD+ participates in 500+ enzymatic reactions, many requiring magnesium.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%NAD+%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── BPC-157 → Omega-3, Vitamin C, L-Glutamine ──────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'BPC-157 promotes collagen synthesis during tissue repair. Vitamin C is the essential cofactor for collagen crosslinking enzymes (prolyl/lysyl hydroxylase).'
FROM peptides p, supplements s
WHERE p.name ILIKE '%BPC-157%' AND s.name ILIKE '%Vitamin C%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'BPC-157 modulates the NO system with anti-inflammatory properties. Omega-3s resolve inflammation through SPMs (specialized pro-resolving mediators). Together they address both repair and inflammation.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%BPC-157%' AND s.name ILIKE '%Omega%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'L-Glutamine is the primary fuel for intestinal lining cells. BPC-157 provides the repair signals; glutamine provides the building material. Especially important for oral BPC-157.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%BPC-157%' AND s.name ILIKE '%L-Glutamine%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── TB-500 → D3+K2, Magnesium ──────────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'TB-500 promotes tissue repair and stem cell differentiation. Vitamin D3 regulates 200+ repair/immune genes and is a co-factor for stem cell differentiation. K2 ensures calcium goes to repair sites.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%TB-500%' AND s.name ILIKE '%D3%K2%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'TB-500 upregulates actin polymerization for cell migration and wound healing. Actin-myosin interactions are ATP and magnesium dependent.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%TB-500%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Semaglutide → Electrolytes, B12, Protein, Fiber, Omega-3
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: GLP-1 agonists reduce food/fluid intake and slow gastric emptying, depleting electrolytes. Prevents muscle cramps, fatigue, dizziness, and cardiac arrhythmias.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%Electrolyte%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: GLP-1 agonists reduce gastric acid and slow emptying, impairing B12 absorption. Sublingual form bypasses this issue. Deficiency causes neuropathy and cognitive impairment.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%B-12%' OR (p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%B12%Sublingual%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'CRITICAL: 20-40% of weight lost from GLP-1 agonists is lean muscle mass without adequate protein. Collagen also supports connective tissue during rapid body composition changes.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%Collagen%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'GLP-1 agonists reduce food volume (less fiber) and slow GI motility. Constipation is one of the most common side effects. Psyllium adds bulk to prevent this.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%Psyllium%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Reduced food intake means reduced healthy fat intake. Omega-3s support the metabolic improvements GLP-1 agonists provide (insulin sensitivity, lipid profile).'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semaglutide%' AND s.name ILIKE '%Omega%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Tirzepatide → Same as Semaglutide ──────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: GLP-1/GIP dual agonists reduce food/fluid intake, depleting electrolytes. Prevents muscle cramps, fatigue, and dizziness.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tirzepatide%' AND s.name ILIKE '%Electrolyte%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: GLP-1 agonists impair B12 absorption. Sublingual methylcobalamin bypasses gastric absorption issues.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tirzepatide%' AND s.name ILIKE '%B-12%' OR (p.name ILIKE '%Tirzepatide%' AND s.name ILIKE '%B12%Sublingual%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'CRITICAL: Preserve lean muscle mass during rapid GLP-1 mediated weight loss. Collagen supports connective tissue integrity.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tirzepatide%' AND s.name ILIKE '%Collagen%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Prevents severe constipation from reduced food volume and slowed GI motility caused by GLP-1/GIP agonism.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tirzepatide%' AND s.name ILIKE '%Psyllium%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Retatrutide → Same as Semaglutide/Tirzepatide ──────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: Triple agonist (GLP-1/GIP/glucagon) causes significant appetite suppression. Electrolytes prevent dehydration symptoms.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Retatrutide%' AND s.name ILIKE '%Electrolyte%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'REQUIRED: B12 absorption impaired by GLP-1 class peptides. Sublingual delivery bypasses gastric issue.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Retatrutide%' AND s.name ILIKE '%B-12%' OR (p.name ILIKE '%Retatrutide%' AND s.name ILIKE '%B12%Sublingual%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Preserve lean mass during aggressive weight loss. Retatrutide shows up to 24% body weight reduction in trials.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Retatrutide%' AND s.name ILIKE '%Collagen%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Cagrilintide → Similar to GLP-1 stack ───────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Amylin analog reduces appetite and food intake. Electrolytes prevent depletion from reduced fluid/food consumption.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Cagri%' AND s.name ILIKE '%Electrolyte%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Protein supplementation prevents lean mass loss during amylin-mediated appetite suppression and weight loss.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Cagri%' AND s.name ILIKE '%Collagen%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── CJC-1295 / Ipamorelin / Sermorelin / Hexarelin → Mag, Zinc
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'GH secretion occurs primarily during deep sleep. Magnesium glycinate promotes GABA activity and deep sleep architecture, enhancing the natural GH pulse these peptides amplify.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%CJC-1295%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc is directly involved in GH synthesis and IGF-1 receptor signaling. Deficiency reduces GH output.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%CJC-1295%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Magnesium promotes deep sleep and GABA activity, enhancing the GH pulse that Ipamorelin stimulates via ghrelin receptors.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Ipamorelin%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc is a critical cofactor for GH production and IGF-1 signaling downstream of Ipamorelin.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Ipamorelin%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Magnesium supports deep sleep architecture and IGF-1 signaling for optimal GH release from Sermorelin.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Sermorelin%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc supports GH production and IGF-1 receptor signaling.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Sermorelin%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Magnesium is a cofactor for IGF-1 signaling and supports deep sleep when GH release occurs.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Hexarelin%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Essential cofactor for GH synthesis and IGF-1 activity.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Hexarelin%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Tesamorelin → Magnesium, Zinc, D3+K2 ───────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Tesamorelin is a GHRH analog. Magnesium supports deep sleep and IGF-1 signaling for optimal GH response.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tesamorelin%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc supports GH synthesis and the IGF-1 cascade that Tesamorelin activates.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Tesamorelin%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Selank / Semax → Omega-3, Mag Threonate, Lion's Mane ───
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Selank modulates BDNF and serotonin systems. DHA (40% of brain phospholipid membranes) is the structural substrate for BDNF signaling. Peptide provides signal; omega-3 provides material.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Selank%' AND s.name ILIKE '%Omega%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Only magnesium form proven to cross the blood-brain barrier. Enhances NMDA receptor function complementary to Selank''s BDNF/GABA modulation.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Selank%' AND s.name ILIKE '%Magnesium L-Threonate%' OR (p.name ILIKE '%Selank%' AND s.name ILIKE '%Neuro-Mag%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Semax upregulates BDNF, NGF, and CNTF. DHA is the structural substrate for the neuroplasticity these neurotrophins promote. High-DHA fish oil is strongly recommended.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semax%' AND s.name ILIKE '%Omega%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Magnesium L-Threonate crosses the BBB and enhances synaptic density, complementing Semax''s neurotrophic signaling.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semax%' AND s.name ILIKE '%Magnesium L-Threonate%' OR (p.name ILIKE '%Semax%' AND s.name ILIKE '%Neuro-Mag%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Lion''s mane stimulates NGF via hericenones/erinacines. Semax also upregulates NGF — combination is additive for neurotrophic support.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Semax%' AND s.name ILIKE '%Lion%Mane%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── PT-141 / Melanotan 2 → Ginger ──────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Nausea is the #1 side effect of PT-141 (~40% of users). Ginger acts on 5-HT3 receptors to reduce central nausea. Take 30 minutes before injection.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%PT-141%' AND s.name ILIKE '%Ginger%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Ginger reduces the nausea commonly experienced with melanocortin receptor agonists. Take before injection.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Melanotan%' AND s.name ILIKE '%Ginger%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Epithalon → Zinc, D3+K2, Vitamin C ─────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Epithalon activates telomerase which contains a zinc finger domain. Zinc deficiency directly reduces telomerase activity, opposing Epithalon''s primary mechanism.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Epithalon%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Vitamin D3 independently supports telomere length. Higher serum D3 is associated with longer telomeres. Synergistic with Epithalon''s telomerase activation.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Epithalon%' AND s.name ILIKE '%D3%K2%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Telomeres are vulnerable to oxidative damage. Vitamin C protects the telomeres that Epithalon is working to extend.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Epithalon%' AND s.name ILIKE '%Vitamin C%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── KPV → Probiotics, L-Glutamine, Omega-3 ─────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'KPV reduces NF-kB gut inflammation. Probiotics restore the healthy microbiome in the healed gut environment. Specific strains (S. boulardii, L. rhamnosus GG) have evidence for IBD.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%KPV%' AND s.name ILIKE '%Probiotic%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'L-Glutamine fuels intestinal cells while KPV reduces the inflammation damaging them. Repair signal + building material.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%KPV%' AND s.name ILIKE '%L-Glutamine%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Omega-3s produce resolvins and protectins that work alongside KPV''s NF-kB suppression to resolve gut inflammation.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%KPV%' AND s.name ILIKE '%Omega%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── SS-31 → CoQ10, PQQ, ALA, ALCAR, Magnesium ─────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'SS-31 stabilizes cardiolipin in the inner mitochondrial membrane. CoQ10 is the electron carrier in the same chain. Directly synergistic — same organelle, complementary mechanisms.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%SS-31%' AND (s.name ILIKE '%Ubiquinol%' OR s.name ILIKE '%CoQ10%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'PQQ creates NEW mitochondria (biogenesis). SS-31 OPTIMIZES existing ones. Together they address both mitochondrial quality and quantity.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%SS-31%' AND s.name ILIKE '%PQQ%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Alpha-lipoic acid is a mitochondrial antioxidant supporting the reduced-ROS environment that SS-31 creates.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%SS-31%' AND s.name ILIKE '%Alpha-Lipoic%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'ALCAR transports fatty acids into mitochondria for fuel. SS-31 optimizes the ETC; ALCAR ensures adequate fuel supply.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%SS-31%' AND s.name ILIKE '%Acetyl%Carnitine%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── MOTS-C → CoQ10, Magnesium, Berberine ───────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'MOTS-c activates AMPK to improve mitochondrial function. CoQ10 supports the electron transport chain that MOTS-c is optimizing.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%MOTS%' AND (s.name ILIKE '%Ubiquinol%' OR s.name ILIKE '%CoQ10%')
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'AMPK activation by MOTS-c requires magnesium. Metabolic processes regulated by MOTS-c (glucose uptake, fatty acid oxidation) are also magnesium-dependent.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%MOTS%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Berberine is also an AMPK activator via different mechanism (Complex I inhibition). Potentially additive with MOTS-c for metabolic optimization.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%MOTS%' AND s.name ILIKE '%Berberine%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── LL-37 → NAC, Vitamin C (already in protocol-knowledge) ──
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'NAC is a glutathione precursor — supports liver detox during LL-37''s biofilm disruption and Herxheimer reactions.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%LL-37%' AND s.name ILIKE '%NAC%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Immune support during active antimicrobial protocol. Also recycles oxidized glutathione.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%LL-37%' AND s.name ILIKE '%Vitamin C%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Glutathione → NAC, Vitamin C, ALA ──────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'NAC is the rate-limiting precursor for your body''s own glutathione production between injections.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Glutathione%' AND s.name ILIKE '%NAC%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Vitamin C recycles oxidized glutathione back to its active reduced form, extending the benefit of each injection.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Glutathione%' AND s.name ILIKE '%Vitamin C%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Alpha-lipoic acid regenerates both glutathione AND vitamin C — the complete antioxidant recycling network.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Glutathione%' AND s.name ILIKE '%Alpha-Lipoic%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Thymosin Alpha-1 → D3+K2, Zinc ─────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Thymosin Alpha-1 modulates immune cell maturation. Vitamin D3 regulates immune function and T-cell differentiation — directly synergistic pathways.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Thymosin Alpha%' AND s.name ILIKE '%D3%K2%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc is essential for thymic function and T-cell development — the primary cells Thymosin Alpha-1 acts upon.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Thymosin Alpha%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── Kisspeptin → Zinc, D3, Magnesium ────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Zinc is essential for testosterone synthesis stimulated by Kisspeptin''s HPG axis activation.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Kisspeptin%' AND s.name ILIKE '%Zinc%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Vitamin D3 supports HPG axis function and testosterone production stimulated by Kisspeptin.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Kisspeptin%' AND s.name ILIKE '%D3%K2%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'Magnesium supports hormone production, sleep quality, and overall HPG axis function.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%Kisspeptin%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ── DSIP → Magnesium Glycinate ──────────────────────────────
INSERT INTO peptide_suggested_supplements (peptide_id, supplement_id, reasoning)
SELECT p.id, s.id, 'DSIP is a sleep peptide. Magnesium glycinate promotes GABA receptor activity and deep sleep architecture, enhancing DSIP''s sleep-inducing effects.'
FROM peptides p, supplements s
WHERE p.name ILIKE '%DSIP%' AND s.name ILIKE '%Magnesium Glycinate%'
AND NOT EXISTS (SELECT 1 FROM peptide_suggested_supplements ps WHERE ps.peptide_id = p.id AND ps.supplement_id = s.id);

-- ═══════════════════════════════════════════════════════════════
-- DONE — Verify counts
-- ═══════════════════════════════════════════════════════════════
SELECT 'Supplements in catalog:' as label, count(*) as count FROM supplements
UNION ALL
SELECT 'Peptide-supplement links:', count(*) FROM peptide_suggested_supplements;
