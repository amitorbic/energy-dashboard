from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.test_data_generator import generate_edi_files, DEFAULT_CHARGE_CODES
from middleware.auth import require_admin
from utils.database import get_db

router = APIRouter(prefix="/admin/test-data", tags=["admin"])


async def _audit(db: AsyncSession, admin: dict, action: str) -> None:
    await db.execute(text(
        "INSERT INTO user_log (uid, user_name, broker_name, action, date, flag) "
        "VALUES (:uid, :uname, NULL, :action, :date, 'test_data_generator')"
    ), {
        "uid":    admin.get("user_id") or admin.get("sub") or 0,
        "uname":  admin.get("username") or admin.get("email") or "admin",
        "action": action,
        "date":   str(int(datetime.utcnow().timestamp())),
    })


class GenerateEdiRequest(BaseModel):
    esi_ids: list[str]
    file_types: list[str]  # any of "867", "810"
    service_start: date | None = None
    service_end: date | None = None
    charge_codes: list[str] | None = None


@router.get("/charge-codes")
async def list_charge_codes(admin: dict = Depends(require_admin)):
    """The verified default charge codes usable for 810 generation."""
    return {"default_charge_codes": DEFAULT_CHARGE_CODES}


@router.post("/generate-edi")
async def generate_edi(
    body: GenerateEdiRequest,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    esi_ids = [e.strip() for e in body.esi_ids if e.strip()]
    file_types = [t.strip() for t in body.file_types if t.strip() in ("867", "810")]

    service_end = body.service_end or date.today()
    service_start = body.service_start or (service_end - timedelta(days=30))

    result = await generate_edi_files(
        db=db,
        esi_ids=esi_ids,
        file_types=file_types,
        service_start=service_start,
        service_end=service_end,
        charge_codes=body.charge_codes,
    )

    await _audit(
        db, admin,
        f"generated {'/'.join(file_types)} test files for {len(result['matched_esi_ids'])} ESI(s), "
        f"{len(result['skipped'])} skipped",
    )
    await db.commit()

    return result
