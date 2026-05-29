# =============================================================================
# routers/imports.py
# Generic file import handler — used by all modules.
# Handles column detection, mapping save/load, and commit for any file type.
# =============================================================================

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
import pandas as pd
import io
import os
import json
import tempfile
import re

from utils.database import get_db

router = APIRouter(prefix="/api/imports", tags=["imports"])

# Temp dir for files pending mapping confirmation
TEMP_UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "ameripower_uploads")
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# =============================================================================
# SUPPORTED FILE TYPES
# Each file type defines its required + optional fields.
# Processors are registered at the bottom of this file.
# =============================================================================

FILE_TYPE_CONFIG = {
    "AR_SHEET": {
        "label": "AR Summary Sheet",
        "required": ["esiid", "customer_name", "usage_balance", "days_overdue"],
        "optional": [
            "account_number",
            "etf_amount",
            "broker_name",
            "customer_email",
            "customer_phone",
            "premise_address",
            "track",
            "stage",
        ],
    },
    "PAYMENT_SHEET": {
        "label": "Payment Sheet",
        "required": ["esiid", "amount", "payment_date"],
        "optional": ["account_number", "customer_name", "method", "reference_number"],
    },
    "BILLING_SHEET": {
        "label": "Billing Sheet",
        "required": ["esiid", "invoice_amount", "invoice_date"],
        "optional": ["account_number", "customer_name", "due_date", "usage_kwh"],
    },
}

ALL_SYSTEM_FIELDS = {
    # Shared
    "esiid": {"label": "ESIID / Premise ID"},
    "account_number": {"label": "Account number"},
    "customer_name": {"label": "Customer name"},
    # AR sheet
    "usage_balance": {"label": "Usage balance / total due"},
    "days_overdue": {"label": "Days overdue"},
    "etf_amount": {"label": "ETF amount"},
    "broker_name": {"label": "Broker name"},
    "customer_email": {"label": "Email"},
    "customer_phone": {"label": "Phone"},
    "premise_address": {"label": "Address"},
    "track": {"label": "Track (ACTIVE/INACTIVE)"},
    "stage": {"label": "Stage"},
    # Payment sheet
    "amount": {"label": "Payment amount"},
    "payment_date": {"label": "Payment date"},
    "method": {"label": "Payment method"},
    "reference_number": {"label": "Reference / check number"},
    # Billing sheet
    "invoice_amount": {"label": "Invoice amount"},
    "invoice_date": {"label": "Invoice date"},
    "due_date": {"label": "Due date"},
    "usage_kwh": {"label": "Usage (kWh)"},
    # Always available
    "skip": {"label": "— Skip this column —"},
}


# =============================================================================
# AUTO-DETECT MAPPING
# Tries to guess the right system field from column name keywords.
# =============================================================================


def auto_detect_mapping(columns: list, file_type: str) -> dict:
    mapping = {}
    for col in columns:
        lower = col.lower().strip()
        matched = "skip"

        if any(k in lower for k in ["premise", "esiid", "esi id", "esi_id"]):
            matched = "esiid"
        elif any(
            k in lower
            for k in ["company name", "comp name", "customer name", "cust name"]
        ):
            matched = "customer_name"
        elif any(
            k in lower
            for k in [
                "total due",
                "balance due",
                "amount due",
                "total due amount",
                "pay term",
            ]
        ):
            matched = "usage_balance"
        elif any(
            k in lower for k in ["days past", "days over", "days due", "past due days"]
        ):
            matched = "days_overdue"
        elif any(k in lower for k in ["cust id", "customer id", "account no", "acct"]):
            matched = "account_number"
        elif any(k in lower for k in ["agent name", "broker name", "broker"]):
            matched = "broker_name"
        elif "email" in lower:
            matched = "customer_email"
        elif any(k in lower for k in ["phone 1", "phone1", "primary phone"]):
            matched = "customer_phone"
        elif any(k in lower for k in ["address", "addr"]):
            matched = "premise_address"
        elif "etf" in lower:
            matched = "etf_amount"
        elif any(
            k in lower for k in ["last pay amount", "last payment amount", "pay amount"]
        ):
            matched = "amount"
        elif any(k in lower for k in ["last payment date", "payment date", "pay date"]):
            matched = "payment_date"
        elif any(k in lower for k in ["invoice amount", "inv amount", "total inv"]):
            matched = "invoice_amount"
        elif any(k in lower for k in ["invoice date", "inv date", "bill date"]):
            matched = "invoice_date"
        elif "due date" in lower:
            matched = "due_date"
        elif any(k in lower for k in ["kwh", "usage", "consumption"]):
            matched = "usage_kwh"

        # Only assign if relevant to this file type
        config = FILE_TYPE_CONFIG.get(file_type, {})
        relevant = config.get("required", []) + config.get("optional", [])
        if matched not in relevant:
            matched = "skip"

        mapping[col] = matched

    return mapping


# =============================================================================
# STEP 1 — DETECT COLUMNS
# Upload file, get headers + sample rows back.
# Returns saved mapping if one exists for this file_type.
# =============================================================================


@router.post("/detect-columns")
async def detect_columns(
    file: UploadFile = File(...),
    file_type: str = Query(..., description="AR_SHEET | PAYMENT_SHEET | BILLING_SHEET"),
    db: AsyncSession = Depends(get_db),
):
    if file_type not in FILE_TYPE_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown file_type: {file_type}")
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="File must be .xlsx, .xls, or .csv")

    content = await file.read()

    try:
        if file.filename.endswith(".csv"):
            df_sample = pd.read_csv(io.BytesIO(content), nrows=5)
            df_full = pd.read_csv(io.BytesIO(content))
        else:
            df_sample = pd.read_excel(io.BytesIO(content), nrows=5)
            df_full = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    columns = list(df_sample.columns)
    sample_rows = df_sample.fillna("").astype(str).to_dict(orient="records")
    total_rows = len(df_full)

    # Save file to temp dir with a unique key
    import uuid

    file_key = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{file_key}{ext}")
    with open(temp_path, "wb") as f:
        f.write(content)

    # Load saved mapping for this file_type
    result = await db.execute(
        text("SELECT mapping FROM column_mappings WHERE file_type = :ft LIMIT 1"),
        {"ft": file_type},
    )
    row = result.fetchone()
    saved_mapping = json.loads(row[0]) if row and row[0] else None

    # Auto-detect if no saved mapping
    suggested_mapping = saved_mapping or auto_detect_mapping(columns, file_type)

    config = FILE_TYPE_CONFIG[file_type]

    return {
        "file_key": file_key,
        "filename": file.filename,
        "file_type": file_type,
        "columns": columns,
        "sample_rows": sample_rows,
        "total_rows": total_rows,
        "suggested_mapping": suggested_mapping,
        "is_saved_mapping": saved_mapping is not None,
        "required_fields": config["required"],
        "optional_fields": config["optional"],
        "system_fields": [
            {
                "value": k,
                "label": v["label"],
                "required": k in config["required"],
            }
            for k, v in ALL_SYSTEM_FIELDS.items()
            if k in config["required"] + config["optional"] + ["skip"]
        ],
    }


# =============================================================================
# STEP 2 — SAVE MAPPING
# Persist column mapping for this file_type so it auto-loads next time.
# =============================================================================


@router.post("/save-mapping")
async def save_mapping(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    file_type = payload.get("file_type")
    mapping = payload.get("mapping", {})

    if not file_type or file_type not in FILE_TYPE_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid file_type")
    if not mapping:
        raise HTTPException(status_code=400, detail="Mapping cannot be empty")

    await db.execute(
        text(
            """
            INSERT INTO column_mappings (file_type, mapping, mapped_by)
            VALUES (:ft, :mapping, 'system')
            ON DUPLICATE KEY UPDATE mapping = :mapping, updated_at = NOW()
        """
        ),
        {"ft": file_type, "mapping": json.dumps(mapping)},
    )
    await db.commit()
    return {"status": "saved", "file_type": file_type}


# =============================================================================
# STEP 3 — COMMIT
# Re-read the temp file, apply mapping, run the appropriate processor.
# =============================================================================


@router.post("/commit")
async def commit_import(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    file_key = payload.get("file_key")
    file_type = payload.get("file_type")
    mapping = payload.get("mapping", {})
    save = payload.get("save_mapping", False)
    filename = payload.get("filename", "")

    if not file_key or not file_type or not mapping:
        raise HTTPException(
            status_code=400, detail="file_key, file_type, and mapping are required"
        )

    # Validate required fields
    config = FILE_TYPE_CONFIG.get(file_type, {})
    required = config.get("required", [])
    mapped_values = set(v for v in mapping.values() if v and v != "skip")
    missing = [r for r in required if r not in mapped_values]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required field mappings: {', '.join(missing)}",
        )

    # Find temp file
    ext = os.path.splitext(filename)[1] if filename else ".xlsx"
    temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{file_key}{ext}")
    if not os.path.exists(temp_path):
        raise HTTPException(
            status_code=400,
            detail="Upload session expired — please re-upload the file.",
        )

    # Read file
    try:
        if ext == ".csv":
            df = pd.read_csv(temp_path)
        else:
            df = pd.read_excel(temp_path)
        raw_rows = df.fillna("").astype(str).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    # Save mapping if requested
    if save:
        await db.execute(
            text(
                """
                INSERT INTO column_mappings (file_type, mapping, mapped_by)
                VALUES (:ft, :mapping, 'system')
                ON DUPLICATE KEY UPDATE mapping = :mapping, updated_at = NOW()
            """
            ),
            {"ft": file_type, "mapping": json.dumps(mapping)},
        )

    # Apply mapping to rows
    mapped_rows = _apply_mapping(raw_rows, mapping, file_type)

    # Route to the appropriate processor
    result = await _process(db, file_type, mapped_rows)

    # Cleanup temp file
    try:
        os.remove(temp_path)
    except Exception:
        pass

    return result


# =============================================================================
# APPLY MAPPING
# Transforms raw sheet rows into normalized dicts using the mapping.
# =============================================================================


def _apply_mapping(raw_rows: list, mapping: dict, file_type: str) -> list:
    mapped_rows = []
    for row in raw_rows:
        mapped = {}
        for src_col, dest_field in mapping.items():
            if not dest_field or dest_field == "skip":
                continue
            val = row.get(src_col, "")

            # Type coercions
            if dest_field in (
                "usage_balance",
                "etf_amount",
                "amount",
                "invoice_amount",
            ):
                try:
                    val = float(re.sub(r"[$,]", "", str(val)) or 0)
                except Exception:
                    val = 0.0
            elif dest_field in ("days_overdue",):
                try:
                    val = int(float(str(val).strip() or 0))
                except Exception:
                    val = 0
            else:
                val = str(val).strip()

            mapped[dest_field] = val
        mapped_rows.append(mapped)
    return mapped_rows


# =============================================================================
# PROCESSORS
# Each file type has its own processor function.
# Add new file types here without touching the endpoints above.
# =============================================================================


async def _process(db: AsyncSession, file_type: str, rows: list) -> dict:
    if file_type == "AR_SHEET":
        return await _process_ar_sheet(db, rows)
    elif file_type == "PAYMENT_SHEET":
        return await _process_payment_sheet(db, rows)
    elif file_type == "BILLING_SHEET":
        return await _process_billing_sheet(db, rows)
    else:
        raise HTTPException(status_code=400, detail=f"No processor for {file_type}")


async def _process_ar_sheet(db: AsyncSession, rows: list) -> dict:
    from controllers.collections import process_ar_import

    stats = await process_ar_import(db, rows, "system")
    return {
        "file_type": "AR_SHEET",
        "status": "COMPLETED" if not stats["errors"] else "COMPLETED_WITH_ERRORS",
        "created": stats["created"],
        "updated": stats["updated"],
        "skipped": stats["skipped"],
        "errors": stats["errors"],
    }


async def _process_payment_sheet(db: AsyncSession, rows: list) -> dict:
    from controllers.payment import post_payment, PaymentSource
    from datetime import date as dt

    processed = 0
    errors = []

    for i, row in enumerate(rows):
        try:
            esiid = row.get("esiid", "")
            amount = float(row.get("amount", 0))
            if not esiid or amount <= 0:
                continue

            payment_date_raw = row.get("payment_date", "")
            try:
                from dateutil import parser as dparser

                payment_date = dparser.parse(str(payment_date_raw)).date()
            except Exception:
                payment_date = dt.today()

            await post_payment(
                db=db,
                esiid=esiid,
                amount=amount,
                payment_date=payment_date,
                received_date=dt.today(),
                method=row.get("method", "ACH").upper() or "ACH",
                source=PaymentSource.PAYMENT_SHEET,
                entered_by="system",
                account_number=row.get("account_number"),
                reference_number=row.get("reference_number"),
            )
            processed += 1
        except Exception as e:
            errors.append(
                {"row": i + 2, "esiid": row.get("esiid", ""), "error": str(e)}
            )

    return {
        "file_type": "PAYMENT_SHEET",
        "status": "COMPLETED" if not errors else "COMPLETED_WITH_ERRORS",
        "processed": processed,
        "errors": errors,
    }


async def _process_billing_sheet(db: AsyncSession, rows: list) -> dict:
    # Placeholder — wire to billing module when ready
    return {
        "file_type": "BILLING_SHEET",
        "status": "COMPLETED",
        "processed": len(rows),
        "errors": [],
        "note": "Billing processor not yet connected",
    }
