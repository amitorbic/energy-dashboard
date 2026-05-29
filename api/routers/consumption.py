from fastapi import APIRouter, File, UploadFile, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.consumption import upload_consumption_data
from middleware.auth import require_auth

router = APIRouter(prefix="/pricing/consumption", tags=["Consumption"])


@router.post("/upload")
async def upload_consumption(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    return await upload_consumption_data(file, db)


# routes/consumption.py (or wherever your router is)


@router.get("/last-updated")
async def get_consumption_last_update(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text

    try:
        # We query the MAX upload_date from the table 'consumption'
        result = await db.execute(text("SELECT MAX(`upload_date`) FROM `consumption`"))
        latest = result.scalar()

        if latest:
            # Important: React needs a string, so we use .isoformat()
            return {
                "latest": (
                    latest.isoformat() if hasattr(latest, "isoformat") else str(latest)
                )
            }

        return {"latest": None}
    except Exception as e:
        print(f"SQL Error: {e}")
        return {"latest": None}


@router.get("/download-current")
async def download_current(db: AsyncSession = Depends(get_db)):
    from fastapi.responses import StreamingResponse
    import pandas as pd
    import io
    from sqlalchemy import select
    from models.consumption import Consumption

    result = await db.execute(select(Consumption))
    rows = result.scalars().all()

    df = pd.DataFrame(
        [
            {
                "market_date": r.market_date,
                "profile_name": r.profile_name,
                "value": r.value,
            }
            for r in rows
        ]
    )

    # Pivot back to wide format for download
    df_wide = df.pivot(index="market_date", columns="profile_name", values="value")
    df_wide.reset_index(inplace=True)

    buffer = io.BytesIO()
    df_wide.to_excel(buffer, index=False)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=consumption_current.xlsx"
        },
    )
