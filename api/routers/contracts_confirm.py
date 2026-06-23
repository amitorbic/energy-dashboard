from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from datetime import date
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from utils.database import get_db
from controllers.custom_pricing import calculate_custom_price
import os
from utils.email_routing import (
    get_tenant_email,
    get_tenant_display_name,
    get_tenant_website,
    get_tenant_address,
    get_tenant_phone,
)
from fastapi import UploadFile, File as FastAPIFile
import pandas as pd
import io
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from fastapi.responses import StreamingResponse
import io
from email.mime.base import MIMEBase
from email import encoders as email_encoders
import io
from email.mime.base import MIMEBase
from email import encoders as email_encoders
from reportlab.platypus import HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors as rl_colors

router = APIRouter(prefix="/contracts", tags=["Contract Confirmation"])


# ─── Helpers ────────────────────────────────────────────────────────────────


def _generate_contract_no(existing_max: str | None) -> str:
    today = date.today().strftime("%y%m%d")
    base = int(today) * 10000 + 101
    if existing_max:
        try:
            max_int = int(existing_max)
            if str(max_int)[:6] == today:
                return str(max_int + 1)
        except (ValueError, TypeError):
            pass
    return str(base)


def _build_confirmation_email_html(data: dict, company_name: str = "") -> str:
    today = date.today().strftime("%m/%d/%Y")

    # ── Rate conversions ¢/kWh → $/kWh ──────────────────────────────────────
    def to_dollar(val):
        try:
            return round(float(val) / 100, 6)
        except (TypeError, ValueError):
            return None

    contract_rate_dollar = to_dollar(data.get("contract_rate"))
    company_quote_dollar = to_dollar(data.get("ap_quote"))

    # ── Split mills calculation ───────────────────────────────────────────────
    if contract_rate_dollar is not None and company_quote_dollar is not None:
        broker_mills = contract_rate_dollar - company_quote_dollar
        split_val = data.get("broker_split")  # passed in from broker_new.split
        ameri_mills = to_dollar(data.get("mill")) or 0.0

        if split_val and broker_mills > 0:
            try:
                split_threshold = float(split_val) / 1000  # mills → $/kWh
                if broker_mills > split_threshold:
                    excess = broker_mills - split_threshold
                    company_keeps = round(excess / 2, 6)
                    company_quote_dollar = round(
                        company_quote_dollar + company_keeps + ameri_mills, 6
                    )
                else:
                    company_quote_dollar = round(company_quote_dollar + ameri_mills, 6)
            except (TypeError, ValueError):
                company_quote_dollar = round(company_quote_dollar + ameri_mills, 6)
        else:
            company_quote_dollar = round(company_quote_dollar + ameri_mills, 6)
        commission = round(contract_rate_dollar - company_quote_dollar, 6)
    else:
        commission = None

    contract_rate_str = (
        f"{contract_rate_dollar:.4f}" if contract_rate_dollar is not None else "—"
    )
    company_quote_str = (
        f"{company_quote_dollar:.4f}" if company_quote_dollar is not None else "—"
    )
    commission_str = f"{commission:.4f}" if commission is not None else "—"

    # ── Enrollment type ───────────────────────────────────────────────────────
    enrollment_parts = []
    if data.get("switch_flag"):
        enrollment_parts.append("Switch")
    if data.get("pmvi"):
        enrollment_parts.append("PMVI")
    if data.get("mvi"):
        enrollment_parts.append("MVI")
    enrollment_type = ", ".join(enrollment_parts) if enrollment_parts else "—"

    # ── Load profiles ─────────────────────────────────────────────────────────
    profiles_display = data.get("profiles_display", "")
    try:
        import json

        volumes = json.loads(data.get("volumes", "{}") or "{}")
        if volumes:
            profiles_display = "  ".join(
                f"{k}__{int(float(v)):,}" for k, v in volumes.items() if v
            )
    except Exception:
        pass

    yes_no = lambda v: "YES" if v else "NO"
    asap = data.get("asap")
    start = "ASAP" if asap else (data.get("start_date") or "—")

    lmp_suffix = " (LMP)" if data.get("lmp") else ""

    return f"""
<html>
<body style="font-family:Arial,sans-serif;font-size:13px;color:#222;margin:0;padding:0;">
<table width="620" cellpadding="0" cellspacing="0"
       style="margin:30px auto;border:1px solid #ccc;">

  <!-- Logo + title -->
  <tr>
    <td colspan="4" style="padding:16px 20px;border-bottom:2px solid #cc0000;">
      <img src="https://ameripowerpricing.com/images/AmeriPower%20new_logo.jpg"
           style="height:50px;vertical-align:middle;" alt="AmeriPower" />
      <span style="float:right;font-size:16px;font-weight:bold;
                   color:#cc0000;line-height:50px;">CONTRACT CONFIRMATION</span>
    </td>
  </tr>

  <!-- Contract No -->
  <tr>
    <td colspan="4" style="padding:10px 20px 4px;">
      <strong>CONTRACT NO:</strong> {data.get("contract_no","")}
    </td>
  </tr>

  <!-- Customer Name -->
  <tr>
    <td colspan="4" style="padding:4px 20px 10px;border-bottom:1px solid #eee;">
      <strong>Customer Name:</strong> {data.get("customer_name","")}
    </td>
  </tr>

  <!-- Row: Contract Received | Term -->
  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;width:40%;border-right:1px solid #eee;">
      <strong>Contract Received/Signed:</strong> {yes_no(data.get("contract_received"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Term:</strong> {data.get("term","—")}{lmp_suffix}
    </td>
  </tr>

  <!-- Row: Credit Approved | Contract Rate -->
  <tr>
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Credit Approved:</strong> {yes_no(data.get("credit_status"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Contract Rate ($/kWh):</strong> {contract_rate_str}
    </td>
  </tr>

  <!-- Row: Executed | Company Quote -->
  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Executed:</strong> {yes_no(data.get("executed"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Company Quote ($/kWh):</strong> {company_quote_str}
    </td>
  </tr>

  <!-- Row: Forwarded | Commission -->
  <tr>
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Forwarded for Enrollment:</strong> {yes_no(data.get("forwarded"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Commission:</strong> {commission_str}
    </td>
  </tr>

  <!-- Appreciation -->
  <tr>
    <td colspan="4" style="padding:10px 20px;text-align:center;
        font-weight:bold;border-top:1px solid #eee;border-bottom:1px solid #eee;
        color:#cc0000;letter-spacing:0.03em;">
      REP APPRECIATES YOUR BUSINESS
    </td>
  </tr>

  <!-- Row: ESI-IDs | Broker Name -->
  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>ESI-IDs:</strong> {data.get("esid_count","—")}
    </td>
    <td style="padding:8px 20px;">
      <strong>Broker Name:</strong> {data.get("broker_name","")}
    </td>
  </tr>

  <!-- Tax Exempt -->
  <tr>
    <td colspan="4" style="padding:8px 20px;border-bottom:1px solid #eee;">
      <strong>Tax Exempt:</strong> {"NO" if data.get("tax_exempt","none") == "none"
                                    else data.get("tax_exempt","").title()}
    </td>
  </tr>

  <!-- Type of Contract | Enrollment Type -->
  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Type of Contract:</strong> {str(data.get("type_of_contract","new")).title()}
    </td>
    <td style="padding:8px 20px;">
      <strong>Enrollment Type:</strong> {enrollment_type}
    </td>
  </tr>

  <!-- Start Date -->
  <tr>
    <td colspan="4" style="padding:8px 20px;border-bottom:1px solid #eee;">
      <strong>Start Date:</strong> {start}
    </td>
  </tr>

  <!-- Load Profiles | Paper Bill -->
  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Load Profiles:</strong><br/>
      <span style="font-size:12px;">{profiles_display or "—"}</span>
    </td>
    <td style="padding:8px 20px;">
      <strong>Paper Bill Required:</strong> {yes_no(data.get("paper_bill"))}
    </td>
  </tr>

  <!-- Customer Email -->
  {"<tr><td colspan='4' style='padding:8px 20px;border-top:1px solid #eee;'><strong>Email:</strong> " + data.get("customer_email","") + "</td></tr>" if data.get("customer_email") else ""}

  <!-- Mills (internal note, shown only if present) -->
  {"<tr style='background:#f9f9f9;'><td colspan='4' style='padding:8px 20px;'><strong>" + (company_name or "REP") + " Mills:</strong> " + str(data.get("mill","")) + "</td></tr>" if data.get("mill") else ""}

  <!-- Comments -->
  {"<tr><td colspan='4' style='padding:8px 20px;border-top:1px solid #eee;'><strong>Comments:</strong><br/><span style='font-size:12px;'>" + str(data.get("comment","")) + "</span></td></tr>" if data.get("comment") else ""}

  <!-- Footer -->
  <tr>
    <td colspan="4" style="padding:12px 20px;border-top:2px solid #eee;
        font-size:11px;color:#999;text-align:center;">
      Auto-generated confirmation — {today} — {get_tenant_display_name()}
    </td>
  </tr>

</table>
</body>
</html>
"""


def _build_lmp_confirmation_email_html(data: dict) -> str:
    today = date.today().strftime("%m/%d/%Y")
    yes_no = lambda v: "YES" if v else "NO"
    asap = data.get("asap")
    start = "ASAP" if asap else (data.get("start_date") or "—")

    enrollment_parts = []
    if data.get("switch_flag"):
        enrollment_parts.append("Switch")
    if data.get("pmvi"):
        enrollment_parts.append("PMVI")
    if data.get("mvi"):
        enrollment_parts.append("MVI")
    enrollment_type = ", ".join(enrollment_parts) if enrollment_parts else "—"

    return f"""
<html>
<body style="font-family:Arial,sans-serif;font-size:13px;color:#222;margin:0;padding:0;">
<table width="620" cellpadding="0" cellspacing="0"
       style="margin:30px auto;border:1px solid #ccc;">

  <tr>
    <td colspan="4" style="padding:16px 20px;border-bottom:2px solid #cc0000;">
      <img src="https://ameripowerpricing.com/images/AmeriPower%20new_logo.jpg"
           style="height:50px;vertical-align:middle;" alt="AmeriPower" />
      <span style="float:right;font-size:16px;font-weight:bold;
                   color:#cc0000;line-height:50px;">CONTRACT CONFIRMATION</span>
    </td>
  </tr>

  <tr>
    <td colspan="4" style="padding:10px 20px 4px;">
      <strong>CONTRACT NO:</strong> {data.get("contract_no","")}
      &nbsp;&nbsp;
      <span style="background:#f3e8ff;color:#7c3aed;font-size:11px;
                   padding:2px 8px;border-radius:4px;font-weight:bold;">LMP</span>
    </td>
  </tr>

  <tr>
    <td colspan="4" style="padding:4px 20px 10px;border-bottom:1px solid #eee;">
      <strong>Customer Name:</strong> {data.get("customer_name","")}
    </td>
  </tr>

  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;width:50%;border-right:1px solid #eee;">
      <strong>Contract Received/Signed:</strong> {yes_no(data.get("contract_received"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Term:</strong> Month to Month
    </td>
  </tr>

  <tr>
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Credit Approved:</strong> {yes_no(data.get("credit_status"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Contract Rate ($/kWh):</strong> {data.get("contract_rate_display","—")}
    </td>
  </tr>

  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Executed:</strong> {yes_no(data.get("executed"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Company Quote ($/kWh):</strong> {data.get("ap_quote_display","—")}
    </td>
  </tr>

  <tr>
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Forwarded for Enrollment:</strong> {yes_no(data.get("forwarded"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Commission:</strong> {data.get("commission_display","—")}
    </td>
  </tr>

  <tr>
    <td colspan="4" style="padding:10px 20px;text-align:center;font-weight:bold;
        border-top:1px solid #eee;border-bottom:1px solid #eee;
        color:#cc0000;letter-spacing:0.03em;">
      REP APPRECIATES YOUR BUSINESS
    </td>
  </tr>

  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>ESI-IDs:</strong> {data.get("esid_count","—")}
    </td>
    <td style="padding:8px 20px;">
      <strong>Broker Name:</strong> {data.get("broker_name","")}
    </td>
  </tr>

  <tr>
    <td colspan="4" style="padding:8px 20px;border-bottom:1px solid #eee;">
      <strong>Tax Exempt:</strong> {"NO" if data.get("tax_exempt","none") == "none"
                                    else data.get("tax_exempt","").title()}
    </td>
  </tr>

  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Type of Contract:</strong> {str(data.get("type_of_contract","new")).title()}
    </td>
    <td style="padding:8px 20px;">
      <strong>Enrollment Type:</strong> {enrollment_type}
    </td>
  </tr>

  <tr>
    <td colspan="4" style="padding:8px 20px;border-bottom:1px solid #eee;">
      <strong>Start Date:</strong> {start}
    </td>
  </tr>

  <tr style="background:#f9f9f9;">
    <td style="padding:8px 20px;border-right:1px solid #eee;">
      <strong>Paper Bill Required:</strong> {yes_no(data.get("paper_bill"))}
    </td>
    <td style="padding:8px 20px;">
      <strong>Meter Fees:</strong> {data.get("meter_fees","0")}
    </td>
  </tr>

  {"<tr><td colspan='4' style='padding:8px 20px;border-top:1px solid #eee;'><strong>Email:</strong> " + data.get("customer_email","") + "</td></tr>" if data.get("customer_email") else ""}
  {"<tr><td colspan='4' style='padding:8px 20px;border-top:1px solid #eee;'><strong>Comments:</strong> " + str(data.get("comment","")) + "</td></tr>" if data.get("comment") else ""}

  <tr>
    <td colspan="4" style="padding:12px 20px;border-top:2px solid #eee;
        font-size:11px;color:#999;text-align:center;">
      Auto-generated LMP confirmation — {today} — {get_tenant_display_name()}
    </td>
  </tr>

</table>
</body>
</html>
"""


# ─── Form Options ────────────────────────────────────────────────────────────


@router.get("/form-options")
async def get_form_options(db: AsyncSession = Depends(get_db)):
    """All dropdown data for the confirmation form."""

    # Auto-generate contract number
    res = await db.execute(text("SELECT MAX(contract_no) as mx FROM confirmation_log"))
    row = res.mappings().first()
    contract_no = _generate_contract_no(row["mx"] if row else None)

    # Brokers — include confirmation_email and confirmation_flag
    brokers_res = await db.execute(
        text(
            """
        SELECT sid, broker_code, company_name, broker_name,
               confirmation_email, confirmation_flag,split
        FROM broker_new
        WHERE regular_status != 'inactive'
        ORDER BY company_name
    """
        )
    )
    brokers = [dict(r) for r in brokers_res.mappings()]

    # Deal persons
    users_res = await db.execute(text("SELECT uid, name FROM users ORDER BY name"))
    users = [dict(r) for r in users_res.mappings()]

    return {"contract_no": contract_no, "brokers": brokers, "users": users}


# ─── Preview HTML (no DB write) ──────────────────────────────────────────────


@router.post("/upload-usage-prefill")
async def upload_usage_prefill(
    file: UploadFile = FastAPIFile(...),
    provider: str = "oncor",
    db: AsyncSession = Depends(get_db),
):
    """Parse usage file and return prefill data for confirmation form."""
    contents = await file.read()

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    # Provider column mapping — same as pricing upload
    provider_map = {
        "oncor": {"esid": "ESI ID", "kwh": "Actual KWH", "profile": "Load Profile"},
        "aep": {"esid": "ESI ID", "kwh": "KWH", "profile": "Load Profile"},
        "tnmp": {"esid": "ESI ID", "kwh": "KWH", "profile": "Load Profile"},
        "centerpoint": {"esid": "ESI ID", "kwh": "KWH", "profile": "Load Profile"},
    }
    cols = provider_map.get(provider, provider_map["oncor"])

    # Get profile mappings from DB
    mappings_res = await db.execute(
        text(
            """
    SELECT full_load_profile, short_name
    FROM load_profiles_master
     """
        )
    )
    profile_map = {r[0]: r[1] for r in mappings_res.fetchall()}

    esids = []
    volumes = {}
    total_kwh = 0.0

    for _, row in df.iterrows():
        esid = str(row.get(cols["esid"], "")).strip()
        kwh = row.get(cols["kwh"], 0)
        profile = str(row.get(cols["profile"], "")).strip()

        if not esid or esid.lower() in ("nan", "esi id", ""):
            continue

        if esid not in esids:
            esids.append(esid)

        # Map profile to short name
        short_name = profile_map.get(profile, "")
        if not short_name:
            continue

        try:
            kwh_val = float(kwh)
        except (ValueError, TypeError):
            continue

        volumes[short_name] = volumes.get(short_name, 0) + kwh_val
        total_kwh += kwh_val

    return {
        "esid_count": len(esids),
        "esiids": ", ".join(esids),
        "volumes": volumes,
        "total_volume": total_kwh,
    }


@router.get("/welcome-letter/list")
async def welcome_letter_list(
    search: str = "", page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * limit
    where = "WHERE customer_name LIKE :s OR broker_name LIKE :s" if search else ""
    params = {"limit": limit, "offset": offset, "s": f"%{search}%"}

    rows = await db.execute(
        text(
            f"""
        SELECT sid, date_modified, customer_name, broker_name,
               contract_rate, commission, mill, ap_quote,
               term, start_date, type_of_contract, esid_count,
               meter_fees, comment, sent_by, customer_email, esiid
        FROM confirmation_log {where}
        ORDER BY sid DESC
        LIMIT :limit OFFSET :offset
    """
        ),
        params,
    )
    total_res = await db.execute(
        text(f"SELECT COUNT(*) as cnt FROM confirmation_log {where}"), params
    )
    total = total_res.mappings().first()["cnt"]
    return {"data": [dict(r) for r in rows.mappings()], "total": total}


@router.get("/welcome-letter/prefill/{sid}")
async def welcome_letter_prefill(sid: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        text("SELECT * FROM confirmation_log WHERE sid = :sid"), {"sid": sid}
    )
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return dict(row)


@router.post("/welcome-letter/generate-pdf")
async def generate_welcome_letter_pdf(
    request: Request, db: AsyncSession = Depends(get_db)
):
    payload = await request.json()

    company_name = payload.get("company_name", "")
    sname = payload.get("sname", "")
    caddress1 = payload.get("caddress1", "")
    caddress2 = payload.get("caddress2", "")
    start_date = payload.get("start_date", "")
    term = payload.get("term", "")
    tdsp = payload.get("tdsp", "")
    cur_date = payload.get("cur_date", "")
    esids = payload.get("esids", [])  # list of {esid, service_address, city_state_zip}

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story = []

    header_style = ParagraphStyle(
        "header",
        fontSize=32,
        fontName="Helvetica-Bold",
        spaceAfter=4,
    )
    puct_style = ParagraphStyle(
        "puct",
        fontSize=11,
        fontName="Helvetica",
        spaceAfter=12,
    )
    # Header
    story.append(
        Paragraph(
            '<font color="black">Ameri</font><font color="red">Power</font>',
            header_style,
        )
    )
    story.append(Paragraph("PUCT #10076", puct_style))
    story.append(Spacer(1, 0.2 * inch))

    # Address block
    story.append(Paragraph(f"<b>{company_name}</b>", styles["Normal"]))
    if sname:
        story.append(Paragraph(sname, styles["Normal"]))
    if caddress1:
        story.append(Paragraph(caddress1, styles["Normal"]))
    if caddress2:
        story.append(Paragraph(caddress2, styles["Normal"]))
    story.append(Spacer(1, 0.15 * inch))

    story.append(
        Paragraph(
            f"RE: Welcome Letter&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{cur_date}",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Dear Customer,", styles["Normal"]))
    story.append(Spacer(1, 0.1 * inch))

    # Fallback template data — replace with per-tenant custom template when that feature is built.
    _name    = get_tenant_display_name()
    _website = get_tenant_website()
    _address = get_tenant_address()
    _phone   = get_tenant_phone()

    story.append(
        Paragraph(
            f"Thank you for choosing {_name} as your new provider for electricity!",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            f"At {_name}, we pride ourselves on offering our customers responsive, competent and excellent service. "
            "Our customers are the most important part of our business, and we work tirelessly to ensure your complete "
            "satisfaction, now and for as long as you are a customer.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            "Be rest assured that at this point we have received and approved your contract and your account will be "
            "switched on the start date for the term agreed per-contract. Contract details are specified below. "
            "Nothing else needs to be done on your part at this point.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))

    # Contract details table
    contract_table = Table(
        [
            ["Contract Start", start_date],
            ["Term of Contract (Months)", str(term)],
            ["Your Utility", tdsp],
            ["Commodity", "Electricity"],
        ],
        colWidths=[3 * inch, 2 * inch],
    )
    contract_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(contract_table)
    story.append(Spacer(1, 0.15 * inch))

    _ops_email = get_tenant_email("operations")
    story.append(
        Paragraph(
            f"If you have any questions regarding your account please feel free to contact your agent or our customer "
            f"service department at <a href='mailto:{_ops_email}'>{_ops_email}</a> or call "
            f"us at {_phone}.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            f"<a href='http://{_website}'>{_website}</a>",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Sincerely,", styles["Normal"]))
    story.append(Paragraph(f"{_name} Operations Team", styles["Normal"]))
    story.append(Paragraph(f"Phone {_phone} | Fax 281 240 0455", styles["Normal"]))
    story.append(Paragraph(_ops_email, styles["Normal"]))
    story.append(Paragraph(_address, styles["Normal"]))

    # ESI IDs table if present
    if esids:
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("<b>Account Details</b>", styles["Normal"]))
        story.append(Spacer(1, 0.1 * inch))
        esid_data = [["#", "ESI ID", "Service Address", "City/State/Zip"]]
        for i, e in enumerate(esids, 1):
            esid_data.append(
                [
                    str(i),
                    e.get("esid", ""),
                    e.get("service_address", ""),
                    e.get("city_state_zip", ""),
                ]
            )
        esid_table = Table(
            esid_data, colWidths=[0.4 * inch, 2 * inch, 2.5 * inch, 2 * inch]
        )
        esid_table.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1, colors.black),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(esid_table)

    doc.build(story)
    buffer.seek(0)

    # Log to wel_letter_log
    await db.execute(
        text(
            """
        INSERT INTO wel_letter_log
        (company_name, email, sname, caddress1, caddress2, tdsp,
         start_date, term, cur_date, sent_by)
        VALUES (:cn, :em, :sn, :a1, :a2, :tdsp, :sd, :term, :cd, :sb)
    """
        ),
        {
            "cn": company_name,
            "em": payload.get("email", ""),
            "sn": sname,
            "a1": caddress1,
            "a2": caddress2,
            "tdsp": tdsp,
            "sd": start_date,
            "term": term,
            "cd": cur_date,
            "sb": payload.get("sent_by", ""),
        },
    )
    await db.commit()

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Welcome_Letter_{company_name}.pdf"
        },
    )


@router.post("/welcome-letter/send-email")
async def send_welcome_letter_email(
    request: Request, db: AsyncSession = Depends(get_db)
):
    payload = await request.json()
    company_name = payload.get("company_name", "")
    to_emails = [
        e.strip()
        for e in payload.get("email", "").replace(";", ",").split(",")
        if e.strip()
    ]

    if not to_emails:
        raise HTTPException(status_code=400, detail="No email address provided")

    # Generate PDF directly into buffer
    buffer = io.BytesIO()
    _build_welcome_pdf(payload, buffer)
    pdf_bytes = buffer.getvalue()

    # Fallback template data — replace with per-tenant custom template when that feature is built.
    _name  = get_tenant_display_name()
    _phone = get_tenant_phone()

    html = f"""<html><body style="font-family:Arial;font-size:14px;">
    <p>Dear <b>{company_name}</b>,</p>
    <p>Thank you for choosing {_name} as your new provider for electricity!</p>
    <p>Please find your welcome letter attached.</p>
    <p><b>Contract Start:</b> {payload.get('start_date','')}<br/>
       <b>Term:</b> {payload.get('term','')} months</p>
    <p>Questions? Contact us at {get_tenant_email("operations")} or {_phone}.</p>
    <p>Sincerely,<br/>{_name} Operations Team</p>
    </body></html>"""

    msg = MIMEMultipart("mixed")
    msg["Subject"] = f"Welcome to {_name} — {company_name}"
    _from_addr = get_tenant_email("operations")
    _display = os.getenv("TENANT_COMPANY_NAME", "")
    msg["From"] = f"{_display} <{_from_addr}>" if _display else _from_addr
    msg["To"] = ", ".join(to_emails)
    msg.attach(MIMEText(html, "html"))

    # Attach PDF
    part = MIMEBase("application", "octet-stream")
    part.set_payload(pdf_bytes)
    email_encoders.encode_base64(part)
    part.add_header(
        "Content-Disposition",
        f'attachment; filename="Welcome_Letter_{company_name}.pdf"',
    )
    msg.attach(part)

    with smtplib.SMTP_SSL(
        os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT"))
    ) as server:
        server.login(os.getenv("SMTP_USER", ""), os.getenv("SMTP_PASS", ""))
        server.sendmail(_from_addr, to_emails, msg.as_string())

    # Log
    await db.execute(
        text(
            """
        INSERT INTO wel_letter_log
        (company_name, email, sname, caddress1, caddress2, tdsp,
         start_date, term, cur_date, sent_by)
        VALUES (:cn,:em,:sn,:a1,:a2,:tdsp,:sd,:term,:cd,:sb)
    """
        ),
        {
            "cn": company_name,
            "em": payload.get("email", ""),
            "sn": payload.get("sname", ""),
            "a1": payload.get("caddress1", ""),
            "a2": payload.get("caddress2", ""),
            "tdsp": payload.get("tdsp", ""),
            "sd": payload.get("start_date", ""),
            "term": payload.get("term", ""),
            "cd": payload.get("cur_date", ""),
            "sb": payload.get("sent_by", ""),
        },
    )
    await db.commit()
    print("DEBUG pdf_bytes length:", len(pdf_bytes))
    return {"status": "sent", "to": to_emails}


def _build_welcome_pdf(payload: dict, buffer: io.BytesIO):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )
    from reportlab.lib import colors

    company_name = payload.get("company_name", "")
    sname = payload.get("sname", "")
    caddress1 = payload.get("caddress1", "")
    caddress2 = payload.get("caddress2", "")
    start_date = payload.get("start_date", "")
    term = payload.get("term", "")
    tdsp = payload.get("tdsp", "")
    cur_date = payload.get("cur_date", "")
    esids = payload.get("esids", [])

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story = []

    story.append(
        Paragraph(
            "<b><font size=28>Ameri<font color='red'>Power</font></font></b>",
            styles["Normal"],
        )
    )
    story.append(Paragraph("PUCT #10076", styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(f"<b>{company_name}</b>", styles["Normal"]))
    if sname:
        story.append(Paragraph(sname, styles["Normal"]))
    if caddress1:
        story.append(Paragraph(caddress1, styles["Normal"]))
    if caddress2:
        story.append(Paragraph(caddress2, styles["Normal"]))
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            f"RE: Welcome Letter&nbsp;&nbsp;&nbsp;&nbsp;{cur_date}", styles["Normal"]
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Dear Customer,", styles["Normal"]))
    story.append(Spacer(1, 0.1 * inch))

    # Fallback template data — replace with per-tenant custom template when that feature is built.
    _name    = get_tenant_display_name()
    _address = get_tenant_address()
    _phone   = get_tenant_phone()

    story.append(
        Paragraph(
            f"Thank you for choosing {_name} as your new provider for electricity! "
            f"At {_name}, we pride ourselves on offering our customers responsive, competent and excellent service.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(
            "Be rest assured that at this point we have received and approved your contract and your account will be "
            "switched on the start date for the term agreed per-contract. Nothing else needs to be done on your part.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))

    t = Table(
        [
            ["Contract Start", start_date],
            ["Term of Contract (Months)", str(term)],
            ["Your Utility", tdsp],
            ["Commodity", "Electricity"],
        ],
        colWidths=[3 * inch, 2 * inch],
    )
    t.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            f"Questions? Contact us at {get_tenant_email('operations')} or {_phone}.",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Sincerely,", styles["Normal"]))
    story.append(Paragraph(f"{_name} Operations Team", styles["Normal"]))
    story.append(Paragraph(_address, styles["Normal"]))

    if esids:
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("<b>Account Details</b>", styles["Normal"]))
        story.append(Spacer(1, 0.1 * inch))
        data = [["#", "ESI ID", "Service Address", "City/State/Zip"]]
        for i, e in enumerate(esids, 1):
            data.append(
                [
                    str(i),
                    e.get("esid", ""),
                    e.get("service_address", ""),
                    e.get("city_state_zip", ""),
                ]
            )
        et = Table(data, colWidths=[0.4 * inch, 2 * inch, 2.5 * inch, 2 * inch])
        et.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1, colors.black),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(et)

    doc.build(story)


@router.post("/welcome-letter/generate-pdf")
async def generate_welcome_letter_pdf(
    request: Request, db: AsyncSession = Depends(get_db)
):
    payload = await request.json()
    buffer = io.BytesIO()
    _build_welcome_pdf(payload, buffer)
    buffer.seek(0)

    company_name = payload.get("company_name", "")
    await db.execute(
        text(
            """
        INSERT INTO wel_letter_log
        (company_name, email, sname, caddress1, caddress2, tdsp,
         start_date, term, cur_date, sent_by)
        VALUES (:cn,:em,:sn,:a1,:a2,:tdsp,:sd,:term,:cd,:sb)
    """
        ),
        {
            "cn": company_name,
            "em": payload.get("email", ""),
            "sn": payload.get("sname", ""),
            "a1": payload.get("caddress1", ""),
            "a2": payload.get("caddress2", ""),
            "tdsp": payload.get("tdsp", ""),
            "sd": payload.get("start_date", ""),
            "term": payload.get("term", ""),
            "cd": payload.get("cur_date", ""),
            "sb": payload.get("sent_by", ""),
        },
    )
    await db.commit()

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Welcome_Letter_{company_name}.pdf"'
        },
    )


@router.post("/preview-html")
async def preview_html_from_payload(
    request: Request, db: AsyncSession = Depends(get_db)
):
    payload = await request.json()
    print("RAW term from payload:", payload.get("term"), type(payload.get("term")))
    print("DEBUG ap_quote:", payload.get("ap_quote"))
    print("DEBUG volumes:", payload.get("volumes"))
    print("DEBUG start_date:", payload.get("start_date"))
    print("DEBUG term:", payload.get("term"))

    # Auto-calculate company quote if blank and profiles+start_date present
    if not payload.get("ap_quote"):
        try:
            import json

            volumes = json.loads(payload.get("volumes", "{}") or "{}")
            profiles = {k: float(v) for k, v in volumes.items() if v}
            start_date = payload.get("start_date") or ""
            term = payload.get("term")

            if profiles and start_date and term:
                prior_day = bool(payload.get("prior_day"))
                results = await calculate_custom_price(
                    0, start_date, [int(term)], profiles, db, prior_day=prior_day
                )
                print("DEBUG term value:", term, type(term))
                print("DEBUG int term:", int(term))
                print("DEBUG results:", results)
                print("DEBUG profiles passed:", profiles)
                print("DEBUG start_date passed:", start_date)
                if results and results[0].get("custom_price"):
                    # Returns in $/kWh — convert to ¢/kWh for storage
                    payload["ap_quote"] = str(
                        round(float(results[0]["custom_price"]), 6)
                    )
        except Exception as e:
            print(f"Auto-calculate skipped: {e}")

    html = _build_confirmation_email_html(payload, os.getenv("TENANT_COMPANY_NAME", ""))
    return {"html": html, "ap_quote": payload.get("ap_quote", "")}


# ─── Send Email (save + send) ────────────────────────────────────────────────


@router.post("/send-email")
async def send_confirmation_email(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.json()
    try:
        fields = {
            "contract_no": payload.get("contract_no"),
            "type_of_contract": payload.get("type_of_contract", "now"),
            "customer_name": payload.get("customer_name", ""),
            "broker_code": payload.get("broker_code", ""),
            "broker_name": payload.get("broker_name", ""),
            "term": payload.get("term", ""),
            "esiid": payload.get("esiid", ""),
            "esid_count": payload.get("esid_count", ""),
            "contract_rate": payload.get("contract_rate", ""),
            "mill": payload.get("mill", "0"),
            "comment": payload.get("comment", ""),
            "comment_mail": payload.get("comment_mail", ""),
            "comment_enrollment": payload.get("comment_enrollment", ""),
            "start_date": payload.get("start_date", ""),
            "ap_quote": payload.get("ap_quote", ""),
            "customer_email": payload.get("customer_email", ""),
            "tax_exempt": payload.get("tax_exempt", ""),
            "meter_fees": payload.get("meter_fees", "0"),
            "lmp": 1 if payload.get("lmp") else 0,
            "sent_by": payload.get("sent_by", ""),
            "date_modified": date.today().strftime("%m/%d/%y"),
            "volumes": payload.get("volumes", ""),
            "total_volume": payload.get("total_volume", ""),
            "commission": payload.get("commission", ""),
            "custom_sid": payload.get("custom_sid", "0"),
            "bne_sid": payload.get("bne_sid", "0"),
            "enroll_check": 0,
            "compare_check": 0,
        }

        result_sid = None
        sid = payload.get("sid")
        if sid and str(sid) not in ("undefined", "null", ""):
            # UPDATE existing
            set_clause = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(
                text(f"UPDATE confirmation_log SET {set_clause} WHERE sid = :sid"),
                {**fields, "sid": sid},
            )
            await db.commit()
            result_sid = int(sid)
        else:
            # INSERT new
            cols = ", ".join(fields.keys())
            vals = ", ".join(f":{k}" for k in fields)
            result = await db.execute(
                text(f"INSERT INTO confirmation_log ({cols}) VALUES ({vals})"), fields
            )
            await db.commit()
            result_sid = result.lastrowid
        sid = result_sid
        if sid is None:
            raise HTTPException(
                status_code=500, detail="Failed to save confirmation record"
            )

        await db.execute(
            text(
                """
            INSERT INTO confirmation_audit_log (sid, contract_no, action, action_by)
            VALUES (:sid, :cn, 'created', :by)
        """
            ),
            {"sid": sid, "cn": fields["contract_no"], "by": fields["sent_by"]},
        )
        await db.commit()

        print("DEBUG send_to_email:", payload.get("send_to_email"))
        print("DEBUG broker_code:", payload.get("broker_code"))
        to_email = [
            e.strip()
            for e in payload.get("send_to_email", "").replace(";", ",").split(",")
            if e.strip()
        ]
        if not to_email:
            return {
                "sid": sid,
                "status": "saved_no_email",
                "message": "Record saved. No recipient email.",
            }

        html = _build_confirmation_email_html(payload, os.getenv("TENANT_COMPANY_NAME", ""))
        msg = MIMEMultipart("alternative")
        msg["Subject"] = (
            f"Confirmation – {payload.get('customer_name','')} – #{payload.get('contract_no','')}"
        )
        _from_addr2 = get_tenant_email("operations")
        _display2 = os.getenv("TENANT_COMPANY_NAME", "")
        msg["From"] = f"{_display2} <{_from_addr2}>" if _display2 else _from_addr2
        msg["To"] = ", ".join(to_email)
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL(
            os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT"))
        ) as server:
            server.login(os.getenv("SMTP_USER", ""), os.getenv("SMTP_PASS", ""))
            server.sendmail(_from_addr2, to_email, msg.as_string())

        await db.execute(
            text(
                """
            INSERT INTO confirmation_audit_log (sid, contract_no, action, action_by)
            VALUES (:sid, :cn, 'sent', :by)
        """
            ),
            {"sid": sid, "cn": fields["contract_no"], "by": fields["sent_by"]},
        )
        await db.commit()

        return {"sid": sid, "status": "sent", "to": to_email}

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── List / Get / Delete ─────────────────────────────────────────────────────


@router.get("/list")
async def list_confirmations(
    page: int = 1, limit: int = 50, search: str = "", db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * limit
    where = (
        "WHERE customer_name LIKE :s OR contract_no LIKE :s OR broker_code LIKE :s"
        if search
        else ""
    )
    params = {"limit": limit, "offset": offset, "s": f"%{search}%"}

    rows = await db.execute(
        text(
            f"""
        SELECT sid, contract_no, customer_name, broker_code, broker_name,
               term, start_date, contract_rate, ap_quote, type_of_contract,
               lmp, sent_by, date_modified
        FROM confirmation_log {where}
        ORDER BY sid DESC
        LIMIT :limit OFFSET :offset
    """
        ),
        params,
    )

    total_res = await db.execute(
        text(f"SELECT COUNT(*) as cnt FROM confirmation_log {where}"), params
    )
    total = total_res.mappings().first()["cnt"]
    return {"data": [dict(r) for r in rows.mappings()], "total": total, "page": page}


@router.get("/user-log/list")
async def get_audit_log(
    page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * limit
    rows = await db.execute(
        text(
            """
        SELECT l.*, u.name as user_name
        FROM confirmation_audit_log l
        LEFT JOIN users u ON u.uid = l.action_by
        ORDER BY l.log_id DESC
        LIMIT :limit OFFSET :offset
    """
        ),
        {"limit": limit, "offset": offset},
    )
    total = (
        (await db.execute(text("SELECT COUNT(*) as cnt FROM confirmation_audit_log")))
        .mappings()
        .first()["cnt"]
    )
    return {"data": [dict(r) for r in rows.mappings()], "total": total}


@router.get("/future")
async def get_future_contracts(search: str = "", db: AsyncSession = Depends(get_db)):
    today = date.today().strftime("%Y-%m-%d")
    where = "WHERE start_date > :today"
    params: dict = {"today": today}
    if search:
        where += (
            " AND (customer_name LIKE :s OR broker_name LIKE :s OR contract_no LIKE :s)"
        )
        params["s"] = f"%{search}%"
    rows = await db.execute(
        text(
            f"""
            SELECT sid, contract_no, customer_name, broker_code, broker_name,
                   term, start_date, contract_rate, ap_quote, type_of_contract,
                   esid_count, sent_by
            FROM confirmation_log {where}
            ORDER BY start_date ASC
        """
        ),
        params,
    )
    return [dict(r) for r in rows.mappings()]


@router.get("/renewal-search")
async def renewal_search(q: str = "", db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        text(
            """
        SELECT 
            r.serial, 
            r.company_name, 
            r.broker_code,
            r.premise_id,
            r.contract_end_date,
            r.load_profile,
            b.company_name as broker_name,
            b.confirmation_email,
            b.split
        FROM contract_renewal r
        LEFT JOIN broker_new b ON b.broker_code = r.broker_code
        WHERE r.company_name LIKE :q 
           OR r.premise_id LIKE :q
        ORDER BY r.contract_end_date ASC
        LIMIT 50
        """
        ),
        {"q": f"%{q}%"},
    )
    rows = [dict(r) for r in res.mappings()]

    for row in rows:
        # Map the DB columns to the keys the frontend expects
        row["esids"] = [
            {
                "esid": row["premise_id"],
                "end_date": row["contract_end_date"],
                "profile_key": row["load_profile"],
            }
        ]
        row["earliest_end_date"] = row["contract_end_date"]

        # Keep 'id' for the frontend as a fallback
        row["id"] = row["serial"]

    return rows


@router.post("/preview-lmp-html")
async def preview_lmp_html(request: Request):
    payload = await request.json()

    try:
        cr = float(payload.get("contract_rate", 0)) * 10  # cents → mills
        aq = float(payload.get("ap_quote", 0)) * 10  # cents → mills
        split_val = payload.get("broker_split")
        ameri = float(payload.get("mill") or 0) * 10

        broker_mills = cr - aq

        if split_val:
            split_threshold = float(split_val)
            if broker_mills > split_threshold:
                excess = broker_mills - split_threshold
                company_keeps = excess / 2
                aq = round(aq + company_keeps + ameri, 4)
            else:
                aq = round(aq + ameri, 4)
        else:
            aq = round(aq + ameri, 4)

        commission = round(cr - aq, 4)
        cr_display = f"LMP + {cr/1000:.3f}"
        aq_display = f"LMP + {aq/1000:.3f}"
        cm_display = f"{commission:.1f} mills ({commission/1000:.4f} $/kWh)"
    except (TypeError, ValueError):
        cr_display = "—"
        aq_display = "—"
        cm_display = "—"
    print("DEBUG LMP contract_rate:", payload.get("contract_rate"))
    print("DEBUG LMP ap_quote:", payload.get("ap_quote"))
    print("DEBUG LMP broker_split:", payload.get("broker_split"))
    print("DEBUG LMP mill:", payload.get("mill"))

    # Override ap_quote/contract_rate display for LMP format
    lmp_payload = {
        **payload,
        "contract_rate_display": cr_display,
        "ap_quote_display": aq_display,
        "commission_display": cm_display,
        "is_lmp": True,
    }
    html = _build_lmp_confirmation_email_html(lmp_payload)
    return {"html": html}


@router.get("/{sid}")
async def get_confirmation(sid: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        text("SELECT * FROM confirmation_log WHERE sid = :sid"), {"sid": sid}
    )
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return dict(row)


@router.delete("/{sid}")
async def delete_confirmation(
    sid: int, deleted_by: str = "", db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        text("SELECT contract_no FROM confirmation_log WHERE sid = :sid"), {"sid": sid}
    )
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    await db.execute(
        text("DELETE FROM confirmation_log WHERE sid = :sid"), {"sid": sid}
    )
    await db.execute(
        text(
            """
        INSERT INTO confirmation_audit_log (sid, contract_no, action, action_by)
        VALUES (:sid, :cn, 'deleted', :by)
    """
        ),
        {"sid": sid, "cn": row["contract_no"], "by": deleted_by},
    )
    await db.commit()
    return {"status": "deleted"}


@router.get("/prefill-custom/{cid}")
async def prefill_from_custom(cid: int, db: AsyncSession = Depends(get_db)):
    """Fetch customer data from customers_new for confirmation pre-fill."""
    # Get customer
    res = await db.execute(
        text("SELECT * FROM customers_new WHERE id = :id"), {"id": cid}
    )
    customer = res.mappings().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer = dict(customer)

    # Get broker
    broker_res = await db.execute(
        text(
            "SELECT company_name, confirmation_email, split FROM broker_new WHERE broker_code = :bc"
        ),
        {"bc": customer["broker_code"]},
    )
    broker = broker_res.mappings().first()
    broker = dict(broker) if broker else {}

    # Get profiles and volumes from customer_usage
    usage_res = await db.execute(
        text(
            """
        SELECT profile_key, SUM(total_kwh) as total_kwh
        FROM customer_usage
        WHERE customer_id = :id
        GROUP BY profile_key
    """
        ),
        {"id": cid},
    )
    usage_rows = [dict(r) for r in usage_res.mappings()]

    profiles = {r["profile_key"]: float(r["total_kwh"]) for r in usage_rows}
    total_volume = sum(profiles.values())

    # Get individual ESIIDs
    esid_res = await db.execute(
        text(
            """
        SELECT DISTINCT esid FROM customer_usage
        WHERE customer_id = :id AND esid IS NOT NULL AND esid != ''
    """
        ),
        {"id": cid},
    )
    esids = [r[0] for r in esid_res.fetchall()]

    return {
        "customer_name": customer.get("company_name", ""),
        "broker_code": customer.get("broker_code", ""),
        "broker_name": broker.get("company_name", ""),
        "confirmation_email": broker.get("confirmation_email", ""),
        "broker_split": broker.get("split", ""),
        "esid_count": customer.get("num_esids") or len(esids),
        "esiid": ", ".join(esids) if esids else customer.get("esid", ""),
        "customer_email": customer.get("contact_email", ""),
        "mill": str(customer.get("mills", "")),
        "start_date": str(customer.get("contract_start_date", "")),
        "volumes": profiles,
        "total_volume": total_volume,
    }
