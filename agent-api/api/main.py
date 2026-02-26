"""
Merchant Onboarding Agent API
FastAPI backend that bridges the frontend chat to Claude Code via AgentAPI.
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from api.auth import verify_supabase_jwt, UserContext
    from api.dispatch import dispatch_message, get_conversation_history, RateLimitExceeded
except ImportError:
    from auth import verify_supabase_jwt, UserContext
    from dispatch import dispatch_message, get_conversation_history, RateLimitExceeded

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("onboarding-agent")

ALLOWED_ORIGINS = [
    "https://app.thepeptideai.com",
    "http://localhost:5173",
    "http://localhost:8080",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Onboarding Agent API starting...")
    yield
    logger.info("Onboarding Agent API shutting down.")


app = FastAPI(
    title="Merchant Onboarding Agent",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class Attachment(BaseModel):
    url: str
    name: str
    type: str


class ChatRequest(BaseModel):
    message: str
    attachments: list[Attachment] | None = None


class ChatResponse(BaseModel):
    reply: str
    message_id: str | None = None


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "onboarding-agent"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, user: UserContext = Depends(verify_supabase_jwt)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        attachments = [a.model_dump() for a in req.attachments] if req.attachments else None
        result = await dispatch_message(
            user_id=user.user_id,
            org_id=user.org_id,
            email=user.email,
            full_name=user.full_name,
            message=req.message.strip(),
            attachments=attachments,
            access_token=user.access_token,
        )
        return ChatResponse(reply=result["reply"], message_id=result.get("message_id"))
    except RateLimitExceeded:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment and try again.")
    except Exception as e:
        logger.exception("Chat dispatch error")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
async def history(user: UserContext = Depends(verify_supabase_jwt)):
    """Return conversation history for the current user's org."""
    try:
        messages = await get_conversation_history(user.org_id, user.user_id)
        return {"messages": messages}
    except Exception as e:
        logger.exception("History fetch error")
        raise HTTPException(status_code=500, detail=str(e))
