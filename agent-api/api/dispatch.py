"""
Dispatch messages to Claude Code CLI directly via subprocess.
Enriches prompts with org context and stores conversation history.
Includes rate limiting, audit logging, and org-isolation enforcement.
"""
import os
import uuid
import logging
import asyncio
import time
from collections import defaultdict

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


def _fetch_org_state(org_id: str) -> str:
    """
    Query the database for a snapshot of what this org has already configured.
    Returns a plain-text summary block to inject into the prompt so the agent
    knows the merchant's current state regardless of conversation history length.
    """
    sb = get_supabase()
    lines = []

    try:
        # Products
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

        # Tenant config (branding, payments)
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
            if c.get("business_name"):
                brand_parts.append(f"name={c['business_name']}")
            lines.append(f"Branding: {', '.join(brand_parts) if brand_parts else 'Not configured'}")

            pay_parts = []
            if c.get("venmo_handle"):
                pay_parts.append("Venmo")
            if c.get("zelle_email"):
                pay_parts.append("Zelle")
            if c.get("stripe_connected"):
                pay_parts.append("Stripe")
            lines.append(f"Payments: {', '.join(pay_parts) if pay_parts else 'None configured'}")
        else:
            lines.append("Branding: Not configured")
            lines.append("Payments: None configured")

        # Contacts
        contacts = sb.table("contacts") \
            .select("id", count="exact") \
            .eq("org_id", org_id) \
            .limit(1) \
            .execute()
        count = contacts.count if contacts.count else 0
        lines.append(f"Contacts: {count} imported")

        # Feature flags
        flags = sb.table("feature_flags") \
            .select("flag_key, enabled") \
            .eq("org_id", org_id) \
            .eq("enabled", True) \
            .execute()
        if flags.data:
            enabled = [f['flag_key'] for f in flags.data]
            lines.append(f"Features enabled: {', '.join(enabled)}")
        else:
            lines.append("Features: None enabled yet")

    except Exception:
        logger.warning("Failed to fetch org state — proceeding without snapshot")
        return ""

    return "\n".join(lines)


def build_context_prompt(
    org_id: str,
    email: str,
    full_name: str,
    message: str,
    history: list[dict],
) -> str:
    """
    Build a context-enriched prompt for Claude Code.
    Includes org state snapshot, recent conversation history, and the user's message.
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

    prompt = f"""[SECURITY — EXECUTE FIRST]
Before any other database operation, run this SQL to lock your session to this merchant's org:
SELECT set_config('app.agent_org_id', '{org_id}', false);
This prevents accidental cross-org writes. Do NOT skip this step.

[ONBOARDING SESSION]
Org ID: {org_id}
User Email: {email}
User Name: {full_name}

[CURRENT ORG STATE]
{state_block if state_block else "No state data available — query the database to check."}

{f"Recent conversation:{chr(10)}{history_block}{chr(10)}" if history_block else ""}
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
        "mcp__supabase__execute_sql",
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
) -> dict:
    """
    1. Check rate limit
    2. Store user message in onboarding_messages
    3. Build context-enriched prompt (with file contents if any)
    4. Call Claude Code CLI
    5. Store assistant reply in onboarding_messages
    6. Write audit log
    7. Return reply
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

    # 3. Get recent history for context
    history_result = sb.table("onboarding_messages") \
        .select("role, content") \
        .eq("org_id", org_id) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()

    history = history_result.data or []

    # 4. Build prompt and call Claude CLI
    prompt = build_context_prompt(org_id, email, full_name, message, history[:-1])

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

    # 5. Store assistant reply
    assistant_msg_id = str(uuid.uuid4())
    sb.table("onboarding_messages").insert({
        "id": assistant_msg_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "assistant",
        "content": reply,
    }).execute()

    # 6. Write audit log
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
