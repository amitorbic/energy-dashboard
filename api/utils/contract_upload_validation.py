"""
Shared row validation for contract uploads.

Used by BOTH the Portfolio standalone upload (routers/admin_portfolio_contracts.py)
and the contract_renewal bulk upload (routers/contract_renewal.py) so the
required-field rules cannot drift apart.

Canonical field names are the Portfolio ones. contract_renewal column names map
as: esi_id=premise_id, annual_volume=contract_renewal_usage,
contract_rate=contract_rate. Callers translate before calling.

Required (all callers): esi_id, load_profile, contract_rate, annual_volume,
contract_type, contract_end_date; contract_start_date when contract_type is
Future. Also checked: esi_id is alphanumeric only, contract_rate is a number in
[0, RATE_MAX_EXCLUSIVE), annual_volume is a number >= 0, and load_profile must be
one of the values in the tenant's own load_profiles_master (a shared reference
table synced to every tenant; see utils/shared_reference_tables.py). The match is
exact and case-sensitive, like the master's stored values (all upper case, no
padding). The caller loads the set with load_valid_profiles() and passes it in;
it is a required argument so the check cannot be skipped.
"""
import re
from datetime import datetime
from decimal import Decimal

from sqlalchemy import text

from utils.contract_type_utils import normalize_upload_type

REQUIRED_FIELDS = [
    "esi_id", "load_profile", "contract_rate", "annual_volume",
    "contract_type", "contract_end_date",
]

# contract_renewal's sync trigger parses contract_end_date with
# STR_TO_DATE(..., '%m/%d/%Y'); any other format is silently skipped there.
DATE_FORMATS_MDY = ("%m/%d/%Y",)
DATE_FORMATS_MDY_OR_ISO = ("%m/%d/%Y", "%Y-%m-%d")

ESI_ALNUM = re.compile(r"[A-Za-z0-9]+")

# contract_rate is $/kWh: accepted range is 0 <= rate < RATE_MAX_EXCLUSIVE.
RATE_MAX_EXCLUSIVE = Decimal("1.0")

_NUMBER = re.compile(r"[+-]?(\d+(\.\d*)?|\.\d+)")


def _parse_number(raw) -> Decimal | None:
    s = str(raw).strip()
    return Decimal(s) if _NUMBER.fullmatch(s) else None


class LoadProfileMasterUnavailable(Exception):
    """load_profiles_master is missing or empty in this DB: the upload cannot be validated."""


async def load_valid_profiles(db) -> frozenset[str]:
    """Read every full_load_profile from this DB's load_profiles_master.

    Raises LoadProfileMasterUnavailable (never returns an empty set) so a tenant
    whose master table was not synced fails loudly instead of skipping the check.
    """
    try:
        rows = (await db.execute(text("SELECT full_load_profile FROM load_profiles_master"))).fetchall()
    except Exception as exc:
        raise LoadProfileMasterUnavailable(
            f"load_profiles_master could not be read in this database ({exc.__class__.__name__}); "
            "run the reference-data sync (scripts/sync_reference_data.py) and retry."
        ) from exc
    if not rows:
        raise LoadProfileMasterUnavailable(
            "load_profiles_master is empty in this database, so load_profile cannot be validated; "
            "run the reference-data sync (scripts/sync_reference_data.py) and retry."
        )
    return frozenset(r[0] for r in rows)


def _blank(v) -> bool:
    return v is None or (isinstance(v, float) and v != v) or not str(v).strip()


def parse_date(raw, formats=DATE_FORMATS_MDY_OR_ISO) -> str | None:
    """Return YYYY-MM-DD, or None if blank/unparseable in every allowed format."""
    if _blank(raw):
        return None
    s = str(raw).strip()
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


_LABELS = {
    "esi_id": "ESI ID", "load_profile": "Load profile", "contract_rate": "Contract rate",
    "annual_volume": "Annual volume", "contract_type": "Contract type",
    "contract_end_date": "Contract end date", "contract_start_date": "Contract start date",
}
_EXAMPLE_PROFILE = "RESHIWR_NORTH_IDR_WS_NOTOU"
_TYPES_TEXT = "Fix, Future, LMP, MTM, MCP, MCP2"


def _shown(v) -> str:
    return "" if _blank(v) else str(v)


def _problem(column: str, value, code: str, message: str, fix: str) -> dict:
    return {"column": column, "value": _shown(value), "code": code, "message": message, "fix": fix}


def validate_contract_row_detailed(
    data: dict,
    *,
    valid_profiles: frozenset[str],
    date_formats=DATE_FORMATS_MDY_OR_ISO,
    strict_esi: bool = False,
    default_start_today: bool = True,
    start_date_formats=None,
) -> tuple[list[dict], dict | None]:
    """
    Returns (problems, parsed). Each problem is {column, value, code, message, fix}:
    column is the template column name, value the submitted text, code a short
    machine-readable id, message plain language, fix a one-line "how to fix".
    parsed is None when problems is non-empty.

    strict_esi: reject any whitespace/control character in esi_id, checked on the
      raw value before any strip (both uploads pass True). Without it, surrounding
      whitespace is trimmed first. Either way the remaining characters must be
      alphanumeric. No length rule is applied.
    default_start_today: blank non-Future start date becomes today (Portfolio
      behaviour). contract_renewal passes False and keeps blank as None.
    start_date_formats: formats accepted for contract_start_date only. None (default) means the
      same as date_formats, so existing callers are unchanged. The Portfolio upload passes
      DATE_FORMATS_MDY so its start date must be month/day/year (ISO is rejected).
    valid_profiles: the tenant's load_profiles_master values (see load_valid_profiles).
      load_profile must equal one of them exactly (case-sensitive, no trimming).
    """
    problems: list[dict] = []

    for col in REQUIRED_FIELDS:
        if _blank(data.get(col)):
            problems.append(_problem(
                col, "", "missing_value", f"{_LABELS[col]} is required.",
                f"Fill in {col} for this row.",
            ))

    raw_esi = data.get("esi_id")
    if not _blank(raw_esi):
        esi = str(raw_esi) if strict_esi else str(raw_esi).strip()
        if re.search(r"\s", esi):
            problems.append(_problem(
                "esi_id", raw_esi, "esi_has_space",
                "ESI ID contains spaces or symbols. Use letters and numbers only.",
                "Delete any space or line break in the ESI ID, including a hidden one at the start or end of the cell.",
            ))
        elif not ESI_ALNUM.fullmatch(esi):
            problems.append(_problem(
                "esi_id", raw_esi, "esi_has_symbol",
                "ESI ID contains spaces or symbols. Use letters and numbers only.",
                "Remove symbols such as - _ . / from the ESI ID.",
            ))

    if not _blank(data.get("contract_rate")):
        rate = _parse_number(data["contract_rate"])
        rate_msg = ("Contract rate must be a number from 0 up to (not including) 1, "
                    "in dollars per kWh, for example 0.0465.")
        if rate is None:
            problems.append(_problem(
                "contract_rate", data["contract_rate"], "rate_not_number", rate_msg,
                "Enter the rate as a plain number such as 0.0465, with no $ sign or letters.",
            ))
        elif not (0 <= rate < RATE_MAX_EXCLUSIVE):
            problems.append(_problem(
                "contract_rate", data["contract_rate"], "rate_out_of_range", rate_msg,
                "If the rate is in cents (for example 6.5), divide by 100 to get dollars per kWh (0.065).",
            ))

    if not _blank(data.get("annual_volume")):
        vol = _parse_number(data["annual_volume"])
        if vol is None or vol < 0:
            problems.append(_problem(
                "annual_volume", data["annual_volume"],
                "volume_not_number" if vol is None else "volume_negative",
                "Annual volume must be a number of 0 or more, with no commas.",
                "Enter the yearly kWh as a plain number such as 120000.",
            ))

    raw_lp = data.get("load_profile")
    if not _blank(raw_lp):
        lp = str(raw_lp)
        if lp not in valid_profiles:
            near = next((p for p in valid_profiles if p.upper() == lp.strip().upper()), None)
            hint = f" Did you mean '{near}'?" if near else ""
            problems.append(_problem(
                "load_profile", raw_lp, "profile_unknown",
                "Load profile is not in the master list. Use a profile exactly as listed "
                f"(capital letters), for example {_EXAMPLE_PROFILE}.{hint}",
                "Copy the profile exactly as listed in the master list: capital letters, no spaces before or after.",
            ))

    date_msg_tail = "written as month/day/year, for example 12/31/2027."
    date_fix = "Write the date as MM/DD/YYYY and check that the day exists (for example, there is no 13/45/2028)."
    raw_end = data.get("contract_end_date")
    parsed_end = parse_date(raw_end, date_formats)
    if not _blank(raw_end) and not parsed_end:
        problems.append(_problem(
            "contract_end_date", raw_end, "end_date_invalid",
            f"Contract end date must be a real date {date_msg_tail}", date_fix,
        ))

    raw_start = data.get("contract_start_date")
    start_given = not _blank(raw_start)
    parsed_start = None
    if start_given:
        parsed_start = parse_date(raw_start, start_date_formats or date_formats)
        if not parsed_start:
            problems.append(_problem(
                "contract_start_date", raw_start, "start_date_invalid",
                f"Contract start date must be a real date {date_msg_tail}", date_fix,
            ))
    elif default_start_today:
        parsed_start = datetime.now().strftime("%Y-%m-%d")

    contract_type = ""
    if not _blank(data.get("contract_type")):
        raw_type = str(data["contract_type"]).strip()
        contract_type, type_error = normalize_upload_type(raw_type)
        if type_error:
            problems.append(_problem(
                "contract_type", data["contract_type"], "type_not_recognised",
                f"Contract type '{raw_type}' is not recognised. Use one of: {_TYPES_TEXT}.",
                "Change the contract type to one of the listed values.",
            ))
        elif contract_type == "Future" and not start_given:
            problems.append(_problem(
                "contract_start_date", "", "future_needs_start",
                "Future contracts need a contract start date.",
                "Fill in contract_start_date, or change the contract type.",
            ))

    if problems:
        return problems, None

    return [], {
        "esi_id": str(raw_esi) if strict_esi else str(raw_esi).strip(),
        "load_profile": str(data["load_profile"]),
        "contract_rate": str(data["contract_rate"]).strip(),
        "annual_volume": str(data["annual_volume"]).strip(),
        "contract_type": contract_type,
        "contract_start_date": parsed_start,
        "contract_end_date": parsed_end,
        "contract_end_date_raw": str(raw_end).strip(),
        "contract_start_date_raw": str(raw_start).strip() if start_given else None,
    }


def validate_contract_row(data: dict, **kwargs) -> tuple[list[str], dict | None]:
    """Same checks as validate_contract_row_detailed; errors come back as plain message strings."""
    problems, parsed = validate_contract_row_detailed(data, **kwargs)
    return [p["message"] for p in problems], parsed
