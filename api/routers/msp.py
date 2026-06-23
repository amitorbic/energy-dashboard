from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from utils.database import get_db
from controllers.custom_pricing import calculate_custom_price
import json
from dateutil.relativedelta import relativedelta
from datetime import datetime, date
from controllers.email_pricing import build_email_html, send_email_async

router = APIRouter(prefix="/msp", tags=["multi-start-pricing"])


# ── Calculate ──────────────────────────────────────────────────────────────
class MspGroup(BaseModel):
    start_date: str
    esid: Optional[str] = None
    profiles: dict  # {profile_key: kwh}


class MspCalcRequest(BaseModel):
    groups: List[MspGroup]
    terms: List[int]  # e.g. [6, 12, 18, 24]


class MspSendRequest(BaseModel):
    sid: int


from dateutil.relativedelta import relativedelta
from datetime import datetime, date


class MspCalcRequest(BaseModel):
    groups: List[MspGroup]
    end_month: int  # 1-12, e.g. 4 for Apri


class MspSaveRequest(BaseModel):
    sid: Optional[int] = None
    customer_name: str
    broker_code: Optional[str] = None
    esids: Optional[str] = None
    groups: str  # JSON string
    terms: Optional[str] = None
    mills: Optional[str] = None
    broker_mill: Optional[str] = None
    comments: Optional[str] = None
    created_by: Optional[str] = None


@router.post("/calculate")
async def calculate_msp(payload: MspCalcRequest, db: AsyncSession = Depends(get_db)):
    if not payload.groups:
        raise HTTPException(400, "No groups provided")

    # ── Parse group start dates ───────────────────────────────────
    parsed_groups = []
    for g in payload.groups:
        try:
            sd = datetime.strptime(g.start_date, "%Y-%m-%d").date()
        except:
            raise HTTPException(400, f"Invalid start date: {g.start_date}")
        parsed_groups.append((sd, g))

    # ── Find latest start date ────────────────────────────────────
    latest_start = max(sd for sd, _ in parsed_groups)

    # ── Generate 3 end dates ──────────────────────────────────────
    # First end date = next occurrence of end_month AFTER latest_start
    m = payload.end_month
    year = latest_start.year
    if latest_start.month >= m:
        year += 1  # next year's April
    first_end = date(year, m, 1)

    end_dates = [
        first_end,
        first_end + relativedelta(years=1),
        first_end + relativedelta(years=2),
    ]

    # ── Calculate price per end date ──────────────────────────────
    end_date_results = []

    for end_date in end_dates:
        total_weighted_value = 0.0
        total_weighted_volume = 0.0
        group_details = []

        for sd, g in parsed_groups:
            if not g.profiles:
                continue

            sd_normalized = sd.replace(day=1)
            end_normalized = end_date.replace(day=1)
            # Term = months from start_date to end_date
            delta = relativedelta(end_normalized, sd_normalized)
            term_months = delta.years * 12 + delta.months + 1
            if term_months <= 0:
                continue  # start date is after end date — skip

            ann_volume = sum(g.profiles.values())
            period_volume = (term_months / 12) * ann_volume

            # Get matrix price for this term using profiles
            matrix = await calculate_custom_price(
                customer_id=0,
                start_date=sd.strftime("%Y-%m-%d"),
                terms=[term_months],
                profiles=g.profiles,
                db=db,
            )

            if isinstance(matrix, dict) and "error" in matrix:
                price = None
            else:
                price = matrix[0]["custom_price"] if matrix else None

            if price is not None:
                total_weighted_value += price * period_volume
                total_weighted_volume += period_volume

            group_details.append(
                {
                    "start_date": sd.strftime("%Y-%m-%d"),
                    "esid": g.esid,
                    "term_months": term_months,
                    "ann_volume": ann_volume,
                    "period_volume": round(period_volume, 2),
                    "price": round(price, 4) if price else None,
                }
            )

        final_price = (
            round(total_weighted_value / total_weighted_volume, 4)
            if total_weighted_volume > 0
            else None
        )

        end_date_results.append(
            {
                "end_date": end_date.strftime("%b'%y"),  # e.g. "Apr'27"
                "end_date_iso": end_date.strftime("%Y-%m-%d"),
                "final_price": final_price,
                "groups": group_details,
            }
        )

    # Total meters count
    total_meters = len([g for g in payload.groups if g.esid])
    total_ann_volume = sum(sum(g.profiles.values()) for _, g in parsed_groups)

    return {
        "customer_name": "",
        "total_meters": total_meters,
        "total_ann_volume": total_ann_volume,
        "end_dates": end_date_results,
    }


@router.post("/save")
async def save_msp(payload: MspSaveRequest, db: AsyncSession = Depends(get_db)):
    try:
        if payload.sid:
            await db.execute(
                text(
                    """
                UPDATE msp_log SET
                    customer_name    = :customer_name,
                    broker_code      = :broker_code,
                    esids            = :esids,
                    groups           = :groups,
                    terms            = :terms,
                    mills = :mills,
                    broker_mill      = :broker_mill,
                    comments         = :comments
                WHERE sid = :sid
            """
                ),
                payload.dict(),
            )
            await db.commit()
            return {"sid": payload.sid, "action": "updated"}
        else:
            result = await db.execute(
                text(
                    """
                INSERT INTO msp_log (
                    customer_name, broker_code, esids, groups,
                    terms, mills, broker_mill, comments, created_by
                ) VALUES (
                    :customer_name, :broker_code, :esids, :groups,
                    :terms, :mills, :broker_mill, :comments, :created_by
                )
            """
                ),
                payload.dict(),
            )
            await db.commit()
            return {"sid": result.lastrowid, "action": "inserted"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, str(e))


# ── List ───────────────────────────────────────────────────────────────────
@router.get("/list")
async def list_msp(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT sid, customer_name, broker_code, esids,
               terms, mills, broker_mill, comments,
               created_at, updated_at
        FROM msp_log ORDER BY updated_at DESC LIMIT 200
    """
        )
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/send-email")
async def send_msp_email(payload: MspSendRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM msp_log WHERE sid = :sid"), {"sid": payload.sid}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "MSP record not found")
    r = dict(row)

    broker = await db.execute(
        text("SELECT * FROM broker_new WHERE broker_code = :bc"),
        {"bc": r["broker_code"]},
    )
    broker = broker.mappings().first()
    if not broker or not broker.get("pricing_email"):
        raise HTTPException(400, "Broker email not found")

    # Recalculate
    try:
        groups_data = json.loads(r["groups"] or "[]")
    except:
        raise HTTPException(400, "Invalid groups data")

    try:
        end_month = int(r["terms"] or "5")
    except ValueError:
        end_month = 5  # default May if terms stored as comma-separated string
    groups = [MspGroup(**g) for g in groups_data]
    calc = await calculate_msp(MspCalcRequest(groups=groups, end_month=end_month), db)

    # Build HTML — end date columns
    end_date_headers = "".join(
        [
            f"<th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333;font-size:12px'>{ed['end_date']}</th>"
            for ed in calc["end_dates"]
        ]
    )
    price_cells = "".join(
        [
            f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:center;font-size:12px'>{ed['final_price'] if ed['final_price'] else 'N/A'}</td>"
            for ed in calc["end_dates"]
        ]
    )

    content_html = f"""
    <table style='border-collapse:collapse;width:100%;margin-bottom:20px;font-size:12px'>
        <thead>
            <tr>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Company Name</th>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Meters</th>
                {end_date_headers}
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style='padding:6px 10px;border:1px solid #ddd;font-weight:bold'>{r['customer_name']}</td>
                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{calc['total_meters']}</td>
                {price_cells}
            </tr>
        </tbody>
    </table>
    <p style='font-size:11px;color:#ff0000;font-weight:bold;text-align:right'>
        <u><em>NODAL AND RUC CHARGES INCLUDED</em></u>
    </p>
    """

    html = build_email_html(broker["company_name"], content_html)
    subject = f"Multiple Start Pricing - {r['customer_name']}"
    await send_email_async(broker["pricing_email"], subject, html)

    return {"sent": True, "to": broker["pricing_email"]}


# ── Get single ────────────────────────────────────────────────────────────
@router.get("/{sid}")
async def get_msp(sid: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM msp_log WHERE sid = :sid"), {"sid": sid}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Not found")
    return dict(row)


# ── Delete ────────────────────────────────────────────────────────────────
@router.delete("/{sid}")
async def delete_msp(sid: int, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM msp_log WHERE sid = :sid"), {"sid": sid})
    await db.commit()
    return {"deleted": sid}
