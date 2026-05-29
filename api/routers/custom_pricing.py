from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from sqlalchemy import text
from controllers.customers import (
    create_customer,
    get_customers,
    get_customer,
    update_customer,
    delete_customer,
)
from controllers.usage_upload import (
    get_profile_mapping,
    parse_oncor_file,
    parse_usage_file,
)
from controllers.usage_upload import process_usage_upload
from controllers.custom_pricing import calculate_custom_price

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.post("")
async def add_customer(data: dict, db: AsyncSession = Depends(get_db)):
    cid = await create_customer(data, db)
    return {"id": cid}


@router.get("")
async def list_customers(db: AsyncSession = Depends(get_db)):
    return await get_customers(db)


# Search contract_renewal table
@router.get("/renewal/search")
async def search_renewal(q: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT * FROM contract_renewal 
        WHERE company_name LIKE :q OR premise_id LIKE :q OR cust_id LIKE :q
        LIMIT 20
    """
        ),
        {"q": f"%{q}%"},
    )
    return [dict(row) for row in result.mappings()]


# Check if ESID already exists in customers_new
@router.get("/check-esid")
async def check_esid(esid: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, company_name FROM customers_new WHERE esid = :esid"),
        {"esid": esid},
    )
    row = result.mappings().first()
    return {"exists": row is not None, "customer": dict(row) if row else None}


@router.post("/parse-usage")
async def parse_usage_file_endpoint(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    contents = await file.read()
    profile_map = await get_profile_mapping(db)

    normalized_df, provider = parse_usage_file(contents)

    if normalized_df.empty:
        return {"error": "Unknown file format", "provider": "unknown"}

    first_esid = str(normalized_df["esid"].iloc[0]) if len(normalized_df) > 0 else ""
    num_esids = normalized_df["esid"].nunique()

    profiles = {}
    for _, row in normalized_df.iterrows():
        full_profile = str(row.get("load_profile", "")).strip()
        short_name = profile_map.get(full_profile)
        if not short_name:
            continue
        kwh = float(row.get("kwh", 0))
        profiles[short_name] = profiles.get(short_name, 0) + kwh

    result = await db.execute(
        text("SELECT id, company_name FROM customers_new WHERE esid = :esid"),
        {"esid": first_esid},
    )
    existing = result.mappings().first()

    return {
        "esid": first_esid,
        "num_esids": num_esids,
        "profiles": profiles,
        "provider": provider,
        "existing_customer": dict(existing) if existing else None,
    }


@router.get("/{cid}")
async def get_one(cid: int, db: AsyncSession = Depends(get_db)):
    customer = await get_customer(cid, db)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/{cid}")
async def edit_customer(cid: int, data: dict, db: AsyncSession = Depends(get_db)):
    await update_customer(cid, data, db)
    return {"status": "updated"}


@router.delete("/{cid}")
async def remove_customer(cid: int, db: AsyncSession = Depends(get_db)):
    await delete_customer(cid, db)
    return {"status": "deleted"}


@router.post("/{cid}/upload-usage")
async def upload_usage(
    cid: int,
    file: UploadFile = File(...),
    delete_existing: bool = True,
    db: AsyncSession = Depends(get_db),
):
    contents = await file.read()
    result = await process_usage_upload(cid, contents, db, delete_existing)
    return result


@router.get("/{cid}/custom-price")
async def get_custom_price(
    cid: int, start_date: str, terms: str, db: AsyncSession = Depends(get_db)
):
    term_list = [int(t) for t in terms.split(",")]
    return await calculate_custom_price(cid, start_date, term_list, db)


@router.get("/{cid}/usage-summary")
async def get_usage_summary(cid: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT profile_key, SUM(total_kwh) as total_kwh
        FROM customer_usage
        WHERE customer_id = :id
        GROUP BY profile_key
        ORDER BY total_kwh DESC
    """
        ),
        {"id": cid},
    )
    return [
        {"profile_key": row.profile_key, "total_kwh": float(row.total_kwh)}
        for row in result.all()
    ]


@router.get("/profiles")  # Make sure the prefix matches your pricing router
async def get_all_profiles(db: AsyncSession = Depends(get_db)):
    # Adjust table name to match your DB (e.g., ref_profile_mappings or load_profiles_master)
    result = await db.execute(
        text("SELECT profile_key, zone, load_factor_type FROM ref_profile_mappings")
    )
    return [dict(row) for row in result.mappings()]


@router.post("/{cid}/custom-price")
async def get_custom_price(cid: int, data: dict, db: AsyncSession = Depends(get_db)):
    start_date = data.get("start_date")
    terms = data.get("terms", [])
    profiles = data.get("profiles", {})  # {profile_key: kwh}
    return await calculate_custom_price(cid, start_date, terms, profiles, db)


@router.post("/{cid}/save-profiles")
async def save_profiles(cid: int, data: dict, db: AsyncSession = Depends(get_db)):
    profiles = data.get("profiles", {})
    start_date = data.get("start_date", "")

    # Delete existing usage for this customer
    await db.execute(
        text("DELETE FROM customer_usage WHERE customer_id = :id"), {"id": cid}
    )

    # Insert new profile volumes
    for profile_key, total_kwh in profiles.items():
        if float(total_kwh) > 0:
            await db.execute(
                text(
                    """
                INSERT INTO customer_usage (customer_id, esid, profile_key, total_kwh)
                VALUES (:customer_id, :esid, :profile_key, :total_kwh)
            """
                ),
                {
                    "customer_id": cid,
                    "esid": "",
                    "profile_key": profile_key,
                    "total_kwh": float(total_kwh),
                },
            )

    # Update pricing start date on customer
    if start_date:
        await db.execute(
            text(
                """
            UPDATE customers_new SET pricing_start_date = :d WHERE id = :id
        """
            ),
            {"d": start_date, "id": cid},
        )

    await db.commit()
    return {"status": "saved"}
