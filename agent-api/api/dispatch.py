"""
Dispatch messages to Claude Code CLI directly via subprocess.
Enriches prompts with org context and stores conversation history.
Includes rate limiting, audit logging, org-isolation enforcement,
and automatic website scraping when URLs are detected.
"""
import os
import re
import uuid
import json
import logging
import asyncio
import time
from collections import defaultdict

import httpx
from supabase import create_client, Client

logger = logging.getLogger("onboarding-agent.dispatch")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CLAUDE_CMD = os.environ.get("CLAUDE_CMD", "claude")
CLAUDE_MD_PATH = os.environ.get("CLAUDE_MD_PATH", "/opt/peptide-agent/CLAUDE.md")

_supabase: Client | None = None

# Limit concurrent Claude CLI processes to prevent OOM on the droplet.
# 8GB RAM, ~1GB per process → max 4 concurrent, rest queue up.
MAX_CONCURRENT_AGENTS = int(os.environ.get("MAX_CONCURRENT_AGENTS", "4"))
_agent_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AGENTS)

# ── Rate limiting ──
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "10"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))
_rate_limits: dict[str, list[float]] = defaultdict(list)

# ── URL detection ──
URL_PATTERN = re.compile(
    r'https?://[^\s<>"\']+|www\.[^\s<>"\']+\.[^\s<>"\']+',
    re.IGNORECASE,
)


def check_rate_limit(org_id: str) -> bool:
    """Return True if the org is within rate limits, False if exceeded."""
    now = time.time()
    window = _rate_limits[org_id]
    _rate_limits[org_id] = [t for t in window if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[org_id]) >= RATE_LIMIT_MAX:
        return False
    _rate_limits[org_id].append(now)
    return True


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


def _extract_urls(text: str) -> list[str]:
    """Extract URLs from a message. Returns de-duped list."""
    urls = URL_PATTERN.findall(text)
    seen = set()
    result = []
    for url in urls:
        # Normalize
        if not url.startswith("http"):
            url = f"https://{url}"
        # Strip trailing punctuation
        url = url.rstrip(".,;:!?)")
        if url not in seen:
            seen.add(url)
            result.append(url)
    return result


async def _scrape_website(url: str, access_token: str) -> dict | None:
    """
    Call the scrape-brand Supabase edge function to extract brand identity
    and peptide catalog from a website URL.

    Returns the extraction result dict or None if scraping fails.
    The edge function handles:
    - Firecrawl scraping (with raw HTML fallback)
    - CSS color extraction
    - GPT-4o structured extraction (brand + peptides)
    - Persistence to tenant_config + scraped_peptides
    """
    edge_url = f"{SUPABASE_URL}/functions/v1/scrape-brand"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                edge_url,
                json={"url": url, "persist": True},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code != 200:
            logger.warning(f"scrape-brand returned {resp.status_code}: {resp.text[:500]}")
            return None

        data = resp.json()
        logger.info(
            f"scrape-brand success: {data.get('metadata', {}).get('peptides_found', 0)} peptides found"
        )
        return data

    except Exception:
        logger.exception(f"Failed to scrape {url}")
        return None


def _format_scrape_results(data: dict) -> str:
    """Format scrape-brand results into a text block for the agent prompt."""
    lines = ["[WEBSITE SCRAPE RESULTS]"]
    lines.append("The system automatically scraped the merchant's website. Here's what was extracted:\n")

    brand = data.get("brand", {})
    if brand:
        lines.append("BRAND IDENTITY:")
        if brand.get("company_name"):
            lines.append(f"  Company Name: {brand['company_name']}")
        if brand.get("primary_color"):
            lines.append(f"  Primary Color: {brand['primary_color']}")
        if brand.get("secondary_color"):
            lines.append(f"  Secondary Color: {brand['secondary_color']}")
        if brand.get("font_family"):
            lines.append(f"  Font: {brand['font_family']}")
        if brand.get("logo_url"):
            lines.append(f"  Logo URL: {brand['logo_url']}")
        if brand.get("tagline"):
            lines.append(f"  Tagline: {brand['tagline']}")
        lines.append("")

    peptides = data.get("peptides", [])
    if peptides:
        lines.append(f"PEPTIDE CATALOG ({len(peptides)} products found):")
        for p in peptides:
            price_str = f"${p['price']}" if p.get("price") else "price unknown"
            conf = f"{int(p.get('confidence', 0) * 100)}% confidence" if p.get("confidence") else ""
            lines.append(f"  - {p['name']} ({price_str}) {conf}")
            if p.get("description"):
                lines.append(f"    {p['description'][:100]}")
        lines.append("")

    meta = data.get("metadata", {})
    if meta:
        lines.append(f"Source URL: {meta.get('url', 'unknown')}")
        if meta.get("persisted"):
            lines.append("Status: Brand data has been auto-saved to tenant_config. Peptides saved to scraped_peptides (pending review).")
        lines.append("")

    lines.append("INSTRUCTIONS: Use this scraped data to set up the merchant's CRM. Apply branding, import the peptides to their catalog, and guide them through the rest of setup. If the brand data was auto-persisted, acknowledge that and ask if they want to adjust anything.")

    return "\n".join(lines)


def _fetch_org_state(org_id: str) -> str:
    """
    Query the database for a snapshot of what this org has already configured.
    Returns a plain-text summary block to inject into the prompt so the agent
    knows the merchant's current state regardless of conversation history length.

    Each query is independent — one table failure won't kill the whole snapshot.
    """
    sb = get_supabase()
    lines = []

    # Products
    try:
        products = sb.table("peptides") \
            .select("name, retail_price") \
            .eq("org_id", org_id) \
            .eq("active", True) \
            .limit(50) \
            .execute()
        if products.data:
            items = [f"  - {p['name']} (${p['retail_price']})" for p in products.data]
            lines.append(f"Products ({len(products.data)} active):\n" + "\n".join(items))
        else:
            lines.append("Products: None configured yet")
    except Exception:
        logger.debug("Failed to fetch peptides — skipping")

    # Scraped peptides (pending review)
    try:
        scraped = sb.table("scraped_peptides") \
            .select("name, price, confidence, status") \
            .eq("org_id", org_id) \
            .limit(50) \
            .execute()
        if scraped.data:
            pending = [s for s in scraped.data if s.get("status") == "pending"]
            approved = [s for s in scraped.data if s.get("status") == "approved"]
            if pending:
                lines.append(f"Scraped peptides awaiting review: {len(pending)}")
            if approved:
                lines.append(f"Scraped peptides approved: {len(approved)}")
    except Exception:
        logger.debug("Failed to fetch scraped_peptides — skipping")

    # Tenant config (branding, payments)
    try:
        config = sb.table("tenant_config") \
            .select("*") \
            .eq("org_id", org_id) \
            .limit(1) \
            .execute()
        if config.data:
            c = config.data[0]
            brand_parts = []
            if c.get("primary_color"):
                brand_parts.append(f"color={c['primary_color']}")
            if c.get("logo_url"):
                brand_parts.append("logo=set")
            if c.get("business_name") or c.get("brand_name"):
                brand_parts.append(f"name={c.get('business_name') or c.get('brand_name')}")
            if c.get("website_url"):
                brand_parts.append(f"website={c['website_url']}")
            lines.append(f"Branding: {', '.join(brand_parts) if brand_parts else 'Not configured'}")

            pay_parts = []
            if c.get("venmo_handle"):
                pay_parts.append(f"Venmo ({c['venmo_handle']})")
            if c.get("zelle_email"):
                pay_parts.append(f"Zelle ({c['zelle_email']})")
            if c.get("stripe_connected"):
                pay_parts.append("Stripe")
            lines.append(f"Payments: {', '.join(pay_parts) if pay_parts else 'None configured'}")

            # Fulfillment
            ship_parts = []
            if c.get("ship_from_name"):
                ship_parts.append(f"from={c['ship_from_name']}")
            if c.get("ship_from_city"):
                ship_parts.append(f"{c['ship_from_city']}, {c.get('ship_from_state', '')}")
            lines.append(f"Shipping: {', '.join(ship_parts) if ship_parts else 'Not configured'}")
        else:
            lines.append("Branding: Not configured")
            lines.append("Payments: None configured")
            lines.append("Shipping: Not configured")
    except Exception:
        logger.debug("Failed to fetch tenant_config — skipping")

    # Contacts
    try:
        contacts = sb.table("contacts") \
            .select("id", count="exact") \
            .eq("org_id", org_id) \
            .limit(1) \
            .execute()
        count = contacts.count if contacts.count else 0
        lines.append(f"Contacts: {count} imported")
    except Exception:
        logger.debug("Failed to fetch contacts — skipping")

    # Feature flags (from org_features)
    try:
        flags = sb.table("org_features") \
            .select("feature_key, enabled") \
            .eq("org_id", org_id) \
            .eq("enabled", True) \
            .execute()
        if flags.data:
            enabled = [f['feature_key'] for f in flags.data]
            lines.append(f"Features enabled: {', '.join(enabled)}")
        else:
            lines.append("Features: None enabled yet")
    except Exception:
        logger.debug("Failed to fetch org_features — skipping")

    # Pricing tiers — try both possible table names
    try:
        tiers = sb.table("pricing_tiers") \
            .select("name, discount_percentage") \
            .eq("org_id", org_id) \
            .execute()
        if tiers.data:
            tier_strs = [f"{t['name']} ({t['discount_percentage']}%)" for t in tiers.data]
            lines.append(f"Pricing tiers: {', '.join(tier_strs)}")
        else:
            lines.append("Pricing tiers: Default (Retail/Partner/VIP)")
    except Exception:
        # Table might be named wholesale_pricing_tiers in some schemas
        try:
            tiers = sb.table("wholesale_pricing_tiers") \
                .select("name, discount_pct") \
                .eq("org_id", org_id) \
                .execute()
            if tiers.data:
                tier_strs = [f"{t['name']} ({t['discount_pct']}%)" for t in tiers.data]
                lines.append(f"Pricing tiers: {', '.join(tier_strs)}")
            else:
                lines.append("Pricing tiers: Default")
        except Exception:
            logger.debug("Failed to fetch pricing tiers — skipping")

    # Commissions
    try:
        commissions = sb.table("commissions") \
            .select("id", count="exact") \
            .eq("org_id", org_id) \
            .limit(1) \
            .execute()
        comm_count = commissions.count if commissions.count else 0
        lines.append(f"Commission rules: {comm_count} configured")
    except Exception:
        logger.debug("Failed to fetch commissions — skipping")

    return "\n".join(lines)


def build_context_prompt(
    org_id: str,
    email: str,
    full_name: str,
    message: str,
    history: list[dict],
    scrape_block: str = "",
) -> str:
    """
    Build a context-enriched prompt for Claude Code.
    Includes org state snapshot, scraped website data, conversation history,
    and the user's message.
    """
    # Org state snapshot — always current regardless of history length
    state_block = _fetch_org_state(org_id)

    history_block = ""
    if history:
        recent = history[-10:]
        lines = []
        for msg in recent:
            role_label = "Merchant" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role_label}: {msg['content']}")
        history_block = "\n".join(lines)

    prompt = f"""[SECURITY — PREPEND TO EVERY SQL WRITE]
Each execute_sql call is a SEPARATE database session. Session variables do NOT persist between calls.
You MUST prepend this line to EVERY SQL statement that writes data (INSERT, UPDATE, DELETE):
SELECT set_config('app.agent_org_id', '{org_id}', true);
Combine it in the SAME execute_sql call as the write. Example:
  SELECT set_config('app.agent_org_id', '{org_id}', true);
  INSERT INTO peptides (org_id, name, retail_price, active) VALUES ('{org_id}', 'BPC-157', 49.99, true);
NEVER run set_config as a separate call — the config will be lost before the write happens.

[ONBOARDING SESSION]
Org ID: {org_id}
User Email: {email}
User Name: {full_name}

[CURRENT ORG STATE]
{state_block if state_block else "No state data available — query the database to check."}

{scrape_block + chr(10) if scrape_block else ""}{f"Recent conversation:{chr(10)}{history_block}{chr(10)}" if history_block else ""}
Merchant says: {message}"""

    return prompt


async def call_claude_cli(prompt: str) -> tuple[str, str]:
    """
    Call Claude Code CLI in full agentic mode via subprocess.
    Uses --print for non-interactive output + --allowedTools to unlock
    MCP tool access (Supabase, Composio) so the agent can actually
    read/write the database and trigger integrations.

    Returns (stdout_text, stderr_text) — stderr contains tool usage logs.
    """
    system_prompt = ""
    if os.path.exists(CLAUDE_MD_PATH):
        with open(CLAUDE_MD_PATH, "r") as f:
            system_prompt = f.read()

    cmd = [
        CLAUDE_CMD,
        "--print",                   # non-interactive, outputs result to stdout
        "--output-format", "text",   # plain text output (no JSON wrapper)
        "--verbose",                 # log tool usage to stderr for debugging
        # Unlock all MCP tools — full agentic mode
        "--allowedTools",
        "mcp__supabase__execute_sql",
        "mcp__supabase__list_tables",
        "mcp__supabase__get_project",
        "mcp__supabase__get_project_url",
        "mcp__supabase__get_organization",
        "mcp__supabase__apply_migration",
        "mcp__composio__*",
    ]

    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    # Run from /root so Claude finds its project-scoped MCP config
    env = {**os.environ, "HOME": "/root"}
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd="/root",
        env=env,
    )

    stdout, stderr = await asyncio.wait_for(
        process.communicate(input=prompt.encode("utf-8")),
        timeout=300.0,  # 5 min — MCP server boot + tool execution
    )

    stderr_text = stderr.decode("utf-8", errors="replace").strip()

    if process.returncode != 0:
        logger.error(f"Claude CLI exited with code {process.returncode}: {stderr_text}")
        raise RuntimeError(f"Claude CLI failed: {stderr_text}")

    return stdout.decode("utf-8", errors="replace").strip(), stderr_text


async def dispatch_message(
    user_id: str,
    org_id: str,
    email: str,
    full_name: str,
    message: str,
    attachments: list[dict] | None = None,
    access_token: str = "",
) -> dict:
    """
    1. Check rate limit
    2. Store user message in onboarding_messages
    3. Detect URLs → scrape website if found
    4. Build context-enriched prompt (with scrape results + file contents)
    5. Call Claude Code CLI
    6. Store assistant reply in onboarding_messages
    7. Write audit log
    8. Return reply
    """
    sb = get_supabase()

    # 1. Rate limit check
    if not check_rate_limit(org_id):
        _log_audit(sb, org_id, user_id, message, None, None, 0, "rate_limited")
        raise RateLimitExceeded(f"Rate limit exceeded for org {org_id}")

    # 2. Store user message
    user_msg_id = str(uuid.uuid4())
    sb.table("onboarding_messages").insert({
        "id": user_msg_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "user",
        "content": message,
    }).execute()

    # 3. Detect URLs and scrape if found
    scrape_block = ""
    urls = _extract_urls(message)
    if urls and access_token:
        # Scrape the first URL found (usually the merchant's website)
        scrape_result = await _scrape_website(urls[0], access_token)
        if scrape_result:
            scrape_block = _format_scrape_results(scrape_result)
            logger.info(f"Injected scrape results for {urls[0]}")

    # 4. Get recent history for context
    history_result = sb.table("onboarding_messages") \
        .select("role, content") \
        .eq("org_id", org_id) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()

    history = history_result.data or []

    # 5. Build prompt and call Claude CLI
    prompt = build_context_prompt(
        org_id, email, full_name, message, history[:-1],
        scrape_block=scrape_block,
    )

    # Append file attachment info to prompt if present
    if attachments:
        file_lines = []
        for att in attachments:
            file_lines.append(f"  - {att['name']} ({att['type']}): {att['url']}")
        prompt += f"\n\n[UPLOADED FILES]\nThe merchant uploaded these files. Download and process them:\n" + "\n".join(file_lines)

    start_time = time.time()
    status = "success"
    tool_log = ""
    reply = ""

    try:
        async with _agent_semaphore:
            reply, tool_log = await call_claude_cli(prompt)
    except asyncio.TimeoutError:
        logger.error("Claude CLI timeout (300s)")
        reply = "I'm still thinking about that — it's taking longer than expected. Please try again in a moment."
        status = "timeout"
    except Exception as e:
        logger.exception("Claude CLI dispatch failed")
        reply = "I encountered an error connecting to the AI backend. Please try again shortly."
        status = "error"

    duration_ms = int((time.time() - start_time) * 1000)

    # 6. Store assistant reply
    assistant_msg_id = str(uuid.uuid4())
    sb.table("onboarding_messages").insert({
        "id": assistant_msg_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "assistant",
        "content": reply,
    }).execute()

    # 7. Write audit log
    _log_audit(sb, org_id, user_id, message, reply, tool_log, duration_ms, status)

    return {"reply": reply, "message_id": assistant_msg_id}


class RateLimitExceeded(Exception):
    """Raised when an org exceeds the per-minute rate limit."""
    pass


def _log_audit(
    sb: Client,
    org_id: str,
    user_id: str,
    message: str,
    reply: str | None,
    tool_log: str | None,
    duration_ms: int,
    status: str,
) -> None:
    """Insert a row into agent_audit_log. Fails silently — audit should never break the main flow."""
    try:
        sb.table("agent_audit_log").insert({
            "org_id": org_id,
            "user_id": user_id,
            "message_preview": message[:200],
            "reply_preview": (reply or "")[:500],
            "tool_log": (tool_log or "")[:5000],
            "duration_ms": duration_ms,
            "status": status,
        }).execute()
    except Exception:
        logger.warning("Failed to write audit log — continuing")


async def get_conversation_history(org_id: str, user_id: str) -> list[dict]:
    """Fetch conversation history for a user's org."""
    sb = get_supabase()
    result = sb.table("onboarding_messages") \
        .select("id, role, content, created_at") \
        .eq("org_id", org_id) \
        .order("created_at", desc=False) \
        .limit(50) \
        .execute()

    return result.data or []
