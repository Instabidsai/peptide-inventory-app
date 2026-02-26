"""Patch dispatch.py on the droplet to fix URL detection and add proactive scraping."""
import re
import sys

DISPATCH_PATH = "/opt/peptide-agent/api/dispatch.py"

with open(DISPATCH_PATH, "r") as f:
    content = f.read()

original = content  # Keep a backup

# ═══════════════════════════════════════════════════════════════
# FIX 1: Replace URL_PATTERN to also catch bare domains
# ═══════════════════════════════════════════════════════════════

# Find and replace the URL_PATTERN block (3-4 lines starting with URL_PATTERN = re.compile)
lines = content.split("\n")
new_lines = []
i = 0
fix1_applied = False
while i < len(lines):
    line = lines[i]
    if "URL_PATTERN = re.compile(" in line and not fix1_applied:
        # Skip lines until we find the closing )
        while i < len(lines) and not (lines[i].strip() == ")" and i > 0):
            i += 1
        i += 1  # skip the closing )

        # Insert new URL pattern
        new_lines.append('# Match full URLs (https://...), www URLs (www....), and bare domains')
        new_lines.append('# Bare domain matching is limited to common TLDs to avoid false positives')
        new_lines.append('BARE_DOMAIN_TLDS = r"(?:com|net|org|io|ai|co|shop|store|us|biz|info|health|xyz|me|app|dev|bio|site|online|tech)"')
        new_lines.append("URL_PATTERN = re.compile(")
        new_lines.append('    rf\'https?://[^\\s<>"\\x27]+|www\\.[^\\s<>"\\x27]+\\.[^\\s<>"\\x27]+|[a-zA-Z0-9][-a-zA-Z0-9]*\\.{BARE_DOMAIN_TLDS}(?:/[^\\s<>"\\x27]*)?\',')
        new_lines.append("    re.IGNORECASE,")
        new_lines.append(")")
        fix1_applied = True
        continue
    new_lines.append(line)
    i += 1

if fix1_applied:
    content = "\n".join(new_lines)
    print("FIX 1 APPLIED: URL_PATTERN updated to catch bare domains")
else:
    print("FIX 1 SKIPPED: URL_PATTERN not found")

# ═══════════════════════════════════════════════════════════════
# FIX 2: Add proactive scraping after URL detection block
# ═══════════════════════════════════════════════════════════════

# We need to find the end of the URL scrape block and add proactive scrape after it
# Look for: logger.info(f"Injected scrape results for {urls[0]}")
marker = 'logger.info(f"Injected scrape results for {urls[0]}")'

if marker in content:
    proactive_block = '''

    # 3b. Proactive scrape: if no URL in message but website exists with no products
    if not scrape_block and access_token:
        try:
            tc = sb.table("tenant_config").select("website_url").eq("org_id", org_id).limit(1).execute()
            prods = sb.table("peptides").select("id", count="exact").eq("org_id", org_id).eq("active", True).limit(1).execute()
            has_website = tc.data and tc.data[0].get("website_url")
            has_products = prods.count and prods.count > 0

            if has_website and not has_products:
                # Check if we already scraped (don't re-scrape)
                already = sb.table("scraped_peptides").select("id", count="exact").eq("org_id", org_id).limit(1).execute()
                if not (already.count and already.count > 0):
                    logger.info(f"Proactive scrape: website={tc.data[0]['website_url']} but no products")
                    scrape_result = await _scrape_website(tc.data[0]["website_url"], access_token)
                    if scrape_result:
                        scrape_block = _format_scrape_results(scrape_result)
                        logger.info("Proactive scrape injected")
        except Exception:
            logger.debug("Proactive scrape check failed -- continuing without")'''

    content = content.replace(marker, marker + proactive_block)
    print("FIX 2 APPLIED: Proactive scrape logic added after URL detection")
else:
    print("FIX 2 SKIPPED: Could not find scrape marker")

# ═══════════════════════════════════════════════════════════════
# Write back
# ═══════════════════════════════════════════════════════════════

with open(DISPATCH_PATH, "w") as f:
    f.write(content)

# Also write a backup
with open(DISPATCH_PATH + ".bak", "w") as f:
    f.write(original)

print(f"\ndispatch.py updated ({DISPATCH_PATH})")
print(f"Backup saved to {DISPATCH_PATH}.bak")
