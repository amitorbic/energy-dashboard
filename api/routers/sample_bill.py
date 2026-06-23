from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from utils.email_routing import get_tenant_email
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io
from datetime import datetime

router = APIRouter(prefix="/sample-bill", tags=["sample-bill"])

MONTH_NAMES = {
    1: "Jan 1st to Jan 31st",
    2: "Feb 1st to Feb 28th",
    3: "Mar 1st to Mar 31st",
    4: "Apr 1st to Apr 30th",
    5: "May 1st to May 31st",
    6: "Jun 1st to Jun 30th",
    7: "July 1st to July 31st",
    8: "Aug 1st to Aug 31st",
    9: "Sep 1st to Sep 30th",
    10: "Oct 1st to Oct 31st",
    11: "Nov 1st to Nov 30th",
    12: "Dec 1st to Dec 31st",
}


class SampleBillRequest(BaseModel):
    name: str
    address: str
    rate: float  # $/kWh
    usage: float  # kWh
    tdsp: float  # TDSP charges
    fee: float  # base charges
    bill_month: str  # MM/YYYY
    tax_exempt: int  # 1=full, 2=city exempt, 3=all taxes, 0=standard


@router.post("/generate")
async def generate_sample_bill(payload: SampleBillRequest):
    try:
        # ── Calculations ──────────────────────────────────────────
        comm_charge = payload.rate * payload.usage
        base = comm_charge + payload.tdsp + payload.fee

        if payload.tax_exempt == 1:  # full exempt
            state_tax = city_tax = 0.0
        elif payload.tax_exempt == 2:  # city exempt
            state_tax = city_tax = 0.0
        else:
            state_tax = base * 0.0625
            city_tax = base * 0.01

        puc_tax = base * 0.00167
        grt = (base + state_tax + city_tax) * 0.01997
        total_due = base + state_tax + city_tax + puc_tax + grt

        # Dates
        try:
            month_num = int(payload.bill_month.split("/")[0])
            year = payload.bill_month.split("/")[1]
        except:
            month_num = datetime.today().month
            year = str(datetime.today().year)

        bill_date = f"{payload.bill_month[:2]}/03/{year}"
        due_date = f"{payload.bill_month[:2]}/18/{year}"
        bill_period = MONTH_NAMES.get(month_num, f"Month {month_num}")
        avg_rate = (
            round((comm_charge + payload.tdsp) / payload.usage, 3)
            if payload.usage
            else 0
        )

        # ── Build PDF ─────────────────────────────────────────────
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
        gray = colors.HexColor("#A9A9A9")
        red = colors.HexColor("#FF0000")
        dark = colors.HexColor("#333333")

        s_normal = ParagraphStyle("n", fontSize=9, fontName="Helvetica", leading=12)
        s_small = ParagraphStyle("s", fontSize=8, fontName="Helvetica", leading=10)
        s_bold = ParagraphStyle("b", fontSize=9, fontName="Helvetica-Bold", leading=12)
        s_large = ParagraphStyle(
            "l", fontSize=16, fontName="Helvetica-Bold", leading=20
        )
        s_red = ParagraphStyle(
            "r", fontSize=14, fontName="Helvetica-Bold", textColor=red, alignment=1
        )

        story = []

        # ── Header info boxes ──────────────────────────────────────
        header_data = [
            [
                # ORBIC-specific: legal entity name, mailing address, and PUC license number
                # all differ per REP. When onboarding a second tenant, replace with
                # env vars (TENANT_LEGAL_NAME, TENANT_MAILING_ADDRESS, TENANT_PUC_LICENSE)
                # or a custom template. For now this block is ORBIC-only.
                Paragraph(
                    "<b>AmeriPower, LLC</b><br/>P.O. Box 16206<br/>Sugar Land, TX 77496<br/>PUC License # 10076",
                    s_small,
                ),
                Paragraph(
                    "<b>Questions or Comments</b><br/>Local: 281-240-0405<br/>Toll-Free: 877-960-5050",
                    s_small,
                ),
                Paragraph(
                    f"<b>Email:</b> {get_tenant_email('operations')}<br/><b>Web:</b> www.ameripower.com",
                    s_small,
                ),
                Paragraph(
                    "<b>For Outages/Emergencies:</b><br/>CenterPoint 1-800-332-7143",
                    s_small,
                ),
            ]
        ]
        header_table = Table(header_data, colWidths=[1.8 * inch] * 4)
        header_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                    ("PADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(header_table)
        story.append(Spacer(1, 12))

        # ── Sample Bill title ─────────────────────────────────────
        story.append(Paragraph("Sample Bill", s_red))
        story.append(Spacer(1, 8))

        # ── Bill info ─────────────────────────────────────────────
        story.append(
            Paragraph(
                f"Acct #: 110921001 &nbsp; Bill #: B123456789 &nbsp; Bill Date: {bill_date}",
                s_normal,
            )
        )
        story.append(Paragraph(f"Service at ESI ID #: 100101010101010101", s_normal))
        story.append(Paragraph(f"<b>{payload.name}</b>", s_normal))
        story.append(Paragraph(payload.address, s_normal))
        story.append(
            Paragraph(
                f"Bill Date: {bill_date} &nbsp; Bill Period: {bill_period}", s_normal
            )
        )
        story.append(Spacer(1, 8))

        # ── Summary table ─────────────────────────────────────────
        summary_data = [
            [
                "Previous Balance",
                "New Charges",
                "Payments/Adj.",
                "Due Amount",
                "Due Date",
            ],
            ["$0.00", f"${total_due:,.2f}", "$0.00", f"${total_due:,.2f}", due_date],
        ]
        summary_table = Table(summary_data, colWidths=[1.4 * inch] * 5)
        summary_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), gray),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                    ("PADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(summary_table)
        story.append(Spacer(1, 8))

        # ── Meter table ───────────────────────────────────────────
        meter_data = [
            [
                "Meter",
                "Type",
                "Dates",
                "Current Read",
                "Previous Read",
                "Multiplier",
                "KWh Usage",
                "KWh Demand",
                "Energy Cost",
            ],
            [
                "1232546",
                "",
                bill_period,
                "0",
                "0",
                "1",
                str(int(payload.usage)),
                "0",
                "See Details",
            ],
        ]
        meter_table = Table(
            meter_data,
            colWidths=[
                0.7 * inch,
                0.5 * inch,
                1.4 * inch,
                0.85 * inch,
                0.85 * inch,
                0.7 * inch,
                0.7 * inch,
                0.7 * inch,
                0.8 * inch,
            ],
        )
        meter_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), gray),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(meter_table)
        story.append(Spacer(1, 10))

        # ── Current Charges ───────────────────────────────────────
        story.append(Paragraph("Current Charges", s_large))
        story.append(Paragraph("Electric Service", s_bold))
        story.append(Spacer(1, 4))

        charge_rows = [
            [
                f"Comm. KWH Charge - {int(payload.usage)} KWh @ ${payload.rate} Per KWh",
                f"${comm_charge:,.2f}",
            ],
            ["PTC: TDSP Pass Through Charges", f"${payload.tdsp:,.2f}"],
            ["Base Charges", f"${payload.fee:,.2f}"],
        ]

        story.append(Paragraph("<b>Sales &amp; Gross Receipt Taxes</b>", s_bold))

        if payload.tax_exempt == 1:  # full exempt — only GRT + PUC
            charge_rows += [
                [f"Gross Receipt Tax Reimbursement @ 0.01997", f"${grt:,.2f}"],
                [f"PUC Assessment Charge @ 0.00167", f"${puc_tax:,.2f}"],
            ]
        elif payload.tax_exempt == 2:  # city exempt — city + GRT + PUC
            charge_rows += [
                [f"City Tax @ 0.01", f"${city_tax:,.2f}"],
                [f"Gross Receipt Tax Reimbursement @ 0.01997", f"${grt:,.2f}"],
                [f"PUC Assessment Charge @ 0.00167", f"${puc_tax:,.2f}"],
            ]
        elif payload.tax_exempt == 3:  # all taxes
            charge_rows += [
                [f"City Tax @ 0.01", f"${city_tax:,.2f}"],
                [f"Gross Receipt Tax Reimbursement @ 0.01997", f"${grt:,.2f}"],
                [f"PUC Assessment Charge @ 0.00167", f"${puc_tax:,.2f}"],
                ["District Tax", "$0.00"],
                [f"State Tax @ 0.0625", f"${state_tax:,.2f}"],
            ]
        else:  # standard
            charge_rows += [
                [f"City Tax @ 0.01", f"${city_tax:,.2f}"],
                [f"Gross Receipt Tax Reimbursement @ 0.01997", f"${grt:,.2f}"],
                [f"PUC Assessment Charge @ 0.00167", f"${puc_tax:,.2f}"],
            ]

        charges_table = Table(charge_rows, colWidths=[6 * inch, 1.2 * inch])
        charges_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(charges_table)
        story.append(Spacer(1, 8))

        # ── Payment and Adjustments ───────────────────────────────
        story.append(Paragraph("Payment and Adjustments", s_large))
        payment_rows = [
            ["Previous Balance", "$0.00"],
            ["Total Current Charges", f"${total_due:,.2f}"],
        ]
        payment_table = Table(payment_rows, colWidths=[6 * inch, 1.2 * inch])
        payment_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(payment_table)

        # Total due — large
        total_table = Table(
            [["Total Amount Due", f"${total_due:,.2f}"]],
            colWidths=[6 * inch, 1.2 * inch],
        )
        total_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 14),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("PADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(total_table)
        story.append(Spacer(1, 8))
        story.append(HRFlowable(width="100%", thickness=0.5, color=gray))
        story.append(Spacer(1, 8))

        # ── Contract Details ──────────────────────────────────────
        contract_header = Table(
            [["Contract Details", "Usage kWh", "Avg Rate", "Amount"]],
            colWidths=[3 * inch, 1.5 * inch, 1.2 * inch, 1.5 * inch],
        )
        contract_header.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(contract_header)

        contract_row = Table(
            [
                [
                    f"{bill_period} Fixed Rate",
                    str(int(payload.usage)),
                    str(payload.rate),
                    f"${payload.usage * payload.rate:,.2f}",
                ]
            ],
            colWidths=[3 * inch, 1.5 * inch, 1.2 * inch, 1.5 * inch],
        )
        contract_row.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(contract_row)
        story.append(Spacer(1, 6))

        story.append(
            Paragraph(
                f"The average price you paid for electricity this month is ${avg_rate} per kWh",
                s_small,
            )
        )
        story.append(Spacer(1, 10))
        story.append(HRFlowable(width="100%", thickness=0.5, color=gray))
        story.append(Spacer(1, 6))

        # ── General Information ───────────────────────────────────
        # ORBIC-specific: year of registration (2003), PUCT license (10076), and legal
        # entity name (AmeriPower, LLC) are all tenant-specific facts, not template text.
        # When onboarding a second tenant, replace this block with per-tenant values.
        story.append(
            Paragraph(
                "<b><u>General Information:</u></b> AmeriPower, LLC was registered as a Texas REP in 2003 "
                "and has been operating under PUCT license # 10076. Our proven track record in this industry "
                "will show that we have a fair and balanced contract accompanied by a strong history of excellent "
                "customer service. The Fixed Energy Price includes energy charges and ERCOT ISO Fees, Nodal charges, "
                "and RUC. Any and all information contained herein is to be used for informational purposes only. "
                "Any pricing may be changed at any time at the sole discretion of AmeriPower, LLC.",
                s_small,
            )
        )

        doc.build(story)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Sample_Bill.pdf"},
        )

    except Exception as e:
        raise HTTPException(500, str(e))
