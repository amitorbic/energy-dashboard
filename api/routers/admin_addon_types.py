from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin
from utils.database import get_db


async def _audit(db: AsyncSession, admin: dict, action: str) -> None:
    """Write one row to user_log — same pattern as commission module."""
    await db.execute(text(
        "INSERT INTO user_log (uid, user_name, broker_name, action, date, flag) "
        "VALUES (:uid, :uname, NULL, :action, :date, 'addon_rates')"
    ), {
        "uid":    admin.get("user_id") or admin.get("sub") or 0,
        "uname":  admin.get("username") or admin.get("email") or "admin",
        "action": action,
        "date":   str(int(datetime.utcnow().timestamp())),
    })

router = APIRouter(prefix="/admin/addon-charge-types", tags=["admin"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _is_dup(exc: IntegrityError) -> bool:
    return "1062" in str(exc.orig) or "Duplicate entry" in str(exc.orig)


def _type_row(row) -> dict:
    return {
        "id":                row[0],
        "code":              row[1],
        "description":       row[2],
        "calculation_basis": row[3],
        "is_taxable":        bool(row[4]),
        "is_active":         bool(row[5]),
        "created_at":        str(row[6]),
        "updated_at":        str(row[7]),
        "current_rate":      float(row[8]) if row[8] is not None else None,
        "rate_effective_from": str(row[9]) if row[9] is not None else None,
    }


def _rate_row(row) -> dict:
    return {
        "id":             row[0],
        "addon_type_id":  row[1],
        "rate":           float(row[2]),
        "effective_from": str(row[3]),
        "effective_to":   str(row[4]) if row[4] is not None else None,
        "created_at":     str(row[5]),
    }


# ── GET list ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_addon_types(
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(text("""
        SELECT t.id, t.code, t.description, t.calculation_basis,
               t.is_taxable, t.is_active, t.created_at, t.updated_at,
               r.rate            AS current_rate,
               r.effective_from  AS rate_effective_from
        FROM addon_charge_types t
        LEFT JOIN addon_charge_type_rates r
               ON r.addon_type_id = t.id
              AND r.effective_to IS NULL
        ORDER BY t.code
    """))
    return [_type_row(row) for row in r.fetchall()]


# ── POST create ───────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_addon_type(
    body: dict,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    code  = (body.get("code") or "").strip().upper()
    desc  = (body.get("description") or "").strip()
    basis = (body.get("calculation_basis") or "").strip()
    taxable = bool(body.get("is_taxable", False))

    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    if basis not in ("flat", "usage_based"):
        raise HTTPException(status_code=400,
                            detail="calculation_basis must be 'flat' or 'usage_based'")

    try:
        r = await db.execute(text("""
            INSERT INTO addon_charge_types
              (code, description, calculation_basis, is_taxable, is_active)
            VALUES (:code, :desc, :basis, :taxable, 1)
        """), {"code": code, "desc": desc, "basis": basis, "taxable": int(taxable)})
        await db.commit()
        new_id = r.lastrowid
    except IntegrityError as e:
        await db.rollback()
        if _is_dup(e):
            raise HTTPException(status_code=409,
                                detail=f"An addon type with code '{code}' already exists.")
        raise

    row = await db.execute(text("""
        SELECT t.id, t.code, t.description, t.calculation_basis,
               t.is_taxable, t.is_active, t.created_at, t.updated_at,
               NULL, NULL
        FROM addon_charge_types t WHERE t.id = :id
    """), {"id": new_id})
    return _type_row(row.fetchone())


# ── PUT edit ──────────────────────────────────────────────────────────────────

@router.put("/{type_id}")
async def update_addon_type(
    type_id: int,
    body: dict,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        text("SELECT id FROM addon_charge_types WHERE id = :id"),
        {"id": type_id},
    )
    if not existing.fetchone():
        raise HTTPException(status_code=404, detail=f"Addon type {type_id} not found")

    fields, params = [], {"id": type_id}

    # code is immutable after creation — silently ignored here regardless of what
    # the client sends, so no bypass path exists even via direct API calls.

    if "description" in body:
        fields.append("description = :desc")
        params["desc"] = (body["description"] or "").strip()

    if "calculation_basis" in body:
        basis = (body["calculation_basis"] or "").strip()
        if basis not in ("flat", "usage_based"):
            raise HTTPException(status_code=400,
                                detail="calculation_basis must be 'flat' or 'usage_based'")
        fields.append("calculation_basis = :basis")
        params["basis"] = basis

    if "is_taxable" in body:
        fields.append("is_taxable = :taxable")
        params["taxable"] = 1 if body["is_taxable"] else 0

    if "is_active" in body:
        fields.append("is_active = :active")
        params["active"] = 1 if body["is_active"] else 0

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.execute(
        text(f"UPDATE addon_charge_types SET {', '.join(fields)} WHERE id = :id"),
        params,
    )
    await db.commit()

    row = await db.execute(text("""
        SELECT t.id, t.code, t.description, t.calculation_basis,
               t.is_taxable, t.is_active, t.created_at, t.updated_at,
               r.rate, r.effective_from
        FROM addon_charge_types t
        LEFT JOIN addon_charge_type_rates r
               ON r.addon_type_id = t.id AND r.effective_to IS NULL
        WHERE t.id = :id
    """), {"id": type_id})
    return _type_row(row.fetchone())


# ── GET rate history ──────────────────────────────────────────────────────────

@router.get("/{type_id}/rates")
async def list_rates(
    type_id: int,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        text("SELECT id FROM addon_charge_types WHERE id = :id"),
        {"id": type_id},
    )
    if not existing.fetchone():
        raise HTTPException(status_code=404, detail=f"Addon type {type_id} not found")

    r = await db.execute(text("""
        SELECT id, addon_type_id, rate, effective_from, effective_to, created_at
        FROM addon_charge_type_rates
        WHERE addon_type_id = :id
        ORDER BY effective_from DESC
    """), {"id": type_id})
    return [_rate_row(row) for row in r.fetchall()]


# ── POST add rate ─────────────────────────────────────────────────────────────

@router.post("/{type_id}/rates", status_code=201)
async def add_rate(
    type_id: int,
    body: dict,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        text("SELECT id FROM addon_charge_types WHERE id = :id"),
        {"id": type_id},
    )
    if not existing.fetchone():
        raise HTTPException(status_code=404, detail=f"Addon type {type_id} not found")

    rate_val = body.get("rate")
    eff_from_str = (body.get("effective_from") or "").strip()

    if rate_val is None:
        raise HTTPException(status_code=400, detail="rate is required")
    try:
        rate_dec = float(rate_val)
        if rate_dec < 0:
            raise ValueError()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="rate must be a non-negative number")

    try:
        new_from: date = date.fromisoformat(eff_from_str)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail="effective_from must be a date in YYYY-MM-DD format")

    # Find the current open row (fetch rate too for the audit log)
    open_r = await db.execute(text("""
        SELECT id, effective_from, rate
        FROM addon_charge_type_rates
        WHERE addon_type_id = :tid AND effective_to IS NULL
        LIMIT 1
    """), {"tid": type_id})
    open_row = open_r.fetchone()

    if open_row:
        open_id, open_from, open_rate = open_row[0], open_row[1], open_row[2]
        # open_from may be a date object or string depending on driver
        if isinstance(open_from, str):
            open_from = date.fromisoformat(open_from)

        if new_from <= open_from:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"New effective_from ({new_from}) must be after the current open "
                    f"rate's effective_from ({open_from}). Rates must be entered in "
                    f"chronological order."
                ),
            )

        close_to = new_from - timedelta(days=1)
        await db.execute(text("""
            UPDATE addon_charge_type_rates
               SET effective_to = :close_to
             WHERE id = :open_id
        """), {"close_to": close_to, "open_id": open_id})

    await db.execute(text("""
        INSERT INTO addon_charge_type_rates
          (addon_type_id, rate, effective_from, effective_to)
        VALUES (:tid, :rate, :eff_from, NULL)
    """), {"tid": type_id, "rate": rate_dec, "eff_from": new_from})
    await db.commit()

    # Audit log — same pattern as commission module (user_log, flag='addon_rates')
    code_r = await db.execute(
        text("SELECT code FROM addon_charge_types WHERE id = :id"), {"id": type_id}
    )
    type_code = (code_r.scalar() or str(type_id))
    if open_row:
        action = (
            f"addon_rate_change: {type_code} "
            f"old=[${float(open_rate):.6f} {open_from}->{close_to}] "
            f"new=[${rate_dec:.6f} {new_from}->open]"
        )
    else:
        action = (
            f"addon_rate_add: {type_code} "
            f"first=[${rate_dec:.6f} {new_from}->open]"
        )
    await _audit(db, admin, action)
    await db.commit()

    # Return full updated rate history for this type
    r = await db.execute(text("""
        SELECT id, addon_type_id, rate, effective_from, effective_to, created_at
        FROM addon_charge_type_rates
        WHERE addon_type_id = :id
        ORDER BY effective_from DESC
    """), {"id": type_id})
    return [_rate_row(row) for row in r.fetchall()]
