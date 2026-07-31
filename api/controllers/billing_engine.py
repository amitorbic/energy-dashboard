import json
from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ── D-row field positions (index 0 = row-type prefix 'D') ────────────────────

class _P867:
    DOC_TRACKING = 5
    TDSP_DUNS    = 10
    TDSP_NAME    = 11
    ESI_ID       = 14
    PTD_CODE     = 21
    READING_TYPE = 23
    CONSUMPTION  = 25
    METER_NUMBER = 26
    METER_TYPE   = 34
    SVC_START    = 50
    SVC_END      = 52
    EST_REASON   = 58

class _P810:
    SUB_PURPOSE  = 4
    DOC_TRACKING = 5
    TDSP_DUNS    = 10
    TDSP_NAME    = 11
    ESI_ID       = 14
    ORIG_DOC_ID  = 16
    LINE_ITEM    = 19
    RATE_CLASS   = 21
    SVC_START    = 23
    SVC_END      = 24
    CHARGE_CODE  = 31
    CHARGE_DESC  = 32
    AMOUNT       = 33
    RATE         = 34
    UOM          = 35
    QUANTITY     = 36
    REG_QTY      = 37
    COMMENTS     = 38
    INV_TOTAL    = 42

# ── Utilities ─────────────────────────────────────────────────────────────────

def _f(parts: list, idx: int) -> str:
    try:
        return parts[idx].strip()
    except IndexError:
        return ''

def _parse_date(s: str) -> Optional[date]:
    s = (s or '').strip()
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def _parse_decimal(s: str) -> Optional[Decimal]:
    s = (s or '').strip()
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None

def _parse_meter_fee(s: str) -> Optional[Decimal]:
    """Strip leading $ if present, parse remainder as DECIMAL. NULL stays NULL."""
    s = (s or '').strip()
    if not s:
        return None
    if s.startswith('$'):
        s = s[1:]
    try:
        return Decimal(s)
    except InvalidOperation:
        return None

# ── 867 parser ────────────────────────────────────────────────────────────────

def parse_867(content: str) -> dict:
    """
    Parse raw 867_03 file content.
    Groups D-rows by Document_Tracking_Number → one record per ESI per period.
    """
    lines = [l for l in content.splitlines() if l.strip()]

    interchange = edi_type = file_date_str = None
    file_tdsp_duns = file_tdsp_name = None

    for line in lines:
        if line.startswith('H~'):
            h = line.split('~')
            interchange    = _f(h, 1)
            edi_type       = _f(h, 2)
            file_date_str  = _f(h, 3)
            break

    groups: dict[str, list] = {}
    for line in lines:
        if not line.startswith('D~'):
            continue
        parts = line.split('~')
        tracking = _f(parts, _P867.DOC_TRACKING)
        if not tracking:
            continue
        if tracking not in groups:
            groups[tracking] = []
        groups[tracking].append(parts)
        if file_tdsp_duns is None:
            file_tdsp_duns = _f(parts, _P867.TDSP_DUNS) or None
            file_tdsp_name = _f(parts, _P867.TDSP_NAME) or None

    esi_records = [_collapse_867_group(t, r) for t, r in groups.items()]

    return {
        'interchange':   interchange,
        'edi_type':      edi_type,
        'file_date':     _parse_date(file_date_str),
        'tdsp_duns':     file_tdsp_duns,
        'tdsp_name':     file_tdsp_name,
        'esi_records':   esi_records,
    }


def _collapse_867_group(tracking: str, rows: list) -> dict:
    """Collapse 2-N D-rows for one Document_Tracking_Number into one record."""
    first = rows[0]
    esi_id    = _f(first, _P867.ESI_ID)
    tdsp_duns = _f(first, _P867.TDSP_DUNS) or None
    tdsp_name = _f(first, _P867.TDSP_NAME) or None

    usage_kwh = kw_demand = None
    service_start = service_end = None
    ptd_code = reading_type = meter_number = meter_type = None
    est_reason = None
    is_estimated = 0

    for parts in rows:
        ptd  = _f(parts, _P867.PTD_CODE)
        mtyp = _f(parts, _P867.METER_TYPE)
        rt   = _f(parts, _P867.READING_TYPE)

        if ptd == 'SU':
            ptd_code     = 'SU'
            reading_type = rt or reading_type
            if rt == 'KA':
                is_estimated = 1
                est_reason = _f(parts, _P867.EST_REASON) or est_reason

            ssd = _parse_date(_f(parts, _P867.SVC_START))
            sed = _parse_date(_f(parts, _P867.SVC_END))
            if ssd:
                service_start = ssd
            if sed:
                service_end = sed

            mn = _f(parts, _P867.METER_NUMBER)
            if mn:
                meter_number = mn

            val = _parse_decimal(_f(parts, _P867.CONSUMPTION))
            if mtyp in ('KHMON', 'KH'):
                usage_kwh = val
                meter_type = mtyp
            elif mtyp in ('K4MON', 'K1MON'):
                kw_demand = val

        elif ptd in ('PL', 'BD'):
            mn = _f(parts, _P867.METER_NUMBER)
            if mn and not meter_number:
                meter_number = mn
            # Dates from PL only as fallback when SU row is absent
            if service_start is None:
                service_start = _parse_date(_f(parts, _P867.SVC_START))
            if service_end is None:
                service_end = _parse_date(_f(parts, _P867.SVC_END))

    billing_days = 0
    if service_start and service_end:
        billing_days = (service_end - service_start).days

    return {
        'document_tracking_number': tracking,
        'esi_id':            esi_id,
        'tdsp_duns':         tdsp_duns,
        'tdsp_name':         tdsp_name,
        'meter_number':      meter_number,
        'service_start':     service_start,
        'service_end':       service_end,
        'billing_days':      billing_days,
        'usage_kwh':         usage_kwh,
        'kw_demand':         kw_demand,
        'ptd_code':          ptd_code,
        'reading_type_code': reading_type,
        'is_estimated':      is_estimated,
        'meter_type':        meter_type,
        'raw_segments':      rows,           # list of split-field lists
    }

# ── 810 parser ────────────────────────────────────────────────────────────────

def parse_810(content: str) -> dict:
    """Parse raw 810_02 file content. One dict per D-row (one per line item)."""
    lines = [l for l in content.splitlines() if l.strip()]

    interchange = edi_type = file_date_str = None
    file_tdsp_duns = file_tdsp_name = None

    for line in lines:
        if line.startswith('H~'):
            h = line.split('~')
            interchange   = _f(h, 1)
            edi_type      = _f(h, 2)
            file_date_str = _f(h, 3)
            break

    line_items = []
    for line in lines:
        if not line.startswith('D~'):
            continue
        parts = line.split('~')

        if file_tdsp_duns is None:
            file_tdsp_duns = _f(parts, _P810.TDSP_DUNS) or None
            file_tdsp_name = _f(parts, _P810.TDSP_NAME) or None

        sub = _f(parts, _P810.SUB_PURPOSE).upper()
        if sub not in ('MONTH', 'FINAL'):
            sub = 'MONTH'

        line_num_s = _f(parts, _P810.LINE_ITEM)
        line_num   = int(line_num_s) if line_num_s.isdigit() else None

        line_items.append({
            'document_tracking_number': _f(parts, _P810.DOC_TRACKING),
            'esi_id':               _f(parts, _P810.ESI_ID),
            'tdsp_duns':            _f(parts, _P810.TDSP_DUNS) or None,
            'tdsp_name':            _f(parts, _P810.TDSP_NAME) or None,
            'original_document_id': _f(parts, _P810.ORIG_DOC_ID) or None,
            'document_sub_purpose': sub,
            'service_start':        _parse_date(_f(parts, _P810.SVC_START)),
            'service_end':          _parse_date(_f(parts, _P810.SVC_END)),
            'line_item_number':     line_num,
            'utility_rate_class':   _f(parts, _P810.RATE_CLASS) or None,
            'charge_code':          _f(parts, _P810.CHARGE_CODE),
            'charge_description':   _f(parts, _P810.CHARGE_DESC) or None,
            'charge_amount':        _parse_decimal(_f(parts, _P810.AMOUNT)),
            'charge_rate':          _parse_decimal(_f(parts, _P810.RATE)),
            'charge_unit':          _f(parts, _P810.UOM) or None,
            'charge_quantity':      _parse_decimal(_f(parts, _P810.QUANTITY)),
            'registered_quantity':  _parse_decimal(_f(parts, _P810.REG_QTY)),
            'charge_comments':      _f(parts, _P810.COMMENTS) or None,
            'invoice_total_amount': _parse_decimal(_f(parts, _P810.INV_TOTAL)),
        })

    return {
        'interchange':  interchange,
        'edi_type':     edi_type,
        'file_date':    _parse_date(file_date_str),
        'tdsp_duns':    file_tdsp_duns,
        'tdsp_name':    file_tdsp_name,
        'line_items':   line_items,
    }

# ── Database helpers ──────────────────────────────────────────────────────────

async def _insert_bpc(
    db: AsyncSession,
    bp_id: int,
    mapping_id: int,
    billing_category: str,
    is_taxable: int,
    li: dict,
    line_item_id: int,
):
    """Insert one billing_period_charges row from a mapped 810 line item."""
    await db.execute(text("""
        INSERT INTO billing_period_charges
          (billing_period_id, charge_source, charge_category,
           charge_code, description, amount, quantity,
           unit_rate, unit, is_taxable, edi_810_line_item_id,
           sort_order)
        VALUES
          (:bp_id, 'tdsp', :category,
           :code, :desc, :amount, :qty,
           :rate, :unit, :is_taxable, :line_item_id,
           :sort_order)
    """), {
        'bp_id':        bp_id,
        'category':     billing_category,
        'code':         li['charge_code'],
        'desc':         li['charge_description'] or li['charge_code'],
        'amount':       li['charge_amount'],
        'qty':          li['charge_quantity'],
        'rate':         li['charge_rate'],
        'unit':         li['charge_unit'],
        'is_taxable':   int(is_taxable),
        'line_item_id': line_item_id,
        'sort_order':   li['line_item_number'] or 0,
    })


async def _retroactive_810_link(db: AsyncSession, bp_id: int, esi_id: str, svc_start, svc_end):
    """
    After a billing_period is created, pick up any 810 line items already
    in edi_810_line_items for this ESI+period that have mapping_id set
    but no billing_period_charges row yet.
    """
    r = await db.execute(text("""
        SELECT li.id, li.charge_code, li.charge_description,
               li.charge_amount, li.charge_rate, li.charge_quantity,
               li.charge_unit, li.registered_quantity, li.charge_comments,
               li.line_item_number,
               m.id, m.billing_category, m.is_taxable
        FROM edi_810_line_items li
        JOIN tdsp_charge_mappings m ON m.id = li.mapping_id
        WHERE li.esi_id       = :esi_id
          AND li.service_start = :svc_start
          AND li.service_end   = :svc_end
          AND li.billing_period_id IS NULL
          AND li.status = 'mapped'
          AND m.billing_category != 'excluded'
          AND m.is_taxable IS NOT NULL
    """), {'esi_id': esi_id, 'svc_start': svc_start, 'svc_end': svc_end})
    rows = r.fetchall()

    for row in rows:
        (li_id, code, desc, amount, rate, qty, unit, reg_qty, comments,
         line_num, mapping_id, category, is_taxable) = row
        li_dict = {
            'charge_code':        code,
            'charge_description': desc,
            'charge_amount':      amount,
            'charge_rate':        rate,
            'charge_quantity':    qty,
            'charge_unit':        unit,
            'registered_quantity': reg_qty,
            'charge_comments':    comments,
            'line_item_number':   line_num,
        }
        await _insert_bpc(db, bp_id, mapping_id, category, is_taxable, li_dict, li_id)
        await db.execute(text(
            "UPDATE edi_810_line_items SET billing_period_id=:bp WHERE id=:id"
        ), {'bp': bp_id, 'id': li_id})

    if rows:
        await db.execute(text(
            "UPDATE billing_periods SET has_810=1 WHERE id=:id"
        ), {'id': bp_id})

    return len(rows)


async def _fetch_contract_segments(
    db: AsyncSession, esi_id: str, svc_start: date, svc_end: date,
) -> list:
    """
    Active contract_renewal segments overlapping [svc_start, svc_end].
    contract_end_date is VARCHAR(100) in the legacy table -- overlap
    filtering is done in Python via _parse_date() rather than SQL.
    Shared by ingest_867 (initial match) and recompute_billing_period
    (admin revert re-match).
    """
    all_cr = await db.execute(text("""
        SELECT contract_rate, other_charge,
               contract_start_date, contract_end_date
        FROM contract_renewal
        WHERE premise_id = :esi_id AND status = 'active'
        ORDER BY contract_start_date
    """), {'esi_id': esi_id})

    segments = []
    for cr_row in all_cr.fetchall():
        c_rate_str, c_other, c_start, c_end_str = cr_row
        if c_start is None:
            continue
        c_end    = _parse_date(str(c_end_str) if c_end_str else '')
        ov_start = max(c_start, svc_start)
        ov_end   = min(c_end if c_end else svc_end, svc_end)
        seg_days = (ov_end - ov_start).days
        if seg_days <= 0:
            continue
        segments.append({
            'rate_str': c_rate_str,
            'other':    c_other,
            'c_start':  c_start,
            'ov_start': ov_start,
            'ov_end':   ov_end,
            'seg_days': seg_days,
        })
    return segments


def _compute_energy_from_segments(
    segments: list,
    billing_days: int,
    usage_kwh: Optional[Decimal],
) -> dict:
    """
    Derive contract_rate / meter_fee / energy_charge / flags / energy_rows
    from already-fetched contract segments. Pure function, no DB access --
    shared by ingest_867 and recompute_billing_period (admin revert).

    Empty `segments` naturally falls into the coverage-gap branch below
    (covered_days=0 < billing_days), which is the right outcome for revert
    (the billing_period already exists and must land somewhere). ingest_867
    still special-cases "no segments at all" itself, before calling this,
    since it additionally marks the source edi_867_usage row and skips
    billing_period creation entirely -- a distinction that only applies
    at initial ingest.
    """
    covered_days = sum(s['seg_days'] for s in segments)
    multi        = len(segments) > 1

    if not segments or covered_days < billing_days:
        return {
            'contract_rate': None, 'meter_fee': None,
            'energy_charge': Decimal('0.00'),
            'flags': ['contract_coverage_gap'], 'energy_rows': [],
        }

    if not multi:
        seg           = segments[0]
        contract_rate = _parse_decimal(str(seg['rate_str'])) if seg['rate_str'] else None
        meter_fee     = _parse_meter_fee(seg['other'])
        energy_charge = (
            (Decimal(str(usage_kwh)) * contract_rate).quantize(Decimal('0.01'))
            if usage_kwh is not None and contract_rate is not None
            else Decimal('0.00')
        )
        return {
            'contract_rate': contract_rate, 'meter_fee': meter_fee,
            'energy_charge': energy_charge, 'flags': [], 'energy_rows': [],
        }

    # Multiple contracts overlap the period -- prorate energy by days.
    # contract_rate stays NULL (no single rate represents the period).
    # meter_fee = latest segment's other_charge, taken in full.
    kwh       = Decimal(str(usage_kwh)) if usage_kwh is not None else Decimal('0')
    daily_kwh = kwh / Decimal(str(billing_days)) if billing_days > 0 else Decimal('0')
    energy_charge = Decimal('0.00')
    energy_rows   = []

    for seg in segments:
        seg_rate = _parse_decimal(str(seg['rate_str'])) if seg['rate_str'] else Decimal('0')
        seg_kwh  = (daily_kwh * Decimal(str(seg['seg_days']))).quantize(Decimal('0.0001'))
        seg_amt  = (seg_kwh * seg_rate).quantize(Decimal('0.01'))
        energy_charge += seg_amt
        rate_str = str(seg_rate.normalize())
        desc = (
            f"Energy Charge "
            f"{seg['ov_start'].strftime('%m/%d')}-{seg['ov_end'].strftime('%m/%d')}"
            f" @ ${rate_str}/kWh"
        )
        energy_rows.append({
            'description': desc,
            'quantity':    seg_kwh,
            'unit_rate':   seg_rate,
            'amount':      seg_amt,
        })

    latest_seg = max(segments, key=lambda s: s['c_start'])
    meter_fee  = _parse_meter_fee(latest_seg['other'])

    return {
        'contract_rate': None, 'meter_fee': meter_fee,
        'energy_charge': energy_charge,
        'flags': ['multi_contract_period'], 'energy_rows': energy_rows,
    }


async def _replay_810_charges(db: AsyncSession, bp_id: int) -> int:
    """
    Re-insert billing_period_charges rows for 810 line items already linked
    to this billing_period. Used by recompute_billing_period after an admin
    revert wipes billing_period_charges -- the revert never clears
    edi_810_line_items.billing_period_id/mapping_id/status, so the same
    mapping guard as _retroactive_810_link applies, just keyed off the
    existing link instead of a fresh NULL->bp_id match.
    """
    r = await db.execute(text("""
        SELECT li.id, li.charge_code, li.charge_description,
               li.charge_amount, li.charge_rate, li.charge_quantity,
               li.charge_unit, li.registered_quantity, li.charge_comments,
               li.line_item_number,
               m.id, m.billing_category, m.is_taxable
        FROM edi_810_line_items li
        JOIN tdsp_charge_mappings m ON m.id = li.mapping_id
        WHERE li.billing_period_id = :bp_id
          AND li.status = 'mapped'
          AND m.billing_category != 'excluded'
          AND m.is_taxable IS NOT NULL
    """), {'bp_id': bp_id})
    rows = r.fetchall()

    for row in rows:
        (li_id, code, desc, amount, rate, qty, unit, reg_qty, comments,
         line_num, mapping_id, category, is_taxable) = row
        li_dict = {
            'charge_code':        code,
            'charge_description': desc,
            'charge_amount':      amount,
            'charge_rate':        rate,
            'charge_quantity':    qty,
            'charge_unit':        unit,
            'registered_quantity': reg_qty,
            'charge_comments':    comments,
            'line_item_number':   line_num,
        }
        await _insert_bpc(db, bp_id, mapping_id, category, is_taxable, li_dict, li_id)

    return len(rows)


async def recompute_billing_period(db: AsyncSession, bp_id: int) -> dict:
    """
    Re-derive a billing_period's contract_rate/meter_fee/energy_charge/flags
    and regenerate its billing_period_charges (TDSP + addon + multi-segment
    energy breakdown) from the still-linked edi_867_usage/edi_810_line_items
    rows and current contract_renewal data.

    Called by the admin revert endpoint immediately after a period's invoice
    is deleted, its billing_period_charges are wiped, and its status is reset
    to 'draft' -- so staff can re-approve without re-uploading the source EDI
    files. Does NOT touch edi_867_usage/edi_810_line_items or their
    billing_period_id links; those stay intact across a revert.
    """
    bp_r = await db.execute(text("""
        SELECT esi_id, service_start, service_end, billing_days, usage_kwh
        FROM billing_periods WHERE id = :id
    """), {'id': bp_id})
    esi_id, svc_start, svc_end, billing_days, usage_kwh = bp_r.fetchone()

    segments = await _fetch_contract_segments(db, esi_id, svc_start, svc_end)
    match = _compute_energy_from_segments(segments, billing_days, usage_kwh)
    flags = list(match['flags'])

    if 'contract_coverage_gap' not in flags:
        addon_flags = await _insert_addon_charges(
            db=db,
            bp_id=bp_id,
            esi_id=esi_id,
            svc_start=svc_start,
            svc_end=svc_end,
            usage_kwh=Decimal(str(usage_kwh)) if usage_kwh is not None else None,
            billing_days=billing_days,
        )
        for f in addon_flags:
            if f not in flags:
                flags.append(f)

        if match['energy_rows']:
            for i, er in enumerate(match['energy_rows']):
                await db.execute(text("""
                    INSERT INTO billing_period_charges
                      (billing_period_id, charge_source, charge_category,
                       description, amount, quantity, unit_rate, unit,
                       is_taxable, sort_order)
                    VALUES
                      (:bp_id, 'supplier', 'energy',
                       :desc, :amount, :qty, :rate, 'kWh',
                       1, :sort)
                """), {
                    'bp_id':  bp_id,
                    'desc':   er['description'],
                    'amount': er['amount'],
                    'qty':    er['quantity'],
                    'rate':   er['unit_rate'],
                    'sort':   i,
                })
            if match['meter_fee'] is not None and match['meter_fee'] > 0:
                await db.execute(text("""
                    INSERT INTO billing_period_charges
                      (billing_period_id, charge_source, charge_category,
                       description, amount, quantity, unit_rate, unit,
                       is_taxable, sort_order)
                    VALUES
                      (:bp_id, 'supplier', 'meter_fee',
                       'Meter Fee', :amount, 1, :rate, NULL,
                       1, 99)
                """), {'bp_id': bp_id, 'amount': match['meter_fee'], 'rate': match['meter_fee']})

    tdsp_count = await _replay_810_charges(db, bp_id)

    await db.execute(text("""
        UPDATE billing_periods
        SET contract_rate = :cr, meter_fee = :mf, energy_charge = :ec,
            flags = :flags, has_810 = :has_810
        WHERE id = :id
    """), {
        'cr':      match['contract_rate'],
        'mf':      match['meter_fee'],
        'ec':      match['energy_charge'],
        'flags':   json.dumps(flags) if flags else None,
        'has_810': 1 if tdsp_count > 0 else 0,
        'id':      bp_id,
    })

    return {
        'contract_rate':         match['contract_rate'],
        'meter_fee':             match['meter_fee'],
        'energy_charge':         match['energy_charge'],
        'flags':                 flags,
        'tdsp_charges_restored': tdsp_count,
    }


async def _get_charge_mapping(db: AsyncSession, charge_code: str, tdsp_duns: Optional[str]):
    """DUNS-specific mapping first, then universal (NULL) fallback."""
    if tdsp_duns:
        r = await db.execute(text(
            "SELECT id, billing_category, is_taxable "
            "FROM tdsp_charge_mappings "
            "WHERE charge_code = :code AND tdsp_duns = :duns LIMIT 1"
        ), {'code': charge_code, 'duns': tdsp_duns})
        row = r.fetchone()
        if row:
            return row

    r = await db.execute(text(
        "SELECT id, billing_category, is_taxable "
        "FROM tdsp_charge_mappings "
        "WHERE charge_code = :code AND tdsp_duns IS NULL LIMIT 1"
    ), {'code': charge_code})
    return r.fetchone()

# ── Addon charge helpers ──────────────────────────────────────────────────────

def _calendar_month_segments(period_start: date, period_end: date) -> list:
    """
    Split billing period [period_start, period_end) into calendar month segments.
    period_end is exclusive: billing_days = (period_end - period_start).days.
    Returns [(seg_start, seg_end_exclusive, month_days), ...].
    """
    segs = []
    cur = period_start
    while cur < period_end:
        last_of_month = date(cur.year, cur.month, monthrange(cur.year, cur.month)[1])
        # First day of next calendar month
        if last_of_month.month == 12:
            first_of_next = date(last_of_month.year + 1, 1, 1)
        else:
            first_of_next = date(last_of_month.year, last_of_month.month + 1, 1)
        seg_end = min(first_of_next, period_end)
        segs.append((cur, seg_end, (seg_end - cur).days))
        cur = seg_end
    return segs


async def _insert_addon_charges(
    db: AsyncSession,
    bp_id: int,
    esi_id: str,
    svc_start: date,
    svc_end: date,
    usage_kwh: Optional[Decimal],
    billing_days: int,
) -> list:
    """
    Compute and insert billing_period_charges rows for all addon types attached
    to this ESI's latest active contract.

    Flat basis: one charge per period at the current open rate.
    Usage-based: one row per calendar month segment, rate prorated by days.
    Snapshot principle: rates are copied at INSERT time.

    Returns list of flag strings to append to billing_period (may be empty).
    Flag: 'addon_rate_missing' — at least one addon had no current/overlapping rate.
    """
    new_flags: list = []

    # Resolve the LATEST active contract for this ESI.
    # ORDER BY contract_start_date DESC mirrors the meter_fee rule in ingest_867:
    # in multi-contract periods the newest contract governs which addons apply.
    cr_r = await db.execute(text("""
        SELECT serial FROM contract_renewal
        WHERE premise_id = :esi_id AND status = 'active'
        ORDER BY contract_start_date DESC
        LIMIT 1
    """), {'esi_id': esi_id})
    cr_row = cr_r.fetchone()
    if not cr_row:
        return new_flags
    contract_serial = cr_row[0]

    addon_r = await db.execute(text("""
        SELECT cac.addon_type_id, act.code, act.description,
               act.calculation_basis, act.is_taxable
        FROM contract_addon_charges cac
        JOIN addon_charge_types act ON act.id = cac.addon_type_id
        WHERE cac.contract_serial = :serial
        ORDER BY act.code
    """), {'serial': contract_serial})
    addon_rows = addon_r.fetchall()

    if not addon_rows:
        return new_flags

    kwh = Decimal(str(usage_kwh)) if usage_kwh is not None else Decimal('0')
    daily_kwh = (kwh / Decimal(str(billing_days))) if billing_days > 0 else Decimal('0')
    month_segs = _calendar_month_segments(svc_start, svc_end)
    sort_offset = 0

    for addon_type_id, code, description, calc_basis, is_taxable_raw in addon_rows:
        is_taxable = bool(is_taxable_raw)

        # ── Flat basis ────────────────────────────────────────────────────────
        # One charge per billing period at the current open rate.
        # Which addons to bill is determined by the latest contract (above) —
        # identical to how meter_fee picks the latest segment's other_charge.
        if calc_basis == 'flat':
            flat_r = await db.execute(text("""
                SELECT rate FROM addon_charge_type_rates
                WHERE addon_type_id = :tid AND effective_to IS NULL
                LIMIT 1
            """), {'tid': addon_type_id})
            flat_row = flat_r.fetchone()
            if not flat_row:
                if 'addon_rate_missing' not in new_flags:
                    new_flags.append('addon_rate_missing')
                continue
            flat_rate = Decimal(str(flat_row[0]))
            await db.execute(text("""
                INSERT INTO billing_period_charges
                  (billing_period_id, charge_source, charge_category,
                   charge_code, description, amount, quantity, unit_rate, unit,
                   is_taxable, sort_order)
                VALUES
                  (:bp_id, 'supplier', 'addon',
                   :code, :desc, :amount, 1, :rate, NULL,
                   :taxable, :sort)
            """), {
                'bp_id':   bp_id,
                'code':    code,
                'desc':    description or code,
                'amount':  flat_rate.quantize(Decimal('0.01')),
                'rate':    flat_rate,
                'taxable': int(is_taxable),
                'sort':    200 + sort_offset,
            })
            sort_offset += 1
            continue

        # ── Usage-based basis ─────────────────────────────────────────────────
        # Calendar-month proration: one row per month segment, each at the rate
        # effective for that month. Snapshot principle: rate copied at INSERT.

        rates_r = await db.execute(text("""
            SELECT rate, effective_from, effective_to
            FROM addon_charge_type_rates
            WHERE addon_type_id = :tid
              AND effective_from < :svc_end
              AND (effective_to IS NULL OR effective_to >= :svc_start)
            ORDER BY effective_from
        """), {'tid': addon_type_id, 'svc_start': svc_start, 'svc_end': svc_end})

        rate_rows = []
        for rr in rates_r.fetchall():
            r_rate = Decimal(str(rr[0]))
            r_from = rr[1] if isinstance(rr[1], date) else date.fromisoformat(str(rr[1]))
            r_to   = (rr[2] if isinstance(rr[2], date) else date.fromisoformat(str(rr[2]))) if rr[2] else None
            rate_rows.append((r_rate, r_from, r_to))

        if not rate_rows:
            if 'addon_rate_missing' not in new_flags:
                new_flags.append('addon_rate_missing')
            continue

        for seg_start, seg_end, month_days in month_segs:
            seg_last = seg_end - timedelta(days=1)

            seg_rate = None
            for r_rate, r_from, r_to in rate_rows:
                if r_from <= seg_last and (r_to is None or r_to >= seg_start):
                    seg_rate = r_rate
                    break

            if seg_rate is None:
                continue

            month_label = seg_start.strftime('%b %Y')
            charge_desc = f"{description} ({month_label})" if description else f"{code} ({month_label})"
            seg_qty = (daily_kwh * Decimal(str(month_days))).quantize(Decimal('0.0001'))
            seg_amt = (seg_qty * seg_rate).quantize(Decimal('0.01'))

            await db.execute(text("""
                INSERT INTO billing_period_charges
                  (billing_period_id, charge_source, charge_category,
                   charge_code, description, amount, quantity, unit_rate, unit,
                   is_taxable, sort_order)
                VALUES
                  (:bp_id, 'supplier', 'addon',
                   :code, :desc, :amount, :qty, :rate, 'kWh',
                   :taxable, :sort)
            """), {
                'bp_id':   bp_id,
                'code':    code,
                'desc':    charge_desc,
                'amount':  seg_amt,
                'qty':     seg_qty,
                'rate':    seg_rate,
                'taxable': int(is_taxable),
                'sort':    200 + sort_offset,
            })
            sort_offset += 1

    return new_flags


# ── 867 ingestion ─────────────────────────────────────────────────────────────

async def ingest_867(
    content: str,
    filename: str,
    uploaded_by: str,
    db: AsyncSession,
) -> dict:
    """
    Parse a 867_03 file, store to edi_files + edi_867_usage,
    then match each ESI to contract_renewal and create billing_periods.

    Returns a summary dict with counts and per-ESI results.
    """
    parsed = parse_867(content)
    interchange = parsed['interchange']

    # Dedup: reject re-uploads of the same file
    dup = await db.execute(
        text("SELECT id FROM edi_files WHERE interchange_control = :ic LIMIT 1"),
        {'ic': interchange}
    )
    if dup.fetchone():
        return {
            'status':  'duplicate',
            'message': f"File already loaded (interchange_control={interchange})",
            'interchange': interchange,
        }

    # Insert edi_files row
    r = await db.execute(text("""
        INSERT INTO edi_files
          (interchange_control, edi_type, tdsp_name, tdsp_duns,
           file_date, original_filename, uploaded_by, status,
           records_found, records_matched, raw_content)
        VALUES
          (:ic, '867_03', :tdsp_name, :tdsp_duns,
           :file_date, :filename, :uploaded_by, 'pending',
           :found, 0, :raw)
    """), {
        'ic':         interchange,
        'tdsp_name':  parsed['tdsp_name'],
        'tdsp_duns':  parsed['tdsp_duns'],
        'file_date':  parsed['file_date'],
        'filename':   filename,
        'uploaded_by': uploaded_by,
        'found':      len(parsed['esi_records']),
        'raw':        content,
    })
    edi_file_id = r.lastrowid

    records_matched = 0
    results = []

    for rec in parsed['esi_records']:
        esi_id = rec['esi_id']
        if not esi_id or not rec['service_start'] or not rec['service_end']:
            results.append({'esi_id': esi_id, 'status': 'error', 'reason': 'missing key fields'})
            continue

        # Insert edi_867_usage (IGNORE on duplicate esi+period)
        raw_json = json.dumps(rec['raw_segments'])
        r2 = await db.execute(text("""
            INSERT IGNORE INTO edi_867_usage
              (edi_file_id, esi_id, document_tracking_number,
               tdsp_name, tdsp_duns, meter_number,
               service_start, service_end, billing_days,
               usage_kwh, kw_demand, ptd_code, reading_type_code,
               is_estimated, meter_type, raw_segments, status)
            VALUES
              (:edi_file_id, :esi_id, :tracking,
               :tdsp_name, :tdsp_duns, :meter_number,
               :svc_start, :svc_end, :billing_days,
               :usage_kwh, :kw_demand, :ptd_code, :reading_type,
               :is_estimated, :meter_type, :raw_segments, 'unmatched')
        """), {
            'edi_file_id':   edi_file_id,
            'esi_id':        esi_id,
            'tracking':      rec['document_tracking_number'],
            'tdsp_name':     rec['tdsp_name'],
            'tdsp_duns':     rec['tdsp_duns'],
            'meter_number':  rec['meter_number'],
            'svc_start':     rec['service_start'],
            'svc_end':       rec['service_end'],
            'billing_days':  rec['billing_days'],
            'usage_kwh':     rec['usage_kwh'],
            'kw_demand':     rec['kw_demand'],
            'ptd_code':      rec['ptd_code'],
            'reading_type':  rec['reading_type_code'],
            'is_estimated':  rec['is_estimated'],
            'meter_type':    rec['meter_type'],
            'raw_segments':  raw_json,
        })
        usage_id = r2.lastrowid

        if usage_id == 0:
            # Duplicate — fetch existing row id
            ex = await db.execute(text(
                "SELECT id FROM edi_867_usage WHERE esi_id=:e AND service_start=:s AND service_end=:n LIMIT 1"
            ), {'e': esi_id, 's': rec['service_start'], 'n': rec['service_end']})
            row = ex.fetchone()
            usage_id = row[0] if row else None
            results.append({'esi_id': esi_id, 'status': 'skipped_duplicate'})
            continue

        # ── Contract matching with multi-segment proration ────────────────────
        svc_start    = rec['service_start']
        svc_end      = rec['service_end']
        billing_days = rec['billing_days']   # (svc_end - svc_start).days

        segments = await _fetch_contract_segments(db, esi_id, svc_start, svc_end)

        if not segments:
            await db.execute(text(
                "UPDATE edi_867_usage SET status='no_contract' WHERE id=:id"
            ), {'id': usage_id})
            results.append({'esi_id': esi_id, 'status': 'no_contract'})
            continue

        multi = len(segments) > 1
        match = _compute_energy_from_segments(segments, billing_days, rec['usage_kwh'])
        contract_rate = match['contract_rate']
        meter_fee     = match['meter_fee']
        energy_charge = match['energy_charge']
        flags         = match['flags']
        energy_rows   = match['energy_rows']

        # Create billing_period (IGNORE on duplicate esi+period — 867 re-send)
        bp = await db.execute(text("""
            INSERT IGNORE INTO billing_periods
              (esi_id, edi_867_id, service_start, service_end,
               billing_days, usage_kwh, kw_demand,
               contract_rate, meter_fee, energy_charge,
               has_810, flags, status)
            VALUES
              (:esi_id, :edi_867_id, :svc_start, :svc_end,
               :billing_days, :usage_kwh, :kw_demand,
               :contract_rate, :meter_fee, :energy_charge,
               0, :flags, 'draft')
        """), {
            'esi_id':        esi_id,
            'edi_867_id':    usage_id,
            'svc_start':     svc_start,
            'svc_end':       svc_end,
            'billing_days':  billing_days,
            'usage_kwh':     rec['usage_kwh'],
            'kw_demand':     rec['kw_demand'],
            'contract_rate': contract_rate,
            'meter_fee':     meter_fee,
            'energy_charge': energy_charge,
            'flags':         json.dumps(flags) if flags else None,
        })
        bp_id        = bp.lastrowid
        is_new_bp    = bp_id != 0

        if not is_new_bp:
            ex = await db.execute(text(
                "SELECT id FROM billing_periods WHERE esi_id=:e AND service_start=:s AND service_end=:n LIMIT 1"
            ), {'e': esi_id, 's': svc_start, 'n': svc_end})
            row = ex.fetchone()
            bp_id = row[0] if row else None

        # Back-link edi_867_usage → billing_period
        await db.execute(text(
            "UPDATE edi_867_usage SET status='matched', billing_period_id=:bp_id WHERE id=:id"
        ), {'bp_id': bp_id, 'id': usage_id})

        # Multi-segment: insert one billing_period_charges row per energy segment
        # plus one meter_fee row, but only when this is a newly created period.
        if multi and is_new_bp and bp_id and 'contract_coverage_gap' not in flags:
            for i, er in enumerate(energy_rows):
                await db.execute(text("""
                    INSERT INTO billing_period_charges
                      (billing_period_id, charge_source, charge_category,
                       description, amount, quantity, unit_rate, unit,
                       is_taxable, sort_order)
                    VALUES
                      (:bp_id, 'supplier', 'energy',
                       :desc, :amount, :qty, :rate, 'kWh',
                       1, :sort)
                """), {
                    'bp_id':  bp_id,
                    'desc':   er['description'],
                    'amount': er['amount'],
                    'qty':    er['quantity'],
                    'rate':   er['unit_rate'],
                    'sort':   i,
                })
            if meter_fee is not None and meter_fee > 0:
                await db.execute(text("""
                    INSERT INTO billing_period_charges
                      (billing_period_id, charge_source, charge_category,
                       description, amount, quantity, unit_rate, unit,
                       is_taxable, sort_order)
                    VALUES
                      (:bp_id, 'supplier', 'meter_fee',
                       'Meter Fee', :amount, 1, :rate, NULL,
                       1, 99)
                """), {'bp_id': bp_id, 'amount': meter_fee, 'rate': meter_fee})

        # Addon charges — all new periods with contract coverage get addon rows
        if is_new_bp and bp_id and 'contract_coverage_gap' not in flags:
            new_addon_flags = await _insert_addon_charges(
                db=db,
                bp_id=bp_id,
                esi_id=esi_id,
                svc_start=svc_start,
                svc_end=svc_end,
                usage_kwh=Decimal(str(rec['usage_kwh'])) if rec['usage_kwh'] is not None else None,
                billing_days=billing_days,
            )
            if new_addon_flags:
                updated_flags = flags + [f for f in new_addon_flags if f not in flags]
                await db.execute(text(
                    "UPDATE billing_periods SET flags=:f WHERE id=:id"
                ), {'f': json.dumps(updated_flags), 'id': bp_id})

        # Retroactively link any 810 line items already loaded for this ESI+period
        retro = await _retroactive_810_link(db, bp_id, esi_id, svc_start, svc_end)

        records_matched += 1
        results.append({
            'esi_id':             esi_id,
            'status':             'matched',
            'billing_period_id':  bp_id,
            'flags':              flags,
            'retro_810_charges':  retro,
        })

    # Update edi_files counters
    await db.execute(text(
        "UPDATE edi_files SET status='processed', records_matched=:m WHERE id=:id"
    ), {'m': records_matched, 'id': edi_file_id})

    await db.commit()

    return {
        'status':           'ok',
        'edi_file_id':      edi_file_id,
        'interchange':      interchange,
        'records_found':    len(parsed['esi_records']),
        'records_matched':  records_matched,
        'results':          results,
    }

# ── 810 ingestion ─────────────────────────────────────────────────────────────

async def ingest_810(
    content: str,
    filename: str,
    uploaded_by: str,
    db: AsyncSession,
) -> dict:
    """
    Parse a 810_02 file, store to edi_files + edi_810_line_items,
    then map each line item against tdsp_charge_mappings and
    create billing_period_charges rows.

    Returns a summary dict with counts and per-line-item results.
    """
    parsed = parse_810(content)
    interchange = parsed['interchange']

    dup = await db.execute(
        text("SELECT id FROM edi_files WHERE interchange_control = :ic LIMIT 1"),
        {'ic': interchange}
    )
    if dup.fetchone():
        return {
            'status':  'duplicate',
            'message': f"File already loaded (interchange_control={interchange})",
            'interchange': interchange,
        }

    r = await db.execute(text("""
        INSERT INTO edi_files
          (interchange_control, edi_type, tdsp_name, tdsp_duns,
           file_date, original_filename, uploaded_by, status,
           records_found, records_matched, raw_content)
        VALUES
          (:ic, '810_02', :tdsp_name, :tdsp_duns,
           :file_date, :filename, :uploaded_by, 'pending',
           :found, 0, :raw)
    """), {
        'ic':         interchange,
        'tdsp_name':  parsed['tdsp_name'],
        'tdsp_duns':  parsed['tdsp_duns'],
        'file_date':  parsed['file_date'],
        'filename':   filename,
        'uploaded_by': uploaded_by,
        'found':      len(parsed['line_items']),
        'raw':        content,
    })
    edi_file_id = r.lastrowid

    records_mapped = 0
    results = []

    for li in parsed['line_items']:
        esi_id    = li['esi_id']
        tdsp_duns = li['tdsp_duns']

        # Insert line item
        r2 = await db.execute(text("""
            INSERT INTO edi_810_line_items
              (edi_file_id, esi_id, tdsp_name, tdsp_duns,
               document_tracking_number, original_document_id,
               document_sub_purpose, service_start, service_end,
               line_item_number, charge_code, charge_description,
               charge_amount, charge_rate, charge_quantity,
               charge_unit, registered_quantity, charge_comments,
               utility_rate_class, invoice_total_amount, status)
            VALUES
              (:edi_file_id, :esi_id, :tdsp_name, :tdsp_duns,
               :doc_tracking, :orig_doc_id,
               :sub_purpose, :svc_start, :svc_end,
               :line_item, :charge_code, :charge_desc,
               :amount, :rate, :qty,
               :uom, :reg_qty, :comments,
               :rate_class, :inv_total, 'unmapped')
        """), {
            'edi_file_id':  edi_file_id,
            'esi_id':       esi_id,
            'tdsp_name':    li['tdsp_name'],
            'tdsp_duns':    tdsp_duns,
            'doc_tracking': li['document_tracking_number'],
            'orig_doc_id':  li['original_document_id'],
            'sub_purpose':  li['document_sub_purpose'],
            'svc_start':    li['service_start'],
            'svc_end':      li['service_end'],
            'line_item':    li['line_item_number'],
            'charge_code':  li['charge_code'],
            'charge_desc':  li['charge_description'],
            'amount':       li['charge_amount'],
            'rate':         li['charge_rate'],
            'qty':          li['charge_quantity'],
            'uom':          li['charge_unit'],
            'reg_qty':      li['registered_quantity'],
            'comments':     li['charge_comments'],
            'rate_class':   li['utility_rate_class'],
            'inv_total':    li['invoice_total_amount'],
        })
        line_item_id = r2.lastrowid

        # Look up charge mapping
        mapping = await _get_charge_mapping(db, li['charge_code'], tdsp_duns)

        if not mapping:
            # Unmapped — mark line item and move on
            results.append({
                'esi_id':      esi_id,
                'charge_code': li['charge_code'],
                'status':      'unmapped',
            })
            continue

        mapping_id, billing_category, is_taxable = mapping

        if is_taxable is None:
            # Mapping exists but taxable status unverified — skip charge row creation
            await db.execute(text(
                "UPDATE edi_810_line_items SET status='unmapped' WHERE id=:id"
            ), {'id': line_item_id})
            results.append({
                'esi_id':      esi_id,
                'charge_code': li['charge_code'],
                'status':      'unmapped_taxable_unverified',
            })
            continue

        # Find matching billing_period
        bp = await db.execute(text("""
            SELECT id FROM billing_periods
            WHERE esi_id = :esi_id
              AND service_start = :svc_start
              AND service_end   = :svc_end
            LIMIT 1
        """), {
            'esi_id':    esi_id,
            'svc_start': li['service_start'],
            'svc_end':   li['service_end'],
        })
        bp_row = bp.fetchone()
        bp_id  = bp_row[0] if bp_row else None

        # Mark excluded billing categories
        if billing_category == 'excluded':
            await db.execute(text(
                "UPDATE edi_810_line_items SET mapping_id=:m, billing_period_id=:bp, status='excluded' WHERE id=:id"
            ), {'m': mapping_id, 'bp': bp_id, 'id': line_item_id})
            results.append({'esi_id': esi_id, 'charge_code': li['charge_code'], 'status': 'excluded'})
            continue

        # Link line item to mapping (billing_period_id may be NULL if 867 not yet loaded)
        await db.execute(text(
            "UPDATE edi_810_line_items SET mapping_id=:m, billing_period_id=:bp, status='mapped' WHERE id=:id"
        ), {'m': mapping_id, 'bp': bp_id, 'id': line_item_id})

        if bp_id is not None:
            # billing_period exists — create billing_period_charges now
            await _insert_bpc(db, bp_id, mapping_id, billing_category, is_taxable, li, line_item_id)
            await db.execute(text(
                "UPDATE billing_periods SET has_810=1 WHERE id=:id"
            ), {'id': bp_id})

        records_mapped += 1
        results.append({
            'esi_id':            esi_id,
            'charge_code':       li['charge_code'],
            'billing_period_id': bp_id,
            'is_taxable':        int(is_taxable),
            'status':            'mapped',
        })

    await db.execute(text(
        "UPDATE edi_files SET status='processed', records_matched=:m WHERE id=:id"
    ), {'m': records_mapped, 'id': edi_file_id})

    await db.commit()

    return {
        'status':          'ok',
        'edi_file_id':     edi_file_id,
        'interchange':     interchange,
        'records_found':   len(parsed['line_items']),
        'records_mapped':  records_mapped,
        'results':         results,
    }
