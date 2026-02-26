"""
Dispatch messages to Claude Code CLI directly via subprocess.
Enriches prompts with org context and stores conversation history.
"""
import os
import uuid
import logging
import asyncio

from supabase import create_client, Client

logger = logging.getLogger("onboarding-agent.dispatch")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CLAUDE_CMD = os.environ.get("CLAUDE_CMD", "claude")
CLAUDE_MD_PATH = os.environ.get("CLAUDE_MD_PATH", "/opt/peptide-agent/CLAUDE.md")

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


def build_context_prompt(
    org_id: str,
    email: str,
    full_name: str,
    message: str,
    history: list[dict],
) -> str:
    """
    Build a context-enriched prompt for Claude Code.
    Includes org context, recent conversation history, and the user's message.
    """
    history_block = ""
    if history:
        recent = history[-10:]
        lines = []
        for msg in recent:
            role_label = "Merchant" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role_label}: {msg['content']}")
        history_block = "\n".join(lines)

    prompt = f"""[ONBOARDING SESSION]
Org ID: {org_id}
User Email: {email}
User Name: {full_name}

{f"Recent conversation:{chr(10)}{history_block}{chr(10)}" if history_block else ""}
Merchant says: {message}"""

    return prompt


async def call_claude_cli(prompt: str) -> str:
    """
    Call Claude Code CLI directly via subprocess.
    Uses --print flag for non-interactive single-shot mode.
    Uses --system-prompt to inject the CLAUDE.md persona.
    """
    system_prompt = ""
    if os.path.exists(CLAUDE_MD_PATH):
        with open(CLAUDE_MD_PATH, "r") as f:
            system_prompt = f.read()

    cmd = [
        CLAUDE_CMD,
        "--print",           # non-interactive, outputs result to stdout
        "--output-format", "text",  # plain text output (no JSON wrapper)
    ]

    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await asyncio.wait_for(
        process.communicate(input=prompt.encode("utf-8")),
        timeout=120.0,
    )

    if process.returncode != 0:
        error_msg = stderr.decode("utf-8", errors="replace").strip()
        logger.error(f"Claude CLI exited with code {process.returncode}: {error_msg}")
        raise RuntimeError(f"Claude CLI failed: {error_msg}")

    return stdout.decode("utf-8", errors="replace").strip()


async def dispatch_message(
    user_id: str,
    org_id: str,
    email: str,
    full_name: str,
    message: str,
) -> dict:
    """
    1. Store user message in onboarding_messages
    2. Build context-enriched prompt
    3. Call Claude Code CLI
    4. Store assistant reply in onboarding_messages
    5. Return reply
    """
    sb = get_supabase()

    # 1. Store user message
    user_msg_id = str(uuid.uuid4())
    sb.table("onboarding_messages").insert({
        "id": user_msg_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "user",
        "content": message,
    }).execute()

    # 2. Get recent history for context
    history_result = sb.table("onboarding_messages") \
        .select("role, content") \
        .eq("org_id", org_id) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()

    history = history_result.data or []

    # 3. Build prompt and call Claude CLI
    prompt = build_context_prompt(org_id, email, full_name, message, history[:-1])

    try:
        reply = await call_claude_cli(prompt)
    except asyncio.TimeoutError:
        logger.error("Claude CLI timeout (120s)")
        reply = "I'm still thinking about that — it's taking longer than expected. Please try again in a moment."
    except Exception as e:
        logger.exception("Claude CLI dispatch failed")
        reply = "I encountered an error connecting to the AI backend. Please try again shortly."

    # 4. Store assistant reply
    assistant_msg_id = str(uuid.uuid4())
    sb.table("onboarding_messages").insert({
        "id": assistant_msg_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "assistant",
        "content": reply,
    }).execute()

    return {"reply": reply, "message_id": assistant_msg_id}


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
