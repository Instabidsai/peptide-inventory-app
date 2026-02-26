"""Patch CLAUDE.md on the droplet to make the agent auto-import scraped products."""

CLAUDE_MD_PATH = "/opt/peptide-agent/CLAUDE.md"

with open(CLAUDE_MD_PATH, "r") as f:
    content = f.read()

original = content

# ═══════════════════════════════════════════════════════════════
# FIX 1: Make the agent auto-import products from scrape results
# ═══════════════════════════════════════════════════════════════

old_scrape_instructions = """**Your job is to IMMEDIATELY use this data to build their CRM:**

1. Check what the scrape already auto-saved (brand data goes to `tenant_config`, peptides go to `scraped_peptides` with status `pending`)
2. Apply any branding that wasn't auto-saved
3. Review and import the scraped peptides into their active catalog
4. Guide them through the remaining setup (payments, shipping, contacts, etc.)

Don't make them repeat information the scrape already found. Show them what you built and ask "Does this look right? Anything to adjust?\""""

new_scrape_instructions = """**Your job is to IMMEDIATELY use this data to build their CRM — NO ASKING, JUST DO IT:**

1. Check what the scrape already auto-saved (brand data goes to `tenant_config`, peptides go to `scraped_peptides` with status `pending`)
2. Apply any branding that wasn't auto-saved
3. **IMMEDIATELY import ALL scraped peptides with confidence >= 0.5 into the `peptides` table** — do NOT ask permission first. Just import them all in one batch INSERT.
4. Update each imported scraped_peptide's status to `imported` and link `imported_peptide_id`
5. Show the merchant a clean table of what you imported (name + price) and say "I pulled these from your website. Anything to adjust?"
6. Guide them through the remaining setup (payments, shipping, contacts, etc.)

**CRITICAL**: Do NOT ask "Should I import these?" or "Would you like me to add these?" — JUST DO IT. Import everything, show results, and let them correct anything that's wrong. Action over permission."""

if old_scrape_instructions in content:
    content = content.replace(old_scrape_instructions, new_scrape_instructions)
    print("FIX 1 APPLIED: Auto-import instructions updated")
else:
    print("FIX 1 SKIPPED: Could not find old scrape instructions")

# ═══════════════════════════════════════════════════════════════
# FIX 2: Update the "If No Website" section to be more aggressive
# ═══════════════════════════════════════════════════════════════

old_no_website = """### If No Website Is Provided

Greet them and ask:
```
Welcome to ThePeptideAI! I'm your Setup Assistant — I'll build out your entire business platform.

The fastest way to get started: share your website URL and I'll extract your branding, products, and everything I can find automatically.

Or tell me about your business and we'll set it up step by step.
```"""

new_no_website = """### If No Website Is Provided

Greet them and ask:
```
Welcome to ThePeptideAI! I'm your Setup Assistant — I'll build out your entire business platform.

To get you set up in under 2 minutes: what's your website URL? I'll pull your branding, every product, and prices automatically.
```

**Do NOT offer the "step by step" alternative upfront.** Always push for the website URL first — it's 10x faster. Only fall back to manual setup if they explicitly say they don't have a website."""

if old_no_website in content:
    content = content.replace(old_no_website, new_no_website)
    print("FIX 2 APPLIED: No-website greeting updated")
else:
    print("FIX 2 SKIPPED: Could not find old no-website section")

# ═══════════════════════════════════════════════════════════════
# FIX 3: Update the import step in the playbook
# ═══════════════════════════════════════════════════════════════

old_import_step = """### Step 2: Import Products (from scraped peptides)
First, check what was scraped:
```sql
SELECT id, name, price, confidence, status FROM scraped_peptides
WHERE org_id = '<ORG_ID>' AND status = 'pending'
ORDER BY confidence DESC;
```

Then import approved ones:"""

new_import_step = """### Step 2: Import Products (from scraped peptides)
First, check what was scraped:
```sql
SELECT id, name, price, confidence, status FROM scraped_peptides
WHERE org_id = '<ORG_ID>' AND status = 'pending'
ORDER BY confidence DESC;
```

**IMMEDIATELY import ALL with confidence >= 0.5 — do NOT ask the merchant:**"""

if old_import_step in content:
    content = content.replace(old_import_step, new_import_step)
    print("FIX 3 APPLIED: Import step updated to auto-import")
else:
    print("FIX 3 SKIPPED: Could not find old import step")

# Write back
with open(CLAUDE_MD_PATH, "w") as f:
    f.write(content)

with open(CLAUDE_MD_PATH + ".bak", "w") as f:
    f.write(original)

print(f"\nCLAUDE.md updated ({CLAUDE_MD_PATH})")
print(f"Backup saved to {CLAUDE_MD_PATH}.bak")
