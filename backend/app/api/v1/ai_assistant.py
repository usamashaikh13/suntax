"""
AI Tax Assistant API router.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """Du bist SunTax, ein freundlicher und kompetenter Schweizer Steuerassistent.

Deine Aufgaben:
- Du hilfst Benutzern, ihre Schweizer Steuererklärung zu verstehen
- Du erklärst, welche Informationen aus Dokumenten extrahiert wurden
- Du identifizierst anwendbare Abzüge basierend auf dem Steuerprofil des Benutzers
- Du stellst gezielte Fragen zu fehlenden Informationen
- Du erklärst Steuerregeln verständlich

Wichtige Einschränkungen:
- Du ERFINDEST NIEMALS Steuersätze, Abzugslimiten oder Berechnungswerte
- Wenn du dir bei einem Wert nicht sicher bist, sagst du das klar
- Alle konkreten Berechnungen werden vom deterministischen SunTax-Steuermodul durchgeführt, nicht von dir
- Komplexe grenzüberschreitende Situationen (Ausland, Quellensteuer, etc.) verweist du an einen Steuerberater
- Du gibst keine Rechtsberatung

Sprache: Antworte auf Deutsch, es sei denn, der Benutzer schreibt auf Englisch oder Französisch.
"""


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    message: str
    conversation_id: str


async def _get_redis():
    """Return an async Redis client (fakeredis in dev, real Redis in prod)."""
    try:
        import fakeredis.aioredis as fakeredis_aio
        if settings.ENVIRONMENT in ("development", "test"):
            return fakeredis_aio.FakeRedis(decode_responses=True)
    except ImportError:
        pass
    import redis.asyncio as aioredis
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def _history_key(user_id: str, tax_return_id: str) -> str:
    return f"chat:{user_id}:{tax_return_id}"


async def _get_tax_return_with_profile(
    tax_return_id: str,
    db: AsyncSession,
    current_user: User,
) -> tuple[TaxReturn, TaxProfile | None]:
    await set_rls_user_id(db, str(current_user.id))
    tr_result = await db.execute(
        select(TaxReturn).where(
            and_(
                TaxReturn.id == str(tax_return_id),
                TaxReturn.user_id == str(current_user.id),
            )
        )
    )
    tr = tr_result.scalar_one_or_none()
    if not tr:
        raise HTTPException(status_code=404, detail="Tax return not found")

    profile_result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    )
    profile = profile_result.scalar_one_or_none()
    return tr, profile


@router.post("/tax-returns/{tax_return_id}/chat")
async def chat(
    tax_return_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """Send a message to the SunTax AI assistant."""
    from google import genai
    from google.genai import types

    tr, profile = await _get_tax_return_with_profile(tax_return_id, db, current_user)

    # Build context about the user's tax situation
    profile_context = ""
    if profile:
        pd = profile.personal_data or {}
        inc = profile.income_data or {}
        ded = profile.deductions_data or {}
        profile_context = (
            f"\n\nAktuelles Steuerprofil des Benutzers:\n"
            f"Kanton: {tr.canton_code}, Gemeinde: {tr.municipality_name}, Steuerjahr: {tr.tax_year}\n"
            f"Name: {pd.get('name', 'nicht erfasst')}\n"
            f"Zivilstand: {pd.get('civil_status', 'nicht erfasst')}\n"
            f"Erwerbseinkommen: CHF {inc.get('employment_income', 'nicht erfasst')}\n"
            f"Pillar 3a: CHF {ded.get('pillar3a_contributions', 'not recorded')}\n"
        )

    # Load conversation history from Redis (async)
    r = await _get_redis()
    history_key = _history_key(str(current_user.id), tax_return_id)
    raw_history = await r.get(history_key)
    history: list[dict] = json.loads(raw_history) if raw_history else []

    # Build Gemini conversation
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    contents = []
    for msg in history[-20:]:  # Last 20 messages for context
        contents.append(
            types.Content(role=msg["role"], parts=[types.Part.from_text(text=msg["content"])])
        )
    contents.append(
        types.Content(role="user", parts=[types.Part.from_text(text=body.message)])
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT + profile_context,
            temperature=0.3,
            max_output_tokens=1024,
        ),
    )

    assistant_reply = response.text

    # Save history (last 40 messages max)
    history.append({"role": "user", "content": body.message})
    history.append({"role": "model", "content": assistant_reply})
    history = history[-40:]
    await r.setex(history_key, 86400 * 7, json.dumps(history))  # 7 days TTL

    return ChatResponse(
        message=assistant_reply,
        conversation_id=f"{current_user.id}:{tax_return_id}",
    )


@router.get("/tax-returns/{tax_return_id}/chat/history")
async def get_chat_history(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve conversation history."""
    await _get_tax_return_with_profile(tax_return_id, db, current_user)
    r = await _get_redis()
    history_key = _history_key(str(current_user.id), tax_return_id)
    raw = await r.get(history_key)
    return {"history": json.loads(raw) if raw else []}


@router.delete("/tax-returns/{tax_return_id}/chat/history")
async def clear_chat_history(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear conversation history."""
    await _get_tax_return_with_profile(tax_return_id, db, current_user)
    r = await _get_redis()
    await r.delete(_history_key(str(current_user.id), tax_return_id))
    return {"message": "History cleared"}
