from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from utils.database import get_db
from controllers.custom_pricing import calculate_custom_price
from datetime import date
from datetime import datetime, timedelta
import calendar
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io

import json

from controllers.email_pricing import build_email_html, send_email_async

router = APIRouter(prefix="/bne", tags=["blend-extend"])


class BneSendRequest(BaseModel):
    sid: int
    start_date: Optional[str] = None
    broker_code: Optional[str] = None


def _remaining_months(end_date_str: str, today: date) -> int:
    if not end_date_str:
        return 0
    try:
        from datetime import datetime

        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
            try:
                end = datetime.strptime(end_date_str.strip(), fmt).date()
                return max(0, round((end - today).days / 30.44))
            except ValueError:
                continue
        return 0
    except Exception:
        return 0


@router.get("/search")
async def search_customers(q: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT cust_id, company_name, premise_id,
               contract_end_date, contract_renewal_usage,
               contract_rate, broker_code, broker_name, load_profile
        FROM contract_renewal
        WHERE (company_name LIKE :q OR premise_id LIKE :q)
        AND contract_rate IS NOT NULL
        AND CAST(contract_rate AS DECIMAL(10,6)) > 0
        ORDER BY company_name
        LIMIT 20
    """
        ),
        {"q": f"%{q}%"},
    )
    rows = result.mappings().all()
    today = date.today()
    out = []
    for r in rows:
        rem = _remaining_months(r["contract_end_date"], today)
        # Convert rate $/kWh → ¢/kWh for display
        rate_cents = (
            round(float(r["contract_rate"]) * 100, 4) if r["contract_rate"] else None
        )
        out.append(
            {
                **dict(r),
                "remaining_months": rem,
                "contract_rate_cents": rate_cents,
            }
        )
    return out


class BneCalcRequest(BaseModel):
    cust_ids: List[str]
    extension_terms: List[int]  # e.g. [6, 12, 18, 24]
    start_date: str
    # Optional overrides — if user edits these on the form
    profiles: Optional[dict] = None  # {profile_key: kwh}
    current_rate: Optional[float] = None  # ¢/kWh override


@router.post("/calculate")
async def calculate_bne(payload: BneCalcRequest, db: AsyncSession = Depends(get_db)):
    if not payload.cust_ids:
        raise HTTPException(400, "No customers selected")
    if not payload.extension_terms:
        raise HTTPException(400, "No extension terms provided")

    # ── Fetch customer data ───────────────────────────────────────
    placeholders = ",".join([f":id{i}" for i in range(len(payload.cust_ids))])
    params = {f"id{i}": v for i, v in enumerate(payload.cust_ids)}
    result = await db.execute(
        text(
            f"""
        SELECT cust_id, company_name, premise_id,
               contract_end_date, contract_renewal_usage,
               contract_rate, load_profile
        FROM contract_renewal WHERE cust_id IN ({placeholders})
    """
        ),
        params,
    )
    rows = result.mappings().all()
    ref_date = (
        datetime.strptime(payload.start_date.strip(), "%Y-%m-%d").date()
        if payload.start_date
        else date.today()
    )

    today = date.today()

    # ── Aggregate volumes across all selected customers ───────────
    # Use passed profiles if user edited them, else build from contract_renewal
    if payload.profiles:
        profiles = {k: float(v) for k, v in payload.profiles.items() if float(v) > 0}
    else:
        # Build profile → total_kwh from contract_renewal_usage
        # contract_renewal has one load_profile per row
        profiles = {}
        for r in rows:
            raw_profile = r["load_profile"]
            usage = float(r["contract_renewal_usage"] or 0)
            if not raw_profile or usage <= 0:
                continue
            # Map load_profile → short_name → profile_key
            mapping_res = await db.execute(
                text(
                    """
              SELECT lpm.short_name
              FROM load_profiles_master lpm
              WHERE lpm.full_load_profile = :raw_profile
              OR lpm.short_name = :raw_profile
              LIMIT 1
              """
                ),
                {"raw_profile": raw_profile},
            )
            print(f"BNE profile lookup: raw='{raw_profile}'")
            mapping_row = mapping_res.mappings().first()
            print(f"BNE profile result: {dict(mapping_row) if mapping_row else None}")
            profile_key = mapping_row["short_name"] if mapping_row else raw_profile
            profiles[profile_key] = profiles.get(profile_key, 0) + usage

    if not profiles:
        raise HTTPException(400, "No profile/volume data found for selected customers")

    total_ann_usage = sum(profiles.values())

    # ── Get current rate (weighted avg if multiple customers) ─────
    if payload.current_rate is not None:
        current_rate = payload.current_rate  # ¢/kWh user override
    else:
        # Weighted avg of current rates across customers
        weighted_rate = 0.0
        total_usage = 0.0
        for r in rows:
            usage = float(r["contract_renewal_usage"] or 0)
            rate = float(r["contract_rate"] or 0) * 100  # $/kWh → ¢/kWh
            weighted_rate += rate * usage
            total_usage += usage
        current_rate = round(weighted_rate / total_usage, 6) if total_usage else 0

    # ── Remaining months (avg across customers) ───────────────────
    rem_months_list = [
        _remaining_months(r["contract_end_date"], ref_date) for r in rows
    ]
    avg_rem_months = (
        round(sum(rem_months_list) / len(rem_months_list)) if rem_months_list else 0
    )

    # ── Get matrix prices for all extension terms at once ─────────
    # Scale profiles to extension term volume
    # calculate_custom_price uses annual profiles, so pass as-is
    end_dates = []
    for r in rows:
        end_str = r["contract_end_date"]
        if not end_str:
            continue
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
            try:
                end_dates.append(datetime.strptime(end_str.strip(), fmt).date())
                break
            except ValueError:
                continue

    if not end_dates:
        raise HTTPException(400, "No valid contract end dates found")

    avg_end = min(end_dates)  # earliest end date

    # Apply 16th rule
    if avg_end.day > 16:
        if avg_end.month == 12:
            matrix_start = avg_end.replace(year=avg_end.year + 1, month=1, day=1)
        else:
            matrix_start = avg_end.replace(month=avg_end.month + 1, day=1)
    else:
        matrix_start = avg_end.replace(day=1)

    matrix_start_str = matrix_start.strftime("%Y-%m-%d")
    print(
        f"BNE matrix start: end_date={avg_end} day={avg_end.day} → matrix_start={matrix_start_str}"
    )

    matrix_results = await calculate_custom_price(
        customer_id=0,
        start_date=matrix_start_str,
        terms=payload.extension_terms,
        profiles=profiles,
        db=db,
    )

    if isinstance(matrix_results, dict) and "error" in matrix_results:
        raise HTTPException(400, matrix_results["error"])

    # ── Apply B&E formula per term ────────────────────────────────
    quotes = []
    for mr in matrix_results:
        ext_term = mr["term"]
        new_rate = mr["custom_price"]  # ¢/kWh from matrix

        if new_rate is None:
            quotes.append(
                {
                    "ext_term": ext_term,
                    "total_term": avg_rem_months + ext_term,
                    "new_rate": None,
                    "blended_rate": None,
                }
            )
            continue

        # Volume for remaining period and extension period (monthly basis)
        rem_vol = (avg_rem_months / 12) * total_ann_usage
        ext_vol = (ext_term / 12) * total_ann_usage
        total_vol = rem_vol + ext_vol

        blended = (
            (current_rate * rem_vol + new_rate * ext_vol) / total_vol
            if total_vol
            else None
        )

        quotes.append(
            {
                "ext_term": ext_term,
                "total_term": avg_rem_months + ext_term,
                "new_rate": round(new_rate, 4),
                "blended_rate": round(blended, 4) if blended else None,
            }
        )

    return {
        "current_rate": round(current_rate, 4),
        "remaining_months": avg_rem_months,
        "total_ann_usage": total_ann_usage,
        "profiles": profiles,
        "quotes": quotes,
        "customers": [
            {
                "cust_id": r["cust_id"],
                "company_name": r["company_name"],
                "premise_id": r["premise_id"],
                "contract_rate_cents": round(float(r["contract_rate"] or 0) * 100, 4),
                "remaining_months": _remaining_months(r["contract_end_date"], ref_date),
                "annual_usage": float(r["contract_renewal_usage"] or 0),
            }
            for r in rows
        ],
    }


@router.get("/list")
async def list_bne(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT sid, customer_name, broker_code, esid,
               current_rate, terms_left, extension_terms,
               mills, broker_mill, comments,
               start_date, created_at, updated_at
        FROM bne_log
        ORDER BY updated_at DESC
        LIMIT 200
    """
        )
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/send-email")
async def send_bne_email(payload: BneSendRequest, db: AsyncSession = Depends(get_db)):
    # Load record
    result = await db.execute(
        text("SELECT * FROM bne_log WHERE sid = :sid"), {"sid": payload.sid}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "BNE record not found")
    r = dict(row)

    # Get broker email
    broker_code = payload.broker_code or r.get("broker_code")
    broker = await db.execute(
        text("SELECT * FROM broker_new WHERE broker_code = :bc"), {"bc": broker_code}
    )
    broker = broker.mappings().first()
    if not broker or not broker.get("pricing_email"):
        raise HTTPException(400, "Broker email not found")

    # Recalculate blended rates
    try:
        cust_ids = json.loads(r["cust_ids"] or "[]")
        profiles = json.loads(r["profiles"] or "{}")
        ext_terms = [
            int(t.strip()) for t in (r["extension_terms"] or "6,12,18,24").split(",")
        ]
    except:
        raise HTTPException(400, "Invalid record data")
    print(
        f"BNE send debug: sid={payload.sid} profiles='{r['profiles']}' start='{r.get('start_date')}' cust_ids='{r['cust_ids']}'"
    )

    calc = await calculate_bne(
        BneCalcRequest(
            cust_ids=cust_ids,
            extension_terms=ext_terms,
            start_date=str(payload.start_date or r.get("start_date") or ""),
            profiles=profiles,
        ),
        db,
    )

    # Build HTML table
    term_headers = "".join(
        [
            f"<th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333;font-size:12px'>{q['ext_term']}/{q['total_term']}</th>"
            for q in calc["quotes"]
        ]
    )
    price_cells = "".join(
        [
            f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:center;font-size:12px'>{q['blended_rate'] if q['blended_rate'] else 'N/A'}</td>"
            for q in calc["quotes"]
        ]
    )

    content_html = f"""
    <p style='font-size:12px;font-weight:bold;color:#333;margin-bottom:8px'>B&amp;E Term / Total Contracted Months</p>
    <table style='border-collapse:collapse;width:100%;margin-bottom:20px;font-size:12px'>
        <thead>
            <tr>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Company Name</th>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Term Left</th>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>B&amp;E Start Date</th>
                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Broker Mills</th>
                {term_headers}
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style='padding:6px 10px;border:1px solid #ddd;font-weight:bold'>{r['customer_name']}</td>
                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{calc['remaining_months']}</td>
                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{r.get('start_date') or ''}</td>
                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{r.get('broker_mill') or ''}</td>
                {price_cells}
            </tr>
        </tbody>
    </table>
    <p style='font-size:11px;color:#ff0000;font-weight:bold;text-align:right'>
        <u><em>NODAL AND RUC CHARGES INCLUDED</em></u>
    </p>
    """

    html = build_email_html(broker["company_name"], content_html)
    subject = f"Blend & Extend Pricing - {r['customer_name']}"
    await send_email_async(broker["pricing_email"], subject, html)

    return {"sent": True, "to": broker["pricing_email"]}


class BneOfferRequest(BaseModel):
    customer_name: str
    broker_name: Optional[str] = ""
    current_rate: float  # ¢/kWh
    terms_left: int  # remaining months
    total_volume: float  # annual kWh
    contract_end_date: str
    mills: Optional[float] = 0
    broker_mills: Optional[float] = 0
    message: Optional[str] = ""
    quotes: List[dict]  # [{ext_term, total_term, new_rate, blended_rate}]


@router.post("/offer-pdf")
async def generate_offer_pdf(payload: BneOfferRequest):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )

    styles = getSampleStyleSheet()
    gray = colors.HexColor("#999999")
    light_green = colors.HexColor("#c4deb4")
    red = colors.HexColor("#ff0000")

    header_style = ParagraphStyle(
        "header",
        fontSize=20,
        textColor=gray,
        alignment=2,
        fontName="Helvetica-BoldOblique",
    )
    title_style = ParagraphStyle("title", fontSize=11, fontName="Helvetica-Bold")
    small_style = ParagraphStyle("small", fontSize=9, fontName="Helvetica")
    conf_style = ParagraphStyle(
        "conf",
        fontSize=8,
        textColor=colors.HexColor("#548DD4"),
        fontName="Helvetica-Oblique",
    )

    today = datetime.today().strftime("%m/%d/%Y")

    def build_page(for_broker: bool):
        story = []

        # Header
        story.append(Paragraph("<em>Energy Rate Quote</em>", header_style))
        story.append(Spacer(1, 6))

        if payload.message:
            story.append(Paragraph(payload.message, small_style))
            story.append(Spacer(1, 6))

        # Quote for + date
        meta = [
            ["Quote For:", payload.customer_name, "", f"Date:  {today}"],
        ]
        meta_table = Table(
            meta, colWidths=[1.2 * inch, 2.5 * inch, 1 * inch, 2.3 * inch]
        )
        meta_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("ALIGN", (3, 0), (3, 0), "RIGHT"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                ]
            )
        )
        story.append(meta_table)

        # Apply mills to blended rates
        adj_quotes = []
        for q in payload.quotes:
            if q["blended_rate"] is None:
                adj_quotes.append({**q, "adj_rate": None})
                continue
            adj = q["blended_rate"]
            if payload.mills:
                adj += payload.mills / 10
            if payload.broker_mills and not for_broker:
                adj += payload.broker_mills / 10
            adj_quotes.append({**q, "adj_rate": round(adj, 4)})

        # Main table
        if for_broker:
            headers = [
                "Company Name",
                "Term Left",
                "B&E Start Date",
                "Broker Mills",
                *[f"{q['ext_term']}/{q['total_term']}" for q in adj_quotes],
            ]
        else:
            headers = [
                "Company Name",
                "Term Left",
                "B&E Start Date",
                "Broker Mills",
                *[f"{q['ext_term']}/{q['total_term']}" for q in adj_quotes],
            ]

        row = [
            payload.customer_name,
            str(payload.terms_left),
            today,
            str(payload.broker_mills or ""),
            *[str(q["adj_rate"]) if q["adj_rate"] else "N/A" for q in adj_quotes],
        ]

        col_count = len(headers)
        col_widths = [1.8 * inch, 0.8 * inch, 1 * inch, 0.8 * inch] + [0.85 * inch] * (
            col_count - 4
        )

        main_table = Table([headers, row], colWidths=col_widths)
        main_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), gray),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white]),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(main_table)
        story.append(Spacer(1, 12))

        # Broker offer — extra savings table
        if for_broker:
            story.append(Spacer(1, 10))
            # Info block
            info_data = [
                [
                    "Customer Name",
                    payload.customer_name,
                    "Current Rate ($/kWh)",
                    f"{payload.current_rate/100:.5f}",
                ],
                [
                    "Annual Volume (kWh)",
                    f"{payload.total_volume:,.0f}",
                    "Current End Date",
                    payload.contract_end_date,
                ],
                ["", "", "Current Broker Mills", str(payload.broker_mills or "")],
            ]
            info_table = Table(
                info_data, colWidths=[1.5 * inch, 2 * inch, 1.8 * inch, 1.7 * inch]
            )
            info_table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ]
                )
            )
            story.append(info_table)
            story.append(Spacer(1, 10))

            # Savings table
            sav_headers = [
                "Extension Term",
                "Total Term",
                "Proposed Broker Mills",
                "New Rate ($/kWh)",
                "Annual Savings",
                "Term Savings",
            ]
            sav_rows = []
            for q in adj_quotes:
                if q["adj_rate"] is None:
                    continue
                ann_sav = payload.total_volume * (
                    payload.current_rate / 100 - q["adj_rate"] / 100
                )
                term_sav = (ann_sav / 12) * q["total_term"]
                ann_str = (
                    f"-${abs(ann_sav):,.2f}" if ann_sav < 0 else f"${ann_sav:,.2f}"
                )
                term_str = (
                    f"-${abs(term_sav):,.2f}" if term_sav < 0 else f"${term_sav:,.2f}"
                )
                sav_rows.append(
                    [
                        str(q["ext_term"]),
                        str(q["total_term"]),
                        str(payload.broker_mills or ""),
                        f"{q['adj_rate']/100:.5f}",
                        ann_str,
                        term_str,
                    ]
                )

            sav_table = Table(
                [sav_headers] + sav_rows,
                colWidths=[
                    1.1 * inch,
                    0.9 * inch,
                    1.4 * inch,
                    1.2 * inch,
                    1.2 * inch,
                    1.2 * inch,
                ],
            )
            style = TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), gray),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
            # Green last column
            for i in range(1, len(sav_rows) + 1):
                style.add("BACKGROUND", (-1, i), (-1, i), light_green)
            sav_table.setStyle(style)
            story.append(sav_table)
        else:
            # Customer — savings table (no broker mills column)
            story.append(Spacer(1, 10))
            info_data = [
                [
                    "Customer Name",
                    payload.customer_name,
                    "Current Rate ($/kWh)",
                    f"{payload.current_rate/100:.5f}",
                ],
                [
                    "Annual Volume (kWh)",
                    f"{payload.total_volume:,.0f}",
                    "Current End Date",
                    payload.contract_end_date,
                ],
            ]
            info_table = Table(
                info_data, colWidths=[1.5 * inch, 2 * inch, 1.8 * inch, 1.7 * inch]
            )
            info_table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ]
                )
            )
            story.append(info_table)
            story.append(Spacer(1, 10))

            sav_headers = [
                "Extension Term",
                "Total Term",
                "New Rate ($/kWh)",
                "Annual Savings",
                "Term Savings",
            ]
            sav_rows = []
            for q in adj_quotes:
                if q["adj_rate"] is None:
                    continue
                ann_sav = payload.total_volume * (
                    payload.current_rate / 100 - q["adj_rate"] / 100
                )
                term_sav = (ann_sav / 12) * q["total_term"]
                ann_str = (
                    f"-${abs(ann_sav):,.2f}" if ann_sav < 0 else f"${ann_sav:,.2f}"
                )
                term_str = (
                    f"-${abs(term_sav):,.2f}" if term_sav < 0 else f"${term_sav:,.2f}"
                )
                sav_rows.append(
                    [
                        str(q["ext_term"]),
                        str(q["total_term"]),
                        f"{q['adj_rate']/100:.5f}",
                        ann_str,
                        term_str,
                    ]
                )

            sav_table = Table(
                [sav_headers] + sav_rows,
                colWidths=[1.3 * inch, 1 * inch, 1.4 * inch, 1.5 * inch, 1.5 * inch],
            )
            style = TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), gray),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
            for i in range(1, len(sav_rows) + 1):
                style.add("BACKGROUND", (-1, i), (-1, i), light_green)
            sav_table.setStyle(style)
            story.append(sav_table)

        # Footer
        story.append(Spacer(1, 10))
        story.append(
            Paragraph(
                '<font color="#ff0000"><u><em>NODAL AND RUC CHARGES INCLUDED</em></u></font>',
                ParagraphStyle(
                    "red", fontSize=9, alignment=2, fontName="Helvetica-BoldOblique"
                ),
            )
        )
        story.append(Spacer(1, 8))
        story.append(
            Paragraph(
                "<em>AMERIPOWER LLC APPRECIATES YOUR BUSINESS</em>",
                ParagraphStyle(
                    "center", fontSize=12, alignment=1, fontName="Helvetica-BoldOblique"
                ),
            )
        )
        story.append(Spacer(1, 12))
        story.append(
            Paragraph(
                "<u>Confidentiality Notice</u>  This message and any attachments are confidential "
                "and may be protected by legal privilege. If you are not the intended recipient, "
                "be aware that any disclosure, copying, distribution or use of this message or any "
                "attachment is prohibited.",
                conf_style,
            )
        )
        return story

    # Build both pages
    full_story = build_page(for_broker=False)
    full_story.append(PageBreak())
    full_story += build_page(for_broker=True)

    doc.build(full_story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=BNE_Offer_{payload.customer_name}.pdf"
        },
    )


@router.get("/customers")
async def get_customers_by_ids(ids: str, db: AsyncSession = Depends(get_db)):
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return []
    placeholders = ",".join([f":id{i}" for i in range(len(id_list))])
    params = {f"id{i}": v for i, v in enumerate(id_list)}
    result = await db.execute(
        text(
            f"""
        SELECT cust_id, company_name, premise_id,
               contract_end_date, contract_renewal_usage,
               contract_rate, broker_code, broker_name, load_profile
        FROM contract_renewal WHERE cust_id IN ({placeholders})
    """
        ),
        params,
    )
    rows = result.mappings().all()
    today = date.today()
    out = []
    for r in rows:
        rem = _remaining_months(r["contract_end_date"], today)
        rate_cents = (
            round(float(r["contract_rate"]) * 100, 4) if r["contract_rate"] else None
        )
        out.append(
            {**dict(r), "remaining_months": rem, "contract_rate_cents": rate_cents}
        )
    return out


class BneSaveRequest(BaseModel):
    sid: Optional[int] = None  # if provided → UPDATE, else INSERT
    customer_name: str
    broker_code: Optional[str] = None
    esid: Optional[str] = None
    cust_ids: Optional[str] = None  # JSON string
    current_rate: Optional[str] = None
    terms_left: Optional[str] = None  # contract end date
    extension_terms: Optional[str] = None  # e.g. "6,12,18,24"
    profiles: Optional[str] = None  # JSON string
    volume: Optional[str] = None  # JSON string
    mills: Optional[str] = None
    broker_mill: Optional[str] = None
    start_date: Optional[str] = None
    comments: Optional[str] = None
    created_by: Optional[str] = None


@router.post("/save")
async def save_bne(payload: BneSaveRequest, db: AsyncSession = Depends(get_db)):
    try:
        print(
            f"BNE save: broker_code='{payload.broker_code}' customer='{payload.customer_name}'"
        )
        if payload.sid:
            # UPDATE existing record
            await db.execute(
                text(
                    """
                UPDATE bne_log SET
                    customer_name    = :customer_name,
                    broker_code      = :broker_code,
                    esid             = :esid,
                    cust_ids         = :cust_ids,
                    current_rate     = :current_rate,
                    terms_left       = :terms_left,
                    extension_terms  = :extension_terms,
                    profiles         = :profiles,
                    volume           = :volume,
                    mills = :mills,
                    broker_mill      = :broker_mill,
                    start_date       = :start_date,
                    comments         = :comments
                WHERE sid = :sid
            """
                ),
                payload.dict(),
            )
            await db.commit()
            return {"sid": payload.sid, "action": "updated"}
        else:
            # INSERT new record
            result = await db.execute(
                text(
                    """
                INSERT INTO bne_log (
                    customer_name, broker_code, esid, cust_ids,
                    current_rate, terms_left, extension_terms,
                    profiles, volume, mills, broker_mill,
                    start_date, comments, created_by
                ) VALUES (
                    :customer_name, :broker_code, :esid, :cust_ids,
                    :current_rate, :terms_left, :extension_terms,
                    :profiles, :volume, :mills, :broker_mill,
                    :start_date, :comments, :created_by
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


@router.get("/{sid}")
async def get_bne(sid: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM bne_log WHERE sid = :sid"), {"sid": sid}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Not found")
    return dict(row)


@router.delete("/{sid}")
async def delete_bne(sid: int, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM bne_log WHERE sid = :sid"), {"sid": sid})
    await db.commit()
    return {"deleted": sid}
