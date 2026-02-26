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
