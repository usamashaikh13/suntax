"""
AI Tax Assistant & Submission Guide API router.

Provides:
- GET  /tax-returns/{id}/guide  -> Comprehensive AI-driven submission roadmap & readiness audit
- POST /tax-returns/{id}/chat   -> Interactive AI Copilot to guide and answer tax questions
- GET  /tax-returns/{id}/chat/history
- DELETE /tax-returns/{id}/chat/history
"""
from __future__ import annotations

import json
import logging
from typing import Any, List, Optional

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
from app.models.document import Document
from app.models.tax_calculation import TaxCalculation

logger = logging.getLogger(__name__)

router = APIRouter()

SYSTEM_PROMPT = """You are SunTax AI Copilot, an expert and reassuring Swiss tax advisor.
Your primary mission is to guide the user step-by-step through preparing, optimizing, and submitting their Swiss Income Tax Return (Steuererklärung / Déclaration d'impôt).

Your Key Responsibilities:
1. Guide the user through the 5 filing stages:
   - Step 1: Upload tax documents (Salary certificate / Lohnausweis, Bank statements, Pillar 3a certificate)
   - Step 2: Maximize deductions (Pillar 3a up to CHF 7,258 in 2025, professional expenses flat rate, commuting expenses, health insurance)
   - Step 3: Clarify tax details (marital status, church tax liability, children)
   - Step 4: Verify deterministic tax calculation (Federal, Cantonal, and Municipal taxes)
   - Step 5: Official submission to the cantonal/communal tax office (eCH-0196 XML export or signed summary printout)
2. Explain Swiss tax laws simply, accurately, and without jargon.
3. Help the user achieve a 100% readiness score and feel confident before submitting.

Safety & Accuracy Principles:
- You never invent rates or tax numbers — calculations are performed by SunTax's deterministic engine.
- Always provide clear, actionable next steps.
- Reply in clear English by default (or the language the user speaks to you in).
"""

CANTON_NAMES: dict[str, str] = {
    "ZH": "Zurich", "BE": "Bern", "LU": "Lucerne", "UR": "Uri", "SZ": "Schwyz",
    "OW": "Obwalden", "NW": "Nidwalden", "GL": "Glarus", "ZG": "Zug", "FR": "Fribourg",
    "SO": "Solothurn", "BS": "Basel-City", "BL": "Basel-Country", "SH": "Schaffhausen",
    "AR": "Appenzell Ausserrhoden", "AI": "Appenzell Innerrhoden", "SG": "St. Gallen",
    "GR": "Graubünden", "AG": "Aargau", "TG": "Thurgau", "TI": "Ticino", "VD": "Vaud",
    "VS": "Valais", "NE": "Neuchâtel", "GE": "Geneva", "JU": "Jura",
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChecklistItem(BaseModel):
    id: str
    title: str
    description: str
    status: str  # "completed" | "in_progress" | "pending" | "action_needed"
    category: str
    action_tab: str


class DeductionOpportunity(BaseModel):
    title: str
    max_amount_chf: Optional[float] = None
    estimated_saving_chf: Optional[float] = None
    description: str
    status: str  # "claimed" | "available" | "optimized"


class AiTaxGuideResponse(BaseModel):
    tax_return_id: str
    canton_code: str
    canton_name: str
    tax_year: int
    readiness_score: int  # 0 to 100
    current_phase: str  # "documents" | "deductions" | "questions" | "calculation" | "submission" | "completed"
    phase_title: str
    next_recommended_action: str
    next_tab: str
    ai_summary: str
    checklist: List[ChecklistItem]
    deduction_opportunities: List[DeductionOpportunity]
    official_submission_instructions: str
    is_ready_to_submit: bool


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    message: str
    response: str  # alias for frontend compatibility
    conversation_id: str
    suggestions: List[str] = []
    readiness_score: Optional[int] = None
    next_step: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


async def _get_tax_return_with_context(
    tax_return_id: str,
    db: AsyncSession,
    current_user: User,
) -> tuple[TaxReturn, TaxProfile | None, List[Document], TaxCalculation | None]:
    await set_rls_user_id(db, str(current_user.id))
    tr_res = await db.execute(
        select(TaxReturn).where(
            and_(
                TaxReturn.id == str(tax_return_id),
                TaxReturn.user_id == str(current_user.id),
            )
        )
    )
    tr = tr_res.scalar_one_or_none()
    if not tr:
        raise HTTPException(status_code=404, detail="Tax return not found")

    prof_res = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    )
    profile = prof_res.scalar_one_or_none()

    docs_res = await db.execute(
        select(Document).where(Document.tax_return_id == str(tr.id))
    )
    docs = list(docs_res.scalars().all())

    calc_res = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = calc_res.scalar_one_or_none()

    return tr, profile, docs, calc


def _build_submission_instructions(canton_code: str, municipality: str, tax_year: int) -> str:
    canton_name = CANTON_NAMES.get(canton_code, canton_code)
    return (
        f"Official Filing Guidelines for Canton {canton_name} ({municipality}), Tax Year {tax_year}:\n\n"
        f"1. Electronic eCH-0196 XML Submission: Download the eCH-0196 XML export file generated by SunTax. "
        f"This file complies with the official Swiss e-Government standard and can be uploaded directly into "
        f"the cantonal e-tax portal (e.g., eSteuern.ch / ZHservices for Zurich, TaxMe for Bern, eTax.zug for Zug).\n\n"
        f"2. Official PDF Print & Sign: If submitting via post or in person to the municipal tax office ({municipality}), "
        f"download the completed SunTax Summary Return PDF. Print, sign the signature section on the declaration sheet, "
        f"attach your original Lohnausweis and bank balance certificates, and mail it to your local tax administration.\n\n"
        f"3. Deadline: The standard filing deadline is March 31, {tax_year + 1}. If needed, you can request an extension "
        f"free of charge through your canton's online tax portal."
    )


def _generate_fallback_guidance(
    user_query: str,
    tr: TaxReturn,
    profile: Optional[TaxProfile],
    docs: List[Document],
    calc: Optional[TaxCalculation],
) -> tuple[str, List[str], str]:
    """Smart deterministic guidance when LLM is unavailable."""
    canton_name = CANTON_NAMES.get(tr.canton_code, tr.canton_code)
    has_docs = len(docs) > 0
    has_calc = calc is not None
    is_confirmed = tr.status == "confirmed"

    q_lower = user_query.lower()

    if "submit" in q_lower or "how to" in q_lower or "filing" in q_lower or "itr" in q_lower:
        reply = (
            f"Here is how to submit your {tr.tax_year} tax return for Canton {canton_name} ({tr.municipality_name}):\n\n"
            f"1. Review Your Deductions: Ensure Pillar 3a (up to CHF 7,258 in 2025), commuting costs, and health insurance are entered.\n"
            f"2. Run Tax Calculation: Go to the 'Calculation' tab to review your federal, cantonal, and municipal tax breakdown.\n"
            f"3. Confirm Your Return: Navigate to the 'Review & Submit' tab, confirm the legal declaration, and click 'Confirm & Submit'.\n"
            f"4. Official Export: Export your return as official eCH-0196 XML for your cantonal tax portal, or download the PDF for paper submission.\n\n"
            f"Would you like me to check if you have any missing deductions before submitting?"
        )
        suggestions = [
            "Check my missing deductions",
            "Is my calculation ready?",
            "How do I submit XML to the tax office?",
        ]
        next_step = "review"
    elif "deduction" in q_lower or "save" in q_lower or "pillar" in q_lower:
        reply = (
            f"Top Tax-Saving Deductions for Canton {canton_name} ({tr.tax_year}):\n\n"
            f"• Pillar 3a (Private Pension): Deduct up to CHF 7,258 (employed with pension fund) or up to 20% of net income (max CHF 36,288 for self-employed). This can save CHF 1,500 to 2,500 in taxes!\n"
            f"• Professional Expenses: A standard 3% lump-sum deduction (min CHF 2,000, max CHF 4,000) applies automatically, or actual receipts for training/equipment.\n"
            f"• Commuting Expenses: Deduct public transit or bike expenses (Canton {tr.canton_code} cap applied).\n"
            f"• Health Insurance: Flat deduction for mandatory insurance premiums.\n"
            f"• Charitable Donations: Deduct qualified donations over CHF 100 up to 20% of net income."
        )
        suggestions = [
            "How do I enter Pillar 3a?",
            "Run tax calculation now",
            "Show submission checklist",
        ]
        next_step = "profile"
    elif "ready" in q_lower or "status" in q_lower or "check" in q_lower:
        status_text = "Confirmed and Ready" if is_confirmed else ("Calculation complete" if has_calc else ("Documents uploaded" if has_docs else "Awaiting documents"))
        reply = (
            f"Current Filing Status for {tr.municipality_name} ({canton_name}):\n\n"
            f"• Status: {status_text}\n"
            f"• Documents: {len(docs)} document(s) uploaded\n"
            f"• Calculation: {'Calculated (CHF ' + f'{calc.total_tax_due:,.2f}' + ' due)' if has_calc else 'Pending calculation'}\n"
            f"• Submission Confirmation: {'Signed and Confirmed' if is_confirmed else 'Pending review & signature'}\n\n"
            f"Next recommended step: {'Go to Review & Submit' if has_calc else 'Run Calculation' if has_docs else 'Upload your Salary Statement (Lohnausweis)'}."
        )
        suggestions = [
            "Guide me to submit",
            "What deductions can I claim?",
            "Download tax return summary",
        ]
        next_step = "review" if has_calc else "calculation"
    else:
        reply = (
            f"I am your SunTax AI Copilot for Canton {canton_name} ({tr.tax_year}). "
            f"I can guide you step-by-step to optimize your deductions, verify calculations, and prepare your return for official submission to the tax authority. "
            f"What would you like assistance with?"
        )
        suggestions = [
            "Guide me through submitting my tax return",
            "Check my missing deductions",
            "How to submit in Canton " + canton_name,
        ]
        next_step = "documents" if not has_docs else "calculation"

    return reply, suggestions, next_step


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tax-returns/{tax_return_id}/guide")
async def get_tax_submission_guide(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiTaxGuideResponse:
    """
    Evaluates the user's tax return against Swiss filing criteria
    and returns a structured readiness roadmap with actionable steps.
    """
    tr, profile, docs, calc = await _get_tax_return_with_context(tax_return_id, db, current_user)
    canton_name = CANTON_NAMES.get(tr.canton_code, tr.canton_code)

    checklist: List[ChecklistItem] = []
    score = 0

    # 1. Base Setup
    checklist.append(
        ChecklistItem(
            id="base_info",
            title=f"Tax Jurisdiction: Canton {canton_name}, {tr.municipality_name}",
            description=f"Tax return initiated for tax year {tr.tax_year}.",
            status="completed",
            category="setup",
            action_tab="documents",
        )
    )
    score += 15

    # 2. Documents
    has_salary = any(
        (d.document_type == "salary_certificate" or "salary" in d.original_filename.lower() or "lohn" in d.original_filename.lower())
        for d in docs
    )
    has_bank = any("bank" in (d.document_type or "").lower() or "konto" in d.original_filename.lower() for d in docs)
    has_pillar3 = any("pillar" in (d.document_type or "").lower() or "säule" in d.original_filename.lower() for d in docs)

    if docs:
        score += 20
        checklist.append(
            ChecklistItem(
                id="doc_upload",
                title=f"Documents Uploaded ({len(docs)} total)",
                description="Tax documents uploaded and processed with OCR.",
                status="completed",
                category="documents",
                action_tab="documents",
            )
        )
    else:
        checklist.append(
            ChecklistItem(
                id="doc_upload",
                title="Upload Essential Tax Documents",
                description="Upload your Salary Certificate (Lohnausweis) and bank statements.",
                status="action_needed",
                category="documents",
                action_tab="documents",
            )
        )

    # 3. Income & Profile
    inc = profile.income_data if profile else {}
    employment_inc = float(inc.get("employment_income", 0) or 0) if inc else 0
    if employment_inc > 0 or has_salary:
        score += 20
        checklist.append(
            ChecklistItem(
                id="income_verified",
                title="Employment Income Verified",
                description=f"Gross income recorded: CHF {employment_inc:,.2f}.",
                status="completed",
                category="profile",
                action_tab="profile",
            )
        )
    else:
        checklist.append(
            ChecklistItem(
                id="income_verified",
                title="Verify Employment Income",
                description="Confirm gross employment income from your Lohnausweis.",
                status="pending",
                category="profile",
                action_tab="profile",
            )
        )

    # 4. Deductions
    ded = profile.deductions_data if profile else {}
    pillar3_val = float(ded.get("pillar3a_contributions", 0) or 0) if ded else 0
    deduction_opportunities: List[DeductionOpportunity] = [
        DeductionOpportunity(
            title="Pillar 3a (Private Pension)",
            max_amount_chf=7258.0,
            estimated_saving_chf=float(pillar3_val * 0.25) if pillar3_val else 1800.0,
            description=f"Deduct up to CHF 7,258 in 2025. You declared CHF {pillar3_val:,.2f}.",
            status="claimed" if pillar3_val > 0 else "available",
        ),
        DeductionOpportunity(
            title="Professional Expenses (Lump Sum)",
            max_amount_chf=4000.0,
            estimated_saving_chf=600.0,
            description="Standard 3% lump sum for work equipment and professional literature (min CHF 2,000, max CHF 4,000).",
            status="claimed",
        ),
        DeductionOpportunity(
            title="Public Transit & Commuting Expenses",
            max_amount_chf=5000.0,
            estimated_saving_chf=450.0,
            description=f"Deduct travel costs to your workplace up to the Canton {tr.canton_code} cap.",
            status="available",
        ),
        DeductionOpportunity(
            title="Compulsory Health Insurance Premiums",
            max_amount_chf=2600.0,
            estimated_saving_chf=500.0,
            description="Flat-rate standard deduction for basic health insurance premiums.",
            status="claimed",
        ),
    ]

    score += 15
    checklist.append(
        ChecklistItem(
            id="deductions_check",
            title="Tax Deductions Optimized",
            description=f"Pillar 3a: CHF {pillar3_val:,.2f}. Standard professional expenses applied.",
            status="completed" if pillar3_val > 0 else "in_progress",
            category="deductions",
            action_tab="profile",
        )
    )

    # 5. Calculation
    if calc:
        score += 20
        checklist.append(
            ChecklistItem(
                id="calculation_check",
                title=f"Tax Calculation Finalized: CHF {calc.total_tax_due:,.2f}",
                description=f"Federal: CHF {calc.federal_income_tax:,.2f}, Canton: CHF {calc.cantonal_income_tax:,.2f}, Municipality: CHF {calc.municipal_income_tax:,.2f}.",
                status="completed",
                category="calculation",
                action_tab="calculation",
            )
        )
    else:
        checklist.append(
            ChecklistItem(
                id="calculation_check",
                title="Run Deterministic Tax Calculation",
                description="Compute your official federal, cantonal, and municipal tax breakdown.",
                status="action_needed",
                category="calculation",
                action_tab="calculation",
            )
        )

    # 6. Submission confirmation
    if tr.status == "confirmed":
        score = 100
        checklist.append(
            ChecklistItem(
                id="submission_check",
                title="Legal Confirmation Completed",
                description=f"Confirmed and ready for export on {tr.confirmed_at.strftime('%Y-%m-%d') if tr.confirmed_at else 'recently'}.",
                status="completed",
                category="submission",
                action_tab="review",
            )
        )
    else:
        checklist.append(
            ChecklistItem(
                id="submission_check",
                title="Review Legal Declaration & Submit",
                description="Sign the electronic declaration to finalize your return and unlock eCH-0196 XML and PDF exports.",
                status="pending" if calc else "action_needed",
                category="submission",
                action_tab="review",
            )
        )

    # Determine phase
    score = min(max(score, 15), 100)
    if tr.status == "confirmed":
        current_phase = "completed"
        phase_title = "Ready for Official Submission"
        next_action = "Download your official eCH-0196 XML and Summary PDF to submit to the tax office."
        next_tab = "review"
    elif calc:
        current_phase = "submission"
        phase_title = "Step 5: Review & Official Confirmation"
        next_action = "Review your finalized calculation, accept the declaration, and confirm your tax return."
        next_tab = "review"
    elif docs:
        current_phase = "calculation"
        phase_title = "Step 4: Compute Taxes"
        next_action = "Calculate your taxes to see your exact federal, cantonal, and communal tax bill."
        next_tab = "calculation"
    else:
        current_phase = "documents"
        phase_title = "Step 1: Upload Documents"
        next_action = "Upload your Salary Statement (Lohnausweis) and bank statements to extract your figures."
        next_tab = "documents"

    ai_summary = (
        f"Your tax return for Canton {canton_name} ({tr.municipality_name}) is currently at {score}% completion. "
        f"{next_action}"
    )

    instructions = _build_submission_instructions(tr.canton_code, tr.municipality_name or "local municipality", tr.tax_year)

    return AiTaxGuideResponse(
        tax_return_id=str(tr.id),
        canton_code=tr.canton_code,
        canton_name=canton_name,
        tax_year=tr.tax_year,
        readiness_score=score,
        current_phase=current_phase,
        phase_title=phase_title,
        next_recommended_action=next_action,
        next_tab=next_tab,
        ai_summary=ai_summary,
        checklist=checklist,
        deduction_opportunities=deduction_opportunities,
        official_submission_instructions=instructions,
        is_ready_to_submit=(score >= 70 and calc is not None),
    )


@router.post("/tax-returns/{tax_return_id}/chat")
async def chat(
    tax_return_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """
    Send a message to the SunTax AI Assistant.
    Provides proactive guidance to complete and submit the Swiss tax return.
    """
    tr, profile, docs, calc = await _get_tax_return_with_context(tax_return_id, db, current_user)
    canton_name = CANTON_NAMES.get(tr.canton_code, tr.canton_code)

    # Build context about user's current filing state
    pd = profile.personal_data or {} if profile else {}
    inc = profile.income_data or {} if profile else {}
    ded = profile.deductions_data or {} if profile else {}

    profile_context = (
        f"\n\nCurrent Taxpayer Situation:\n"
        f"Canton: {tr.canton_code} ({canton_name}), Municipality: {tr.municipality_name}, Tax Year: {tr.tax_year}\n"
        f"Status: {tr.status}\n"
        f"Documents Uploaded: {len(docs)} files\n"
        f"Gross Employment Income: CHF {inc.get('employment_income', 'Not yet provided')}\n"
        f"Pillar 3a Contributions: CHF {ded.get('pillar3a_contributions', '0.00')}\n"
        f"Calculation: {'Calculated (Total CHF ' + str(calc.total_tax_due) + ')' if calc else 'Not yet calculated'}\n"
    )

    r = await _get_redis()
    history_key = _history_key(str(current_user.id), tax_return_id)
    raw_history = await r.get(history_key)
    history: list[dict] = json.loads(raw_history) if raw_history else []

    assistant_reply = ""
    suggestions: List[str] = [
        "How do I submit to the tax office?",
        "What deductions am I missing?",
        "Check my tax calculation",
    ]
    next_step = "review" if calc else ("calculation" if docs else "documents")

    # Attempt Gemini API if key is available and not placeholder
    gemini_key = settings.GEMINI_API_KEY
    is_valid_key = bool(gemini_key and not gemini_key.startswith("your_") and len(gemini_key) > 15)

    if is_valid_key:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=gemini_key)
            contents = []
            for msg in history[-14:]:
                contents.append(
                    types.Content(role=msg["role"], parts=[types.Part.from_text(text=msg["content"])])
                )
            contents.append(
                types.Content(role="user", parts=[types.Part.from_text(text=body.message)])
            )

            prompt = SYSTEM_PROMPT + profile_context
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=prompt,
                    temperature=0.3,
                    max_output_tokens=1024,
                ),
            )
            if response and response.text:
                assistant_reply = response.text
        except Exception as exc:
            logger.warning("Gemini chat API call failed, using intelligent Swiss tax fallback: %s", exc)

    # Fallback to deterministic expert Swiss tax guide if Gemini is inactive or failed
    if not assistant_reply:
        assistant_reply, suggestions, next_step = _generate_fallback_guidance(
            body.message, tr, profile, docs, calc
        )

    # Save conversation
    history.append({"role": "user", "content": body.message})
    history.append({"role": "model", "content": assistant_reply})
    history = history[-40:]
    await r.setex(history_key, 86400 * 7, json.dumps(history))

    return ChatResponse(
        message=assistant_reply,
        response=assistant_reply,
        conversation_id=f"{current_user.id}:{tax_return_id}",
        suggestions=suggestions,
        next_step=next_step,
    )


@router.get("/tax-returns/{tax_return_id}/chat/history")
async def get_chat_history(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve conversation history."""
    await _get_tax_return_with_context(tax_return_id, db, current_user)
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
    await _get_tax_return_with_context(tax_return_id, db, current_user)
    r = await _get_redis()
    await r.delete(_history_key(str(current_user.id), tax_return_id))
    return {"message": "History cleared"}
