"""
Populate Learn Section — Theme Cleanup + Resource Population
============================================================
Usage:
    uv run python scripts/populate_learn_section.py
    uv run python scripts/populate_learn_section.py --dry-run

What it does:
1. Cleans up resource_themes (consolidate duplicates, fix names, remove junk)
2. Adds proper descriptions to each peptide theme
3. Creates resources from YouTube videos in the embeddings table
4. Maps videos to themes via keyword matching on titles
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Fix Windows console encoding
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Load env ────────────────────────────────────────────
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = "--dry-run" in sys.argv

# ── Theme descriptions ──────────────────────────────────
THEME_DESCRIPTIONS = {
    "ARA-290": "A non-erythropoietic EPO-derived peptide with tissue-protective and anti-inflammatory properties, studied for neuropathy and chronic pain.",
    "BPC-157": "Body Protection Compound-157. A peptide derived from human gastric juice that promotes healing of muscles, tendons, ligaments, and the GI tract.",
    "Cagriniltide": "An amylin analog being studied in combination with semaglutide for enhanced weight management and metabolic health.",
    "CJC-1295 (no DAC)": "A growth hormone-releasing hormone (GHRH) analog that stimulates natural GH production without the sustained half-life of the DAC version.",
    "CJC-1295 / Ipamorelin": "A synergistic combination of GHRH analog and growth hormone secretagogue for optimized natural growth hormone release.",
    "DSIP": "Delta Sleep-Inducing Peptide. Promotes deep restorative sleep and has stress-protective, antioxidant, and endocrine-modulating properties.",
    "Epithalon": "A synthetic tetrapeptide that activates telomerase enzyme production, potentially supporting cellular longevity and anti-aging processes.",
    "FOXO4": "A peptide that selectively targets senescent (zombie) cells for clearance, supporting cellular rejuvenation and healthy aging.",
    "GHK-Cu": "Copper peptide GHK-Cu promotes skin remodeling, wound healing, collagen synthesis, and has potent anti-aging and tissue repair properties.",
    "Glutathione": "The body's master antioxidant. Supports detoxification, immune function, and cellular protection against oxidative stress.",
    "Ipamorelin": "A highly selective growth hormone secretagogue that stimulates GH release with minimal impact on cortisol and appetite hormones.",
    "Kisspeptin": "A neuropeptide that regulates reproductive hormone signaling (GnRH/LH/FSH) and has emerging roles in metabolic health and mood.",
    "KPV": "A tripeptide fragment of alpha-MSH with powerful anti-inflammatory, antimicrobial, and gut-healing properties.",
    "LL-37": "A human cathelicidin antimicrobial peptide with broad-spectrum immune defense, wound healing, and biofilm disruption properties.",
    "Melanotan 2": "A synthetic analog of alpha-melanocyte stimulating hormone (α-MSH) that promotes skin pigmentation and has other physiological effects.",
    "Methylene Blue": "A synthetic compound with antioxidant and mitochondrial-supporting properties studied for cognitive enhancement and cellular energy production.",
    "MOTS-C": "A mitochondrial-derived peptide that regulates metabolic homeostasis, improves insulin sensitivity, and enhances exercise capacity.",
    "NAD+": "Nicotinamide Adenine Dinucleotide. An essential coenzyme for cellular energy production, DNA repair, and sirtuin activation.",
    "Oxytocin": "The bonding hormone with roles in social behavior, stress reduction, wound healing, and anti-inflammatory effects.",
    "PT-141": "Bremelanotide. A melanocortin receptor agonist studied for sexual dysfunction that works through central nervous system pathways.",
    "Retatrutide": "A triple-agonist peptide targeting GLP-1, GIP, and glucagon receptors for comprehensive metabolic health and weight management.",
    "Selank": "An anxiolytic peptide derived from tuftsin with nootropic, immunomodulatory, and stress-reducing properties without sedation.",
    "Semax": "A synthetic peptide derived from ACTH (4-10) that supports cognitive function, neuroprotection, and brain-derived neurotrophic factor (BDNF) production.",
    "Sermorelin": "A growth hormone-releasing hormone analog (GHRH 1-29) that stimulates the pituitary to produce and release natural growth hormone.",
    "SS-31": "Elamipretide. Targets the inner mitochondrial membrane cardiolipin to restore mitochondrial function, improve cellular energy, and reduce oxidative stress.",
    "TB500": "Thymosin Beta 4. A naturally occurring peptide involved in tissue repair, cell migration, blood vessel formation, and anti-inflammatory processes.",
    "Tesamorelin": "A growth hormone-releasing hormone analog primarily studied for reducing visceral adipose tissue and improving metabolic parameters.",
    "Tesamorelin / Ipamorelin": "A blend combining GHRH analog Tesamorelin with secretagogue Ipamorelin for synergistic growth hormone optimization.",
    "Thymosin Alpha 1": "An immune-modulating peptide that enhances T-cell function, dendritic cell maturation, and overall immune surveillance.",
    "Tirzepatide": "A dual GLP-1/GIP receptor agonist used for type 2 diabetes and chronic weight management with significant metabolic benefits.",
    "VIP": "Vasoactive Intestinal Peptide. Regulates gut function, immune response, circadian rhythm, and has neuroprotective properties.",
    "AOD-9604": "A fragment of human growth hormone (hGH 176-191) studied for fat metabolism, weight management, and cartilage repair.",
}

# ── Video → Peptide keyword mapping ─────────────────────
# Each theme name maps to a list of lowercase keywords to search in video titles
VIDEO_PEPTIDE_KEYWORDS = {
    "BPC-157": ["bpc-157", "bpc 157", "bpc157"],
    "TB500": ["tb500", "tb-500", "tb 500"],
    "Retatrutide": ["retatrutide", "retatrude", "redatruide", "redatride", "red tide", "reddit true tide", "reta "],
    "Tirzepatide": ["tirzepatide", "tzepatide"],
    "KPV": ["kpv"],
    "GHK-Cu": ["ghk-cu", "ghk cu", "ghk copper", "copper peptide", "i take copper every day"],
    "DSIP": ["dsip"],
    "Kisspeptin": ["kisspeptin"],
    "MOTS-C": ["mots-c", "motsc", "mots c"],
    "SS-31": ["ss-31", "ss31", "ss 31"],
    "Methylene Blue": ["methylene blue"],
    "NAD+": ["nad+", "nad "],
    "Melanotan 2": ["melanotan"],
    "CJC-1295 / Ipamorelin": ["cjc 1295", "cjc-1295", "cjc1295", "ipamorelin"],
    "CJC-1295 (no DAC)": [],  # Videos assigned to blend theme instead
    "Epithalon": ["epithalon", "epitalon"],
    "AOD-9604": ["aod-9604", "aod9604", "aod 9604"],
    "Tesamorelin": ["tesamorelin"],
    "PT-141": ["pt-141", "pt141"],
    "Selank": ["selank"],
    "Semax": ["semax"],
    "Sermorelin": ["sermorelin"],
    "LL-37": ["ll-37", "ll37"],
    "Oxytocin": ["oxytocin"],
    "ARA-290": ["ara-290", "ara290"],
    "FOXO4": ["foxo4", "foxo-4"],
    "VIP": [],  # Too generic to match on title
    "Thymosin Alpha 1": ["thymosin alpha", "thymalin", "thy alpha"],
    "Glutathione": ["glutathione"],
    "Cagriniltide": ["cagriniltide"],
    "Ipamorelin": [],  # Videos go to CJC-1295 / Ipamorelin blend
    # Disease/condition-based matches that map to specific peptides
}

# Additional keyword patterns for broader topic matching
CONDITION_PEPTIDE_MAP = {
    "parkinson": ["BPC-157"],
    "dementia": ["BPC-157", "Semax"],
    "fibromyalgia": ["BPC-157"],
    "arthritis": ["BPC-157", "TB500"],
    "tinnitus": ["BPC-157"],
    "multiple sclerosis": ["BPC-157"],
    "hashimoto": ["Thymosin Alpha 1"],
    "menopause": ["Kisspeptin"],
    "lupus": ["BPC-157"],
    "crohn": ["BPC-157", "KPV"],
    "ulcerative colitis": ["BPC-157", "KPV"],
    "mold toxicity": ["Glutathione"],
    "cholesterol": ["Retatrutide"],
    "cardiovascular": ["BPC-157", "Retatrutide"],
    "ptsd": ["Selank", "Semax"],
    "adhd": ["Semax", "Selank"],
    "fatigue": ["NAD+", "SS-31", "MOTS-C"],
    "cancer": ["Retatrutide", "FOXO4"],
    "longevity": ["Epithalon", "MOTS-C", "SS-31"],
    "testosterone": ["Kisspeptin"],
    "growth hormone": ["Sermorelin", "CJC-1295 / Ipamorelin", "Tesamorelin"],
    "secretagogue": ["Sermorelin", "CJC-1295 / Ipamorelin"],
    "nicotine": ["Semax"],  # Nicotine videos often discuss nootropic stacks
    "brain upgrade": ["Semax", "Selank"],
    "migraine": ["BPC-157"],
    "parasite": ["LL-37"],
    "sleep": ["DSIP"],
    "peptide stack": [],  # General — no specific theme
}


def match_video_to_themes(title: str) -> list[str]:
    """Match a video title to one or more theme names."""
    title_lower = title.lower()
    matches = set()

    # Direct peptide keyword matching
    for theme_name, keywords in VIDEO_PEPTIDE_KEYWORDS.items():
        for kw in keywords:
            if kw in title_lower:
                matches.add(theme_name)
                break

    # Condition-based matching
    for condition, themes in CONDITION_PEPTIDE_MAP.items():
        if condition in title_lower:
            for t in themes:
                matches.add(t)

    return list(matches)


def main():
    print("=" * 60)
    print("  POPULATE LEARN SECTION")
    print("  " + ("DRY RUN — no changes will be made" if DRY_RUN else "LIVE RUN"))
    print("=" * 60)

    # ======================================================
    # PHASE 1: THEME CLEANUP
    # ======================================================
    print("\n-- PHASE 1: Theme Cleanup --")

    # Get current themes
    themes = sb.table("resource_themes").select("*").execute().data
    print(f"  Current themes: {len(themes)}")

    # Get current resources (to know what theme_ids are in use)
    resources = sb.table("resources").select("id, title, theme_id, url, type").execute().data
    print(f"  Current resources: {len(resources)}")

    # 1a. Delete garbage resources
    garbage_resources = [r for r in resources if not r.get("title") or r["title"] == "Test Resource" or not r.get("url")]
    if garbage_resources:
        print(f"\n  Deleting {len(garbage_resources)} garbage resources:")
        for r in garbage_resources:
            print(f"    - '{r.get('title', '(empty)')}' [{r['id'][:8]}...]")
            if not DRY_RUN:
                sb.table("resources").delete().eq("id", r["id"]).execute()

    # 1b. Delete "Test Peptide" theme
    test_themes = [t for t in themes if t["name"].strip() == "Test Peptide"]
    if test_themes:
        print(f"\n  Deleting 'Test Peptide' theme")
        if not DRY_RUN:
            for t in test_themes:
                sb.table("resource_themes").delete().eq("id", t["id"]).execute()

    # 1c. Define consolidation groups (source names → target name)
    consolidations = {
        "Retatrutide": ["Retatrutide 10mg", "Retatrutide 20mg", "Retatrutide 30mg", "Retatrutide 60mg"],
        "TB500": ["TB500 10mg", "TB500 20mg"],
        "Tesamorelin": ["Tesamorelin 10mg", "Tesamorelin 20mg"],
        "Tirzepatide": ["Tirzepatide 10mg", "Tirzepatide 20mg", "Tirzepatide 30mg"],
    }

    # Build name→id lookup (strip whitespace for matching)
    theme_lookup = {t["name"].strip(): t["id"] for t in themes}

    for target_name, source_names in consolidations.items():
        # Find existing theme IDs for this group
        group_ids = []
        for sn in source_names:
            tid = theme_lookup.get(sn)
            if tid:
                group_ids.append((sn, tid))

        if len(group_ids) <= 1:
            continue

        keep_name, keep_id = group_ids[0]
        delete_items = group_ids[1:]

        print(f"\n  Consolidating {target_name}: keeping '{keep_name}' [{keep_id[:8]}...], merging {len(delete_items)} others")

        for del_name, del_id in delete_items:
            # Move any resources from deleted theme to kept theme
            linked_res = [r for r in resources if r.get("theme_id") == del_id]
            if linked_res and not DRY_RUN:
                sb.table("resources").update({"theme_id": keep_id}).eq("theme_id", del_id).execute()
                print(f"    Moved {len(linked_res)} resources from '{del_name}'")

            # Delete the duplicate theme
            if not DRY_RUN:
                sb.table("resource_themes").delete().eq("id", del_id).execute()
            print(f"    Deleted theme '{del_name}'")

    # 1d. Rename themes to clean names
    renames = {
        # Consolidation targets
        "Retatrutide 10mg": "Retatrutide",
        "TB500 10mg": "TB500",
        "Tesamorelin 10mg": "Tesamorelin",
        "Tirzepatide 10mg": "Tirzepatide",
        # Dosage stripping
        "ARA-290": "ARA-290",  # already clean, but trim whitespace
        "BPC-157": "BPC-157",
        "Cagriniltide 10mg": "Cagriniltide",
        "CJC (no DAC)": "CJC-1295 (no DAC)",
        "CJC (no DAC)/Ipamorelin 5mg/5mg": "CJC-1295 / Ipamorelin",
        "DSIP 10mg": "DSIP",
        "Epithalon 40mg": "Epithalon",
        "FOXO4 10mg": "FOXO4",
        "GHK-CU 100mg": "GHK-Cu",
        "Glutathione 1500mg": "Glutathione",
        "Ipamorelin 10mg": "Ipamorelin",
        "Kisspeptin 10mg": "Kisspeptin",
        "KPV": "KPV",
        "LL-37 5mg": "LL-37",
        "Melanotan 2 10mg": "Melanotan 2",
        "Methylone Blue": "Methylene Blue",
        "MOTS-C 40mg": "MOTS-C",
        "NAD+ 1000mg": "NAD+",
        "Oxytocin 10mg": "Oxytocin",
        "PT-141 10mg": "PT-141",
        "Selank 10mg": "Selank",
        "Semax 10mg": "Semax",
        "Sermorelin 10mg": "Sermorelin",
        "SS-31 50mg": "SS-31",
        "Tesamorelin/Ipamorelin Blnd 11mg/6mg": "Tesamorelin / Ipamorelin",
        "Thy Alpha 1 10mg": "Thymosin Alpha 1",
        "VIP 10mg": "VIP",
    }

    print("\n  Renaming themes:")
    # Refresh themes after consolidation
    if not DRY_RUN:
        themes = sb.table("resource_themes").select("*").execute().data
    theme_lookup = {t["name"].strip(): t for t in themes}

    renamed_count = 0
    for old_name, new_name in renames.items():
        t = theme_lookup.get(old_name)
        if not t:
            continue

        desc = THEME_DESCRIPTIONS.get(new_name, t.get("description", ""))
        if t["name"].strip() == new_name and t.get("description") == desc:
            continue  # Already correct

        print(f"    '{old_name}' → '{new_name}'")
        if not DRY_RUN:
            sb.table("resource_themes").update({
                "name": new_name,
                "description": desc,
            }).eq("id", t["id"]).execute()
        renamed_count += 1

    print(f"  Renamed {renamed_count} themes")

    # 1e. Add missing theme: AOD-9604
    if not DRY_RUN:
        themes = sb.table("resource_themes").select("*").execute().data
    current_names = {t["name"].strip() for t in themes}

    missing_themes = ["AOD-9604"]
    for mt in missing_themes:
        if mt not in current_names:
            print(f"\n  Creating missing theme: {mt}")
            if not DRY_RUN:
                sb.table("resource_themes").insert({
                    "name": mt,
                    "description": THEME_DESCRIPTIONS.get(mt, f"Resources related to {mt}"),
                    "icon": "beaker",
                    "color": "#10b981",
                }).execute()

    # ======================================================
    # PHASE 2: POPULATE RESOURCES FROM YOUTUBE EMBEDDINGS
    # ======================================================
    print("\n-- PHASE 2: Populate Resources from YouTube --")

    # Get fresh theme list
    if not DRY_RUN:
        themes = sb.table("resource_themes").select("*").execute().data
    theme_name_to_id = {t["name"].strip(): t["id"] for t in themes}

    # Get existing resources to avoid duplicates (normalize URLs to video IDs)
    import re as _re
    def extract_video_id(url: str) -> str:
        """Extract YouTube video ID from various URL formats."""
        if not url:
            return url
        # youtu.be/VIDEO_ID or youtube.com/watch?v=VIDEO_ID
        m = _re.search(r'(?:youtu\.be/|youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})', url)
        return m.group(1) if m else url

    existing_resources = sb.table("resources").select("url").execute().data
    existing_video_ids = {extract_video_id(r["url"]) for r in existing_resources if r.get("url")}

    # Get distinct videos from embeddings
    # We need to query embeddings and group by video_id in the metadata
    print("  Fetching distinct videos from embeddings...")

    # Supabase JS/Python client doesn't support DISTINCT on jsonb easily,
    # so we fetch all and deduplicate in Python
    all_embeddings = []
    page_size = 1000
    offset = 0
    while True:
        batch = sb.table("embeddings").select(
            "metadata"
        ).not_.is_("metadata->>video_id", "null").range(offset, offset + page_size - 1).execute().data
        all_embeddings.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    # Deduplicate by video_id, keeping first occurrence
    seen_videos = {}
    for emb in all_embeddings:
        meta = emb.get("metadata", {})
        vid = meta.get("video_id")
        if vid and vid not in seen_videos:
            seen_videos[vid] = {
                "video_id": vid,
                "title": meta.get("title", "Untitled"),
                "video_url": meta.get("video_url", f"https://www.youtube.com/watch?v={vid}"),
            }

    videos = list(seen_videos.values())
    print(f"  Found {len(videos)} distinct YouTube videos")

    # Match videos to themes and insert resources
    inserted = 0
    skipped_existing = 0
    unmatched = []

    for video in videos:
        url = video["video_url"]
        title = video["title"]
        vid = video["video_id"]

        # Skip if resource already exists for this video
        if vid in existing_video_ids:
            skipped_existing += 1
            continue

        # Match to themes
        matched_themes = match_video_to_themes(title)

        if not matched_themes:
            unmatched.append(title)
            # Still insert as unthemed resource (shows in general library)
            matched_themes = [None]

        for theme_name in matched_themes:
            theme_id = theme_name_to_id.get(theme_name) if theme_name else None

            # Skip if theme doesn't exist (shouldn't happen after cleanup, but safety check)
            if theme_name and not theme_id:
                print(f"    WARNING: Theme '{theme_name}' not found, inserting unthemed")
                theme_id = None

            resource = {
                "title": title,
                "description": f"Dr. Trevor Bachmeyer discusses {title.split(' - ')[0] if ' - ' in title else title}.",
                "type": "video",
                "url": url,
                "content": None,
                "link_button_text": "Watch on YouTube",
                "theme_id": theme_id,
                "thumbnail_url": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
                "view_count": 0,
                "is_featured": False,
            }

            if not DRY_RUN:
                try:
                    sb.table("resources").insert(resource).execute()
                    inserted += 1
                except Exception as e:
                    print(f"    ERROR inserting '{title}': {e}")
            else:
                inserted += 1

            # Track URL to avoid duplicate inserts for multi-theme videos
            # (each video gets one resource per matched theme)
            # Actually, let's only insert once per video — assign to FIRST matching theme
            break

        existing_video_ids.add(vid)

    # ======================================================
    # PHASE 3: ASSIGN UNTHEMED EXISTING RESOURCES
    # ======================================================
    print("\n-- PHASE 3: Fix Unthemed Resources --")

    # Re-fetch resources to include newly inserted ones
    if not DRY_RUN:
        all_resources = sb.table("resources").select("id, title, theme_id, url").execute().data
        unthemed = [r for r in all_resources if not r.get("theme_id") and r.get("title")]
        fixed = 0
        for r in unthemed:
            matched = match_video_to_themes(r["title"])
            if matched:
                theme_id = theme_name_to_id.get(matched[0])
                if theme_id:
                    sb.table("resources").update({"theme_id": theme_id}).eq("id", r["id"]).execute()
                    print(f"    Linked '{r['title'][:50]}...' → {matched[0]}")
                    fixed += 1
        print(f"  Fixed {fixed} unthemed resources")

    # ======================================================
    # SUMMARY
    # ======================================================
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  Resources inserted: {inserted}")
    print(f"  Already existed (skipped): {skipped_existing}")
    print(f"  Videos without theme match: {len(unmatched)}")

    if unmatched:
        print("\n  Unmatched videos (inserted as general resources):")
        for t in sorted(unmatched):
            print(f"    - {t}")

    # Final theme coverage report
    if not DRY_RUN:
        themes = sb.table("resource_themes").select("id, name").execute().data
        all_resources = sb.table("resources").select("theme_id").execute().data
        theme_counts = {}
        for r in all_resources:
            tid = r.get("theme_id")
            if tid:
                theme_counts[tid] = theme_counts.get(tid, 0) + 1

        print("\n  Theme coverage:")
        empty_themes = []
        for t in sorted(themes, key=lambda x: x["name"]):
            count = theme_counts.get(t["id"], 0)
            if count == 0:
                empty_themes.append(t["name"])
            else:
                print(f"    ✓ {t['name']}: {count} resources")

        if empty_themes:
            print(f"\n  Still empty ({len(empty_themes)} themes):")
            for name in empty_themes:
                print(f"    ○ {name}")
    else:
        print("\n  (DRY RUN — no changes made)")


if __name__ == "__main__":
    main()
