from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_auth
from schemas.document_parser import SaveDocumentRequest
from utils.database import get_db
import controllers.document_parser as ctrl

router = APIRouter(prefix="/document-parser", tags=["Document Parser"])


# ── Templates (used by Next.js parse route for prompt augmentation) ───────────

@router.get("/templates")
async def get_templates(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    """Return all bill templates ordered by usage.
    The Next.js parse-document route calls this before AI extraction
    to inject known-provider context into the prompt."""
    return await ctrl.get_all_templates(db)


@router.get("/templates/{provider_name}")
async def get_template(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    t = await ctrl.get_template_by_provider(provider_name, db)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


# ── Save (called from frontend Confirm & Save button) ─────────────────────────

@router.post("/save")
async def save_document(
    payload: SaveDocumentRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Routes to save_bill or save_contract based on doc_type.
    For utility_bill: also upserts bill_templates and returns template_id.
    For contract: saves competitive intelligence to parsed_contracts.
    """
    if payload.doc_type == "utility_bill":
        return await ctrl.save_bill(payload, db)
    if payload.doc_type == "contract":
        return await ctrl.save_contract(payload, db)
    raise HTTPException(
        status_code=400, detail=f"Unknown doc_type: '{payload.doc_type}'"
    )


# ── Parsed bills ──────────────────────────────────────────────────────────────

@router.get("/bills")
async def list_bills(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.list_bills(limit, offset, db)


@router.get("/bills/{record_id}")
async def get_bill(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    row = await ctrl.get_bill(record_id, db)
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    return row


# ── Parsed contracts ──────────────────────────────────────────────────────────

@router.get("/contracts")
async def list_contracts(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.list_contracts(limit, offset, db)


@router.get("/contracts/{record_id}")
async def get_contract(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    row = await ctrl.get_contract(record_id, db)
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")
    return row
