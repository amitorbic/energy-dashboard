from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from utils.renewal_rules import resolve_renewal_start_date, resolve_be_start_date, fetch_active_contract
from middleware.auth import require_auth
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, timedelta
import io
import openpyxl

router = APIRouter(prefix="/enrollment-engine", tags=["enrollment-engine"])

# ── Plan code lookup ──────────────────────────────────────────────────────────

_PR_LMP0 = {
    "0.00": "PR1503060001",  "2.99": "PR1503090001",
    "3.99": "PR1504230001",  "4.95": "PR1506170002",
    "4.99": "PR1503090002",  "5.00": "PR1503060003",
    "5.95": "PR1506170001",  "5.99": "PR1503050002",
    "6.95": "PR1509030001",  "7.95": "PR1503120001",
    "7.99": "PR1503060002",  "9.99": "PR1509030001",
    "10.00": "PR1503050003",
}
_PR_LMP1 = {"10.00": "PR1503050004"}
_PR_LMP2 = {"10.00": "PR1503050005"}


def _clean_fee(meter_fees) -> str:
    if not meter_fees:
        return "0.00"
    try:
        val = Decimal(str(meter_fees).replace("$", "").strip())
        return f"{val:.2f}"
    except (InvalidOperation, ValueError):
        return "0.00"


def _fee_to_pr(meter_fees, lmp) -> str:
    fee = _clean_fee(meter_fees)
    lmp_int = int(lmp or 0)
    if lmp_int == 1:
        return _PR_LMP1.get(fee, "")
    if lmp_int == 2:
        return _PR_LMP2.get(fee, "")
    return _PR_LMP0.get(fee, "")


# ── Start-date-type / MassRoll code resolution ────────────────────────────────

# TDSP duns -> (tdsp_name, priority_code) for Priority Move-In. Priority codes
# come from the "Priority Codes" reference tab in a real 2013 MassRoll
# workbook; duns values cross-checked against esi_id_master's dominant duns
# per ESI ID prefix (2026-09-21) -- 1044-prefixed ESIDs resolve to duns
# 1039940674000, matching the Oncor duns already used in migration 040.
_TDSP_BY_DUNS = {
    "957877905":     ("CenterPoint Energy", "02"),
    "007929441":     ("TNMP", "02"),
    "1039940674000": ("Oncor", "03"),
    "007924772":     ("AEP Texas Central", "99"),
    "007923311":     ("AEP Texas North", "99"),
    "026763672":     ("Sharyland", "99"),
}


def _resolve_enrol_type(rec: dict) -> str:
    """'M' (Move-In) for mvi/pmvi records, 'S' (Switch) otherwise -- confirmed
    against the reference MassRoll workbook: enrol_type is only ever S or M,
    and priority_code (not enrol_type) is what distinguishes a plain Move-In
    from a Priority Move-In."""
    return "M" if (rec.get("mvi") or rec.get("pmvi")) else "S"


def _is_business_day(d: date) -> bool:
    return d.weekday() < 5


def _add_business_days(start: date, n: int) -> date:
    d = start
    added = 0
    while added < n:
        d += timedelta(days=1)
        if _is_business_day(d):
            added += 1
    return d


def _validate_switch_date(rec: dict, effective_d: Optional[date], today: date) -> Optional[str]:
    """Self Selected Switch dates (a specific date the customer/broker chose,
    as opposed to ASAP, Meter Read, or Move-In) must land on a business day
    and be at least 3 business days out, per the reference MassRoll
    workbook's "Enrollments Guide" tab and docs/ENROLLMENT_RULES.md. ASAP,
    Meter Read, and Move-In records aren't a customer-picked calendar date
    and are exempt."""
    if _resolve_enrol_type(rec) != "S" or rec.get("asap") or rec.get("meter_read"):
        return None
    if not effective_d:
        return None
    if not _is_business_day(effective_d):
        return f"Self-selected switch date {effective_d.isoformat()} is not a business day"
    earliest = _add_business_days(today, 3)
    if effective_d < earliest:
        return (
            f"Self-selected switch date {effective_d.isoformat()} is less than"
            f" 3 business days out (earliest allowed: {earliest.isoformat()})"
        )
    return None


async def _fetch_esi_meta(db: AsyncSession, esi_ids: list) -> dict:
    """Batch-fetch duns + meter_read_cycle for a set of ESI IDs."""
    ids = tuple({e for e in esi_ids if e})
    if not ids:
        return {}
    result = await db.execute(
        text("SELECT esi_id, duns, meter_read_cycle FROM esi_id_master WHERE esi_id IN :ids"),
        {"ids": ids},
    )
    return {r[0]: {"duns": r[1], "meter_read_cycle": r[2]} for r in result.fetchall()}


async def _next_meter_read_date(db: AsyncSession, duns, cycle, after: date) -> Optional[date]:
    if not duns or not cycle:
        return None
    result = await db.execute(
        text(
            "SELECT read_date FROM tdsp_meter_read_calendar"
            " WHERE tdsp_duns = :duns AND bill_cycle = :cycle AND read_date >= :after"
            " ORDER BY read_date ASC LIMIT 1"
        ),
        {"duns": duns, "cycle": cycle, "after": after},
    )
    row = result.fetchone()
    return row[0] if row else None


async def _resolve_effective_dates(db: AsyncSession, records: list) -> None:
    """Mutates each record in place: resolves the effective start date (Meter
    Read Date lookup when the meter_read flag is set), and attaches
    _duns / _priority_code / _effective_date for downstream use. ASAP is
    already resolved to today's date at form-submit time
    (app/pages/contracts/send.tsx buildPayload), so no ASAP handling is
    needed here."""
    esi_meta = await _fetch_esi_meta(db, [r.get("esiid") for r in records])
    today = date.today()

    for rec in records:
        meta = esi_meta.get(rec.get("esiid") or "", {})
        duns = meta.get("duns")
        rec["_duns"] = duns
        if rec.get("pmvi") and duns in _TDSP_BY_DUNS:
            rec["_priority_code"] = _TDSP_BY_DUNS[duns][1]

        raw = _parse_enrollment_date(rec.get("start_date"))
        raw_d = datetime.strptime(raw, "%Y-%m-%d").date() if raw else None
        effective_d = raw_d

        if rec.get("meter_read"):
            resolved = await _next_meter_read_date(db, duns, meta.get("meter_read_cycle"), today)
            if resolved:
                effective_d = resolved
                rec["start_date"] = resolved.isoformat()
                rec["_date_note"] = f"Meter Read Date resolved to {resolved.isoformat()}"
            else:
                rec["_date_note"] = (
                    "Meter Read Date requested but no TDSP calendar match found"
                    " -- using submitted date"
                )

        rec["_effective_date"] = effective_d
        rec["_date_error"] = _validate_switch_date(rec, effective_d, today)


def _parse_enrollment_date(d) -> Optional[str]:
    """Convert MM/DD/YYYY or YYYY-MM-DD to YYYY-MM-DD for MySQL DATE."""
    if not d:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(d).strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


# ── MasterRoll 2016 column layout (128 cols, A–DX) ───────────────────────────

_HEADERS = [
    "Batch_No", "Batch_File_Name", "Source", "source_line", "ENROLL_SERIAL_NO",
    "Sic_Code", "Cust_Class", "Referred_Code", "Referred_Cust_ID", "Credit_Rate2",
    "Credit_Score", "Credit_Score_Source", "Credit_Score_Date", "Cust_Type",
    "Master_Id", "Master_Ref", "Agent_Code", "Premise_ID", "Plan_Group",
    "Request_Date", "Enrol_Type", "Offcycle_Switch_Date", "Company_Name",
    "Cust_Firstname", "Cust_Lastname", "Cust_Mi", "SSN", "Phone1",
    "Cm_Address1", "Cm_Address2", "Cm_Address3", "Cm_City", "Cm_State", "Cm_Zip",
    "Phone2", "Email_Address", "Contact1", "Contact2", "Account_Rep",
    "Life_Support", "waiver_notice", "cust_status", "plan_id1", "plan_id2",
    "plan_id3", "cust_ref_id", "billto_cust_id", "lock_box", "pay_term",
    "cust_bill_type", "cust_bill_mode",
    "tax_exempt1", "tax_exempt2", "tax_exempt3", "tax_exempt4",
    "tax_exempt5", "tax_exempt6", "tax_exempt7", "tax_exempt8",
    "credit_id", "edi_bill_presenter", "deposit_plan", "deposit_amount",
    "deposit_pay_type", "deposit_aba_nbr", "deposit_account_no", "deposit_cc_no",
    "deposit_expiry_YYYY", "deposit_expiry_MM", "deposit_security_code",
    "deposit_pay_amount", "Deposit_charge", "deposit_acct_type", "deposit_card_type",
    "plan_id_t1", "plan_id_t1_rate", "plan_id_t1_rateper",
    "plan_id_t2", "plan_id_t2_rate", "plan_id_t2_rateper",
    "plan_id_t3", "plan_id_t3_rate", "plan_id_t3_rateper",
    "use_data_from_file",
    "pm_address1", "pm_address2", "pm_city", "pm_state", "pm_zip",
    "pm_county", "pm_country", "pm_duns", "pm_meter", "pm_multiplier",
    "priority_code", "multi_plan", "multi_plan_rate", "spouse_email", "cust_fax1",
    "use_cust_id", "promo_code", "cust_coments",
    "contract_ind", "contract_no", "master_contract_no",
    "contract_date", "contract_start_date", "contract_end_date", "contract_term",
    "contract_type", "calc_method", "sys_charge_code_st", "rate_type",
    "contract_rate", "adder1_rate", "adder2_rate", "agent_duns",
    "flat_chg_amt", "trueup_term", "agent_commission_rate", "contract_comments",
    "mcp_multiplier", "fixed_rate_factor", "default_contract_id",
    "enroll_product", "flow_status", "current_rate", "current_rate_json",
]

_COL = {
    "batch_no":        1,
    "batch_file_name": 2,
    "source":          3,
    "serial_no":       5,
    "agent_code":      17,
    "premise_id":      18,
    "plan_group":      19,
    "request_date":    20,
    "enrol_type":      21,
    "offcycle_switch": 22,
    "priority_code":   95,
    "company_name":    23,
    "cust_firstname":  24,
    "cust_lastname":   25,
    "cm_address2":     30,
    "cm_city":         32,
    "cm_state":        33,
    "cm_zip":          34,
    "email_address":   36,
    "life_support":    40,
    "waiver_notice":   41,
    "cust_status":     42,
    "plan_id1":        43,
    "cust_ref_id":     46,
    "billto_cust_id":  47,
    "cust_bill_mode":  51,
    "contract_ind":   103,
    "contract_no":    104,
    "contract_date":  106,
    "contract_start": 107,
    "contract_term":  109,
    "contract_type":  110,
    "agent_comm":     120,
    "enroll_product": 125,
    "flow_status":    126,
    "current_rate":   127,
    "contract_rate":  114,
}


def _build_row(rec: dict, batch_no: int, serial: int) -> list:
    row = [""] * 128

    try:
        rate = round(float(str(rec.get("contract_rate") or "0")) / 100, 6)
    except (ValueError, TypeError):
        rate = ""

    plan_group = rec.get("plan_group") or "C1"

    row[_COL["batch_no"] - 1]        = f"B{batch_no}"
    row[_COL["batch_file_name"] - 1] = "X2"
    row[_COL["source"] - 1]          = "BATCH"
    row[_COL["serial_no"] - 1]       = serial
    row[_COL["agent_code"] - 1]      = rec.get("broker_code") or ""
    row[_COL["premise_id"] - 1]      = rec.get("esiid") or ""
    row[_COL["plan_group"] - 1]      = plan_group
    row[_COL["request_date"] - 1]    = rec.get("start_date") or ""

    enrol_type = _resolve_enrol_type(rec)
    row[_COL["enrol_type"] - 1]      = enrol_type
    # Offcycle_Switch_Date is only for a self-selected-date Switch (a fee
    # applies); left blank for ASAP "standard" switches and for Move-Ins,
    # per the reference MassRoll workbook (massroll2012 tab, batch B3354).
    if enrol_type == "S" and not rec.get("asap"):
        row[_COL["offcycle_switch"] - 1] = rec.get("start_date") or ""
    if rec.get("pmvi") and rec.get("_priority_code"):
        row[_COL["priority_code"] - 1] = rec["_priority_code"]

    row[_COL["company_name"] - 1]    = rec.get("customer_name") or ""
    row[_COL["cust_firstname"] - 1]  = rec.get("cust_first_name") or ""
    row[_COL["cust_lastname"] - 1]   = rec.get("cust_last_name") or ""
    # Street address goes in cm_address2 (cm_address1 left blank), matching
    # the reference MassRoll workbook's real submitted rows.
    row[_COL["cm_address2"] - 1]     = rec.get("billing_address") or ""
    row[_COL["cm_city"] - 1]         = rec.get("billing_city") or ""
    row[_COL["cm_state"] - 1]        = rec.get("billing_state") or ""
    row[_COL["cm_zip"] - 1]          = rec.get("billing_zip") or ""
    row[_COL["email_address"] - 1]   = rec.get("customer_email") or ""
    row[_COL["life_support"] - 1]    = "N"
    row[_COL["waiver_notice"] - 1]   = "N"
    row[_COL["cust_status"] - 1]     = "P"
    row[_COL["plan_id1"] - 1]        = "PNCPOSTPAY"
    # Addition, consolidated billing -- Build Plan #9: link this ESI's
    # ERCOT masterroll row to the existing account it's billed under.
    if rec.get("billing_choice") == "consolidated" and rec.get("linked_cust_id"):
        row[_COL["cust_ref_id"] - 1]    = rec["linked_cust_id"]
        row[_COL["billto_cust_id"] - 1] = rec["linked_cust_id"]
    row[_COL["cust_bill_mode"] - 1]  = "Email" if rec.get("customer_email") else ""
    row[_COL["contract_ind"] - 1]    = "Y"
    row[_COL["contract_no"] - 1]     = rec.get("contract_no") or ""
    row[_COL["contract_date"] - 1]   = rec.get("start_date") or ""
    row[_COL["contract_start"] - 1]  = rec.get("start_date") or ""
    row[_COL["contract_term"] - 1]   = rec.get("term") or ""
    row[_COL["contract_type"] - 1]   = "FIXED"
    row[_COL["agent_comm"] - 1]      = rec.get("commission") or ""
    row[_COL["enroll_product"] - 1]  = _fee_to_pr(rec.get("meter_fees"), rec.get("lmp"))
    row[_COL["flow_status"] - 1]     = "-10"
    row[_COL["current_rate"] - 1]    = rate
    row[_COL["contract_rate"] - 1]   = rate

    return row


def _load_plan_group_map_query() -> str:
    return "SELECT premise_id, plan_group FROM contract_renewal WHERE premise_id IS NOT NULL"


def _expand_esiids(rows: list, plan_group_map: dict) -> list:
    """Expand comma-separated esiid strings into one record per ESIID."""
    expanded: list = []
    for row in rows:
        esiid_raw = (row.get("esiid") or "").strip()
        if "," in esiid_raw:
            parts = [e.strip() for e in esiid_raw.split(",") if e.strip()]
            for esid in parts:
                nr = dict(row)
                nr["esiid"] = esid
                nr["plan_group"] = plan_group_map.get(esid)
                expanded.append(nr)
        else:
            row["plan_group"] = plan_group_map.get(esiid_raw) if esiid_raw else None
            expanded.append(row)
    return expanded


# ── Request models ────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    record_sids: list[int]
    date_from: Optional[str] = None
    date_to: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pending")
async def get_pending(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    broker_code: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    filters = ["cl.enroll_check = 0"]
    params: dict = {}

    if date_from:
        filters.append("cl.start_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        filters.append("cl.start_date <= :date_to")
        params["date_to"] = date_to
    if broker_code:
        filters.append("cl.broker_code = :broker_code")
        params["broker_code"] = broker_code

    where = " AND ".join(filters)

    result = await db.execute(
        text(f"""
            SELECT
                cl.sid, cl.esiid, cl.customer_name, cl.broker_code, cl.broker_name,
                cl.start_date, cl.term, cl.contract_rate, cl.meter_fees, cl.lmp,
                cl.tax_exempt, cl.customer_email, cl.contract_no, cl.date_modified,
                cl.commission, cl.type_of_contract,
                cl.asap, cl.meter_read, cl.pmvi, cl.mvi, cl.switch_flag
            FROM confirmation_log cl
            WHERE {where}
            ORDER BY cl.date_modified DESC
        """),
        params,
    )
    rows = [dict(r) for r in result.mappings().all()]

    pg_result = await db.execute(text(_load_plan_group_map_query()))
    plan_group_map = {r[0]: r[1] for r in pg_result.fetchall()}

    expanded = _expand_esiids(rows, plan_group_map)
    await _resolve_effective_dates(db, expanded)

    # Future Date > 30 days is held out of the pending batch per
    # docs/ENROLLMENT_RULES.md -- these records still stay visible on the
    # existing /contracts/future page for later processing.
    holdout_cutoff = date.today() + timedelta(days=30)
    held_for_future = []
    still_pending = []
    for row in expanded:
        eff = row.get("_effective_date")
        if eff and eff > holdout_cutoff:
            held_for_future.append(row)
        else:
            still_pending.append(row)
    expanded = still_pending

    for row in expanded:
        row["effective_start_date"] = row["_effective_date"].isoformat() if row.get("_effective_date") else None
        row["enrol_type"] = _resolve_enrol_type(row)
        row["priority_code"] = row.get("_priority_code")
        row["date_note"] = row.get("_date_note")
        row["date_warning"] = row.get("_date_error")
        for k in ("_effective_date", "_duns", "_priority_code", "_date_note", "_date_error"):
            row.pop(k, None)

    plan_result = await db.execute(
        text("SELECT id, base_fee, plan_id, plan_name, paired_with FROM plan_codes WHERE active = 1 ORDER BY id")
    )
    plan_list = [dict(r) for r in plan_result.mappings().all()]

    fee_to_plan: dict = {}
    for p in plan_list:
        key = f"{float(p['base_fee']):.2f}"
        if key not in fee_to_plan:
            fee_to_plan[key] = p

    plan_by_id = {p["plan_id"]: p for p in plan_list}

    for row in expanded:
        fee = _clean_fee(row.get("meter_fees"))
        plan = fee_to_plan.get(fee)
        row["suggested_plan"] = plan["plan_id"] if plan else None
        row["suggested_plan_name"] = plan["plan_name"] if plan else None
        if plan and plan.get("paired_with"):
            paired = plan_by_id.get(plan["paired_with"])
            row["paired_plan"] = paired["plan_id"] if paired else None
            row["paired_plan_name"] = paired["plan_name"] if paired else None
        else:
            row["paired_plan"] = None
            row["paired_plan_name"] = None

    held_for_future_preview = [
        {
            "sid": r.get("sid"),
            "esiid": r.get("esiid"),
            "customer_name": r.get("customer_name"),
            "start_date": r.get("start_date"),
        }
        for r in held_for_future
    ]

    return {
        "records": expanded,
        "total": len(expanded),
        "held_for_future": len(held_for_future),
        "held_for_future_records": held_for_future_preview,
    }


@router.get("/plan-codes")
async def get_plan_codes(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    result = await db.execute(
        text("SELECT * FROM plan_codes WHERE active = 1 ORDER BY customer_type, base_fee, plan_id")
    )
    rows = [dict(r) for r in result.mappings().all()]

    grouped: dict = {}
    for row in rows:
        ctype = row.get("customer_type") or "other"
        grouped.setdefault(ctype, []).append(row)
    return grouped


@router.post("/generate-masterroll")
async def generate_masterroll(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    if not body.record_sids:
        raise HTTPException(status_code=400, detail="No record sids provided")

    sid_list = ",".join(str(s) for s in body.record_sids)

    result = await db.execute(
        text(f"""
            SELECT
                cl.sid, cl.esiid, cl.customer_name, cl.broker_code, cl.broker_name,
                cl.start_date, cl.term, cl.contract_rate, cl.meter_fees, cl.lmp,
                cl.customer_email, cl.contract_no, cl.commission, cl.mill,
                cl.type_of_contract, cl.linked_cust_id, cl.billing_choice,
                cl.billing_address, cl.billing_city, cl.billing_state, cl.billing_zip,
                cl.plan_group, cl.plan_id, cl.cust_first_name, cl.cust_last_name,
                cl.asap, cl.meter_read, cl.pmvi, cl.mvi, cl.switch_flag
            FROM confirmation_log cl
            WHERE cl.sid IN ({sid_list})
            ORDER BY cl.customer_name
        """)
    )
    records = [dict(r) for r in result.mappings().all()]
    if not records:
        raise HTTPException(status_code=404, detail="No matching records found")

    pg_result = await db.execute(text(_load_plan_group_map_query()))
    plan_group_map = {r[0]: r[1] for r in pg_result.fetchall()}

    expanded = _expand_esiids(records, plan_group_map)
    await _resolve_effective_dates(db, expanded)

    batch_r = await db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM enrollment_batches"))
    batch_no = batch_r.scalar()

    # Build XLSX (headers only for now -- rows are written below, in the same
    # pass as the skip guards, so a skipped record never ends up in the file
    # even though it was never inserted into enrollment_masterroll).
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "MasterRoll"
    ws.cell(row=1, column=1, value="enrolment_queue")
    for col_idx, header in enumerate(_HEADERS, start=1):
        ws.cell(row=2, column=col_idx, value=header)

    # Generate customer_ids and insert into enrollment_masterroll (staging —
    # contract_renewal is only written on Mark Active).
    # Counter spans both contract_renewal and enrollment_masterroll so this
    # flow and create-internal-batch (which still assigns cust_id from
    # contract_renewal alone) never hand out the same id on the same day.
    date_prefix = datetime.now().strftime("%y%m%d")
    seq_r = await db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM contract_renewal WHERE cust_id LIKE :prefix) +
                (SELECT COUNT(*) FROM enrollment_masterroll WHERE customer_id LIKE :prefix)
        """),
        {"prefix": f"{date_prefix}%"},
    )
    base_seq = seq_r.scalar() or 0

    skipped = []
    inserted_count = 0
    inserted_sids = set()
    serial = 0
    for rec in expanded:
        esi_id = rec.get("esiid") or ""
        # .title() normalizes casing (send.tsx historically submitted
        # lowercase "renewal"/"new" while everything downstream compares
        # against "Renewal"/"New") -- see docs/ENROLLMENT_RULES.md,
        # "type_of_contract casing" note, 2026-09-22.
        contract_type = str(rec.get("type_of_contract") or "New").strip().title()

        # Self Selected Switch date guard -- business day + 3-business-day
        # minimum lead time, per the reference workbook's "Enrollments
        # Guide" tab and docs/ENROLLMENT_RULES.md. Checked first since a
        # bad date makes the other guards moot.
        date_error = rec.get("_date_error")
        if date_error:
            skipped.append({
                "sid": rec.get("sid"),
                "esi_id": esi_id,
                "customer_name": rec.get("customer_name", ""),
                "reason": date_error,
            })
            continue

        # Active-contract guard, branched by contract type per
        # docs/ENROLLMENT_RULES.md "Active Contract Guard Rules" -- mirrors
        # the guard in routers/contracts_confirm.py's /send-email endpoint:
        #   New / Addition   -> hard block if ESI active/pending/going_final
        #   Renewal / B&E    -> no block on active status; validate start_date
        #                       aligns with the current active contract's end date
        #   Assignment       -> allowed unconditionally (ESI expected active)
        if esi_id and contract_type in ("New", "Addition"):
            dup_r = await db.execute(
                text(
                    "SELECT cust_id, broker_code FROM contract_renewal"
                    " WHERE premise_id = :esi AND status IN ('active', 'pending', 'going_final')"
                    " LIMIT 1"
                ),
                {"esi": esi_id},
            )
            dup_row = dup_r.fetchone()
            if not dup_row:
                mr_dup_r = await db.execute(
                    text(
                        "SELECT customer_id FROM enrollment_masterroll"
                        " WHERE esi_id = :esi AND status IN ('pending', 'submitted') LIMIT 1"
                    ),
                    {"esi": esi_id},
                )
                if mr_dup_r.fetchone():
                    skipped.append({
                        "sid": rec.get("sid"),
                        "esi_id": esi_id,
                        "customer_name": rec.get("customer_name", ""),
                        "reason": "Duplicate submission already pending in enrollment_masterroll",
                    })
                    continue
            elif dup_row:
                existing_broker = dup_row[1] or "unknown"
                incoming_broker = rec.get("broker_code") or "unknown"
                if existing_broker == incoming_broker:
                    reason = "Active contract exists (same broker on record)"
                else:
                    reason = (
                        f"Active contract exists under a different broker"
                        f" (on record: {existing_broker}, submitted: {incoming_broker})"
                        " -- possible broker conflict, escalate before proceeding"
                    )
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": reason,
                })
                continue

        elif esi_id and contract_type == "Renewal":
            # Renewal-only 3-case start-date rule -- docs/ENROLLMENT_RULES.md
            # Build Plan #6 (decided 2026-09-21). See utils/renewal_rules.py.
            # Auto-corrects rec["start_date"] (cases 1/2, so _build_row below
            # picks up the resolved date) or skips the record (case 3).
            new_start = _parse_enrollment_date(rec.get("start_date"))
            new_start_d = datetime.strptime(new_start, "%Y-%m-%d").date() if new_start else None
            raw_end_d, acct_type = await fetch_active_contract(db, esi_id)
            # Ignore the account_type='default' fallback contract's
            # artificial ~30-years-out end date -- treat it the same as
            # "no active contract" so it can't force a bogus start date.
            end_d = raw_end_d if acct_type != "default" else None
            resolved_d, block_reason = resolve_renewal_start_date(date.today(), end_d, new_start_d)
            if block_reason:
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": f"Start date: {block_reason}",
                })
                continue
            if resolved_d:
                rec["start_date"] = resolved_d.strftime("%Y-%m-%d")

        elif esi_id and contract_type == "B&E":
            # B&E-only start-date rule -- docs/ENROLLMENT_RULES.md Build Plan
            # #7 (decided 2026-09-21). See utils/renewal_rules.py. Unlike
            # Renewal, the submitted start date passes through unchanged --
            # the only guard is that a real, non-default active contract
            # must exist to blend against.
            new_start = _parse_enrollment_date(rec.get("start_date"))
            new_start_d = datetime.strptime(new_start, "%Y-%m-%d").date() if new_start else None
            end_d, acct_type = await fetch_active_contract(db, esi_id)
            resolved_d, block_reason = resolve_be_start_date(new_start_d, end_d, acct_type)
            if block_reason:
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": f"Start date: {block_reason}",
                })
                continue
            if resolved_d:
                rec["start_date"] = resolved_d.strftime("%Y-%m-%d")

        # Assignment (and any other type): no guard here.

        serial += 1
        row_data = _build_row(rec, batch_no, serial)
        for col_idx, value in enumerate(row_data, start=1):
            if value != "":
                ws.cell(row=serial + 2, column=col_idx, value=value)

        cust_id = f"{date_prefix}{base_seq + inserted_count + 1:04d}"
        inserted_count += 1
        raw_rate = rec.get("contract_rate")
        contract_rate = None
        if raw_rate:
            try:
                contract_rate = round(float(str(raw_rate)) / 100, 6)
            except (ValueError, TypeError):
                contract_rate = None
        await db.execute(
            text("""
                INSERT INTO enrollment_masterroll (
                    batch_no, esi_id, customer_id, status,
                    enrol_type, priority_code, tdsp_duns, tdsp_name,
                    contract_type, contract_rate, contract_term,
                    contract_start_date, plan_id1, plan_group,
                    company_name, cust_first_name, cust_last_name, customer_email,
                    billing_address, billing_city, billing_state, billing_zip,
                    broker_code, broker_name, agent_commission_rate, mills,
                    meter_fee, lmp, confirmation_sid, bill_to_id
                ) VALUES (
                    :batch_no, :esi_id, :customer_id, 'pending',
                    :enrol_type, :priority_code, :tdsp_duns, :tdsp_name,
                    :contract_type, :contract_rate, :contract_term,
                    :contract_start_date, :plan_id1, :plan_group,
                    :company_name, :cust_first_name, :cust_last_name, :customer_email,
                    :billing_address, :billing_city, :billing_state, :billing_zip,
                    :broker_code, :broker_name, :agent_commission_rate, :mills,
                    :meter_fee, :lmp, :confirmation_sid, :bill_to_id
                )
            """),
            {
                "batch_no":              str(batch_no),
                "esi_id":                esi_id,
                "customer_id":           cust_id,
                "enrol_type":            _resolve_enrol_type(rec),
                "priority_code":         rec.get("_priority_code"),
                "tdsp_duns":             rec.get("_duns"),
                "tdsp_name":             _TDSP_BY_DUNS.get(rec.get("_duns"), (None, None))[0],
                "contract_type":         rec.get("type_of_contract") or None,
                "contract_rate":         contract_rate,
                "contract_term":         rec.get("term") or None,
                "contract_start_date":   (
                    rec["_effective_date"].isoformat() if rec.get("_effective_date")
                    else _parse_enrollment_date(rec.get("start_date"))
                ),
                "plan_id1":              rec.get("plan_id") or None,
                "plan_group":            rec.get("plan_group") or "C1",
                "company_name":          rec.get("customer_name") or "",
                "cust_first_name":       rec.get("cust_first_name") or None,
                "cust_last_name":        rec.get("cust_last_name") or None,
                "customer_email":        rec.get("customer_email") or None,
                "billing_address":       rec.get("billing_address") or None,
                "billing_city":          rec.get("billing_city") or None,
                "billing_state":         rec.get("billing_state") or None,
                "billing_zip":           rec.get("billing_zip") or None,
                "broker_code":           rec.get("broker_code") or None,
                "broker_name":           rec.get("broker_name") or None,
                "agent_commission_rate": rec.get("commission") or None,
                "mills":                 rec.get("mill") or None,
                "meter_fee":             _clean_fee(rec.get("meter_fees")),
                "lmp":                   int(rec.get("lmp") or 0),
                "confirmation_sid":      rec.get("sid"),
                "bill_to_id": (
                    rec.get("linked_cust_id")
                    if rec.get("billing_choice") == "consolidated" and rec.get("linked_cust_id")
                    else None
                ),
            },
        )
        inserted_sids.add(rec.get("sid"))

    # Mark enrolled only the records that actually made it into this batch --
    # a skipped record (bad date, duplicate, misaligned renewal) must stay in
    # the pending queue, not silently vanish as "enrolled".
    if inserted_sids:
        inserted_sid_list = ",".join(str(s) for s in inserted_sids)
        await db.execute(
            text(f"UPDATE confirmation_log SET enroll_check = 1 WHERE sid IN ({inserted_sid_list})")
        )
    await db.execute(
        text("""
            INSERT INTO enrollment_batches (batch_no, generated_by, record_count, date_from, date_to)
            VALUES (:batch_no, :generated_by, :record_count, :date_from, :date_to)
        """),
        {
            "batch_no":      str(batch_no),
            "generated_by":  payload.get("username") or payload.get("email") or "unknown",
            "record_count":  inserted_count,
            "date_from":     body.date_from or None,
            "date_to":       body.date_to or None,
        },
    )
    await db.commit()

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    import json as _json
    filename = f"MasterRoll {datetime.now().strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Enrollment-Skipped": _json.dumps(skipped),
        },
    )


# ── Step 3: Batch management ──────────────────────────────────────────────────

@router.get("/batches")
async def list_batches(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    result = await db.execute(
        text("""
            SELECT id, batch_no, generated_by, generated_at,
                   record_count, date_from, date_to, status, submitted_at
            FROM enrollment_batches
            ORDER BY generated_at DESC
        """)
    )
    rows = [dict(r) for r in result.mappings().all()]

    # Coerce non-serialisable types
    for row in rows:
        if row.get("generated_at") and not isinstance(row["generated_at"], str):
            row["generated_at"] = row["generated_at"].isoformat()
        if row.get("submitted_at") and not isinstance(row["submitted_at"], str):
            row["submitted_at"] = row["submitted_at"].isoformat()

    return {"batches": rows}


@router.post("/batches/{batch_no}/submit")
async def submit_batch(
    batch_no: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    result = await db.execute(
        text("SELECT id FROM enrollment_batches WHERE batch_no = :batch_no"),
        {"batch_no": batch_no},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Batch not found")

    await db.execute(
        text("""
            UPDATE enrollment_batches
            SET status = 'submitted', submitted_at = NOW()
            WHERE batch_no = :batch_no
        """),
        {"batch_no": batch_no},
    )
    await db.commit()
    return {"ok": True, "batch_no": batch_no, "status": "submitted"}


# ── Step 4: Per-batch customer view ──────────────────────────────────────────

@router.get("/batches/{batch_no}")
async def get_batch_customers(
    batch_no: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    batch_r = await db.execute(
        text("""
            SELECT id, batch_no, generated_by, generated_at,
                   record_count, date_from, date_to, status, submitted_at
            FROM enrollment_batches WHERE batch_no = :batch_no
        """),
        {"batch_no": batch_no},
    )
    batch_row = batch_r.mappings().fetchone()
    if not batch_row:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch = dict(batch_row)
    if batch.get("generated_at") and not isinstance(batch["generated_at"], str):
        batch["generated_at"] = batch["generated_at"].isoformat()
    if batch.get("submitted_at") and not isinstance(batch["submitted_at"], str):
        batch["submitted_at"] = batch["submitted_at"].isoformat()

    cust_r = await db.execute(
        text("""
            SELECT customer_id, esi_id, company_name, status,
                   broker_code AS broker_id, broker_name, plan_group,
                   meter_fee, contract_start_date AS enrollment_date, contract_end_date,
                   enrol_type, contract_type, contract_rate, contract_term,
                   plan_id1, plan_id2, plan_id3, priority_code,
                   cust_first_name, cust_last_name, customer_email, customer_phone,
                   billing_address, billing_city, billing_state, billing_zip,
                   agent_commission_rate, mills, lmp, load_profile,
                   city_tax_exempt, county_tax_exempt, state_tax_exempt, mta_cda_tax_exempt,
                   spdt_tax_exempt, spdt2_tax_exempt, grt_tax_exempt, puc_tax_exempt,
                   tdsp_duns, tdsp_name, utility_account_number, confirmation_sid
            FROM enrollment_masterroll
            WHERE batch_no = :batch_no
            ORDER BY customer_id
        """),
        {"batch_no": batch_no},
    )
    customers = [dict(r) for r in cust_r.mappings().all()]
    for c in customers:
        if c.get("enrollment_date") and not isinstance(c["enrollment_date"], str):
            c["enrollment_date"] = str(c["enrollment_date"])
        if c.get("contract_end_date") and not isinstance(c["contract_end_date"], str):
            c["contract_end_date"] = str(c["contract_end_date"])

    return {"batch": batch, "customers": customers}


# ── Step 5: Activate / cancel customer ───────────────────────────────────────

@router.post("/activate/{customer_id}")
async def activate_customer(
    customer_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    mr_r = await db.execute(
        text("SELECT * FROM enrollment_masterroll WHERE customer_id = :cid"),
        {"cid": customer_id},
    )
    mr_row = mr_r.mappings().fetchone()
    if not mr_row:
        raise HTTPException(status_code=404, detail="Customer not found")
    mr = dict(mr_row)

    if mr.get("status") not in ("pending", "submitted"):
        raise HTTPException(
            status_code=409,
            detail=f"Customer is already {mr.get('status')}, cannot activate again",
        )

    esi_id = mr["esi_id"]

    # Full record insert — activation is the only point contract_renewal gets
    # a row for this customer under Option A. Rate comes straight from
    # enrollment_masterroll.contract_rate, not looked up again from confirmation_log.
    await db.execute(
        text("""
            INSERT INTO contract_renewal (
                premise_id, cust_id, status, batch_no, account_type,
                contract_type, contract_rate, contract_start_date, contract_end_date,
                plan_id, plan_group,
                company_name, cust_first_name, cust_last_name, cust_email, cust_phone1,
                billing_address, billing_city, billing_state, billing_zip,
                broker_code, broker_name, comm_rate, other_charge, load_profile,
                city_tax_exempt, county_tax_exempt, state_tax_exempt, mtacda_tax_exempt,
                spdt_tax_exempt, spdt2_tax_exempt, grt_tax_exempt, puc_tax_exempt,
                bill_to_id
            ) VALUES (
                :premise_id, :cust_id, 'active', :batch_no, 'standalone',
                :contract_type, :contract_rate, :contract_start_date, :contract_end_date,
                :plan_id, :plan_group,
                :company_name, :cust_first_name, :cust_last_name, :cust_email, :cust_phone1,
                :billing_address, :billing_city, :billing_state, :billing_zip,
                :broker_code, :broker_name, :comm_rate, :other_charge, :load_profile,
                :city_tax_exempt, :county_tax_exempt, :state_tax_exempt, :mtacda_tax_exempt,
                :spdt_tax_exempt, :spdt2_tax_exempt, :grt_tax_exempt, :puc_tax_exempt,
                :bill_to_id
            )
        """),
        {
            "premise_id":          esi_id,
            "cust_id":             customer_id,
            "batch_no":            mr.get("batch_no"),
            "contract_type":       mr.get("contract_type"),
            "contract_rate":       mr.get("contract_rate"),
            "contract_start_date": mr.get("contract_start_date"),
            "contract_end_date":   mr.get("contract_end_date"),
            "plan_id":             mr.get("plan_id1"),
            "plan_group":          mr.get("plan_group"),
            "company_name":        mr.get("company_name"),
            "cust_first_name":     mr.get("cust_first_name"),
            "cust_last_name":      mr.get("cust_last_name"),
            "cust_email":          mr.get("customer_email"),
            "cust_phone1":         mr.get("customer_phone"),
            "billing_address":     mr.get("billing_address"),
            "billing_city":        mr.get("billing_city"),
            "billing_state":       mr.get("billing_state"),
            "billing_zip":         mr.get("billing_zip"),
            "broker_code":         mr.get("broker_code"),
            "broker_name":         mr.get("broker_name"),
            "comm_rate":           mr.get("agent_commission_rate"),
            "other_charge":        mr.get("meter_fee"),
            "load_profile":        mr.get("load_profile"),
            "city_tax_exempt":     mr.get("city_tax_exempt"),
            "county_tax_exempt":   mr.get("county_tax_exempt"),
            "state_tax_exempt":    mr.get("state_tax_exempt"),
            "mtacda_tax_exempt":   mr.get("mta_cda_tax_exempt"),
            "spdt_tax_exempt":     mr.get("spdt_tax_exempt"),
            "spdt2_tax_exempt":    mr.get("spdt2_tax_exempt"),
            "grt_tax_exempt":      mr.get("grt_tax_exempt"),
            "puc_tax_exempt":      mr.get("puc_tax_exempt"),
            "bill_to_id":          mr.get("bill_to_id"),
        },
    )

    # Fetch the now-active real contract row to copy fields to the default contract
    real_r = await db.execute(
        text("SELECT * FROM contract_renewal WHERE cust_id = :cid"),
        {"cid": customer_id},
    )
    real_row = dict(real_r.mappings().fetchone() or {})

    # Duplicate guard — skip if default contract already exists for this ESI
    dup_default_r = await db.execute(
        text(
            "SELECT serial FROM contract_renewal"
            " WHERE premise_id = :esi AND account_type = 'default' LIMIT 1"
        ),
        {"esi": esi_id},
    )
    if not dup_default_r.fetchone():
        start = real_row.get("contract_start_date")
        start_str = str(start) if start else str(date.today())
        default_end = (
            f"{int(start_str[:4]) + 30}{start_str[4:]}"
            if start_str
            else f"{date.today().year + 30}{str(date.today())[4:]}"
        )
        await db.execute(
            text("""
                INSERT INTO contract_renewal (
                    premise_id, cust_id, status, account_type, contract_type,
                    contract_rate, contract_start_date, contract_end_date,
                    broker_code, broker_name, plan_group, other_charge,
                    company_name, cust_first_name, cust_last_name, cust_email,
                    billing_address, billing_city, billing_state, billing_zip
                ) VALUES (
                    :premise_id, NULL, 'active', 'default', 'Default',
                    '0.1300', :contract_start_date, :contract_end_date,
                    :broker_code, :broker_name, :plan_group, '0',
                    :company_name, :cust_first_name, :cust_last_name, :cust_email,
                    :billing_address, :billing_city, :billing_state, :billing_zip
                )
            """),
            {
                "premise_id":          esi_id,
                "contract_start_date": start_str,
                "contract_end_date":   default_end,
                "broker_code":         real_row.get("broker_code"),
                "broker_name":         real_row.get("broker_name"),
                "plan_group":          real_row.get("plan_group"),
                "company_name":        real_row.get("company_name"),
                "cust_first_name":     real_row.get("cust_first_name"),
                "cust_last_name":      real_row.get("cust_last_name"),
                "cust_email":          real_row.get("cust_email"),
                "billing_address":     real_row.get("billing_address"),
                "billing_city":        real_row.get("billing_city"),
                "billing_state":       real_row.get("billing_state"),
                "billing_zip":         real_row.get("billing_zip"),
            },
        )
    # TODO: Cron job pending — the day after a real contract's contract_end_date,
    # if the ESI ID has an account_type='default' contract and the real contract
    # status becomes 'expired', billing automatically switches to the default contract.

    await db.execute(
        text("UPDATE enrollment_masterroll SET status = 'active' WHERE customer_id = :cid"),
        {"cid": customer_id},
    )

    await db.commit()
    return {"ok": True, "customer_id": customer_id, "esi_id": esi_id}


@router.post("/cancel/{customer_id}")
async def cancel_customer(
    customer_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    result = await db.execute(
        text("SELECT customer_id FROM enrollment_masterroll WHERE customer_id = :cid"),
        {"cid": customer_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Customer not found")

    await db.execute(
        text("UPDATE enrollment_masterroll SET status = 'cancelled' WHERE customer_id = :cid"),
        {"cid": customer_id},
    )
    await db.commit()
    return {"ok": True, "customer_id": customer_id, "status": "cancelled"}


# ── Create Internal Batch (no Excel — Renewals / Assignments / B&E) ───────────

class InternalBatchRequest(BaseModel):
    record_sids: list[int]


@router.post("/create-internal-batch")
async def create_internal_batch(
    body: InternalBatchRequest,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    if not body.record_sids:
        raise HTTPException(status_code=400, detail="No record sids provided")

    sid_list = ",".join(str(s) for s in body.record_sids)

    result = await db.execute(
        text(f"""
            SELECT
                cl.sid, cl.esiid, cl.customer_name, cl.broker_code, cl.broker_name,
                cl.start_date, cl.term, cl.contract_rate, cl.meter_fees,
                cl.customer_email, cl.commission, cl.type_of_contract,
                cl.billing_address, cl.billing_city, cl.billing_state, cl.billing_zip,
                cl.plan_group, cl.plan_id, cl.cust_first_name, cl.cust_last_name
            FROM confirmation_log cl
            WHERE cl.sid IN ({sid_list})
            ORDER BY cl.customer_name
        """)
    )
    records = [dict(r) for r in result.mappings().all()]
    if not records:
        raise HTTPException(status_code=404, detail="No matching records found")

    pg_result = await db.execute(text(_load_plan_group_map_query()))
    plan_group_map = {r[0]: r[1] for r in pg_result.fetchall()}

    expanded = _expand_esiids(records, plan_group_map)

    batch_r = await db.execute(text("SELECT COALESCE(MAX(id), 0) + 1 FROM enrollment_batches"))
    batch_no = batch_r.scalar()

    date_prefix = datetime.now().strftime("%y%m%d")
    seq_r = await db.execute(
        text("SELECT COUNT(*) FROM contract_renewal WHERE cust_id LIKE :prefix"),
        {"prefix": f"{date_prefix}%"},
    )
    base_seq = seq_r.scalar() or 0

    skipped = []
    inserted_count = 0
    for rec in expanded:
        esi_id = rec.get("esiid") or ""
        # .title() normalizes casing -- see docs/ENROLLMENT_RULES.md,
        # "type_of_contract casing" note, 2026-09-22.
        contract_type = str(rec.get("type_of_contract") or "Renewal").strip().title()

        # Active-contract guard, branched by contract type per
        # docs/ENROLLMENT_RULES.md "Active Contract Guard Rules" -- mirrors
        # the guard in generate_masterroll() / contracts_confirm.py's
        # /send-email. This endpoint exists specifically for Renewals /
        # Assignments / B&E, all of which are EXPECTED to target an
        # already-active ESI, so they must not be hard-blocked on that
        # alone -- only New/Addition treats "already active" as the problem.
        if esi_id and contract_type in ("New", "Addition"):
            dup_r = await db.execute(
                text(
                    "SELECT cust_id, broker_code FROM contract_renewal"
                    " WHERE premise_id = :esi"
                    " AND status IN ('active', 'pending', 'going_final') LIMIT 1"
                ),
                {"esi": esi_id},
            )
            dup_row = dup_r.fetchone()
            if dup_row:
                existing_broker = dup_row[1] or "unknown"
                incoming_broker = rec.get("broker_code") or "unknown"
                if existing_broker == incoming_broker:
                    reason = "Active contract exists (same broker on record)"
                else:
                    reason = (
                        f"Active contract exists under a different broker"
                        f" (on record: {existing_broker}, submitted: {incoming_broker})"
                        " -- possible broker conflict, escalate before proceeding"
                    )
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": reason,
                })
                continue

        elif esi_id and contract_type == "Renewal":
            # Renewal-only 3-case start-date rule -- docs/ENROLLMENT_RULES.md
            # Build Plan #6 (decided 2026-09-21). See utils/renewal_rules.py.
            # Auto-corrects rec["start_date"] (cases 1/2, so the INSERT below
            # picks up the resolved date) or skips the record (case 3).
            new_start = _parse_enrollment_date(rec.get("start_date"))
            new_start_d = datetime.strptime(new_start, "%Y-%m-%d").date() if new_start else None
            raw_end_d, acct_type = await fetch_active_contract(db, esi_id)
            # Ignore the account_type='default' fallback contract's
            # artificial ~30-years-out end date -- treat it the same as
            # "no active contract" so it can't force a bogus start date.
            end_d = raw_end_d if acct_type != "default" else None
            resolved_d, block_reason = resolve_renewal_start_date(date.today(), end_d, new_start_d)
            if block_reason:
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": f"Start date: {block_reason}",
                })
                continue
            if resolved_d:
                rec["start_date"] = resolved_d.strftime("%Y-%m-%d")

        elif esi_id and contract_type == "B&E":
            # B&E-only start-date rule -- docs/ENROLLMENT_RULES.md Build Plan
            # #7 (decided 2026-09-21). See utils/renewal_rules.py. Unlike
            # Renewal, the submitted start date passes through unchanged --
            # the only guard is that a real, non-default active contract
            # must exist to blend against.
            new_start = _parse_enrollment_date(rec.get("start_date"))
            new_start_d = datetime.strptime(new_start, "%Y-%m-%d").date() if new_start else None
            end_d, acct_type = await fetch_active_contract(db, esi_id)
            resolved_d, block_reason = resolve_be_start_date(new_start_d, end_d, acct_type)
            if block_reason:
                skipped.append({
                    "sid": rec.get("sid"),
                    "esi_id": esi_id,
                    "customer_name": rec.get("customer_name", ""),
                    "reason": f"Start date: {block_reason}",
                })
                continue
            if resolved_d:
                rec["start_date"] = resolved_d.strftime("%Y-%m-%d")

        # Assignment (and any other type): no guard here.

        cust_id = f"{date_prefix}{base_seq + inserted_count + 1:04d}"
        inserted_count += 1
        raw_rate = rec.get("contract_rate")
        contract_rate = None
        if raw_rate:
            try:
                contract_rate = round(float(str(raw_rate)) / 100, 6)
            except (ValueError, TypeError):
                contract_rate = None
        await db.execute(
            text("""
                INSERT INTO contract_renewal (
                    premise_id, cust_id, status, batch_no, account_type,
                    contract_start_date, company_name,
                    cust_first_name, cust_last_name, cust_email,
                    billing_address, billing_city, billing_state, billing_zip,
                    broker_code, broker_name, plan_group, plan_id, other_charge,
                    contract_rate
                ) VALUES (
                    :premise_id, :cust_id, 'pending', :batch_no, 'standalone',
                    :contract_start_date, :company_name,
                    :cust_first_name, :cust_last_name, :cust_email,
                    :billing_address, :billing_city, :billing_state, :billing_zip,
                    :broker_code, :broker_name, :plan_group, :plan_id, :other_charge,
                    :contract_rate
                )
            """),
            {
                "premise_id":          esi_id,
                "cust_id":             cust_id,
                "batch_no":            str(batch_no),
                "contract_start_date": _parse_enrollment_date(rec.get("start_date")),
                "company_name":        rec.get("customer_name") or "",
                "cust_first_name":     rec.get("cust_first_name") or None,
                "cust_last_name":      rec.get("cust_last_name") or None,
                "cust_email":          rec.get("customer_email") or None,
                "billing_address":     rec.get("billing_address") or None,
                "billing_city":        rec.get("billing_city") or None,
                "billing_state":       rec.get("billing_state") or None,
                "billing_zip":         rec.get("billing_zip") or None,
                "broker_code":         rec.get("broker_code") or None,
                "broker_name":         rec.get("broker_name") or None,
                "plan_group":          rec.get("plan_group") or "C1",
                "plan_id":             rec.get("plan_id") or None,
                "other_charge":        str(float(_clean_fee(rec.get("meter_fees")))),
                "contract_rate":       contract_rate,
            },
        )

    await db.execute(
        text(f"UPDATE confirmation_log SET enroll_check = 1 WHERE sid IN ({sid_list})")
    )
    await db.execute(
        text("""
            INSERT INTO enrollment_batches (batch_no, generated_by, record_count, status)
            VALUES (:batch_no, :generated_by, :record_count, 'internal')
        """),
        {
            "batch_no":      str(batch_no),
            "generated_by":  payload.get("username") or payload.get("email") or "unknown",
            "record_count":  inserted_count,
        },
    )
    await db.commit()

    return {"batch_no": batch_no, "inserted": inserted_count, "skipped": skipped}
