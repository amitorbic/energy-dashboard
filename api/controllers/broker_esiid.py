"""
Broker ESIID Lookup — exact replication of esiid.php / esiid_lookup.php.

TDSP → table mapping (esiid.php lines 141-157).
Address search: 4-step fallback (exact → long form → short form → numeric prefix).
Results capped at 10; rows with "TEMP" in address are excluded.
"""

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


# ---------------------------------------------------------------------------
# TDSP name → database table (esiid.php lines 141-157)
# ---------------------------------------------------------------------------
_TDSP_TABLE = {
    "AEP Texas Central Service Area":               "aep_central",
    "AEP Texas North Service Area":                 "aep_north",
    "Centerpoint Electric Service Area":            "cnp",
    "Nueces Electric Cooperative Service Area":     "necsa",
    "Oncor Electric Delivery Service Area (SESCO territory)": "sesco",
    "Sharyland Utilities Service Area":             "susa",
    "Texas New Mexico Power Service Area":          "tnmps",
    "Oncor Electric Delivery Service Area":         "oncor",
}

# ESI ID first-4-digits → table (esiid.php lines 122-137)
_ESID_PREFIX_TABLE = {
    "1008": "cnp",
    "1040": "tnmps",
    "1044": "oncor",
    "1003": "aep_central",
    "1020": "aep_central",
    "1017": "susa",
}

# ---------------------------------------------------------------------------
# Address abbreviation expansions (mirrors esiid.php "long form" transform)
# ---------------------------------------------------------------------------
_EXPAND = {
    " RD ": " ROAD ", " LN ": " LANE ", " PKWY ": " PARTWAY ",
    " HWY ": " HIGHWAY ", " DR ": " DRIVEWAY ", " AVE ": " AVENUE ",
}
_CONTRACT = {v: k for k, v in _EXPAND.items()}


def _expand_address(addr: str) -> str:
    a = " " + addr.upper() + " "
    for short, long in _EXPAND.items():
        a = a.replace(short, long)
    return a.strip()


def _contract_address(addr: str) -> str:
    a = " " + addr.upper() + " "
    for long, short in _CONTRACT.items():
        a = a.replace(long, short)
    return a.strip()


def _numeric_prefix(addr: str) -> str:
    import re
    m = re.match(r"^(\d+)", addr.strip())
    return m.group(1) if m else ""


def _title_case(val: str) -> str:
    return val.title() if val else ""


# ---------------------------------------------------------------------------
# Single-table address search (helper)
# ---------------------------------------------------------------------------

async def _search_table(
    db: AsyncSession, table: str, where_clause: str, params: dict,
    results: list, seen: set,
) -> None:
    sql = text(f"SELECT esiid, address, city, state, zipcode FROM `{table}` WHERE {where_clause}")
    rows = (await db.execute(sql, params)).fetchall()
    for row in rows:
        if len(results) >= 10:
            break
        esiid = row[0] or ""
        addr  = row[1] or ""
        if "TEMP" in addr.upper():
            continue
        if esiid in seen:
            continue
        seen.add(esiid)
        results.append({
            "esiid":   esiid,
            "address": _title_case(addr),
            "city":    _title_case(row[2] or ""),
            "state":   _title_case(row[3] or ""),
            "zipcode": _title_case(row[4] or ""),
        })


# ---------------------------------------------------------------------------
# Search by address (4-step fallback, mirrors esiid.php)
# ---------------------------------------------------------------------------

async def search_by_address(
    db: AsyncSession, table: str, ser_text: str, city: str, zipcode: str,
) -> List[dict]:
    results: list = []
    seen: set = set()

    use_city = city and city.upper() not in ("", "CITY")

    async def _try(addr_str: str) -> None:
        if len(results) >= 10:
            return
        if use_city:
            clause = "address LIKE :addr AND city = :city AND zipcode = :zip"
            params = {"addr": f"%{addr_str}%", "city": city.upper(), "zip": zipcode}
        else:
            clause = "address LIKE :addr AND zipcode = :zip"
            params = {"addr": f"%{addr_str}%", "zip": zipcode}
        await _search_table(db, table, clause, params, results, seen)

    # Step 1: exact
    await _try(ser_text.upper())
    # Step 2: long form
    if len(results) < 10:
        await _try(_expand_address(ser_text))
    # Step 3: short form
    if len(results) < 10:
        await _try(_contract_address(ser_text))
    # Step 4: numeric prefix
    if len(results) < 10:
        prefix = _numeric_prefix(ser_text)
        if prefix:
            await _try(prefix)

    return results


# ---------------------------------------------------------------------------
# Search by single ESI ID
# ---------------------------------------------------------------------------

async def search_by_esiid(
    db: AsyncSession, table: str, ser_text: str, city: str, zipcode: str,
) -> List[dict]:
    results: list = []
    seen: set = set()

    use_city = city and city.upper() not in ("", "CITY")
    if use_city:
        clause = "esiid = :esiid AND city = :city AND zipcode = :zip"
        params = {"esiid": ser_text, "city": city.upper(), "zip": zipcode}
    else:
        clause = "esiid = :esiid AND zipcode = :zip"
        params = {"esiid": ser_text, "zip": zipcode}

    await _search_table(db, table, clause, params, results, seen)
    return results


# ---------------------------------------------------------------------------
# Search by multiple ESI IDs (space-separated)
# ---------------------------------------------------------------------------

async def search_by_multiple_esiid(
    db: AsyncSession, ser_text: str,
) -> List[dict]:
    results: list = []
    seen: set = set()

    esiids = ser_text.split()
    for eid in esiids:
        if len(results) >= 10:
            break
        prefix = eid[:4]
        table  = _ESID_PREFIX_TABLE.get(prefix)
        if not table:
            continue
        clause = "esiid = :esiid"
        params = {"esiid": eid}
        await _search_table(db, table, clause, params, results, seen)

    return results


# ---------------------------------------------------------------------------
# Public entry point — dispatches by search_type
# ---------------------------------------------------------------------------

async def esiid_lookup(
    db: AsyncSession,
    tdsp: str,
    city: str,
    zipcode: str,
    search_type: str,   # "address" | "esiid" | "multiple_esiid"
    ser_text: str,
) -> List[dict]:
    if search_type == "multiple_esiid":
        return await search_by_multiple_esiid(db, ser_text)

    table = _TDSP_TABLE.get(tdsp)
    if not table:
        return []

    if search_type == "esiid":
        return await search_by_esiid(db, table, ser_text, city, zipcode)

    # default: address
    return await search_by_address(db, table, ser_text, city, zipcode)
