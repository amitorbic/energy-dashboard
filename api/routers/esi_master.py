from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_auth
from utils.database import get_db

router = APIRouter(prefix="/esi-master", tags=["esi-master"])

COLUMNS = [
    "esi_id", "address", "address_overflow", "city", "state", "zipcode",
    "county", "duns", "meter_read_cycle", "status", "premise_type",
    "power_region", "stationcode", "stationname", "metered",
    "open_service_orders", "polr_customer_class", "settlement_ams_indicator",
    "tdsp_ams_indicator", "switch_hold_indicator", "premise_subtype_code",
    "premise_subtype_desc", "source_file", "loaded_at",
]
SELECT_COLS = ", ".join(COLUMNS)


def _row_to_dict(row):
    d = dict(zip(COLUMNS, row))
    if d.get("loaded_at") is not None:
        d["loaded_at"] = str(d["loaded_at"])
    return d


@router.get("/search")
async def search_esi_master(
    zipcode: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    address: Optional[str] = Query(None, description="Optional partial address match"),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    """
    Search by zipcode + city (both required -- deliberate perf/business
    rule over a 13M+ row table), with an optional partial address filter.
    """
    if not zipcode or not city:
        raise HTTPException(
            status_code=400,
            detail="Both 'zipcode' and 'city' are required query parameters",
        )

    conditions = ["zipcode = :zipcode", "city = :city"]
    params: dict = {"zipcode": zipcode, "city": city, "limit": limit}
    if address:
        conditions.append("address LIKE :address")
        params["address"] = f"%{address.strip()}%"

    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT {SELECT_COLS} FROM esi_id_master WHERE {where} LIMIT :limit"),
        params,
    )
    rows = result.fetchall()
    return {"count": len(rows), "results": [_row_to_dict(r) for r in rows]}


@router.get("/{esi_id}")
async def get_esi_id(esi_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_auth)):
    """Direct primary-key lookup of a single ESI ID."""
    result = await db.execute(
        text(f"SELECT {SELECT_COLS} FROM esi_id_master WHERE esi_id = :esi_id"),
        {"esi_id": esi_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"ESI ID {esi_id} not found")
    return _row_to_dict(row)
