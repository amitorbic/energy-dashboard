import pandas as pd
import io
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_profile_mapping(db: AsyncSession) -> dict:
    result = await db.execute(
        text("SELECT full_load_profile, short_name FROM load_profiles_master")
    )
    return {row.full_load_profile: row.short_name for row in result.all()}


def detect_provider(df: pd.DataFrame) -> str:
    cols = [c.strip().lower() for c in df.columns]
    if "esi_id" in cols and "actual_kwh" in cols:
        return "tnmp"
    if "esi id" in cols and "actual kwh" in cols:
        return "oncor_aep"  # Oncor, AEP West, AEP South all same format
    if "#" in cols and "esi id" in cols and "account number" in cols:
        return "centerpoint"
    return "unknown"


def clean_esid(val) -> str:
    """Handle TNMP's ="10400..." format and numeric ESIDs"""
    s = str(val).strip()
    if s.startswith('="') and s.endswith('"'):
        return s[2:-1]
    return s


def parse_dates_excel_serial(val):
    """Convert Excel serial date numbers to proper dates"""
    if isinstance(val, float) or isinstance(val, int):
        return pd.Timestamp("1899-12-30") + pd.Timedelta(days=int(val))
    return pd.to_datetime(val)


def normalize_oncor_aep(df: pd.DataFrame) -> pd.DataFrame:
    """Handles Oncor, AEP West, AEP South — identical column structure"""
    df.columns = [c.strip() for c in df.columns]
    return pd.DataFrame(
        {
            "esid": df["ESI ID"].astype(str).str.strip(),
            "kwh": pd.to_numeric(df["Actual KWH"], errors="coerce").fillna(0),
            "load_profile": df["Load Profile"].astype(str).str.strip(),
            "start_date": df["Start Date"].apply(parse_dates_excel_serial),
            "end_date": df["End Date"].apply(parse_dates_excel_serial),
        }
    )


def normalize_tnmp(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip() for c in df.columns]
    return pd.DataFrame(
        {
            "esid": df["ESI_ID"].apply(clean_esid),
            "kwh": pd.to_numeric(df["ACTUAL_KWH"], errors="coerce").fillna(0),
            "load_profile": df["LOAD_PROFILE"].astype(str).str.strip(),
            "start_date": pd.to_datetime(df["START_DATE"], errors="coerce"),
            "end_date": pd.to_datetime(df["END_DATE"], errors="coerce"),
        }
    )


def normalize_centerpoint(contents: bytes) -> pd.DataFrame:
    wb = pd.ExcelFile(io.BytesIO(contents))
    dfs = []

    for sheet_name in wb.sheet_names[1:]:  # skip Accounts sheet
        try:
            sheet_df = pd.read_excel(wb, sheet_name=sheet_name)
            sheet_df.columns = [c.strip() for c in sheet_df.columns]
            normalized = normalize_oncor_aep(sheet_df)  # same format!
            dfs.append(normalized)
        except Exception as e:
            print(f"Centerpoint sheet {sheet_name} error: {e}")
            continue

    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()


def parse_usage_file(contents: bytes) -> tuple[pd.DataFrame, str]:
    """Auto-detect provider and return normalized DataFrame"""
    # Try reading as Excel first
    try:
        df = pd.read_excel(io.BytesIO(contents))
    except Exception:
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except Exception:
            return pd.DataFrame(), "unknown"

    provider = detect_provider(df)

    if provider == "oncor_aep":
        return normalize_oncor_aep(df), provider
    elif provider == "tnmp":
        return normalize_tnmp(df), provider
    elif provider == "centerpoint":
        return normalize_centerpoint(contents), provider
    else:
        return pd.DataFrame(), "unknown"


# Keep backward compat
def parse_oncor_file(contents: bytes) -> pd.DataFrame:
    df, _ = parse_usage_file(contents)
    return df


async def process_usage_upload(
    customer_id: int, contents: bytes, db: AsyncSession, delete_existing: bool = True
):
    profile_map = await get_profile_mapping(db)

    normalized_df, provider = parse_usage_file(contents)

    if normalized_df.empty:
        return {"inserted": 0, "errors": [f"Unknown file format or empty file"]}

    print(f"Detected provider: {provider}, rows: {len(normalized_df)}")

    # Delete existing usage for this customer
    if delete_existing:
        await db.execute(
            text("DELETE FROM customer_usage WHERE customer_id = :id"),
            {"id": customer_id},
        )

    inserted = 0
    errors = []

    for _, row in normalized_df.iterrows():
        full_profile = str(row.get("load_profile", "")).strip()
        short_name = profile_map.get(full_profile)

        if not short_name:
            errors.append(f"Unknown profile: {full_profile}")
            continue

        try:
            period_start = (
                row["start_date"].date() if pd.notna(row["start_date"]) else None
            )
            period_end = row["end_date"].date() if pd.notna(row["end_date"]) else None

            await db.execute(
                text(
                    """
                INSERT INTO customer_usage 
                (customer_id, esid, profile_key, total_kwh, period_start, period_end)
                VALUES (:customer_id, :esid, :profile_key, :total_kwh, :period_start, :period_end)
            """
                ),
                {
                    "customer_id": customer_id,
                    "esid": str(row.get("esid", "")),
                    "profile_key": short_name,
                    "total_kwh": float(row.get("kwh", 0)),
                    "period_start": period_start,
                    "period_end": period_end,
                },
            )
            inserted += 1
        except Exception as e:
            errors.append(str(e))

    await db.commit()
    return {"inserted": inserted, "errors": errors[:10], "provider": provider}
