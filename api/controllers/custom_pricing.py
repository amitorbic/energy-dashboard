from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from controllers.pricing_engine import calculate_matrix_for_start_date


async def calculate_custom_price(
    customer_id: int,
    start_date: str,
    terms: list,
    profiles: dict,
    db: AsyncSession,
    prior_day: bool = False,
):
    # Use passed profiles instead of reading from DB
    if not profiles:
        # fallback to DB if no profiles passed
        result = await db.execute(
            text(
                """
            SELECT profile_key, SUM(total_kwh) as total_kwh
            FROM customer_usage
            WHERE customer_id = :id
            GROUP BY profile_key
        """
            ),
            {"id": customer_id},
        )
        usage = {row.profile_key: float(row.total_kwh) for row in result.all()}
    else:
        usage = {k: float(v) for k, v in profiles.items() if float(v) > 0}

    if not usage:
        return {"error": "No usage data found"}

    total_kwh = sum(usage.values())

    matrix = await calculate_matrix_for_start_date(
        start_date, terms, db, "all", prior_day=prior_day
    )
    if isinstance(matrix, dict):
        matrix = matrix.get("matrix", [])

    mappings_res = await db.execute(text("SELECT * FROM ref_profile_mappings"))
    mappings = [dict(row) for row in mappings_res.mappings()]

    results = []
    for t in terms:
        weighted_sum = 0.0
        matched_volume = 0.0

        for profile_key, kwh in usage.items():
            mapping = next(
                (m for m in mappings if m["profile_key"] == profile_key), None
            )
            print(f"DEBUG profile={profile_key} mapping={mapping}")
            if not mapping:
                continue

            zone = mapping.get("zone", "").title()
            lf = mapping.get("load_factor_type", "")
            print(f"DEBUG looking for zone='{zone}' in {[r['zone'] for r in matrix]}")

            zone_row = next(
                (r for r in matrix if r["zone"].lower() == zone.lower()), None
            )
            print(f"DEBUG zone_row={zone_row is not None}")
            if not zone_row:
                continue

            price = zone_row.get(f"{lf}_{t}")
            print(
                f"DEBUG price lookup: key={lf}_{t} price={price} zone_row_keys={list(zone_row.keys())[:8]}"
            )
            if price is None or price == "N/A":
                continue

            print(f"DEBUG profile={profile_key} zone={zone} lf={lf}")
            print(f"DEBUG zone_row found: {zone_row is not None}")
            if zone_row:
                print(f"DEBUG price key: {lf}_{t} = {zone_row.get(f'{lf}_{t}')}")
            weighted_sum += float(price) * kwh
            matched_volume += kwh

        custom_price = (
            round(weighted_sum / total_kwh, 4) if matched_volume > 0 else None
        )

        results.append(
            {
                "term": t,
                "custom_price": custom_price,
                "total_kwh": total_kwh,
                "matched_volume": matched_volume,
            }
        )

    return results
