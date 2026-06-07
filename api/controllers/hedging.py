from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi import HTTPException

LOCATION_TO_ZONE = {
    "HB_HOUSTON": "HOUSTON",
    "HB_NORTH": "NORTH",
    "HB_SOUTH": "SOUTH",
    "HB_WEST": "WEST",
    "LZ_HOUSTON": "HOUSTON",
    "LZ_NORTH": "NORTH",
    "LZ_SOUTH": "SOUTH",
    "LZ_WEST": "WEST",
}


async def add_hedge(data: dict, db: AsyncSession):

    # Check duplicate deal number

    existing = await db.execute(
        text("SELECT id FROM hedge_book WHERE deal_number = :dn"),
        {"dn": data["deal_number"]},
    )
    if existing.fetchone():
        raise HTTPException(
            status_code=400, detail=f"Deal number {data['deal_number']} already exists"
        )

    await db.execute(
        text("""
        INSERT INTO hedge_book (
            deal_number, trade_date, delivery_start, delivery_end,
            block_type, location,zone, volume_mw, price,
            instrument_type, hr_value, gas_price,
            counterparty, source, notes, entered_by
        ) VALUES (
            :deal_number, :trade_date, :delivery_start, :delivery_end,
            :block_type,:location, :zone, :volume_mw, :price,
            :instrument_type, :hr_value, :gas_price,
            :counterparty, :source, :notes, :entered_by
        )
    """),
        {
            "deal_number": data["deal_number"],
            "trade_date": data.get("trade_date"),
            "delivery_start": data["delivery_start"],
            "delivery_end": data["delivery_end"],
            "block_type": data.get("block_type", "7x16"),
            "zone": LOCATION_TO_ZONE.get(
                data.get("location", ""), data.get("zone", "")
            ),
            "location": data.get("location"),
            "volume_mw": float(data["volume_mw"]),
            "price": float(data["price"]),
            "instrument_type": data.get("instrument_type", "FIXED"),
            "hr_value": float(data["hr_value"]) if data.get("hr_value") else None,
            "gas_price": float(data["gas_price"]) if data.get("gas_price") else None,
            "counterparty": data.get("counterparty"),
            "source": data.get("source", "BILATERAL"),
            "notes": data.get("notes"),
            "entered_by": data.get("entered_by"),
        },
    )
    await db.commit()

    result = await db.execute(text("SELECT LAST_INSERT_ID() as id"))
    new_id = result.scalar()
    return {"id": new_id, "status": "created", "deal_number": data["deal_number"]}


async def get_hedges(
    zone: str, block_type: str, instrument_type: str, db: AsyncSession
):
    conditions = []
    params = {}

    if zone:
        conditions.append("zone = :zone")
        params["zone"] = zone
    if block_type:
        conditions.append("block_type = :block_type")
        params["block_type"] = block_type
    if instrument_type:
        conditions.append("instrument_type = :instrument_type")
        params["instrument_type"] = instrument_type

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    result = await db.execute(
        text(f"""
        SELECT
            id, deal_number, trade_date, delivery_start, delivery_end,
            block_type, location,zone, volume_mw, price, instrument_type,
            hr_value, gas_price, counterparty, source, notes,
            entered_at,
            CASE
                WHEN instrument_type = 'HEAT_RATE' AND hr_value IS NOT NULL AND gas_price IS NOT NULL
                THEN ROUND(hr_value * gas_price, 4)
                ELSE price
            END as effective_price,
            DATEDIFF(delivery_end, delivery_start) + 1 as delivery_days
        FROM hedge_book
        {where}
        ORDER BY delivery_start, zone, block_type
    """),
        params,
    )

    return [dict(row) for row in result.mappings()]


async def get_hedge(hedge_id: int, db: AsyncSession):
    result = await db.execute(
        text("""
        SELECT * FROM hedge_book WHERE id = :id
    """),
        {"id": hedge_id},
    )
    row = result.mappings().fetchone()
    return dict(row) if row else None


async def update_hedge(hedge_id: int, data: dict, db: AsyncSession):
    # Check deal number not taken by another record
    existing = await db.execute(
        text("SELECT id FROM hedge_book WHERE deal_number = :dn AND id != :id"),
        {"dn": data["deal_number"], "id": hedge_id},
    )
    if existing.fetchone():
        raise HTTPException(
            status_code=400, detail=f"Deal number {data['deal_number']} already exists"
        )

    await db.execute(
        text("""
        UPDATE hedge_book SET
            deal_number     = :deal_number,
            trade_date      = :trade_date,
            delivery_start  = :delivery_start,
            delivery_end    = :delivery_end,
            block_type      = :block_type,
            location        = :location,
            zone            = :zone,
            volume_mw       = :volume_mw,
            price           = :price,
            instrument_type = :instrument_type,
            hr_value        = :hr_value,
            gas_price       = :gas_price,
            counterparty    = :counterparty,
            source          = :source,
            notes           = :notes
        WHERE id = :id
    """),
        {
            "id": hedge_id,
            "deal_number": data["deal_number"],
            "trade_date": data.get("trade_date"),
            "delivery_start": data["delivery_start"],
            "delivery_end": data["delivery_end"],
            "block_type": data.get("block_type", "7x16"),
            "location": data["location"],
            "zone": data["zone"],
            "volume_mw": float(data["volume_mw"]),
            "price": float(data["price"]),
            "instrument_type": data.get("instrument_type", "FIXED"),
            "hr_value": float(data["hr_value"]) if data.get("hr_value") else None,
            "gas_price": float(data["gas_price"]) if data.get("gas_price") else None,
            "counterparty": data.get("counterparty"),
            "source": data.get("source", "BILATERAL"),
            "notes": data.get("notes"),
        },
    )
    await db.commit()


async def delete_hedge(hedge_id: int, db: AsyncSession):
    await db.execute(text("DELETE FROM hedge_book WHERE id = :id"), {"id": hedge_id})
    await db.commit()


async def get_hedge_summary(zone: str, db: AsyncSession):
    zone_filter = "AND zone = :zone" if zone else ""
    params = {"zone": zone} if zone else {}

    # Summary by zone + block type
    by_zone = await db.execute(
        text(f"""
        SELECT
            zone,
            block_type,
            instrument_type,
            COUNT(*)                    as deals,
            SUM(volume_mw)              as total_mw,
            AVG(price)                  as avg_price,
            MIN(delivery_start)         as earliest_delivery,
            MAX(delivery_end)           as latest_delivery
        FROM hedge_book
        WHERE 1=1 {zone_filter}
        GROUP BY zone, block_type, instrument_type
        ORDER BY zone, block_type
    """),
        params,
    )

    # Monthly breakdown
    monthly = await db.execute(
        text(f"""
        SELECT
            DATE_FORMAT(delivery_start, '%Y-%m') as month,
            zone,
            block_type,
            SUM(volume_mw)              as total_mw,
            AVG(price)                  as avg_price,
            COUNT(*)                    as deals
        FROM hedge_book
        WHERE 1=1 {zone_filter}
        GROUP BY DATE_FORMAT(delivery_start, '%Y-%m'), zone, block_type
        ORDER BY month, zone
    """),
        params,
    )

    # Overall stats
    stats = await db.execute(
        text(f"""
        SELECT
            COUNT(*)                    as total_deals,
            SUM(volume_mw)              as total_mw,
            SUM(
                volume_mw *
                CASE block_type
                    WHEN '7x24' THEN 24
                    WHEN '7x16' THEN 16
                    WHEN '5x16' THEN 16
                    WHEN '7x8'  THEN 8
                    ELSE 24
                END *
                (DATEDIFF(delivery_end, delivery_start) + 1)
            )                           as total_mwh,
            AVG(price)                  as avg_portfolio_price,
            MIN(delivery_start)         as earliest_delivery,
            MAX(delivery_end)           as latest_delivery,
            COUNT(DISTINCT zone)        as zones_hedged,
            COUNT(DISTINCT deal_number) as unique_deals
        FROM hedge_book
        WHERE 1=1 {zone_filter}
    """),
        params,
    )

    stats_row = stats.mappings().fetchone()

    return {
        "stats": dict(stats_row) if stats_row else {},
        "by_zone": [dict(r) for r in by_zone.mappings()],
        "monthly": [dict(r) for r in monthly.mappings()],
    }
