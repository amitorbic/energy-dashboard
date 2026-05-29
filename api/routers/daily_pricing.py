# routes/daily_pricing.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from fastapi.responses import StreamingResponse
from datetime import date

# Import your controller function
from controllers.pricing_engine import (
    calculate_matrix_for_start_date,
    generate_excel_matrix,
)

router = APIRouter(prefix="/pricing", tags=["Pricing"])  # This makes it /api/pricing


@router.get("/daily-matrix")
async def get_daily_matrix(
    start_month: str,
    terms: str,
    price_type: str = "commercial",
    db: AsyncSession = Depends(get_db),
):
    term_list = [int(t) for t in terms.split(",")]
    matrix = await calculate_matrix_for_start_date(
        start_month, term_list, db, price_type
    )
    return matrix


# 1. The decorator MUST be on its own line ABOVE the function
@router.get("/export-excel")
async def export_excel(
    start_date: str,
    terms: str,
    price_type: str,
    num_months: int = 6,
    db: AsyncSession = Depends(get_db),
):
    term_list = [int(t) for t in terms.split(",") if t.strip().isdigit()]

    # Generate the stream
    excel_stream = await generate_excel_matrix(
        start_date, term_list, num_months, price_type, db
    )

    filename = f"AmeriPower_Matrix_{date.today().isoformat()}.xlsx"

    # 2. The return statement must end cleanly
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def export_pricing_matrix(
    start_date: str, terms: str, num_months: int = 6, db: AsyncSession = Depends(get_db)
):
    # Convert comma-string terms to list of ints
    term_list = [int(t) for t in terms.split(",") if t.strip().isdigit()]

    excel_stream = await generate_excel_matrix(start_date, term_list, num_months, db)

    filename = f"AmeriPower_Matrix_{date.today().isoformat()}.xlsx"

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/profiles")
async def get_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            "SELECT profile_key, zone FROM ref_profile_mappings ORDER BY zone, profile_key"
        )
    )
    return [dict(row) for row in result.mappings()]
