"""
Supabase auth verification for the onboarding agent API.
Uses Supabase's auth.get_user() to verify tokens (supports ES256 + HS256).
Extracts user_id, org_id, email from the verified user + profile lookup.
"""
import os
import logging
from dataclasses import dataclass

from fastapi import Request, HTTPException
from supabase import create_client, Client

logger = logging.getLogger("onboarding-agent.auth")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


@dataclass
class UserContext:
    user_id: str
    org_id: str
    email: str
    full_name: str


async def verify_supabase_jwt(request: Request) -> UserContext:
    """
    Dependency that verifies the Supabase access token via auth.get_user(),
    then looks up the user's profile to get org_id and full_name.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header[7:]

    # Verify token via Supabase Auth API (works with both HS256 and ES256)
    sb = get_supabase()
    try:
        user_response = sb.auth.get_user(token)
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = user_response.user
    user_id = user.id
    email = user.email or ""

    # Look up profile for org_id and full_name
    result = sb.table("profiles").select("org_id, full_name").eq("user_id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=403, detail="Profile not found")

    org_id = result.data.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="User has no organization")

    return UserContext(
        user_id=user_id,
        org_id=org_id,
        email=email,
        full_name=result.data.get("full_name", ""),
    )
