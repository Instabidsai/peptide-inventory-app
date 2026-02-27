#!/usr/bin/env python3
"""Generate structured article resources for every peptide theme in the Learn section.

For peptides with YouTube embedding content (from Dr. Bachmeyer's videos):
  - Pulls relevant chunks from the embeddings table
  - Synthesizes them into a structured article via GPT-4o-mini

For peptides without YouTube content:
  - Generates a research-based article from GPT-4o-mini's training data

Usage:
  uv run python scripts/generate_peptide_articles.py              # live run
  uv run python scripts/generate_peptide_articles.py --dry-run    # preview only
  uv run python scripts/generate_peptide_articles.py --force      # overwrite existing articles
"""

from __future__ import annotations

import argparse
import json
import os
import re as _re
import sys
import time
from pathlib import Path

# Windows encoding fix + ensure unbuffered output
os.environ["PYTHONUNBUFFERED"] = "1"
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ["VITE_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ---------------------------------------------------------------------------
# Peptide keyword matching (video title -> theme name)
# ---------------------------------------------------------------------------
PEPTIDE_KEYWORDS: dict[str, list[str]] = {
    "AOD-9604":               ["aod", "aod9604", "aod-9604"],
    "ARA-290":                ["ara-290", "ara290"],
    "BPC-157":                ["bpc", "bpc-157", "bpc157"],
    "Cagriniltide":           ["cagri", "cagriniltide"],
    "CJC-1295 (no DAC)":     [],  # handled by CJC combo
    "CJC-1295 / Ipamorelin":  ["cjc", "cjc-1295", "cjc1295", "ipamorelin"],
    "DSIP":                   ["dsip", "delta sleep"],
    "Epithalon":              ["epithalon", "epitalon"],
    "FOXO4":                  ["foxo4", "foxo-4", "foxo4-dri"],
    "GHK-Cu":                 ["ghk", "ghk-cu", "copper peptide"],
    "Glutathione":            ["glutathione"],
    "Ipamorelin":             ["ipamorelin"],
    "Kisspeptin":             ["kisspeptin", "kiss-peptin"],
    "KPV":                    ["kpv"],
    "LL-37":                  ["ll-37", "ll37", "cathelicidin"],
    "Melanotan 2":            ["melanotan", "mt2", "mt-2", "mt-ii"],
    "Methylene Blue":         ["methylene blue"],
    "MOTS-C":                 ["mots-c", "motsc", "mots c"],
    "NAD+":                   ["nad+", "nad ", "nicotinamide adenine"],
    "Oxytocin":               ["oxytocin"],
    "PT-141":                 ["pt-141", "pt141", "bremelanotide"],
    "Retatrutide":            ["retatrutide", "retatrude", "reta ", "retratrutide", "redatruide", "red tide", "reddit true tide"],
    "Selank":                 ["selank"],
    "Semax":                  ["semax"],
    "Sermorelin":             ["sermorelin"],
    "SS-31":                  ["ss-31", "ss31", "elamipretide"],
    "TB500":                  ["tb-500", "tb500", "thymosin beta"],
    "Tesamorelin":            ["tesamorelin"],
    "Tesamorelin / Ipamorelin": [],  # combo - handled by individual keywords
    "Thymosin Alpha 1":       ["thymosin alpha", "ta1", "ta-1"],
    "Tirzepatide":            ["tirzepatide", "mounjaro"],
    "VIP":                    ["vasoactive intestinal", "vip peptide"],
}

# Condition-based matching (video title condition -> theme names)
CONDITION_KEYWORDS: dict[str, list[str]] = {
    "adhd":        ["Semax", "Selank"],
    "dementia":    ["Semax", "MOTS-C", "NAD+"],
    "parkinson":   ["BPC-157", "Semax", "NAD+", "MOTS-C"],
    "arthritis":   ["BPC-157", "TB500"],
    "fibromyalgia": ["BPC-157", "KPV", "SS-31"],
    "cholesterol":  ["NAD+", "Retatrutide"],
    "fatigue":     ["SS-31", "MOTS-C", "NAD+"],
    "longevity":   ["Epithalon", "MOTS-C", "NAD+", "SS-31"],
    "cancer":      ["FOXO4", "Thymosin Alpha 1", "Retatrutide"],
    "muscle":      ["TB500", "BPC-157", "AOD-9604"],
    "growth hormone": ["CJC-1295 / Ipamorelin", "Sermorelin", "Tesamorelin", "Ipamorelin"],
    "secretagogue": ["CJC-1295 / Ipamorelin", "Sermorelin", "Ipamorelin"],
    "menopause":   ["Kisspeptin", "Oxytocin"],
    "ptsd":        ["Selank", "Semax", "BPC-157"],
    "tinnitus":    ["BPC-157", "Semax"],
    "gut health":  ["BPC-157", "KPV", "LL-37"],
    "inflammation": ["KPV", "BPC-157", "LL-37", "Thymosin Alpha 1"],
    "immune":      ["Thymosin Alpha 1", "LL-37", "KPV"],
    "brain":       ["Semax", "Selank", "NAD+", "MOTS-C"],
    "cognitive":   ["Semax", "Selank", "NAD+"],
    "weight loss": ["Retatrutide", "Tirzepatide", "AOD-9604", "Cagriniltide"],
    "semaglutide": ["Tirzepatide", "Retatrutide"],
    "mold":        ["Glutathione", "NAD+", "KPV"],
    "multiple sclerosis": ["BPC-157", "KPV", "Thymosin Alpha 1"],
    "hashimoto":   ["Thymosin Alpha 1", "Selank"],
    "lupus":       ["KPV", "Thymosin Alpha 1"],
    "crohn":       ["BPC-157", "KPV"],
    "colitis":     ["BPC-157", "KPV"],
    "irritable bowel": ["BPC-157", "KPV"],
    "cardiovascular": ["BPC-157", "Retatrutide", "NAD+", "MOTS-C"],
    "migraine":    ["BPC-157", "Semax", "MOTS-C"],
    "parasite":    ["LL-37", "Thymosin Alpha 1"],
    "testosterone": ["Kisspeptin"],
    "fertility":   ["Kisspeptin"],
    "sexual":      ["PT-141", "Kisspeptin"],
    "skin":        ["GHK-Cu", "Melanotan 2"],
    "tanning":     ["Melanotan 2"],
    "sleep":       ["DSIP", "Selank"],
    "antimicrobial": ["LL-37", "Thymosin Alpha 1"],
    "liver":       ["BPC-157", "NAD+", "Glutathione", "Retatrutide"],
    "plaque":      ["NAD+", "Retatrutide", "BPC-157"],
    "statin":      ["NAD+", "Retatrutide"],
    "nicotine":    ["Semax"],
    "oral peptide": ["BPC-157"],
    "cycle peptide": ["BPC-157", "TB500"],
    "forever peptide": ["BPC-157"],
    "peptides for life": ["BPC-157", "KPV"],
    "best peptides": ["BPC-157", "KPV", "Retatrutide"],
}

# ---------------------------------------------------------------------------
# Protocol enrichment data (from protocol-knowledge.ts)
# Dosing tiers, stacking info, supplements, warnings, cycle patterns
# ---------------------------------------------------------------------------

PROTOCOL_ENRICHMENT: dict[str, dict] = {
    "Retatrutide": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Gentle Start", "dose": "0.5 mg weekly", "notes": "Extra-cautious for GI-sensitive. Stay 2-4 weeks before escalating."},
            {"label": "Standard Titration", "dose": "1 mg weekly (escalate to 4 mg)", "notes": "Phase 2 trial schedule. Sweet spot at 4 mg — 17.5% weight loss with fewer side effects than 8 mg."},
            {"label": "Aggressive", "dose": "1 mg weekly → 12 mg", "notes": "Maximum studied. GI side effects nearly double skipping steps. 68% adverse at 8 mg."},
            {"label": "Maintenance", "dose": "4 mg weekly", "notes": "Post-titration. Adjust 2-8 mg based on response."},
        ],
        "schedule": "Weeks 1-2: 0.5 mg | Weeks 3-4: 1 mg | Weeks 5-6: 1.5 mg | Weeks 7-8: 2 mg | Weeks 9-10: 2.5-4 mg",
        "route": "subcutaneous",
    },
    "MOTS-C": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Conservative", "dose": "2.5 mg twice weekly (5 mg/week)", "notes": "Starting dose for metabolic support."},
            {"label": "Standard", "dose": "5 mg 3x weekly (10-15 mg/week)", "notes": "Dr. Bachmeyer recommends 2.5-5 mg EOD or combined with NAD+ every second day."},
            {"label": "Aggressive", "dose": "5 mg every other day", "notes": "Short-term metabolic reset. 4-6 week duration."},
        ],
        "route": "subcutaneous",
    },
    "GHK-Cu": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Conservative (Anti-Aging)", "dose": "1 mg 3x weekly", "notes": "Lower dose for skin health. Cycle 8-12 weeks on, 4 off."},
            {"label": "Standard", "dose": "2 mg daily", "notes": "Dr. Bachmeyer recommends 2-3 mg daily. 5 days on, 2 days off."},
            {"label": "Aggressive (Wound Healing)", "dose": "2 mg daily", "notes": "Cap at 2 mg per injection. Contains copper — caution with sensitivity."},
        ],
        "warning": "Known to cause stinging/burning at injection site. Consider diluting further or warm compress after injection.",
        "supplements": [{"name": "Zinc", "dose": "15-30 mg daily", "reason": "Balance copper levels"}],
        "route": "subcutaneous",
    },
    "NAD+": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Conservative", "dose": "50 mg twice weekly", "notes": "Start for 2-4 weeks. Dr. Bachmeyer notes oral NAD+ is ineffective — subcutaneous only."},
            {"label": "Standard", "dose": "100 mg 3x weekly", "notes": "Most common. Administer before workouts or during stress. Can stack with CoQ10 and alpha-lipoic acid."},
            {"label": "Loading Phase", "dose": "200 mg daily for 7-10 days", "notes": "Saturates depleted reserves. Then drop to standard. Above 200 mg requires medical supervision."},
        ],
        "supplements": [{"name": "TMG (Trimethylglycine)", "dose": "500 mg daily", "reason": "Restore methyl groups depleted by NAD+ therapy"}],
        "route": "subcutaneous",
    },
    "TB500": {
        "category": "healing",
        "tiers": [
            {"label": "Conservative", "dose": "2 mg twice weekly", "notes": "4 mg/week loading for 4-6 weeks, then 2 mg every 1-2 weeks maintenance."},
            {"label": "Standard Loading", "dose": "2.5 mg twice weekly", "notes": "Dr. Bachmeyer recommends 2.5-5 mg twice weekly for 6 weeks. At least 5 mg/week."},
            {"label": "Aggressive Loading", "dose": "5 mg twice weekly", "notes": "10 mg/week. TB-500 works by saturating tissue — loading phase is key."},
        ],
        "cycle": "6 weeks loading, then maintenance. 6 weeks off between full loading cycles.",
        "route": "subcutaneous",
    },
    "BPC-157": {
        "category": "healing",
        "tiers": [
            {"label": "Conservative (Maintenance)", "dose": "250 mcg daily", "notes": "Minimum effective dose per Dr. Bachmeyer. Good for gut healing or general recovery."},
            {"label": "Standard", "dose": "500 mcg daily", "notes": "Most common clinical protocol. Can split into 250 mcg AM + 250 mcg PM."},
            {"label": "Aggressive (Acute Injury)", "dose": "500 mcg twice daily", "notes": "1000 mcg total/day. For acute injuries. Inject near injury site for local effects."},
        ],
        "cycle": "4-8 weeks on, 2-4 weeks off. Some practitioners use continuously for gut healing.",
        "warning": "Oral BPC-157 capsules are available for gut-specific healing but less effective systemically than injection.",
        "route": "subcutaneous (or oral for gut)",
    },
    "Semax": {
        "category": "cognitive",
        "tiers": [
            {"label": "Conservative", "dose": "200 mcg daily (intranasal)", "notes": "1 spray per nostril, morning. Start here for 1-2 weeks."},
            {"label": "Standard", "dose": "600 mcg daily (intranasal)", "notes": "3 sprays per nostril, 2x daily. Dr. Bachmeyer's recommended protocol."},
            {"label": "NA-Semax (Enhanced)", "dose": "300-600 mcg daily", "notes": "Acetylated form with longer half-life and stronger BDNF boost."},
        ],
        "route": "intranasal",
    },
    "Tesamorelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Conservative", "dose": "1 mg daily", "notes": "Lower starting dose. Best injected before bed, empty stomach."},
            {"label": "Standard", "dose": "2 mg daily", "notes": "FDA-approved dose. Evening injection on empty stomach. Wait 15-20 min after Ipamorelin."},
        ],
        "warning": "NEVER mix in same syringe as Ipamorelin. Empty stomach NON-NEGOTIABLE — carbs/insulin blunt GH release.",
        "stack_label": "Evening Stack Part 2 — Inject AFTER Ipamorelin",
        "route": "subcutaneous",
    },
    "Ipamorelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Conservative", "dose": "100 mcg daily", "notes": "Starting dose before bed. Primes pituitary for GH release."},
            {"label": "Standard", "dose": "200 mcg daily", "notes": "Most common dose. Evening on empty stomach. Acts as 'starter pistol' for GH."},
            {"label": "Split Dose", "dose": "100 mcg 2-3x daily", "notes": "Split dosing for multiple GH pulses. Each dose fasted."},
        ],
        "stack_label": "Evening Stack Part 1 — Inject FIRST, wait 15-20 min",
        "route": "subcutaneous",
    },
    "Selank": {
        "category": "cognitive",
        "tiers": [
            {"label": "Conservative", "dose": "250 mcg daily (intranasal)", "notes": "1-2 sprays per nostril, morning. Anti-anxiety without sedation."},
            {"label": "Standard", "dose": "500 mcg daily (intranasal)", "notes": "2-3 sprays per nostril. Can split AM/PM for sustained effect."},
        ],
        "route": "intranasal",
    },
    "DSIP": {
        "category": "sleep",
        "tiers": [
            {"label": "Conservative", "dose": "100 mcg before bed", "notes": "Starting dose. Does not force sleep — promotes natural sleep architecture."},
            {"label": "Standard", "dose": "250 mcg before bed", "notes": "Most common. 5 days on, 2 days off. Effects often improve over first 2 weeks."},
        ],
        "cycle": "5 days on, 2 days off. 4-8 week cycles.",
        "route": "subcutaneous",
    },
    "Tirzepatide": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Starting", "dose": "2.5 mg weekly for 4 weeks", "notes": "Mandatory starting dose per FDA label."},
            {"label": "Standard", "dose": "5-10 mg weekly", "notes": "Titrate up every 4 weeks. 10 mg is common maintenance."},
            {"label": "Maximum", "dose": "15 mg weekly", "notes": "Highest FDA-approved dose. GI side effects increase significantly."},
        ],
        "schedule": "2.5 mg → 5 mg → 7.5 mg → 10 mg → 12.5 mg → 15 mg (every 4 weeks)",
        "route": "subcutaneous",
    },
    "Semaglutide": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Starting", "dose": "0.25 mg weekly for 4 weeks", "notes": "Mandatory starting dose."},
            {"label": "Standard", "dose": "1 mg weekly", "notes": "Common maintenance for diabetes. Titrate every 4 weeks."},
            {"label": "Weight Loss Max", "dose": "2.4 mg weekly", "notes": "FDA weight loss dose (Wegovy). Full titration takes 16+ weeks."},
        ],
        "route": "subcutaneous",
    },
    "CJC-1295 (no DAC)": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Standard", "dose": "100 mcg daily before bed", "notes": "Stimulates pulsatile GH release. Pair with Ipamorelin for synergy."},
        ],
        "route": "subcutaneous",
    },
    "CJC-1295 / Ipamorelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Standard Combo", "dose": "CJC-1295 100 mcg + Ipamorelin 200 mcg daily", "notes": "Evening before bed, empty stomach. Synergistic GH release."},
        ],
        "route": "subcutaneous",
    },
    "PT-141": {
        "category": "sexual_health",
        "tiers": [
            {"label": "Conservative", "dose": "0.5 mg as needed", "notes": "Test dose 3-4 hours before activity. Assess nausea tolerance."},
            {"label": "Standard", "dose": "1.5 mg as needed", "notes": "Common effective dose. Take 45-60 min before. Effects last 24-72 hours."},
            {"label": "Maximum", "dose": "2 mg per dose", "notes": "Do not exceed. Wait 72 hours between doses. Max 8 doses/month."},
        ],
        "warning": "Nausea is the primary side effect — take on empty stomach. Can darken moles (melanocortin effect). Do NOT combine with alcohol.",
        "route": "subcutaneous",
    },
    "Epithalon": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Standard (Khavinson)", "dose": "5-10 mg daily for 10-20 days", "notes": "Original Russian protocol. 10 days on, 6 months off. Activates telomerase."},
        ],
        "cycle": "10 days ON, 6 months OFF. Short intense bursts — not continuous.",
        "route": "subcutaneous",
    },
    "Thymosin Alpha 1": {
        "category": "healing",
        "tiers": [
            {"label": "Conservative", "dose": "1.5 mg twice weekly", "notes": "Immune maintenance. 3 mg total per week."},
            {"label": "Standard", "dose": "1.5 mg daily", "notes": "Active immune support protocol. 4-8 week cycles."},
        ],
        "cycle": "4-8 weeks on, 2-4 weeks off.",
        "route": "subcutaneous",
    },
    "KPV": {
        "category": "healing",
        "tiers": [
            {"label": "Conservative", "dose": "200 mcg daily", "notes": "Starting anti-inflammatory dose. Can use oral capsules for gut-specific."},
            {"label": "Standard", "dose": "500 mcg daily", "notes": "Standard for gut inflammation and immune modulation."},
        ],
        "route": "subcutaneous or oral",
    },
    "Hexarelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Conservative", "dose": "100 mcg daily fasted", "notes": "Tolerance assessment week."},
            {"label": "Standard", "dose": "100 mcg 2-3x daily", "notes": "200-300 mcg total. Fasted administration essential."},
        ],
        "warning": "MOST prone to desensitization among GHRPs. Strict cycling non-negotiable. Can elevate cortisol and prolactin.",
        "cycle": "8-12 weeks on, 4-6 weeks off. MANDATORY break.",
        "route": "subcutaneous",
    },
    "Sermorelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Conservative", "dose": "200 mcg daily before bed", "notes": "Empty stomach. Good starting dose."},
            {"label": "Standard", "dose": "300 mcg daily before bed", "notes": "Most common clinical dose for anti-aging and body composition."},
            {"label": "High/Stack", "dose": "500 mcg daily before bed", "notes": "Often stacked with Ipamorelin 200-300 mcg for synergistic GH pulse."},
        ],
        "supplements": [
            {"name": "Magnesium Glycinate", "dose": "400 mg", "reason": "Supports GH release and sleep"},
            {"name": "Zinc", "dose": "30 mg", "reason": "Critical cofactor for GH production"},
        ],
        "cycle": "12 weeks on, 4 weeks off.",
        "route": "subcutaneous",
    },
    "AOD-9604": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Conservative", "dose": "250 mcg daily fasted", "notes": "Start here for 2 weeks."},
            {"label": "Standard", "dose": "300 mcg daily AM fasted", "notes": "Inject near abdominal fat. No effect on GH/IGF-1."},
            {"label": "High", "dose": "500 mcg daily fasted", "notes": "Can split 250 AM + 250 PM."},
        ],
        "supplements": [
            {"name": "L-Carnitine", "dose": "500-1000 mg", "reason": "Enhances fat transport for burning"},
        ],
        "cycle": "12 weeks on, 4 weeks off.",
        "route": "subcutaneous",
    },
    "5-Amino-1MQ": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Conservative", "dose": "50 mg oral daily", "notes": "Starting dose for 1-2 weeks."},
            {"label": "Standard", "dose": "100 mg oral daily", "notes": "Empty stomach. Most common research dose."},
            {"label": "High", "dose": "150 mg oral twice daily (300 mg)", "notes": "AM and early afternoon."},
        ],
        "warning": "Oral capsule — no injection. Relatively new; long-term human safety data limited.",
        "route": "oral",
    },
    "SS-31": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Conservative", "dose": "2 mg daily", "notes": "Starting dose for first week."},
            {"label": "Standard", "dose": "4 mg daily", "notes": "Standard. Effects cumulative — noticeable at week 2-3."},
            {"label": "High", "dose": "8 mg daily", "notes": "For advanced mitochondrial dysfunction or cardiac support."},
        ],
        "supplements": [
            {"name": "CoQ10", "dose": "200 mg", "reason": "Synergistic mitochondrial support"},
            {"name": "PQQ", "dose": "20 mg", "reason": "Promotes mitochondrial biogenesis"},
        ],
        "cycle": "4-8 weeks on, 4 weeks off.",
        "route": "subcutaneous",
    },
    "Cagriniltide": {
        "category": "weight_loss",
        "tiers": [
            {"label": "Starting", "dose": "0.25 mg weekly", "notes": "Mandatory starting dose for 4 weeks. Do not skip."},
            {"label": "Standard", "dose": "1.0 mg weekly", "notes": "Mid-range after successful titration."},
            {"label": "Max", "dose": "2.4 mg weekly", "notes": "Only after full titration over 16+ weeks."},
        ],
        "warning": "HIGH NAUSEA RISK. Must be used alongside GLP-1 agonist (Tirzepatide or Semaglutide). Titrate slowly every 4 weeks.",
        "supplements": [
            {"name": "Electrolytes", "dose": "daily", "reason": "Prevent dehydration from reduced intake"},
            {"name": "B12", "dose": "1000 mcg weekly", "reason": "GLP-1 drugs may reduce B12 absorption"},
        ],
        "route": "subcutaneous",
    },
    "LL-37": {
        "category": "healing",
        "tiers": [
            {"label": "Low & Slow", "dose": "100 mcg every other day", "notes": "Gauge Herxheimer response first."},
            {"label": "Standard", "dose": "100 mcg daily", "notes": "Standard antimicrobial/immune dose."},
            {"label": "High", "dose": "250 mcg daily", "notes": "For severe chronic biofilm infections (Lyme, CIRS/mold)."},
        ],
        "warning": "HERXHEIMER REACTION: As biofilms break down, released toxins cause temporary symptom flare. This means it is WORKING. Start low.",
        "supplements": [
            {"name": "Activated Charcoal", "dose": "500 mg (2 hrs away from supps)", "reason": "Absorb released biofilm toxins"},
            {"name": "NAC", "dose": "600 mg 2x daily", "reason": "Glutathione precursor for liver detox"},
            {"name": "Vitamin C", "dose": "1-2 g daily", "reason": "Immune support during antimicrobial protocol"},
        ],
        "cycle": "4-6 weeks on, 2-4 weeks off.",
        "route": "subcutaneous",
    },
    "Glutathione": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Maintenance", "dose": "200 mg IM 1-2x/week", "notes": "General wellness antioxidant."},
            {"label": "Standard", "dose": "200 mg IM 3x/week", "notes": "Active detox, liver health, skin brightening."},
            {"label": "Acute", "dose": "300 mg IM daily for 1-2 weeks", "notes": "Post-illness, heavy metal detox, environmental toxins."},
        ],
        "warning": "IM injection preferred over Sub-Q. Sulfur smell is normal. Rotate sites. Mild detox symptoms possible.",
        "supplements": [
            {"name": "NAC", "dose": "600 mg 2x daily", "reason": "Helps body replenish its own glutathione"},
            {"name": "Vitamin C", "dose": "1-2 g daily", "reason": "Recycles oxidized glutathione"},
            {"name": "Alpha Lipoic Acid", "dose": "300-600 mg", "reason": "Regenerates both glutathione and vitamin C"},
        ],
        "route": "intramuscular",
    },
    "Oxytocin": {
        "category": "sexual_health",
        "tiers": [
            {"label": "Low / Social", "dose": "10 IU as needed", "notes": "15-20 min before event. For social anxiety and mood."},
            {"label": "Standard", "dose": "15 IU as needed", "notes": "Sweet spot. Enhances bonding, empathy, connection."},
            {"label": "High", "dose": "25 IU as needed", "notes": "DO NOT exceed 30 IU — higher causes drowsiness and blunting."},
        ],
        "warning": "BIPHASIC: Low doses promote bonding. Above 30 IU causes drowsiness/emotional blunting — opposite effect. Less is more.",
        "route": "subcutaneous",
    },
    "Kisspeptin": {
        "category": "sexual_health",
        "tiers": [
            {"label": "Conservative", "dose": "200 mcg EOD", "notes": "Assess individual response."},
            {"label": "Standard", "dose": "300 mcg daily", "notes": "Most common for hormone optimization and libido."},
            {"label": "High", "dose": "500 mcg daily (MAX)", "notes": "DO NOT exceed — GnRH desensitization risk above this."},
        ],
        "warning": "Above 500 mcg DESENSITIZES GnRH receptors, suppressing hormones instead of elevating. Monitor with bloodwork.",
        "supplements": [
            {"name": "Zinc", "dose": "30 mg", "reason": "Cofactor for testosterone synthesis"},
            {"name": "Vitamin D3", "dose": "5000 IU", "reason": "Supports HPG axis"},
            {"name": "Magnesium", "dose": "400 mg", "reason": "Supports hormone production"},
        ],
        "cycle": "8-12 weeks on, 4 weeks off. Bloodwork before and after.",
        "route": "subcutaneous",
    },
    "Melanotan 2": {
        "category": "sexual_health",
        "tiers": [
            {"label": "Low Start", "dose": "100 mcg daily before bed", "notes": "Test tolerance 3-5 days."},
            {"label": "Standard Loading", "dose": "250 mcg daily before bed", "notes": "Take ginger 30 min before for nausea. Results in 1-2 weeks."},
            {"label": "Maintenance", "dose": "250 mcg 1-2x/week", "notes": "Sustains tan after loading."},
        ],
        "warning": "TAKE BEFORE BED (sleep through nausea). Will darken existing moles. PRIAPISM RISK in males at high doses.",
        "supplements": [{"name": "Ginger", "dose": "500-1000 mg 30 min before", "reason": "Reduce nausea"}],
        "route": "subcutaneous",
    },
    "VIP": {
        "category": "healing",
        "tiers": [
            {"label": "Conservative", "dose": "50 mcg nasal 2x daily", "notes": "Starting protocol. Monitor blood pressure."},
            {"label": "Standard (Shoemaker)", "dose": "50 mcg nasal 4x daily", "notes": "Standard CIRS protocol. Every 4-6 hours."},
        ],
        "warning": "MUST clear MARCoNS nasal colonization BEFORE starting. VIP with active MARCoNS worsens illness. Nasal culture first.",
        "cycle": "30-90 days continuous. Retest TGF-beta, C4a, VEGF after 30 days.",
        "route": "nasal spray",
    },
    "ARA-290": {
        "category": "healing",
        "tiers": [
            {"label": "Standard (28-Day)", "dose": "4 mg daily for exactly 28 days", "notes": "Only established protocol. Nerve repair benefits continue after cycle ends."},
        ],
        "warning": "FIXED 28-DAY PROTOCOL. Do not extend. Expensive cycle. Benefits develop after cycle. Can repeat after 4-8 weeks.",
        "cycle": "Exactly 28 days on, then 4-8 weeks off.",
        "route": "subcutaneous",
    },
    "FOXO4": {
        "category": "anti_aging",
        "tiers": [
            {"label": "Conservative", "dose": "3 mg EOD for 2 weeks", "notes": "Lower starting dose for first-timers."},
            {"label": "Standard", "dose": "5 mg EOD for 2-3 weeks", "notes": "Most common senolytic protocol."},
            {"label": "High", "dose": "10 mg EOD for 2-3 weeks", "notes": "Aggressive clearance. Stronger side effects."},
        ],
        "warning": "EXPECT worse before better — fatigue, achiness, flu-like symptoms during cycle are signs of senescent cell clearance.",
        "supplements": [
            {"name": "Quercetin", "dose": "500 mg daily during cycle", "reason": "Natural senolytic — synergizes with FOXO4-DRI"},
            {"name": "Fisetin", "dose": "100-500 mg daily during cycle", "reason": "Additional senolytic support"},
        ],
        "cycle": "2-3 weeks on (EOD), then 3-4 months off. Repeat 2-3x per year.",
        "route": "subcutaneous",
    },
    "Methylene Blue": {
        "category": "cognitive",
        "tiers": [
            {"label": "Microdose", "dose": "0.5-1 mg/kg oral", "notes": "Cognitive enhancement dose. Turns urine blue-green (normal)."},
            {"label": "Standard", "dose": "1-2 mg/kg oral", "notes": "Mitochondrial support. Take with food."},
        ],
        "warning": "NOT a peptide — a synthetic compound. Turns urine/tears blue. Do NOT combine with SSRIs (serotonin syndrome risk).",
        "route": "oral",
    },
    "Tesamorelin / Ipamorelin": {
        "category": "gh_stack",
        "tiers": [
            {"label": "Evening GH Protocol", "dose": "Step 1: Ipamorelin 200 mcg → wait 15-20 min → Step 2: Tesamorelin 2 mg", "notes": "Empty stomach. Never mix in same syringe. Ipamorelin primes pituitary, Tesamorelin triggers GH blast."},
        ],
        "warning": "CRITICAL SEQUENCING: Ipamorelin FIRST (starter pistol), wait 15-20 min, THEN Tesamorelin (the blast). Never combine in same syringe. Empty stomach non-negotiable.",
        "route": "subcutaneous",
    },
}

# ---------------------------------------------------------------------------
# Named protocol stacks (from PROTOCOL_TEMPLATES in protocol-knowledge.ts)
# Maps stack name -> description + peptide list
# ---------------------------------------------------------------------------

NAMED_STACKS: list[dict[str, str | list[str]]] = [
    {"name": "Healing Stack", "desc": "TB-500 + BPC-157 for tissue repair and recovery", "peptides": ["TB500", "BPC-157"]},
    {"name": "Healing Stack (Injury)", "desc": "TB-500 + BPC-157 aggressive loading for acute injuries", "peptides": ["TB500", "BPC-157"]},
    {"name": "GH Stack (Evening)", "desc": "Ipamorelin + 2x Tesamorelin for growth hormone optimization", "peptides": ["Ipamorelin", "Tesamorelin", "Tesamorelin / Ipamorelin"]},
    {"name": "Weight Loss", "desc": "Retatrutide + MOTS-C for metabolic enhancement", "peptides": ["Retatrutide", "MOTS-C"]},
    {"name": "Weight Loss (Gentle)", "desc": "Retatrutide gentle start + MOTS-C conservative for GI-sensitive clients", "peptides": ["Retatrutide", "MOTS-C"]},
    {"name": "Cognitive", "desc": "Semax + Selank for focus and anxiety reduction", "peptides": ["Semax", "Selank"]},
    {"name": "Sleep & Recovery", "desc": "DSIP + NAD+ for restorative sleep and cellular repair", "peptides": ["DSIP", "NAD+"]},
    {"name": "Anti-Aging", "desc": "GHK-Cu + NAD+ + MOTS-C for longevity and skin health", "peptides": ["GHK-Cu", "NAD+", "MOTS-C"]},
    {"name": "GLOW", "desc": "GHK-Cu + BPC-157 + TB-500 for skin rejuvenation, collagen synthesis, and tissue repair", "peptides": ["GHK-Cu", "BPC-157", "TB500"]},
    {"name": "KLOW", "desc": "GLOW stack + KPV for enhanced anti-inflammatory support and immune modulation", "peptides": ["GHK-Cu", "BPC-157", "TB500", "KPV"]},
    {"name": "Gut Healing", "desc": "BPC-157 + KPV for gut lining repair and inflammation", "peptides": ["BPC-157", "KPV"]},
    {"name": "Immune Boost", "desc": "Thymosin Alpha-1 + NAD+ for immune function and cellular energy", "peptides": ["Thymosin Alpha 1", "NAD+"]},
    {"name": "Longevity", "desc": "Epithalon + NAD+ + GHK-Cu for telomere support, cellular repair, and skin health", "peptides": ["Epithalon", "NAD+", "GHK-Cu"]},
    {"name": "Full Protocol", "desc": "Complete 11-peptide protocol: weight loss, healing, GH, cognitive, and sleep", "peptides": ["Retatrutide", "MOTS-C", "GHK-Cu", "NAD+", "TB500", "BPC-157", "Semax", "Tesamorelin", "Ipamorelin", "Selank", "DSIP"]},
]

# Co-occurrence data from real client protocols (top pairings)
CO_OCCURRENCE: dict[str, list[str]] = {
    "BPC-157": ["NAD+", "MOTS-C", "TB500", "GHK-Cu", "Selank", "Semax", "KPV"],
    "NAD+":    ["BPC-157", "MOTS-C", "GHK-Cu", "Selank", "Semax", "TB500"],
    "MOTS-C":  ["NAD+", "BPC-157", "GHK-Cu", "Selank", "Semax", "TB500"],
    "GHK-Cu":  ["NAD+", "BPC-157", "MOTS-C", "Selank", "Semax", "TB500"],
    "TB500":   ["BPC-157", "NAD+", "MOTS-C", "GHK-Cu", "Selank", "Semax"],
    "Selank":  ["Semax", "NAD+", "BPC-157", "MOTS-C", "GHK-Cu"],
    "Semax":   ["Selank", "NAD+", "BPC-157", "MOTS-C", "GHK-Cu"],
    "Tesamorelin": ["Ipamorelin", "DSIP"],
    "Ipamorelin":  ["Tesamorelin", "DSIP"],
    "DSIP":    ["NAD+", "Selank", "Tesamorelin", "Ipamorelin"],
    "Retatrutide": ["MOTS-C"],
    "KPV":     ["BPC-157", "GHK-Cu", "TB500"],
}

# GH Stack sequencing rules
GH_STACK_SEQUENCING = """GH Stack Critical Sequencing:
Step 1 (Minute Zero): Inject Ipamorelin first — it primes the pituitary for maximum GH release.
Step 2 (Wait 15-20 Minutes): Allow Ipamorelin to fully prime receptors.
Step 3 (The Blast): Inject Tesamorelin — triggers a massive, natural GH pulse from the primed pituitary.
WARNING: NEVER mix in the same syringe. Empty stomach NON-NEGOTIABLE."""


def build_protocol_context(peptide_name: str) -> str:
    """Build a rich protocol context string for a peptide from enrichment data."""
    parts: list[str] = []

    # 1. Dosing tiers
    enrichment = PROTOCOL_ENRICHMENT.get(peptide_name, {})
    if enrichment:
        tiers = enrichment.get("tiers", [])
        if tiers:
            parts.append("=== DOSING PROTOCOLS ===")
            parts.append(f"Administration: {enrichment.get('route', 'subcutaneous')}")
            for t in tiers:
                parts.append(f"• {t['label']}: {t['dose']}")
                if t.get("notes"):
                    parts.append(f"  → {t['notes']}")
            if enrichment.get("schedule"):
                parts.append(f"Titration Schedule: {enrichment['schedule']}")

        # Cycle pattern
        if enrichment.get("cycle"):
            parts.append(f"\nCycle Pattern: {enrichment['cycle']}")

        # Warnings
        if enrichment.get("warning"):
            parts.append(f"\n⚠️ WARNING: {enrichment['warning']}")

        # Stack label
        if enrichment.get("stack_label"):
            parts.append(f"\nStack Role: {enrichment['stack_label']}")

        # Supplement notes
        supps = enrichment.get("supplements", [])
        if supps:
            parts.append("\n=== RECOMMENDED SUPPLEMENTS ===")
            for s in supps:
                parts.append(f"• {s['name']} ({s['dose']}): {s['reason']}")

    # 2. Named stacks this peptide belongs to
    my_stacks = []
    for stack in NAMED_STACKS:
        if peptide_name in stack["peptides"]:
            other_peptides = [p for p in stack["peptides"] if p != peptide_name]
            my_stacks.append(f"• {stack['name']}: {stack['desc']} (paired with: {', '.join(other_peptides)})")

    if my_stacks:
        parts.append("\n=== NAMED PROTOCOL STACKS ===")
        parts.append(f"{peptide_name} is included in these pre-built protocol stacks:")
        parts.extend(my_stacks)

    # 3. GH Stack sequencing (for Tesamorelin/Ipamorelin)
    if peptide_name in ("Tesamorelin", "Ipamorelin", "Tesamorelin / Ipamorelin"):
        parts.append(f"\n=== GH STACK SEQUENCING ===\n{GH_STACK_SEQUENCING}")

    # 4. Co-occurrence (real client protocol data)
    co = CO_OCCURRENCE.get(peptide_name, [])
    if co:
        parts.append(f"\n=== COMMONLY STACKED WITH (from real client protocols) ===")
        parts.append(f"{peptide_name} is most frequently used alongside: {', '.join(co)}")

    return "\n".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# Article generation prompts
# ---------------------------------------------------------------------------
SYNTHESIS_PROMPT = """You are a peptide research writer for an educational health platform.
You have been given transcript excerpts from Dr. Trevor Bachmeyer's educational videos about {peptide_name}.

Using ONLY the source material provided, write a comprehensive, well-structured article about {peptide_name}.

The article MUST follow this exact structure with these HTML headings:

<h2>What is {peptide_name}?</h2>
A clear 2-3 paragraph introduction explaining what this peptide is, its origin, and why it's significant in research.

<h2>Mechanism of Action</h2>
Explain how {peptide_name} works at a biological level. Include pathways, receptors, or cellular mechanisms mentioned in the source material.

<h2>Research Applications</h2>
What conditions or goals is this peptide being researched for? Use bullet points (<ul><li>) for clarity. Include what the research community is exploring.

<h2>Typical Research Protocols</h2>
Dosing ranges, frequency, administration routes, and cycle lengths discussed in the source material. Present as a clean table or bullet list. Include reconstitution or storage notes if mentioned.

<h2>Key Research Findings</h2>
Summarize the most important studies, clinical data, or findings mentioned in the source material.

<h2>Synergistic Combinations</h2>
If the source material mentions combining {peptide_name} with other peptides or compounds, include this section. If not, skip it.

<h2>Important Considerations</h2>
Side effects, contraindications, or cautions mentioned in the source material.

RULES:
- Write in a professional, educational tone
- Use proper HTML tags: <h2>, <p>, <ul>, <li>, <strong>, <em>, <table>, <tr>, <td>, <th>
- Do NOT use <h1> tags (the page title handles that)
- Do NOT include any markdown — output pure HTML only
- Do NOT invent information not present in the source material
- Every claim should be traceable to the provided excerpts
- Include a brief disclaimer at the end: "This content is for educational and research purposes only. Consult a qualified healthcare provider before beginning any new protocol."
- Target 800-1200 words
- Make it scannable with clear headings and bullet points"""

GENERATION_PROMPT = """You are a peptide research writer for an educational health platform.
Write a comprehensive, well-structured article about {peptide_name}.

{peptide_name} description: {description}

The article MUST follow this exact structure with these HTML headings:

<h2>What is {peptide_name}?</h2>
A clear 2-3 paragraph introduction explaining what this peptide is, its origin/discovery, and why it's significant in current research.

<h2>Mechanism of Action</h2>
Explain how {peptide_name} works at a biological level. Include known pathways, receptors, or cellular mechanisms.

<h2>Research Applications</h2>
What conditions or goals is this peptide being researched for? Use bullet points (<ul><li>) for clarity.

<h2>Typical Research Protocols</h2>
Common dosing ranges, frequency, administration routes, and cycle lengths found in the research literature. Present as a clean bullet list or table. Include reconstitution or storage notes where applicable.

<h2>Key Research Findings</h2>
Summarize the most important published studies or clinical data.

<h2>Synergistic Combinations</h2>
If there are known synergistic combinations with other peptides or compounds, include them. Otherwise skip this section.

<h2>Important Considerations</h2>
Known side effects, contraindications, or cautions from the literature.

RULES:
- Write in a professional, educational tone based on published research
- Use proper HTML tags: <h2>, <p>, <ul>, <li>, <strong>, <em>, <table>, <tr>, <td>, <th>
- Do NOT use <h1> tags
- Do NOT include any markdown — output pure HTML only
- Base content on well-established research literature
- Include a brief disclaimer at the end: "This content is for educational and research purposes only. Consult a qualified healthcare provider before beginning any new protocol."
- Target 800-1200 words
- Make it scannable with clear headings and bullet points"""

# Theme descriptions for generation prompt context
THEME_DESCRIPTIONS: dict[str, str] = {
    "AOD-9604":               "A modified fragment of human growth hormone (hGH fragment 176-191) researched for fat metabolism and cartilage repair.",
    "ARA-290":                "A non-erythropoietic peptide derived from EPO, researched for neuropathic pain and tissue protection via the innate repair receptor.",
    "BPC-157":                "Body Protection Compound-157, a pentadecapeptide derived from gastric juice, extensively researched for tissue healing, gut repair, and neuroprotection.",
    "Cagriniltide":           "A long-acting amylin analog researched for weight management and metabolic health, often studied alongside semaglutide.",
    "CJC-1295 (no DAC)":     "Modified growth hormone releasing hormone (mod-GRF 1-29) without Drug Affinity Complex, used to stimulate pulsatile GH release.",
    "CJC-1295 / Ipamorelin":  "A popular GH secretagogue combination pairing CJC-1295 (GHRH analog) with Ipamorelin (ghrelin mimetic) for synergistic growth hormone release.",
    "DSIP":                   "Delta Sleep-Inducing Peptide, a neuropeptide researched for sleep regulation, stress adaptation, and neuroendocrine modulation.",
    "Epithalon":              "A tetrapeptide (Ala-Glu-Asp-Gly) that activates telomerase, researched for anti-aging and longevity by Dr. Vladimir Khavinson.",
    "FOXO4":                  "FOXO4-DRI peptide that disrupts FOXO4-p53 interaction, researched as a senolytic agent to selectively clear senescent cells.",
    "GHK-Cu":                 "Copper tripeptide (glycyl-L-histidyl-L-lysine) naturally found in plasma, researched for wound healing, skin rejuvenation, and tissue remodeling.",
    "Glutathione":            "The body's master antioxidant tripeptide (Glu-Cys-Gly), critical for detoxification, immune function, and cellular protection.",
    "Ipamorelin":             "A selective growth hormone secretagogue (ghrelin mimetic) that stimulates GH release without significantly affecting cortisol or prolactin.",
    "Kisspeptin":             "A neuropeptide that regulates the hypothalamic-pituitary-gonadal axis, playing a central role in puberty, fertility, and hormone signaling.",
    "KPV":                    "Alpha-MSH-derived tripeptide (Lys-Pro-Val) with potent anti-inflammatory properties, researched for gut inflammation and immune modulation.",
    "LL-37":                  "Human cathelicidin antimicrobial peptide, part of the innate immune system, researched for antimicrobial defense and wound healing.",
    "Melanotan 2":            "A synthetic analog of alpha-melanocyte-stimulating hormone (alpha-MSH) researched for skin pigmentation and photoprotection.",
    "Methylene Blue":         "A synthetic compound (not a peptide) with mitochondrial electron carrier properties, researched for cognitive enhancement and neuroprotection.",
    "MOTS-C":                 "Mitochondrial-derived peptide encoded in the 12S rRNA gene, researched for metabolic regulation, exercise mimetic effects, and longevity.",
    "NAD+":                   "Nicotinamide adenine dinucleotide, a critical coenzyme for cellular energy metabolism, DNA repair, and sirtuin activation.",
    "Oxytocin":               "A neuropeptide hormone produced in the hypothalamus, known for its roles in social bonding, stress reduction, and reproductive function.",
    "PT-141":                 "Bremelanotide, a melanocortin receptor agonist researched for sexual dysfunction, acting through central nervous system pathways.",
    "Retatrutide":            "A triple-agonist peptide targeting GLP-1, GIP, and glucagon receptors, researched for weight management and metabolic health.",
    "Selank":                 "A synthetic analog of the immunomodulatory peptide tuftsin, developed at the Russian Academy of Sciences for anxiolytic and nootropic effects.",
    "Semax":                  "A synthetic peptide analog of ACTH(4-7) with added Pro-Gly-Pro, researched for neuroprotection, cognitive enhancement, and BDNF modulation.",
    "Sermorelin":             "A growth hormone releasing hormone (GHRH) analog (1-29 amino acids) that stimulates natural GH production from the pituitary.",
    "SS-31":                  "Elamipretide, a mitochondria-targeted tetrapeptide that stabilizes cardiolipin in the inner mitochondrial membrane, researched for cellular energy and aging.",
    "TB500":                  "Thymosin Beta-4 fragment, a 43-amino acid peptide researched for tissue repair, wound healing, and reduction of inflammation.",
    "Tesamorelin":            "A growth hormone releasing hormone analog FDA-approved for HIV-associated lipodystrophy, also researched for cognitive benefits and body composition.",
    "Tesamorelin / Ipamorelin": "A GH secretagogue combination pairing Tesamorelin (GHRH analog) with Ipamorelin (ghrelin mimetic) for enhanced growth hormone optimization.",
    "Thymosin Alpha 1":       "A thymic peptide that modulates T-cell function, researched for immune enhancement, viral infections, and as an immunotherapy adjuvant.",
    "Tirzepatide":            "A dual GLP-1/GIP receptor agonist (brand name Mounjaro/Zepbound), FDA-approved for type 2 diabetes and weight management.",
    "VIP":                    "Vasoactive Intestinal Peptide, a neuropeptide with 28 amino acids that regulates vasodilation, gut motility, and immune function.",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def supabase_get(path: str, params: dict | None = None) -> list[dict]:
    """GET request to Supabase REST API."""
    import urllib.request
    import urllib.parse

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)

    req = urllib.request.Request(url, headers=HEADERS, method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def supabase_post(path: str, data: list[dict] | dict) -> list[dict]:
    """POST request to Supabase REST API."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def supabase_rpc(fn_name: str, params: dict) -> list[dict]:
    """Call a Supabase RPC function."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    body = json.dumps(params).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def openai_chat(system_prompt: str, user_prompt: str, model: str = "gpt-4o-mini") -> str:
    """Call OpenAI chat completions API."""
    import urllib.request

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 4000,
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode())
    return result["choices"][0]["message"]["content"].strip()


def match_video_to_themes(title: str) -> set[str]:
    """Match a video title to theme names."""
    title_lower = title.lower()
    matches: set[str] = set()

    for theme_name, keywords in PEPTIDE_KEYWORDS.items():
        for kw in keywords:
            if kw in title_lower:
                matches.add(theme_name)
                break

    for condition, themes in CONDITION_KEYWORDS.items():
        if condition in title_lower:
            for t in themes:
                matches.add(t)

    return matches


def get_themes() -> list[dict]:
    """Fetch all resource themes."""
    return supabase_get("resource_themes", {"select": "id,name,description", "order": "name"})


def get_existing_articles(theme_ids: list[str]) -> set[str]:
    """Get theme IDs that already have article resources."""
    if not theme_ids:
        return set()
    resources = supabase_get("resources", {
        "select": "theme_id",
        "type": "eq.article",
        "theme_id": f"in.({','.join(theme_ids)})",
    })
    return {r["theme_id"] for r in resources if r.get("theme_id")}


def get_all_embeddings() -> list[dict]:
    """Fetch all YouTube embedding chunks with content and metadata."""
    # Supabase REST API has a 1000 row default limit, need to paginate
    all_rows: list[dict] = []
    offset = 0
    batch_size = 1000

    while True:
        rows = supabase_get("embeddings", {
            "select": "content,metadata",
            "metadata->>source": "eq.youtube_pipeline",
            "order": "id",
            "offset": str(offset),
            "limit": str(batch_size),
        })
        all_rows.extend(rows)
        if len(rows) < batch_size:
            break
        offset += batch_size

    return all_rows


def group_embeddings_by_theme(embeddings: list[dict]) -> dict[str, list[dict]]:
    """Group embedding chunks by theme name based on video title matching."""
    theme_chunks: dict[str, list[dict]] = {}

    for emb in embeddings:
        meta = emb.get("metadata", {})
        title = meta.get("title", "")
        matched_themes = match_video_to_themes(title)

        for theme_name in matched_themes:
            if theme_name not in theme_chunks:
                theme_chunks[theme_name] = []
            theme_chunks[theme_name].append(emb)

    return theme_chunks


def build_source_material(chunks: list[dict], max_words: int = 6000) -> str:
    """Concatenate chunk content, dedup by video, cap at max_words."""
    # Group by video_id to avoid repeating the same chunks
    by_video: dict[str, list[dict]] = {}
    for c in chunks:
        vid = c.get("metadata", {}).get("video_id", "unknown")
        if vid not in by_video:
            by_video[vid] = []
        by_video[vid].append(c)

    # Sort each video's chunks by chunk_index
    for vid in by_video:
        by_video[vid].sort(key=lambda x: x.get("metadata", {}).get("chunk_index", 0))

    # Build text with video headers
    parts: list[str] = []
    word_count = 0

    for vid, vid_chunks in by_video.items():
        video_title = vid_chunks[0].get("metadata", {}).get("title", "Unknown Video")
        parts.append(f"\n--- Source: {video_title} ---\n")

        for chunk in vid_chunks:
            text = chunk.get("content", "").strip()
            if not text:
                continue
            words = len(text.split())
            if word_count + words > max_words:
                break
            parts.append(text)
            word_count += words

        if word_count >= max_words:
            break

    return "\n\n".join(parts)


def generate_article_from_sources(peptide_name: str, source_material: str) -> str:
    """Generate an article by synthesizing YouTube transcript content."""
    system = SYNTHESIS_PROMPT.format(peptide_name=peptide_name)
    user = f"Here are the transcript excerpts about {peptide_name}:\n\n{source_material}\n\nPlease synthesize this into a comprehensive article about {peptide_name}."
    return openai_chat(system, user)


def generate_article_from_knowledge(peptide_name: str, description: str) -> str:
    """Generate an article from general research knowledge."""
    system = GENERATION_PROMPT.format(peptide_name=peptide_name, description=description)
    user = f"Write a comprehensive research article about {peptide_name}."
    return openai_chat(system, user)


def clean_html(html: str) -> str:
    """Strip markdown artifacts if GPT slips any in."""
    # Remove markdown code fences
    html = _re.sub(r"^```html?\s*\n?", "", html, flags=_re.MULTILINE)
    html = _re.sub(r"\n?```\s*$", "", html, flags=_re.MULTILINE)
    return html.strip()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Generate peptide articles for Learn section")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    parser.add_argument("--force", action="store_true", help="Overwrite existing articles")
    parser.add_argument("--theme", type=str, help="Generate for a single theme only (by name)")
    args = parser.parse_args()

    print("=" * 60)
    print("  PEPTIDE ARTICLE GENERATOR")
    print("  " + ("DRY RUN" if args.dry_run else "LIVE RUN"))
    print("=" * 60)

    # 1. Fetch themes
    print("\n[1/4] Fetching themes...")
    themes = get_themes()
    print(f"       Found {len(themes)} themes")

    if args.theme:
        themes = [t for t in themes if t["name"] == args.theme]
        if not themes:
            print(f"  ERROR: Theme '{args.theme}' not found")
            return
        print(f"       Filtered to: {args.theme}")

    # 2. Check existing articles
    print("\n[2/4] Checking existing articles...")
    all_theme_ids = [t["id"] for t in themes]
    existing = get_existing_articles(all_theme_ids) if not args.force else set()
    print(f"       {len(existing)} themes already have articles" + (" (--force: will overwrite)" if args.force else ""))

    # 3. Fetch and group embeddings
    print("\n[3/4] Fetching YouTube embeddings...")
    embeddings = get_all_embeddings()
    print(f"       {len(embeddings)} total chunks")

    theme_chunks = group_embeddings_by_theme(embeddings)
    themes_with_content = set(theme_chunks.keys())
    print(f"       Matched to {len(themes_with_content)} themes")
    for name in sorted(themes_with_content):
        print(f"         {name}: {len(theme_chunks[name])} chunks")

    # 4. Generate articles
    print("\n[4/4] Generating articles...")
    print("-" * 60)

    generated = 0
    skipped = 0
    errors = 0

    for theme in themes:
        name = theme["name"]
        tid = theme["id"]
        desc = theme.get("description") or THEME_DESCRIPTIONS.get(name, "")

        # Skip if already has article
        if tid in existing and not args.force:
            print(f"  SKIP: {name} (already has article)")
            skipped += 1
            continue

        has_content = name in theme_chunks and len(theme_chunks[name]) > 0
        chunk_count = len(theme_chunks.get(name, []))

        print(f"\n  >> {name}")
        if has_content:
            print(f"     Source: {chunk_count} embedding chunks (Dr. Bachmeyer)")
        else:
            print(f"     Source: Research knowledge (no YouTube content)")

        if args.dry_run:
            print(f"     [DRY RUN] Would generate article")
            generated += 1
            continue

        try:
            if has_content:
                source_material = build_source_material(theme_chunks[name])
                word_count = len(source_material.split())
                print(f"     Synthesizing from {word_count} words of source material...")
                html = generate_article_from_sources(name, source_material)
            else:
                print(f"     Generating from research knowledge...")
                html = generate_article_from_knowledge(name, desc)

            html = clean_html(html)
            word_count = len(html.split())
            print(f"     Generated {word_count} words of HTML")

            # Build description (first 200 chars of text content, no HTML)
            text_only = _re.sub(r"<[^>]+>", " ", html)
            text_only = _re.sub(r"\s+", " ", text_only).strip()
            description = text_only[:200] + "..." if len(text_only) > 200 else text_only

            resource = {
                "title": f"{name}: Complete Research Guide",
                "description": description,
                "type": "article",
                "url": f"#article-{name.lower().replace(' ', '-').replace('/', '-')}",
                "content": html,
                "theme_id": tid,
                "is_featured": False,
                "link_button_text": "Read Article",
            }

            result = supabase_post("resources", resource)
            print(f"     Inserted resource: {result[0]['id'][:8]}...")
            generated += 1

            # Rate limit
            time.sleep(2)

        except Exception as e:
            print(f"     ERROR: {e}")
            errors += 1
            time.sleep(1)

    # Summary
    print("\n" + "=" * 60)
    print("  COMPLETE")
    print("=" * 60)
    print(f"  Generated: {generated}")
    print(f"  Skipped:   {skipped}")
    print(f"  Errors:    {errors}")
    print(f"  Total themes: {len(themes)}")

    # Show which themes had no YouTube source
    no_youtube = sorted(n for n in [t["name"] for t in themes] if n not in themes_with_content)
    if no_youtube:
        print(f"\n  Themes with knowledge-based articles (no YouTube source):")
        for name in no_youtube:
            print(f"    - {name}")


if __name__ == "__main__":
    main()
