"""
Synthetic 867_03 / 810_02 EDI file generator for the admin test-data tool.

Every literal structural field (row prefixes, ERCOT DUNS, marketer DUNS/name,
TDSP DUNS/name, rate-class code, per-unit charge rates, column headers) is
copied verbatim from real sample files already in this repo
(reference_data/In_207_ERCOT_200101_86703_H99990001.txt and
reference_data/In_207_ONCOR_200421_81002_00N30003.txt) and cross-checked
against the field positions in controllers/billing_engine.py's _P867/_P810
classes. Only per-ESI variable fields (tracking number, ESI ID, dates,
usage/demand, charge amounts derived from usage) are substituted.

contract_renewal has no tdsp_duns/tdsp_name column, so there is no real
per-ESI TDSP to look up -- the TDSP identity used here (ONCOR / 1039940674000
for both file types) is fixed to the real DUNS/name pair observed in the
810_02 sample, since tdsp_charge_mappings rows are all tdsp_duns IS NULL
(universal) and match regardless of which real TDSP DUNS is used.
"""
import random
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ── Structural constants, copied verbatim from real sample files ────────────

_ERCOT_DUNS    = "183529049"
_ERCOT_NAME    = "ERCOT"
_MARKETER_DUNS = "140780003"
_MARKETER_NAME = "AMERIPOWER"
_TDSP_DUNS     = "1039940674000"
_TDSP_NAME     = "ONCOR"

_867_L_ROW = (
    "L~Document_Set~Document_Type~Document_Purpose~Document_SubPurpose~Document_Tracking_Number~"
    "Sub_Document_Tracking_Number~Transaction_Date~Marketer_DUNS~Marketer_Name~Utility DUNS~Utility Name~"
    "ERCOT_DUNS~ERCOT_Name~ESI_ID~Original_Tracking_Number~Original_Document_ID~Commodity~Membership ID~"
    "Document_Due_Date~Document_Due_Time~PTD_Code~PTD_Description~Reading_Type_Code~Reading_Type_Description~"
    "Total_Consumption~Meter_Number~Product_Transfer_Movement_Code~Transfer_Code_Description~"
    "Meter_Role_Reference_ID~Meter_Role_Reference_ID_Description~Rate_Adjustment_Code~"
    "Rate_Adjustment_Description~Total_Consumption_Adjusted~Meter_Type~Beginning_Read~Beginning_Read_Type~"
    "Ending_Read~Ending_Read_Type~Meter_Multiplier_Measurement~Transformer_Loss_Factor_Measurement~"
    "Power_Factor_Measurement~Channel_Number~Unmetered_Service_Type_Code~Unmetered_Service_Type_Code_Description~"
    "Unmetered_Service_Type_Detailed_Description~Number_of_UnMetered_Devices~UOM_Number_of_UnMetered_Devices~"
    "Consumption_Quantity_Per_Device~UOM_Consumption_Quantity_Per_Device~Service_Period_Start_Date~"
    "Service_Period_Start_Date_Time~Service_Period_End_Date~Service_Period_End_Date_Time~Meter_Exchange_Date~"
    "Meter_Exchange_Date_Time~Interval_End_Time_Date~Interval_End_Time_Time~Estimation_Reason_Code~"
    "Estimation_Reason_Code_Description~Estimation_Reason_Clarification~Door_Hanger_Flag_Left~"
    "No_Access_Sequence_Number~Service_Sequence_Number"
)

_810_L_ROW = (
    "L~Document_Set~Document_Type~Document_Purpose~Document_SubPurpose~Document_Tracking_Number~"
    "Sub_Document_Tracking_Number~Transaction_Date~Marketer_DUNS~Marketer_Name~Utility_DUNS~Utility_Name~"
    "ERCOT_DUNS~ERCOT_Name~ESI_ID~Original_Tracking_Number~Original_Document_ID~Commodity~Payment_Due_Date~"
    "Line_Item_Number~Charge_Code_Classification_Level_of_Charges~Utility_Rate_Class~Utility_Rate_SubClass~"
    "Service_Period_Start_Date~Service_Period_End_Date~Charge_Relationship_Code~Service_Order_Completion_Date~"
    "Unmetered_Service_Date_Range~Late_Payment_Charge_Invoice_Number~Utility_Service_Order_Number~"
    "Charge_Indicator_Line_Item_Charge~Charge_Code_Line_Item_Charge~Charge_Code_Description_Line_Item_Charge~"
    "Charge_Amount_Line_Item_Charge~Rate_Line_Item_Charge~UOM_Line_Item_Charge~Quantity_Line_Item_Charge~"
    "Registered_Quantity_Line_Item_Charge~Comments_Line_Item_Charge~Tax_Type_Code~Tax_Amount~"
    "Tax_Relationship_Code~Invoice_Total_Amount"
)

# 867 D-row templates: real rows for ESI 1008901001900201400108 / tracking
# 867030SW00002019365B1010102000, verified field-index-by-field-index against
# _P867. '{tracking}', '{esi}', '{qty}', '{meter}', '{start}', '{end}' are the
# only substituted positions (indices 5, 14, 25/26/34-dependent, 26, 50, 52).
_867_ROW_SU_KHMON = (
    "D~867~867_03~ORIGINAL~NONINTERVAL~{tracking}~~{txn}~140780003~AMERIPOWER~"
    "1039940674000~ONCOR~183529049~ERCOT~{esi}~~~E~~~~SU~"
    "NON INTERVAL USAGE OR METERED SUMMARY~KA~QUANTITY ESTIMATED~{kwh}~~~~~~51~"
    "TOTAL/MAX_DEMAND~{kwh}~KHMON~~~~~~~~~~~~~~~~{start}~~{end}~~~~~~O1~TDSP Reason~~N~000~001"
)
_867_ROW_SU_K4MON = (
    "D~867~867_03~ORIGINAL~NONINTERVAL~{tracking}~~{txn}~140780003~AMERIPOWER~"
    "1039940674000~ONCOR~183529049~ERCOT~{esi}~~~E~~~~SU~"
    "NON INTERVAL USAGE OR METERED SUMMARY~KA~QUANTITY ESTIMATED~{kw}~~~~~~51~"
    "TOTAL/MAX_DEMAND~{kw}~K4MON~~~~~~~~~~~~~~~~{start}~~{end}~~~~~~O1~TDSP Reason~~N~000~001"
)
_867_ROW_PL_KHMON = (
    "D~867~867_03~ORIGINAL~NONINTERVAL~{tracking}~~{txn}~140780003~AMERIPOWER~"
    "1039940674000~ONCOR~183529049~ERCOT~{esi}~~~E~~~~PL~NON INTERVAL DETAIL~KA~"
    "QUANTITY ESTIMATED~{kwh}~{meter}~~~A~ADDITIVE~51~TOTAL/MAX_DEMAND~{kwh}~KHMON~"
    "0~ACTUAL~{kwh}~ESTIMATE~1~~~~~~~~~~~{start}~~{end}~~~~~~O1~TDSP Reason~~N~000~001"
)
_867_ROW_PL_K4MON = (
    "D~867~867_03~ORIGINAL~NONINTERVAL~{tracking}~~{txn}~140780003~AMERIPOWER~"
    "1039940674000~ONCOR~183529049~ERCOT~{esi}~~~E~~~~PL~NON INTERVAL DETAIL~KA~"
    "QUANTITY ESTIMATED~{kw}~{meter}~~~A~ADDITIVE~51~TOTAL/MAX_DEMAND~{kw}~K4MON~"
    "0~ACTUAL~{kw}~ESTIMATE~1~~~~~~~~~~~{start}~~{end}~~~~~~O1~TDSP Reason~~N~000~001"
)

# 810 D-row template. One row per charge code; {qty}/{rate}/{amount} vary,
# everything else (rate class D0, UOM, comments, description) is copied from
# the real sample group whose Invoice_Total_Amount (216.95) matches the sum
# of its 8 line items exactly.
_810_ROW = (
    "D~810~810_02~ORIGINAL~MONTH~{tracking}~1~{txn}~140780003~140780003 - AMERIPOWER~"
    "1039940674000~ONCOR~~~{esi}~~{orig_doc}~E~{due}~1~RATE~D0~~{start}~{end}~A~~~~~C~"
    "{code}~{desc}~{amount}~{rate}~{uom}~{qty}~~{comments}~~~~{invoice_total}"
)

# The 8 charge codes confirmed against tdsp_charge_mappings (all universal,
# tdsp_duns IS NULL, is_taxable NOT NULL) AND observed recurring together in
# the real 810_02 sample -- these are the "verified universal" default set.
# uom 'K1' rows bill per kW (demand), 'KH' rows bill per kWh (energy) --
# inferred from the real sample where K1 quantity (21) and KH quantity (4720)
# for the same tracking group match this project's own kw_demand/usage_kwh
# split for that ESI/period.
_CHARGE_TEMPLATES = {
    "TRN002": {"rate": Decimal("3.620742"), "uom": "K1", "basis": "demand",
               "desc": "Firm Point to Point Transmission Service Charge for long term or short term firm point to point transmission service",
               "comments": "TRANSMISSION COST RECOVERY FACTOR"},
    "BAS003": {"rate": Decimal("30.82"), "uom": "EA", "basis": "flat",
               "desc": "Delivery Point Charge", "comments": "METERING CHARGE"},
    "MSC025": {"rate": Decimal("0.053"), "uom": "K1", "basis": "demand",
               "desc": "Nuclear Decommissioning", "comments": "NUCLEAR DECOMMISSIONING CHARGE"},
    "BAS001": {"rate": Decimal("9.25"), "uom": "EA", "basis": "flat",
               "desc": "Basic Customer Charge", "comments": "CUSTOMER CHARGE"},
    "DIS001": {"rate": Decimal("4.49733"), "uom": "K1", "basis": "demand",
               "desc": "Distribution Charge", "comments": "DISTRIBUTION SYSTEM CHARGE"},
    "MSC041": {"rate": Decimal("0.000348"), "uom": "KH", "basis": "energy",
               "desc": "Energy Efficiency Cost Recovery Factor (EECRF)", "comments": "ENERGY EFFICIENCY COST RECOVERY"},
    "MSC042": {"rate": Decimal("0.099593"), "uom": "K1", "basis": "demand",
               "desc": "Distribution Cost Recovery Factor", "comments": "DISTRIBUTION COST RECOVERY FACTOR"},
    "MSC024": {"rate": Decimal("0.00033"), "uom": "KH", "basis": "energy",
               "desc": "Public Purpose Program", "comments": "ELECTRICITY RELIEF PROGRAM"},
}
DEFAULT_CHARGE_CODES = ["TRN002", "BAS003", "MSC025", "BAS001", "DIS001", "MSC041", "MSC042", "MSC024"]


def _fmt_date(d: date) -> str:
    """m/d/Y with no zero-padding, matching the real sample files."""
    return f"{d.month}/{d.day}/{d.year}"


async def _unique_interchange(db: AsyncSession) -> str:
    for _ in range(20):
        ic = str(random.randint(10_000_000, 99_999_999))
        r = await db.execute(text("SELECT 1 FROM edi_files WHERE interchange_control = :ic"), {"ic": ic})
        if not r.fetchone():
            return ic
    raise RuntimeError("Could not generate a unique interchange_control after 20 attempts")


async def _unique_867_tracking(db: AsyncSession, esi_id: str) -> str:
    for _ in range(20):
        suffix = "".join(random.choices("0123456789", k=8))
        tracking = f"867030TD{esi_id[-10:]}{suffix}"[:100]
        r = await db.execute(
            text("SELECT 1 FROM edi_867_usage WHERE document_tracking_number = :t"), {"t": tracking}
        )
        if not r.fetchone():
            return tracking
    raise RuntimeError(f"Could not generate a unique 867 tracking number for ESI {esi_id}")


async def _unique_810_tracking(db: AsyncSession, esi_id: str) -> str:
    for _ in range(20):
        suffix = "".join(random.choices("0123456789", k=8))
        tracking = f"810000{esi_id[-10:]}Z{suffix}"[:100]
        r = await db.execute(
            text("SELECT 1 FROM edi_810_line_items WHERE document_tracking_number = :t"), {"t": tracking}
        )
        if not r.fetchone():
            return tracking
    raise RuntimeError(f"Could not generate a unique 810 tracking number for ESI {esi_id}")


def _synthetic_usage(esi_id: str, contract_rate: Optional[Decimal]) -> tuple:
    """Deterministic-per-ESI plausible usage_kwh / kw_demand pair.

    Seeded on the ESI ID so repeated generation for the same ESI (e.g. re-runs
    during testing) produces the same numbers. Demand-to-energy ratio (~8.5%)
    matches the order of magnitude observed in the real 867_03 sample
    (70 kWh / 6 kW, 8600 kWh / 45 kW, etc).
    """
    rnd = random.Random(esi_id)
    usage_kwh = Decimal(rnd.randint(400, 3000))
    kw_demand = (usage_kwh * Decimal("0.085")).quantize(Decimal("1"))
    if kw_demand < 1:
        kw_demand = Decimal("1")
    return usage_kwh, kw_demand


async def _lookup_contract(db: AsyncSession, esi_id: str) -> Optional[dict]:
    r = await db.execute(text("""
        SELECT contract_rate, other_charge, contract_start_date, contract_end_date
        FROM contract_renewal
        WHERE TRIM(premise_id) = :esi_id AND status = 'active'
        ORDER BY contract_start_date DESC
        LIMIT 1
    """), {"esi_id": esi_id.strip()})
    row = r.fetchone()
    if not row:
        return None
    rate_str, other_charge, c_start, c_end = row
    try:
        contract_rate = Decimal(str(rate_str)) if rate_str else None
    except InvalidOperation:
        contract_rate = None
    return {
        "contract_rate": contract_rate,
        "other_charge": other_charge,
        "contract_start_date": c_start,
        "contract_end_date": c_end,
    }


async def generate_edi_files(
    db: AsyncSession,
    esi_ids: list,
    file_types: list,
    service_start: date,
    service_end: date,
    charge_codes: Optional[list] = None,
) -> dict:
    """
    Look up each ESI against contract_renewal; build one combined 867 file
    and/or one combined 810 file (matching how real files carry many ESIs).
    Returns generated file content plus skip reasons -- nothing is written
    to disk or uploaded.
    """
    codes = charge_codes or DEFAULT_CHARGE_CODES
    unknown = [c for c in codes if c not in _CHARGE_TEMPLATES]
    if unknown:
        raise ValueError(
            f"charge_codes {unknown} have no verified real-sample template. "
            f"Supported codes: {sorted(_CHARGE_TEMPLATES)}"
        )

    matched = []
    skipped = []
    for esi_id in esi_ids:
        contract = await _lookup_contract(db, esi_id)
        if not contract:
            skipped.append({"esi_id": esi_id, "reason": "No active contract_renewal row found for this premise_id"})
            continue
        usage_kwh, kw_demand = _synthetic_usage(esi_id, contract["contract_rate"])
        matched.append({
            "esi_id": esi_id,
            "contract": contract,
            "usage_kwh": usage_kwh,
            "kw_demand": kw_demand,
        })

    files = []

    if "867" in file_types and matched:
        interchange = await _unique_interchange(db)
        db_seen_interchanges = {interchange}
        lines = [
            f"H~{interchange}~867_03~{_fmt_date(date.today())}~{datetime.now().strftime('%H:%M:%S')}~"
            f"{_ERCOT_DUNS}~{_ERCOT_NAME}~{_MARKETER_DUNS}~{_MARKETER_NAME}~4.0~TX",
            _867_L_ROW,
        ]
        txn = _fmt_date(date.today())
        d_row_count = 0
        for m in matched:
            tracking = await _unique_867_tracking(db, m["esi_id"])
            meter = "I" + "".join(random.Random(m["esi_id"] + "meter").choices("0123456789", k=8))
            ctx = {
                "tracking": tracking, "txn": txn, "esi": m["esi_id"],
                "kwh": str(m["usage_kwh"]), "kw": str(m["kw_demand"]), "meter": meter,
                "start": _fmt_date(service_start), "end": _fmt_date(service_end),
            }
            for tmpl in (_867_ROW_SU_KHMON, _867_ROW_SU_K4MON, _867_ROW_PL_KHMON, _867_ROW_PL_K4MON):
                lines.append(tmpl.format(**ctx))
                d_row_count += 1
        lines.append(f"T~{interchange}~867_03~{d_row_count}")
        files.append({
            "filename": f"In_207_ONCOR_{date.today().strftime('%y%m%d')}_86703_TEST{interchange}.txt",
            "edi_type": "867_03",
            "interchange_control": interchange,
            "content": "\n".join(lines) + "\n",
        })

    if "810" in file_types and matched:
        interchange = await _unique_interchange(db)
        lines = [
            f"H~{interchange}~810_02~{_fmt_date(date.today())}~{datetime.now().strftime('%H:%M:%S')}~"
            f"{_TDSP_DUNS}~{_TDSP_NAME}~{_MARKETER_DUNS}~{_MARKETER_DUNS} - {_MARKETER_NAME}~4.0~TX",
            _810_L_ROW,
        ]
        txn = _fmt_date(date.today())
        due = _fmt_date(date.today() + timedelta(days=35))
        d_row_count = 0
        for m in matched:
            tracking = await _unique_810_tracking(db, m["esi_id"])
            orig_doc = "".join(random.Random(m["esi_id"] + "origdoc").choices("0123456789Z", k=27))

            charge_rows = []
            total = Decimal("0.00")
            for code in codes:
                tmpl = _CHARGE_TEMPLATES[code]
                if tmpl["basis"] == "demand":
                    qty = m["kw_demand"]
                elif tmpl["basis"] == "energy":
                    qty = m["usage_kwh"]
                else:
                    qty = Decimal("1")
                amount = (qty * tmpl["rate"]).quantize(Decimal("0.01"))
                total += amount
                charge_rows.append((code, tmpl, qty, amount))

            for code, tmpl, qty, amount in charge_rows:
                ctx = {
                    "tracking": tracking, "txn": txn, "esi": m["esi_id"], "orig_doc": orig_doc,
                    "due": due, "start": _fmt_date(service_start), "end": _fmt_date(service_end),
                    "code": code, "desc": tmpl["desc"], "amount": str(amount), "rate": str(tmpl["rate"]),
                    "uom": tmpl["uom"], "qty": str(qty), "comments": tmpl["comments"],
                    "invoice_total": str(total.quantize(Decimal("0.01"))),
                }
                lines.append(_810_ROW.format(**ctx))
                d_row_count += 1
        lines.append(f"T~{interchange}~810_02~{d_row_count}")
        files.append({
            "filename": f"In_207_ONCOR_{date.today().strftime('%y%m%d')}_81002_TEST{interchange}.txt",
            "edi_type": "810_02",
            "interchange_control": interchange,
            "content": "\n".join(lines) + "\n",
        })

    return {
        "files": files,
        "matched_esi_ids": [m["esi_id"] for m in matched],
        "skipped": skipped,
    }
