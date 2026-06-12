import datetime
import re
from io import BytesIO

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import phpserialize
    _HAS_PHP = True
except ImportError:
    _HAS_PHP = False

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _unserialize(data) -> dict:
    """Safely decode PHP serialized data. Returns {} on any failure."""
    if not data or not _HAS_PHP:
        return {}
    try:
        raw = data.encode("utf-8", errors="replace") if isinstance(data, str) else data
        return phpserialize.loads(raw)
    except Exception:
        return {}


def _b(v) -> str:
    """Decode bytes → str; pass strings through."""
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return str(v) if v is not None else ""


def _get_tdsp(esid: str) -> str:
    """Mirrors PHP tdsp(): first 4 chars of ESID → TDSP provider name."""
    prefix = (esid or "")[:4]
    return {
        "1008": "CENTERPOINT",
        "1040": "TNMP",
        "1044": "ONCOR",
        "1003": "AEP",
        "1020": "AEP",
        "1017": "Sharyland",
    }.get(prefix, "")


# ── Active Quotes ──────────────────────────────────────────────────────────

async def get_active_quotes(
    db: AsyncSession,
    broker_id: str,
    role: str,
    search_text: str = "",
) -> dict:
    """
    Mirrors view_edit.php customer list logic exactly.
    Admin (role==1) sees all; others scoped to their broker_code.

    PHP search queries for admin do NOT join broker_new (no company_name).
    PHP bug on line 139: renewal rows display $row['credit_status'] (last
    regular customer's value) instead of $row_renewal['credit_status'].
    We return both sets so the frontend can replicate the bug.
    """
    is_admin = role == "1"
    like = f"%{search_text}%" if search_text else None

    if is_admin:
        if like:
            # PHP line 70-71: no broker_new JOIN when searching
            q_reg = ("SELECT * FROM customer "
                     "WHERE status=1 AND name LIKE :s")
            q_ren = ("SELECT * FROM broker_customer "
                     "WHERE renewal=1 AND status=1 AND name LIKE :s")
            p = {"s": like}
        else:
            # PHP line 74: full join with broker_new, ordered by company_name
            q_reg = ("SELECT c.*, b.company_name "
                     "FROM customer c, broker_new b "
                     "WHERE c.broker_code = b.broker_code "
                     "AND (c.status=1 OR c.status=2) "
                     "ORDER BY b.company_name, c.name")
            q_ren = ("SELECT * FROM broker_customer "
                     "WHERE renewal=1 AND status=1")
            p = {}
    else:
        if like:
            q_reg = ("SELECT * FROM customer "
                     "WHERE broker_code=:bid "
                     "AND name LIKE :s AND (status=1 OR status=2) ORDER BY name")
            q_ren = ("SELECT * FROM broker_customer "
                     "WHERE broker_code=:bid AND renewal=1 AND status=1 AND name LIKE :s")
            p = {"bid": broker_id, "s": like}
        else:
            q_reg = ("SELECT * FROM customer "
                     "WHERE broker_code=:bid "
                     "AND (status=1 OR status=2) ORDER BY name")
            q_ren = ("SELECT * FROM broker_customer "
                     "WHERE broker_code=:bid AND renewal=1 AND status=1")
            p = {"bid": broker_id}

    res_reg = await db.execute(text(q_reg), p)
    res_ren = await db.execute(text(q_ren), p)

    def to_dict(row, acc_type: str) -> dict:
        d = {k: (str(v) if v is not None else "") for k, v in row._mapping.items()}
        d["_account_type"] = acc_type
        return d

    customers = [to_dict(r, "regular") for r in res_reg.fetchall()]
    renewals  = [to_dict(r, "renewal")  for r in res_ren.fetchall()]
    return {"customers": customers, "renewals": renewals}


# ── Delete Customer ────────────────────────────────────────────────────────

async def delete_customer(db: AsyncSession, cid: str, table: str) -> dict:
    """Mirrors delete_customer.php: soft-delete by setting status=0."""
    if table not in {"customer", "broker_customer"}:
        return {"success": False, "message": "Invalid table"}
    await db.execute(
        text(f"UPDATE {table} SET status=0 WHERE cid=:cid"),
        {"cid": cid},
    )
    await db.commit()
    return {"success": True}


# ── Approve Customer ───────────────────────────────────────────────────────

async def approve_customer(db: AsyncSession, cid: str, table: str) -> dict:
    """
    Mirrors update_status AJAX call from ajax_function.js.
    PHP shows "Approved" button only when credit_status='Approved' (view_edit.php
    line 116). Sets credit_status='Approved' as confirmation action.
    """
    if table not in {"customer", "broker_customer"}:
        return {"success": False, "message": "Invalid table"}
    await db.execute(
        text(f"UPDATE {table} SET credit_status='Approved' WHERE cid=:cid"),
        {"cid": cid},
    )
    await db.commit()
    return {"success": True}


# ── Pricing Offer PDF ──────────────────────────────────────────────────────

async def generate_offer_pdf(
    db: AsyncSession,
    cid: str,
    type_: str,
    acc_name: str,
    acc_per: str,
    acc_address: str,
    acc_phone: str,
    acc_email: str,
    dasdate: str,
    doccterm1: str,
    doccterm2: str,
    doccterm3: str,
    doccterm4: str,
    doccterm5: str,
    quote6: str,
    quote12: str,
    quote18: str,
    quote24: str,
    quote36: str,
    acc_damount: str,
    com_name: str,
) -> bytes:
    """
    Mirrors pricing_offer.php PDF generation using reportlab instead of mPDF/jpgraph.

    DB fields deserialized via phpserialize:
      customer       → volume, profiles, city_state_zip, esid_list, multiple_volume
      broker_customer → all_volume, profiles, city_state_zip, esid_list, multiple_volume

    Term usage: sumvol/12 * term_months  (mirrors PHP $sumvol_X = ($sumvol/12)*$matches[0])
    Bar chart:  monthly aggregated from multiple_volume keys "MM_..."  (#FF1493 bars)
    """
    # ── Fetch customer record ────────────────────────────────────────────────
    tbl = "broker_customer" if type_ == "renewal" else "customer"
    res = await db.execute(text(f"SELECT * FROM {tbl} WHERE cid=:cid"), {"cid": cid})
    customer = res.fetchone()

    sumvol = 0.0
    max_max_volume = 0.0
    tdsp_name = ""
    num_esid = ""
    status = ""
    monthly_vols = [0.0] * 12

    if customer:
        row = dict(customer._mapping)
        status  = str(row.get("credit_status") or "")
        num_esid = str(row.get("num_esid") or "")

        vol_field = "all_volume" if type_ == "renewal" else "volume"
        volumes_raw = _unserialize(row.get(vol_field))
        if isinstance(volumes_raw, dict):
            for v in volumes_raw.values():
                try:
                    sumvol += float(v or 0)
                except (TypeError, ValueError):
                    pass

        # TDSP from profiles field
        profile_raw = _unserialize(row.get("profiles"))
        if isinstance(profile_raw, dict):
            profiles = [_b(v) for v in profile_raw.values()]
        elif isinstance(profile_raw, list):
            profiles = [_b(v) for v in profile_raw]
        else:
            profiles = []
        if len(profiles) > 1:
            tdsp_name = "multiple"
        elif profiles:
            tdsp_name = _get_tdsp(profiles[0])

        # Monthly volumes from multiple_volume (key format "MM_...")
        final_data = _unserialize(row.get("multiple_volume"))
        month_idx = {f"{i:02d}": i - 1 for i in range(1, 13)}
        if isinstance(final_data, dict):
            max_vols_per_profile = []
            for profile_vol in final_data.values():
                if not isinstance(profile_vol, dict):
                    continue
                local = [0.0] * 12
                for key, vol in profile_vol.items():
                    m = _b(key)[:2]
                    if m in month_idx:
                        try:
                            local[month_idx[m]] += float(vol or 0)
                        except (TypeError, ValueError):
                            pass
                for i in range(12):
                    monthly_vols[i] += local[i]
                vals = [float(v or 0) for v in profile_vol.values()
                        if v is not None]
                if vals:
                    max_vols_per_profile.append(max(vals))
            if max_vols_per_profile:
                max_max_volume = max(max_vols_per_profile)

    # ── Term usage calculation ────────────────────────────────────────────────
    def term_usage(term_str: str) -> str:
        """Mirrors PHP: $sumvol_X = ($sumvol/12) * preg_match digit."""
        m = re.search(r"\d+", term_str or "")
        if m:
            return str(round(sumvol / 12 * int(m.group())))
        return "N/A"

    # ── Format quotes to 4 decimal places (mirrors PHP number_format($q, 4)) ─
    def fmt_q(q: str) -> str:
        if q == "N/A":
            return "N/A"
        try:
            return f"{float(q):.4f}"
        except (TypeError, ValueError):
            return q or "N/A"

    q6, q12, q18, q24, q36 = fmt_q(quote6), fmt_q(quote12), fmt_q(quote18), fmt_q(quote24), fmt_q(quote36)

    try:
        damount = f"{float(acc_damount):.2f}" if acc_damount else "0.00"
    except (TypeError, ValueError):
        damount = "0.00"

    today = datetime.date.today().strftime("%m/%d/%Y")

    # ── Reportlab setup ──────────────────────────────────────────────────────
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.45 * inch, rightMargin=0.45 * inch,
        topMargin=0.45 * inch, bottomMargin=0.45 * inch,
    )
    styles = getSampleStyleSheet()
    N = styles["Normal"]
    eee = colors.HexColor("#EEEEEE")
    ccc = colors.HexColor("#CCCCCC")
    crimson = colors.HexColor("#B22222")

    def P(text, **kwargs):
        style = ParagraphStyle("_", parent=N, **kwargs)
        return Paragraph(text, style)

    def box_style(hdr_rows=1, header_bg=eee):
        ts = [
            ("BOX",          (0, 0), (-1, -1), 0.5, ccc),
            ("INNERGRID",    (0, 0), (-1, -1), 0.25, ccc),
            ("TOPPADDING",   (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
            ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ]
        for r in range(hdr_rows):
            ts.append(("BACKGROUND", (0, r), (-1, r), header_bg))
        return TableStyle(ts)

    story = []

    # ── 1. Header: logo left, title+date right ───────────────────────────────
    title_inner = Table(
        [[P("<b>Pricing Offer Sheet</b>", fontSize=13, alignment=2)],
         [P(f"Date: {today}", fontSize=9, alignment=2)]],
        colWidths=[3.4 * inch],
    )
    hdr_tbl = Table(
        [[P('<b><font size="17">Ameri</font>'
            '<font size="17" color="red">Power</font></b>'), title_inner]],
        colWidths=[3.5 * inch, 3.5 * inch],
    )
    story.append(hdr_tbl)
    story.append(Spacer(1, 0.1 * inch))

    # ── 2. Customer Information ──────────────────────────────────────────────
    cust_rows = [
        [P("<b>Customer Information</b>", fontSize=10)],
        [P(f"Company Name: {acc_name}",                      fontSize=9)],
        [P(f"Contact Person: {acc_per}",                     fontSize=9)],
        [P(f"Address: {acc_address.replace(',', ' ')}",      fontSize=9)],
        [P(f"Phone: {acc_phone}",                            fontSize=9)],
        [P("Fax: (713) 8136 891",                            fontSize=9)],  # hardcoded in PHP
        [P(f"Email: {acc_email}",                            fontSize=9)],
    ]
    story.append(Table(cust_rows, colWidths=[7.1 * inch],
                       style=box_style()))
    story.append(Spacer(1, 0.1 * inch))

    # ── 3. Pricing Summary + Account Information (two columns) ───────────────
    ps_rows = [
        [P("<b>Pricing Summary</b>", fontSize=10)],
        [P("Product Type: Fixed Commercial C1",       fontSize=9)],
        [P(f"Start Date: {dasdate}",                  fontSize=9)],
        [P(f"Credit Status: {status}",                fontSize=9)],
        [P("Payment Term: Net 15",                    fontSize=9)],
        [P(f"Deposit Amount: ${damount}",             fontSize=9)],
    ]
    ai_rows = [
        [P("<b>Account Information</b>", fontSize=10)],
        [P(f"Meter Count: {num_esid}",                fontSize=9)],
        [P(f"Agent: {com_name}",                      fontSize=9)],
        [P(f"Annual Usage: {round(sumvol)} kWh",      fontSize=9)],
        [P(f"Peak KW: {round(max_max_volume)}",       fontSize=9)],
        [P(f"TDSP: {tdsp_name}",                      fontSize=9)],
        [P("ISO: ERCOT",                              fontSize=9)],
    ]
    ps_tbl = Table(ps_rows, colWidths=[3.4 * inch], style=box_style())
    ai_tbl = Table(ai_rows, colWidths=[3.4 * inch], style=box_style())
    story.append(Table([[ps_tbl, ai_tbl]], colWidths=[3.55 * inch, 3.55 * inch]))
    story.append(Spacer(1, 0.1 * inch))

    # ── 4. Terms Table ────────────────────────────────────────────────────────
    terms_data = [
        [P("<b>Term (Months)</b>", fontSize=9),
         P("<b>Term Usage (kWh)</b>", fontSize=9),
         P("<b>Contract Price (¢/kWh)</b>", fontSize=9)],
        [doccterm1 or "", f"{term_usage(doccterm1)} kWh", f"¢ {q6}"],
        [doccterm2 or "", f"{term_usage(doccterm2)} kWh", f"¢ {q12}"],
        [doccterm3 or "", f"{term_usage(doccterm3)} kWh", f"¢ {q18}"],
        [doccterm4 or "", f"{term_usage(doccterm4)} kWh", f"¢ {q24}"],
        [doccterm5 or "", f"{term_usage(doccterm5)} kWh", f"¢ {q36}"],
    ]
    story.append(Table(terms_data,
                       colWidths=[2.37 * inch, 2.37 * inch, 2.37 * inch],
                       style=box_style()))
    story.append(Spacer(1, 0.1 * inch))

    # ── 5. Usage Bar Chart ────────────────────────────────────────────────────
    if any(monthly_vols):
        d = Drawing(490, 150)
        bc = VerticalBarChart()
        bc.x, bc.y, bc.width, bc.height = 45, 15, 430, 120
        bc.data = [monthly_vols]
        bc.categoryAxis.categoryNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        bc.bars[0].fillColor = colors.HexColor("#FF1493")  # matches PHP bar color
        d.add(bc)
        graph_rows = [
            [P("<b>Annual Usage Profile</b>", fontSize=10)],
            [d],
        ]
        story.append(Table(graph_rows, colWidths=[7.1 * inch], style=box_style()))
        story.append(Spacer(1, 0.1 * inch))

    # ── 6. For Agent Use Only + TDSP Disclaimer ───────────────────────────────
    disc = (
        "To ensure AmeriPower LLC can accurately serve your energy needs and avoid "
        "potential cancellation penalty, please ensure the above mentioned ESI ID(s) "
        "and start dates are correct before signing.\n"
        "Customer Signature_____________________\n"
        "Customer Name________________________\n"
        "Effective Date_________________________\n\n"
        "<b>TDSP Charges non-inclusion Statement:</b> <i>By signing customer here "
        "acknowledges its understanding that regulated TDSP charges are not included "
        "in the above pricing quote(s) and will appear in bill as a separate line "
        "item. These charges vary based on customer and TDSP. AmeriPower LLC makes "
        "no representation or promise regarding TDSP charges</i>"
    )
    agent_style = TableStyle([
        ("BACKGROUND",   (0, 0), (0, 0), crimson),
        ("TEXTCOLOR",    (0, 0), (0, 0), colors.white),
        ("BACKGROUND",   (0, 1), (0, 1), eee),
        ("BOX",          (0, 0), (-1, -1), 0.5, ccc),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ])
    story.append(Table(
        [[P("<b>For Agent Use Only</b>", fontSize=10)],
         [P(disc, fontSize=9)]],
        colWidths=[7.1 * inch],
        style=agent_style,
    ))
    story.append(Spacer(1, 0.1 * inch))

    # ── 7. Bottom note (mirrors PHP bottom paragraph) ─────────────────────────
    story.append(P(
        "Note: This offer shall only become binding &amp; enforceable when executed "
        "in accordance with the terms &amp; conditions specified in our contract "
        "agreement and nothing herein shall be deemed to require AmeriPower LLC to "
        "enter into any such agreement.",
        fontSize=8,
    ))

    doc.build(story)
    return buf.getvalue()
