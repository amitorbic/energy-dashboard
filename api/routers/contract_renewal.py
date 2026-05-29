import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
import io
import numpy as np

router = APIRouter(prefix="/contract-renewal", tags=["contract-renewal"])

COLUMN_MAP = {
    "usage": "contract_renewal_usage",
    # contract_rate → add to table or handle separately
}

valid_cols = [
    "cust_id",
    "company_name",
    "cust_first_name",
    "cust_last_name",
    "plan_group",
    "billing_address",
    "billing_city",
    "billing_state",
    "billing_zip",
    "cust_email",
    "cust_fax1",
    "cust_phone1",
    "premise_id",
    "premise_address2",
    "premise_city",
    "premise_state",
    "premise_zip",
    "broker_code",
    "broker_name",
    "comm_rate",
    "contract_end_date",
    "load_profile",
    "contract_renewal_usage",
    "other_charge",
    "bill_mode",
    "contract_type",
    "cust_type",
    "bill_date",
    "city_tax_exempt",
    "county_tax_exempt",
    "mtacda_tax_exempt",
    "spdt_tax_exempt",
    "spdt2_tax_exempt",
    "state_tax_exempt",
    "auto_pay_type",
    "bill_to_id",
    "attn",
    "contract_rate",
]


@router.post("/upload")
async def upload_contract_renewal(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    content = await file.read()
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            raw_text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    df = pd.read_csv(
        io.StringIO(raw_text),
        sep=",",
        dtype={"premise_id": str, "cust_id": str},
    )

    # Rename mismatched columns
    df = df.rename(columns={"usage": "contract_renewal_usage"})

    # Fill missing columns with None
    for col in valid_cols:
        if col not in df.columns:
            df[col] = None

    df = df[valid_cols]

    # Replace NaN with None
    import numpy as np

    df = df.replace({np.nan: None})

    # ── TRUNCATE BEFORE INSERT — always fresh data ──
    await db.execute(text("TRUNCATE TABLE contract_renewal"))
    await db.commit()

    inserted = 0
    skipped = 0
    for _, row in df.iterrows():
        data = {k: (None if v != v else v) for k, v in row.to_dict().items()}
        try:
            await db.execute(
                text(
                    """
                INSERT INTO contract_renewal (
                    cust_id, company_name, cust_first_name, cust_last_name,
                    plan_group, billing_address, billing_city, billing_state,
                    billing_zip, cust_email, cust_fax1, cust_phone1,
                    premise_id, premise_address2, premise_city, premise_state,
                    premise_zip, broker_code, broker_name, comm_rate,
                    contract_end_date, load_profile, contract_renewal_usage,
                    other_charge, bill_mode, contract_type, cust_type,
                    bill_date, city_tax_exempt, county_tax_exempt,
                    mtacda_tax_exempt, spdt_tax_exempt, spdt2_tax_exempt,
                    state_tax_exempt, auto_pay_type, bill_to_id, attn,
                    contract_rate
                ) VALUES (
                    :cust_id, :company_name, :cust_first_name, :cust_last_name,
                    :plan_group, :billing_address, :billing_city, :billing_state,
                    :billing_zip, :cust_email, :cust_fax1, :cust_phone1,
                    :premise_id, :premise_address2, :premise_city, :premise_state,
                    :premise_zip, :broker_code, :broker_name, :comm_rate,
                    :contract_end_date, :load_profile, :contract_renewal_usage,
                    :other_charge, :bill_mode, :contract_type, :cust_type,
                    :bill_date, :city_tax_exempt, :county_tax_exempt,
                    :mtacda_tax_exempt, :spdt_tax_exempt, :spdt2_tax_exempt,
                    :state_tax_exempt, :auto_pay_type, :bill_to_id, :attn,
                    :contract_rate
                )
            """
                ),
                data,
            )
            inserted += 1
        except Exception as e:
            skipped += 1
            if skipped == 1:
                print(f"SKIP ERROR: {e}")

    await db.commit()
    return {"inserted": inserted, "skipped": skipped, "total": len(df)}


@router.get("/list")
async def list_renewal(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT serial, cust_id, company_name, premise_id, broker_code, broker_name,
               contract_end_date, contract_rate, contract_renewal_usage,
               load_profile, cust_email, cust_phone1
        FROM contract_renewal
        ORDER BY company_name ASC
    """
        )
    )
    rows = [dict(r) for r in result.mappings().all()]
    return {"rows": rows, "total": len(rows)}
