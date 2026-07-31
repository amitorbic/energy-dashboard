import json
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_exempt_varchar(val) -> bool:
    """Contract_renewal VARCHAR exemption fields: '0' or blank = not exempt."""
    if val is None:
        return False
    return str(val).strip() not in ('', '0')


async def _next_invoice_number(db: AsyncSession, today: date) -> str:
    """B + YYMMDD + 4-digit daily sequence starting at 0001.

    Driven by invoice_sequence_tracker, NOT by MAX() over existing invoice
    rows -- reverting an invoice DELETEs its row, so deriving the next
    number from surviving rows would let a deleted number be reissued.
    The INSERT ... ON DUPLICATE KEY UPDATE ... LAST_INSERT_ID(expr) idiom
    increments and reads back the new value atomically under an InnoDB row
    lock, so concurrent invoice generation for the same day can't race into
    a duplicate sequence number. LAST_INSERT_ID(1) also appears in the
    VALUES clause (not just ON DUPLICATE KEY UPDATE) -- without it, the
    plain-INSERT branch taken for a date's first-ever call never sets the
    session's last-insert-id, which then reads back as whatever value an
    unrelated AUTO_INCREMENT insert on the same pooled connection last left
    it as, corrupting the sequence.
    """
    await db.execute(text("""
        INSERT INTO invoice_sequence_tracker (`date`, last_sequence_used)
        VALUES (:today, LAST_INSERT_ID(1))
        ON DUPLICATE KEY UPDATE
          last_sequence_used = LAST_INSERT_ID(last_sequence_used + 1)
    """), {'today': today})
    r = await db.execute(text("SELECT LAST_INSERT_ID()"))
    seq = r.scalar()
    return f"B{today.strftime('%y%m%d')}{int(seq):04d}"


def _supplier_charge_from_period(
    energy_charge: Optional[Decimal],
    meter_fee: Optional[Decimal],
) -> Decimal:
    """supplier_charge = energy_charge + meter_fee, both read from billing_periods.
    energy_charge is set at ingest time (single-segment: kwh×rate;
    multi-segment: sum of prorated amounts). contract_rate is NULL for
    multi-segment periods, so the old kwh×rate formula cannot be used."""
    ec  = energy_charge if energy_charge is not None else Decimal('0')
    fee = meter_fee     if meter_fee     is not None else Decimal('0')
    return (ec + fee).quantize(Decimal('0.01'))


_TAX_LINE_LABELS = {
    'STATE_TAX':   'State Sales Tax',
    'CITY_TAX':    'City Sales Tax',
    'COUNTY_TAX':  'County Sales Tax',
    'SPDT_TAX':    'Special Purpose District Tax',
    'SPDT2_TAX':   'Special Purpose District Tax (2)',
    'SPD3_TAX':    'Special Purpose District Tax (3)',
    'TRANSIT_TAX': 'Transit / MTA Tax',
    'MGRT':        'Municipal Gross Receipts Tax',
    'PUCA':        'PUC Assessment',
}


async def _add_billing_period_flag(db: AsyncSession, bp_id: int, flag: str) -> None:
    """Merge a flag string into billing_periods.flags (JSON array of strings —
    same convention as billing_engine.py's addon_rate_missing flag)."""
    r = await db.execute(text(
        "SELECT flags FROM billing_periods WHERE id = :id"
    ), {'id': bp_id})
    row = r.fetchone()
    flags = json.loads(row[0]) if row and row[0] else []
    if flag not in flags:
        flags.append(flag)
        await db.execute(text(
            "UPDATE billing_periods SET flags = :f WHERE id = :id"
        ), {'f': json.dumps(flags), 'id': bp_id})


async def _compute_tax(
    db: AsyncSession,
    esi_id: str,
    svc_start: date,
    svc_end: date,
    tax_base: Decimal,
    bp_id: int,
) -> Decimal:
    """
    Insert one billing_period_charges row (charge_source='tax') per applicable,
    non-exempt tax type and return their sum (invoices.tax_total).

    Two tax bases:
      - tax_base: Sec. 151 sales-tax base (taxable_subtotal + supplier_charge +
        taxable_addon), passed in by the caller — drives STATE/CITY/COUNTY/
        SPDT/SPDT2/SPD3/TRANSIT.
      - total_billed: supplier_charge + tdsp_total + addon_total, computed here
        (queried fresh rather than passed in) — drives MGRT/PUCA. These are
        independent of jurisdiction resolution.

    Jurisdiction (city+county -> tax_jurisdiction_rates) rules:
      - Missing/blank premise_county, no matching row, or multiple matching
        rows at the latest effective quarter with DIFFERENT total_tax_rate
        (SPD ambiguity) -> unresolved: skip all jurisdiction-based lines,
        flag billing_period 'tax_jurisdiction_unresolved'. MGRT/PUCA still run.
      - Multiple matching rows with the SAME total_tax_rate -> auto-resolve
        (lowest id) and proceed normally, no flag.
    """
    cr = await db.execute(text("""
        SELECT premise_city, premise_county,
               city_tax_exempt, county_tax_exempt, mtacda_tax_exempt,
               spdt_tax_exempt, spdt2_tax_exempt, state_tax_exempt,
               grt_tax_exempt, puc_tax_exempt
        FROM contract_renewal
        WHERE premise_id = :esi_id AND status = 'active'
        LIMIT 1
    """), {'esi_id': esi_id})
    cr_row = cr.fetchone()
    if not cr_row:
        return Decimal('0.00')

    (city, county, city_ex, county_ex, mta_ex,
     spdt_ex, spdt2_ex, state_ex, grt_ex, puc_ex) = cr_row

    # ── total_billed: computed independently inside _compute_tax, not passed in ──
    bp_r = await db.execute(text(
        "SELECT energy_charge, meter_fee FROM billing_periods WHERE id = :id"
    ), {'id': bp_id})
    bp_row = bp_r.fetchone()
    supplier_charge = _supplier_charge_from_period(bp_row[0], bp_row[1]) if bp_row else Decimal('0.00')

    tdsp_r = await db.execute(text("""
        SELECT COALESCE(SUM(amount), 0) FROM billing_period_charges
        WHERE billing_period_id = :id AND charge_source = 'tdsp'
    """), {'id': bp_id})
    tdsp_total = Decimal(str(tdsp_r.scalar() or 0))

    addon_r = await db.execute(text("""
        SELECT COALESCE(SUM(amount), 0) FROM billing_period_charges
        WHERE billing_period_id = :id AND charge_source = 'supplier' AND charge_category = 'addon'
    """), {'id': bp_id})
    addon_total = Decimal(str(addon_r.scalar() or 0))

    total_billed = supplier_charge + tdsp_total + addon_total

    # ── Jurisdiction lookup (city + county, date-anchored on svc_end, latest quarter wins) ──
    jurisdiction_row = None
    unresolved = False

    if not city or not str(city).strip() or not county or not str(county).strip():
        unresolved = True
    else:
        jr = await db.execute(text("""
            SELECT id, effective_from, city_tax_rate, county_tax_rate,
                   spdt_tax_rate, spdt2_tax_rate, spd3_tax_rate, transit_tax_rate,
                   transit2_tax_rate, state_tax_rate, total_tax_rate
            FROM tax_jurisdiction_rates
            WHERE UPPER(TRIM(city_name)) = UPPER(TRIM(:city))
              AND UPPER(TRIM(county_name)) = UPPER(TRIM(:county))
              AND effective_from <= :svc_end
              AND (effective_to IS NULL OR effective_to > :svc_end)
            ORDER BY effective_from DESC, id
        """), {'city': city, 'county': county, 'svc_end': svc_end})
        jr_rows = jr.fetchall()

        if not jr_rows:
            unresolved = True
        else:
            latest_ef = jr_rows[0][1]
            latest_rows = [r for r in jr_rows if r[1] == latest_ef]
            if len(latest_rows) == 1:
                jurisdiction_row = latest_rows[0]
            else:
                distinct_rates = {Decimal(str(r[10])) for r in latest_rows}
                if len(distinct_rates) == 1:
                    jurisdiction_row = min(latest_rows, key=lambda r: r[0])
                else:
                    unresolved = True  # SPD ambiguity, different rates — flag, skip, no guess

    tax_total = Decimal('0.00')
    sort_idx = 0

    async def _insert_tax_line(code: str, rate: Decimal, base: Decimal) -> None:
        nonlocal tax_total, sort_idx
        if rate is None or rate <= 0 or base <= 0:
            return
        amount = (base * rate).quantize(Decimal('0.01'))
        if amount == 0:
            return
        await db.execute(text("""
            INSERT INTO billing_period_charges
              (billing_period_id, charge_source, charge_category,
               charge_code, description, amount, quantity, unit_rate, unit,
               is_taxable, sort_order)
            VALUES
              (:bp_id, 'tax', 'tax',
               :code, :desc, :amount, :qty, :rate, NULL,
               0, :sort)
        """), {
            'bp_id':  bp_id,
            'code':   code,
            'desc':   _TAX_LINE_LABELS[code],
            'amount': amount,
            'qty':    base,
            'rate':   rate,
            'sort':   300 + sort_idx,
        })
        sort_idx += 1
        tax_total += amount

    if jurisdiction_row is not None:
        (_, _, city_rate, county_rate, spdt_rate, spdt2_rate, spd3_rate,
         transit_rate, transit2_rate, state_rate, _) = jurisdiction_row

        if not _is_exempt_varchar(state_ex):
            await _insert_tax_line('STATE_TAX', Decimal(str(state_rate)) if state_rate is not None else None, tax_base)
        if not _is_exempt_varchar(city_ex):
            await _insert_tax_line('CITY_TAX', Decimal(str(city_rate)) if city_rate is not None else None, tax_base)
        if not _is_exempt_varchar(county_ex):
            await _insert_tax_line('COUNTY_TAX', Decimal(str(county_rate)) if county_rate is not None else None, tax_base)
        if not _is_exempt_varchar(spdt_ex):
            await _insert_tax_line('SPDT_TAX', Decimal(str(spdt_rate)) if spdt_rate is not None else None, tax_base)
        if not _is_exempt_varchar(spdt2_ex):
            await _insert_tax_line('SPDT2_TAX', Decimal(str(spdt2_rate)) if spdt2_rate is not None else None, tax_base)
        # contract_renewal has no spd3_tax_exempt column. Do NOT assume spdt_tax_exempt
        # or spdt2_tax_exempt covers SPD3 (a real, separate special-purpose district) --
        # that would be guessing. Always compute the full rate when present, and flag
        # the billing_period explicitly so exemption status can be reviewed manually.
        if spd3_rate is not None and Decimal(str(spd3_rate)) > 0:
            await _insert_tax_line('SPD3_TAX', Decimal(str(spd3_rate)), tax_base)
            await _add_billing_period_flag(db, bp_id, 'spd3_exemption_unknown')
        if not _is_exempt_varchar(mta_ex):
            transit_combined = (
                (Decimal(str(transit_rate)) if transit_rate is not None else Decimal('0'))
                + (Decimal(str(transit2_rate)) if transit2_rate is not None else Decimal('0'))
            )
            await _insert_tax_line('TRANSIT_TAX', transit_combined, tax_base)

    if unresolved:
        await _add_billing_period_flag(db, bp_id, 'tax_jurisdiction_unresolved')

    # ── MGRT: gros_tax_rates, keyed by city_name only, independent of jurisdiction resolution ──
    # gros_tax_rates.city_name carries a Census-style designation suffix
    # ("Dallas city", "Howe town", "Alma village") that contract_renewal.premise_city
    # does not ("DALLAS", "HOWE"). Strip exactly one trailing designation word
    # before comparing — TRIM(TRAILING ... FROM ...) removes a literal trailing
    # substring, not a character set, so this only strips one real suffix word
    # (e.g. "League City city" -> "League City", not "League").
    if not grt_ex and city and str(city).strip():
        mgrt_r = await db.execute(text("""
            SELECT gros_tax_rate FROM gros_tax_rates
            WHERE UPPER(TRIM(:city)) = TRIM(
                    TRIM(TRAILING 'VILLAGE' FROM
                      TRIM(TRAILING 'TOWN' FROM
                        TRIM(TRAILING 'CITY' FROM UPPER(TRIM(city_name)))
                      )
                    )
                  )
              AND (effective_from IS NULL OR effective_from <= :svc_end)
              AND (effective_to IS NULL OR effective_to > :svc_end)
            LIMIT 1
        """), {'city': city, 'svc_end': svc_end})
        mgrt_row = mgrt_r.fetchone()
        if mgrt_row and mgrt_row[0] is not None:
            await _insert_tax_line('MGRT', Decimal(str(mgrt_row[0])), total_billed)

    # ── PUCA: single flat statewide rate, independent of jurisdiction resolution ──
    if not puc_ex:
        puca_r = await db.execute(text("""
            SELECT rate FROM puca_tax_rates
            WHERE (effective_from IS NULL OR effective_from <= :svc_end)
              AND (effective_to IS NULL OR effective_to > :svc_end)
            LIMIT 1
        """), {'svc_end': svc_end})
        puca_row = puca_r.fetchone()
        if puca_row and puca_row[0] is not None:
            await _insert_tax_line('PUCA', Decimal(str(puca_row[0])), total_billed)

    return tax_total.quantize(Decimal('0.01'))


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_invoice(billing_period_id: int, db: AsyncSession) -> dict:
    """
    Generate an invoice for a billing_period in 'approved' status.
    Transitions billing_period.status to 'invoiced'.

    NOTE: total_amount is PRE-TAX while tax_rates table has no populated rates.
    The invoice is created in 'draft' status and cannot be sent until tax_total
    is verified and rates are confirmed.
    """
    bp_r = await db.execute(text("""
        SELECT id, esi_id, service_start, service_end, billing_days,
               usage_kwh, contract_rate, meter_fee, energy_charge, status
        FROM billing_periods
        WHERE id = :id
    """), {'id': billing_period_id})
    bp = bp_r.fetchone()

    if not bp:
        return {'status': 'error', 'reason': f"billing_period {billing_period_id} not found"}

    (bp_id, esi_id, svc_start, svc_end, billing_days,
     usage_kwh, contract_rate, meter_fee, energy_charge, bp_status) = bp

    if bp_status != 'approved':
        return {
            'status': 'error',
            'reason': (f"billing_period {billing_period_id} is '{bp_status}'"
                       ", must be 'approved' to generate invoice"),
        }

    dup = await db.execute(text(
        "SELECT id FROM invoices WHERE billing_period_id = :id LIMIT 1"
    ), {'id': bp_id})
    if dup.fetchone():
        return {
            'status': 'error',
            'reason': f"Invoice already exists for billing_period {bp_id}",
        }

    supplier_charge = _supplier_charge_from_period(energy_charge, meter_fee)

    # Aggregate TDSP charges only (charge_source='tdsp').
    # Supplier energy and meter_fee rows (present for multi-segment periods)
    # are excluded here to avoid double-counting — their total is already
    # captured in supplier_charge above.
    agg = await db.execute(text("""
        SELECT
          COALESCE(SUM(CASE WHEN is_taxable = 1 THEN amount ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN is_taxable = 0 THEN amount ELSE 0 END), 0)
        FROM billing_period_charges
        WHERE billing_period_id = :id
          AND charge_source = 'tdsp'
    """), {'id': bp_id})
    agg_row = agg.fetchone()
    taxable_subtotal     = Decimal(str(agg_row[0]))
    non_taxable_subtotal = Decimal(str(agg_row[1]))
    tdsp_total = taxable_subtotal + non_taxable_subtotal

    # Aggregate addon charges (charge_source='supplier', charge_category='addon').
    addon_agg = await db.execute(text("""
        SELECT
          COALESCE(SUM(amount), 0),
          COALESCE(SUM(CASE WHEN is_taxable = 1 THEN amount ELSE 0 END), 0)
        FROM billing_period_charges
        WHERE billing_period_id = :id
          AND charge_source = 'supplier'
          AND charge_category = 'addon'
    """), {'id': bp_id})
    addon_agg_row    = addon_agg.fetchone()
    addon_total      = Decimal(str(addon_agg_row[0]))
    taxable_addon    = Decimal(str(addon_agg_row[1]))

    # Tax base: taxable TDSP + supplier energy charge + taxable addon charges.
    # tax_total = 0 until real rates are populated in tax_rates.
    tax_base  = taxable_subtotal + supplier_charge + taxable_addon
    tax_total = await _compute_tax(db, esi_id, svc_start, svc_end, tax_base, bp_id)

    total_amount = supplier_charge + tdsp_total + addon_total + tax_total

    today          = date.today()
    invoice_number = await _next_invoice_number(db, today)

    r = await db.execute(text("""
        INSERT INTO invoices
          (invoice_number, billing_period_id, esi_id, invoice_date,
           total_amount, supplier_charge, tdsp_total, addon_total,
           taxable_subtotal, non_taxable_subtotal, tax_total,
           status)
        VALUES
          (:inv_no, :bp_id, :esi_id, :inv_date,
           :total, :supplier, :tdsp, :addon,
           :taxable, :non_taxable, :tax,
           'draft')
    """), {
        'inv_no':      invoice_number,
        'bp_id':       bp_id,
        'esi_id':      esi_id,
        'inv_date':    today,
        'total':       total_amount,
        'supplier':    supplier_charge,
        'tdsp':        tdsp_total,
        'addon':       addon_total,
        'taxable':     taxable_subtotal,
        'non_taxable': non_taxable_subtotal,
        'tax':         tax_total,
    })
    invoice_id = r.lastrowid

    await db.execute(text(
        "UPDATE billing_periods SET status = 'invoiced' WHERE id = :id"
    ), {'id': bp_id})

    await db.commit()

    return {
        'status':               'ok',
        'invoice_id':           invoice_id,
        'invoice_number':       invoice_number,
        'billing_period_id':    bp_id,
        'esi_id':               esi_id,
        'invoice_date':         today.isoformat(),
        'supplier_charge':      float(supplier_charge),
        'tdsp_total':           float(tdsp_total),
        'addon_total':          float(addon_total),
        'taxable_subtotal':     float(taxable_subtotal),
        'non_taxable_subtotal': float(non_taxable_subtotal),
        'tax_total':            float(tax_total),
        'total_amount':         float(total_amount),
        'pre_tax_flag':         tax_total == Decimal('0.00'),
        'note':                 'PRE-TAX: tax_total is 0 — no rates populated yet',
    }


async def get_invoice(invoice_id: int, db: AsyncSession) -> Optional[dict]:
    r = await db.execute(text("""
        SELECT id, invoice_number, billing_period_id, esi_id,
               invoice_date, due_date, total_amount,
               supplier_charge, tdsp_total, addon_total,
               taxable_subtotal, non_taxable_subtotal, tax_total,
               status, sent_at, paid_at, created_at
        FROM invoices
        WHERE id = :id
    """), {'id': invoice_id})
    row = r.fetchone()
    if not row:
        return None

    (inv_id, inv_no, bp_id, esi_id, inv_date, due_date, total,
     supplier, tdsp, addon, taxable, non_taxable, tax,
     status, sent_at, paid_at, created_at) = row

    charges_r = await db.execute(text("""
        SELECT charge_code, description, amount, is_taxable,
               charge_category, unit_rate, unit, quantity, sort_order
        FROM billing_period_charges
        WHERE billing_period_id = :bp_id
        ORDER BY sort_order, id
    """), {'bp_id': bp_id})
    charges = [
        {
            'charge_code':  c[0],
            'description':  c[1],
            'amount':       float(c[2]),
            'is_taxable':   bool(c[3]),
            'category':     c[4],
            'unit_rate':    float(c[5]) if c[5] is not None else None,
            'unit':         c[6],
            'quantity':     float(c[7]) if c[7] is not None else None,
            'sort_order':   c[8],
        }
        for c in charges_r.fetchall()
    ]

    return {
        'id':                   inv_id,
        'invoice_number':       inv_no,
        'billing_period_id':    bp_id,
        'esi_id':               esi_id,
        'invoice_date':         inv_date.isoformat() if inv_date else None,
        'due_date':             due_date.isoformat() if due_date else None,
        'total_amount':         float(total),
        'supplier_charge':      float(supplier),
        'tdsp_total':           float(tdsp),
        'addon_total':          float(addon),
        'taxable_subtotal':     float(taxable),
        'non_taxable_subtotal': float(non_taxable),
        'tax_total':            float(tax),
        'status':               status,
        'sent_at':              sent_at.isoformat() if sent_at else None,
        'paid_at':              paid_at.isoformat() if paid_at else None,
        'created_at':           created_at.isoformat() if created_at else None,
        'charges':              charges,
        'pre_tax_flag':         float(tax) == 0.0,
    }


async def get_invoice_by_period(billing_period_id: int, db: AsyncSession) -> Optional[dict]:
    r = await db.execute(text(
        "SELECT id FROM invoices WHERE billing_period_id = :id LIMIT 1"
    ), {'id': billing_period_id})
    row = r.fetchone()
    if not row:
        return None
    return await get_invoice(row[0], db)
