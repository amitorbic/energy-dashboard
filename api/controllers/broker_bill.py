"""
Broker Bill Sample — exact replication of bill.php / sample_bill_pdf.php.

Tax logic (three paths, mirrors PHP lines 64-94):
  default:    state_tax + city_tax + puc_tax + grt
  residential_tax_exemp: state_tax = 0, city_tax applies
  tax_exempt:  state_tax = 0, city_tax = 0

Bill date: 3rd of start month; due date: 18th of start month.
Zone → ESI ID mapping mirrors sample_bill_pdf.php lines 47-58.
"""

from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)


# ---------------------------------------------------------------------------
# Zone → fake ESI ID (mirrors sample_bill_pdf.php lines 47-58)
# ---------------------------------------------------------------------------
_ZONE_ESID = {
    "CNP":   "1008900000000123456789",
    "ONCOR": "10443000123456789",
    "AEP":   "10032000123456789",
    "TNMP":  "10400500123456789",
}


# ---------------------------------------------------------------------------
# Calculation (mirrors bill.php lines 64-94)
# ---------------------------------------------------------------------------

def _calculate(
    rate: float, usage: float, tdsp: float, fee: float,
    tax_exempt: bool, residential_tax_exemp: bool,
) -> dict:
    # rate is in cents
    comm_charge = (rate / 100.0) * usage

    if tax_exempt:
        state_tax = 0.0
        city_tax  = 0.0
    elif residential_tax_exemp:
        state_tax = 0.0
        city_tax  = (comm_charge + tdsp + fee) * 0.01
    else:
        state_tax = (comm_charge + tdsp + fee) * 0.0625
        city_tax  = (comm_charge + tdsp + fee) * 0.01

    puc_tax = (comm_charge + tdsp + fee) * 0.00167
    grt     = (comm_charge + tdsp + fee + state_tax + city_tax) * 0.01997

    total_due = comm_charge + tdsp + fee + state_tax + city_tax + puc_tax + grt

    # average rate: (comm_charge + tdsp) / usage, avoid divide-by-zero
    avg_rate = round((comm_charge + tdsp) / usage, 4) if usage else 0.0

    return {
        "comm_charge": round(comm_charge, 2),
        "tdsp":        round(tdsp, 2),
        "fee":         round(fee, 2),
        "state_tax":   round(state_tax, 2),
        "city_tax":    round(city_tax, 2),
        "puc_tax":     round(puc_tax, 4),
        "grt":         round(grt, 4),
        "total_due":   round(total_due, 2),
        "avg_rate":    avg_rate,
    }


# ---------------------------------------------------------------------------
# PDF generation (mirrors sample_bill_pdf.php layout)
# ---------------------------------------------------------------------------

def generate_bill_pdf(
    name: str, zone: str, txtdate: str, txtdate1: str,
    tdsp: float, rate: float, usage: float, fee: float,
    address: str,
    tax_exempt: bool, residential_tax_exemp: bool,
) -> bytes:
    c = _calculate(rate, usage, tdsp, fee, tax_exempt, residential_tax_exemp)

    # Parse start date for bill/due dates (3rd and 18th of start month)
    try:
        start_dt = datetime.strptime(txtdate, "%Y-%m-%d")
        bill_date = start_dt.replace(day=3).strftime("%m/%d/%Y")
        due_date  = start_dt.replace(day=18).strftime("%m/%d/%Y")
        period_from = start_dt.strftime("%m/%d/%Y")
    except Exception:
        bill_date = txtdate
        due_date  = txtdate1
        period_from = txtdate

    try:
        end_dt = datetime.strptime(txtdate1, "%Y-%m-%d")
        period_to = end_dt.strftime("%m/%d/%Y")
    except Exception:
        period_to = txtdate1

    zone_esid = _ZONE_ESID.get(zone.upper(), "")

    buf   = BytesIO()
    doc   = SimpleDocTemplate(buf, pagesize=letter,
                               leftMargin=0.6*inch, rightMargin=0.6*inch,
                               topMargin=0.6*inch, bottomMargin=0.6*inch)
    st    = getSampleStyleSheet()
    center = ParagraphStyle("c", parent=st["Normal"], alignment=TA_CENTER)
    right  = ParagraphStyle("r", parent=st["Normal"], alignment=TA_RIGHT)
    bold   = ParagraphStyle("b", parent=st["Normal"], fontName="Helvetica-Bold")
    small  = ParagraphStyle("s", parent=st["Normal"], fontSize=8)

    story = []

    # ---- Header ----
    story.append(Paragraph("<b>ORBIC ENERGY</b>", center))
    story.append(Paragraph("P.O. Box 27, Houston, TX 77001", center))
    story.append(Paragraph("Tel: (713) 555-0100  |  License # BR170183", center))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#003366")))
    story.append(Spacer(1, 6))

    # ---- Account summary table ----
    acct_data = [
        [Paragraph("<b>Account #:</b>", st["Normal"]),
         Paragraph("110921001", st["Normal"]),
         Paragraph("<b>Bill #:</b>", st["Normal"]),
         Paragraph("B123456789", st["Normal"])],
        [Paragraph("<b>Bill Date:</b>", st["Normal"]),
         Paragraph(bill_date, st["Normal"]),
         Paragraph("<b>Due Date:</b>", st["Normal"]),
         Paragraph(due_date, st["Normal"])],
        [Paragraph("<b>Customer:</b>", st["Normal"]),
         Paragraph(name, st["Normal"]),
         Paragraph("<b>Zone:</b>", st["Normal"]),
         Paragraph(zone.upper(), st["Normal"])],
        [Paragraph("<b>Service Address:</b>", st["Normal"]),
         Paragraph(address, st["Normal"]),
         Paragraph("<b>ESI ID:</b>", st["Normal"]),
         Paragraph(zone_esid, small)],
        [Paragraph("<b>Bill Period:</b>", st["Normal"]),
         Paragraph(f"{period_from} to {period_to}", st["Normal"]),
         "", ""],
    ]
    acct_tbl = Table(acct_data, colWidths=[1.4*inch, 2.8*inch, 1.2*inch, 2.0*inch])
    acct_tbl.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#f0f4ff")),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    story.append(acct_tbl)
    story.append(Spacer(1, 10))

    # ---- Summary box ----
    summary_data = [
        ["Previous Balance",      "$0.00"],
        ["New Charges",           f"${c['total_due']:.2f}"],
        ["Payments / Adj.",       "$0.00"],
        ["Amount Due",            f"${c['total_due']:.2f}"],
        ["Due Date",              due_date],
    ]
    story.append(Paragraph("<b>Account Summary</b>", bold))
    story.append(Spacer(1, 4))
    sumtbl = Table(summary_data, colWidths=[3.5*inch, 2.0*inch])
    sumtbl.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("BACKGROUND",    (0, len(summary_data)-1), (-1, len(summary_data)-1), colors.HexColor("#003366")),
        ("TEXTCOLOR",     (0, len(summary_data)-1), (-1, len(summary_data)-1), colors.white),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.grey),
        ("LINEBELOW",     (0,0), (-1,-2), 0.25, colors.lightgrey),
    ]))
    story.append(sumtbl)
    story.append(Spacer(1, 10))

    # ---- Meter details ----
    story.append(Paragraph("<b>Meter Details</b>", bold))
    story.append(Spacer(1, 4))
    meter_data = [
        ["Meter #", "Type", "Current Read", "Previous Read", "Multiplier", "kWh Usage", "kWh Demand"],
        ["1232546",  "E",   "0",            "0",             "1",          f"{usage:.0f}", "0"],
    ]
    mtbl = Table(meter_data,
                 colWidths=[0.9*inch, 0.7*inch, 1.1*inch, 1.1*inch, 0.9*inch, 1.0*inch, 1.0*inch])
    mtbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0),  colors.HexColor("#003366")),
        ("TEXTCOLOR",     (0,0), (-1,0),  colors.white),
        ("FONTSIZE",      (0,0), (-1,-1), 8),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ("GRID",          (0,0), (-1,-1), 0.5, colors.grey),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    story.append(mtbl)
    story.append(Spacer(1, 10))

    # ---- Current charges ----
    story.append(Paragraph("<b>Current Charges</b>", bold))
    story.append(Spacer(1, 4))
    rate_per_kwh = rate / 100.0
    charges_data = [
        [f"Comm. KWH Charge: {usage:.0f} kWh @ ${rate_per_kwh:.4f}/kWh",
         f"${c['comm_charge']:.2f}"],
        ["PTC: TDSP Pass Through Charges",
         f"${c['tdsp']:.2f}"],
        ["Base Charges (Meter Fee)",
         f"${c['fee']:.2f}"],
    ]
    ctbl = Table(charges_data, colWidths=[5.0*inch, 1.5*inch])
    ctbl.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ALIGN",         (1,0), (1,-1),  "RIGHT"),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LINEBELOW",     (0,0), (-1,-2), 0.25, colors.lightgrey),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    story.append(ctbl)
    story.append(Spacer(1, 8))

    # ---- Taxes ----
    story.append(Paragraph("<b>Taxes &amp; Fees</b>", bold))
    story.append(Spacer(1, 4))
    tax_rows = []
    if not tax_exempt and not residential_tax_exemp:
        tax_rows.append([f"State Tax @ 6.25%",        f"${c['state_tax']:.2f}"])
    if not tax_exempt:
        tax_rows.append([f"City Tax @ 1%",             f"${c['city_tax']:.2f}"])
    tax_rows.append(    [f"PUC Assessment @ 0.167%",   f"${c['puc_tax']:.4f}"])
    tax_rows.append(    [f"Gross Receipt Tax @ 1.997%",f"${c['grt']:.4f}"])
    tax_rows.append(    ["District Tax",                "$0.00"])
    ttbl = Table(tax_rows, colWidths=[5.0*inch, 1.5*inch])
    ttbl.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ALIGN",         (1,0), (1,-1),  "RIGHT"),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.grey),
        ("LINEBELOW",     (0,0), (-1,-2), 0.25, colors.lightgrey),
    ]))
    story.append(ttbl)
    story.append(Spacer(1, 8))

    # ---- Total ----
    total_data = [
        ["Previous Balance",    "$0.00"],
        ["Total Current Charges", f"${c['total_due']:.2f}"],
        ["Total Amount Due",    f"${c['total_due']:.2f}"],
    ]
    totbl = Table(total_data, colWidths=[5.0*inch, 1.5*inch])
    totbl.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ALIGN",         (1,0), (1,-1),  "RIGHT"),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("BACKGROUND",    (0, 2), (-1, 2), colors.HexColor("#003366")),
        ("TEXTCOLOR",     (0, 2), (-1, 2), colors.white),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    story.append(totbl)
    story.append(Spacer(1, 8))

    # ---- Contract detail ----
    story.append(Paragraph("<b>Contract Details</b>", bold))
    story.append(Spacer(1, 4))
    contract_data = [
        [f"{period_from} — {period_to}  Fixed Rate",
         f"Usage kWh: {usage:.0f}",
         f"Avg Rate: {c['avg_rate']:.4f}",
         f"${c['comm_charge']:.2f}"],
    ]
    ctbl2 = Table(contract_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch, 1.0*inch])
    ctbl2.setStyle(TableStyle([
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("BOX",        (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    story.append(ctbl2)

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Calculation-only (for live preview in browser without PDF)
# ---------------------------------------------------------------------------

def calculate_bill(
    rate: float, usage: float, tdsp: float, fee: float,
    tax_exempt: bool, residential_tax_exemp: bool,
    zone: str, txtdate: str, txtdate1: str,
) -> dict:
    c = _calculate(rate, usage, tdsp, fee, tax_exempt, residential_tax_exemp)

    try:
        start_dt = datetime.strptime(txtdate, "%Y-%m-%d")
        bill_date = start_dt.replace(day=3).strftime("%m/%d/%Y")
        due_date  = start_dt.replace(day=18).strftime("%m/%d/%Y")
    except Exception:
        bill_date = txtdate
        due_date  = txtdate1

    c["zone_esid"]  = _ZONE_ESID.get(zone.upper(), "")
    c["bill_date"]  = bill_date
    c["due_date"]   = due_date
    c["rate_per_kwh"] = round(rate / 100.0, 4)
    return c
