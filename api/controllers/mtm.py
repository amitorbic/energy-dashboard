from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from utils.zone_mapping import get_load_zones

LOAD_ZONES = get_load_zones()  # ["HOUSTON", "NORTH", "SOUTH", "WEST"]
HUB_LOCATIONS = [f"HB_{z}" for z in LOAD_ZONES]
LOAD_ZONE_LOCATIONS = [f"LZ_{z}" for z in LOAD_ZONES]
GAS_LOCATION = "HH"  # Henry Hub

# Hours-per-day by block type, mirrors controllers/hedging.py's total_mwh CASE
BLOCK_HOURS = {
    "7x24": 24,
    "7x16": 16,
    "5x16": 16,
    "7x8": 8,
}


def _delivery_hours(block_type: str, delivery_start, delivery_end) -> int:
    days = (delivery_end - delivery_start).days + 1
    return BLOCK_HOURS.get(block_type, 24) * days


async def get_market_price(db: AsyncSession, price_date: str, location: str):
    """Flat (hour_ending=0) price if entered, else the average of hourly prices."""
    flat = await db.execute(
        text(
            "SELECT price FROM market_prices "
            "WHERE price_date = :d AND location = :loc AND hour_ending = 0"
        ),
        {"d": price_date, "loc": location},
    )
    val = flat.scalar()
    if val is not None:
        return float(val)

    avg = await db.execute(
        text(
            "SELECT AVG(price) FROM market_prices "
            "WHERE price_date = :d AND location = :loc AND hour_ending != 0"
        ),
        {"d": price_date, "loc": location},
    )
    val = avg.scalar()
    return float(val) if val is not None else None


async def calculate_mtm(db: AsyncSession, price_date: str):
    """Run MTM for every deal still open as of price_date, save to mtm_results."""
    deals = await db.execute(
        text(
            """
            SELECT deal_number, delivery_start, delivery_end, block_type,
                   zone, location, volume_mw, price, instrument_type,
                   hr_value, gas_price
            FROM hedge_book
            WHERE delivery_end >= :price_date
            ORDER BY deal_number
            """
        ),
        {"price_date": price_date},
    )
    rows = [dict(r) for r in deals.mappings()]

    processed = 0
    skipped: list[str] = []
    total_mtm = 0.0

    for d in rows:
        instrument = d["instrument_type"]
        volume_mw = float(d["volume_mw"])
        deal_price = float(d["price"]) if d["price"] is not None else 0.0
        hours = _delivery_hours(d["block_type"], d["delivery_start"], d["delivery_end"])

        market_price = None
        basis = 0.0
        gas_price_current = None

        if instrument == "INDEX":
            mtm_value = 0.0

        elif instrument == "FIXED":
            location = d["location"] or ""
            if location.startswith("HB_"):
                lz_location = f"LZ_{d['zone']}"
                hb_price = await get_market_price(db, price_date, location)
                lz_price = await get_market_price(db, price_date, lz_location)
                if hb_price is None or lz_price is None:
                    skipped.append(d["deal_number"])
                    continue
                basis = lz_price - hb_price
                market_price = lz_price
                mtm_value = (lz_price - (deal_price - basis)) * volume_mw * hours
            else:
                market_price = await get_market_price(db, price_date, location)
                if market_price is None:
                    skipped.append(d["deal_number"])
                    continue
                mtm_value = (market_price - deal_price) * volume_mw * hours

        elif instrument == "HEAT_RATE":
            location = d["location"] or ""
            market_price = await get_market_price(db, price_date, location)
            gas_price_current = await get_market_price(db, price_date, GAS_LOCATION)
            if market_price is None or gas_price_current is None or d["hr_value"] is None:
                skipped.append(d["deal_number"])
                continue
            current_price = float(d["hr_value"]) * gas_price_current / 1000
            mtm_value = (market_price - current_price) * volume_mw * hours

        elif instrument == "GAS_BASIS":
            location = d["location"] or ""
            gas_price_current = await get_market_price(db, price_date, location)
            if gas_price_current is None or d["gas_price"] is None:
                skipped.append(d["deal_number"])
                continue
            mtm_value = (gas_price_current - float(d["gas_price"])) * volume_mw

        else:
            skipped.append(d["deal_number"])
            continue

        await db.execute(
            text(
                """
                INSERT INTO mtm_results (
                    calc_date, deal_number, instrument_type, location, zone,
                    volume_mw, deal_price, market_price, basis, gas_price_current,
                    mtm_value, delivery_start, delivery_end
                ) VALUES (
                    :calc_date, :deal_number, :instrument_type, :location, :zone,
                    :volume_mw, :deal_price, :market_price, :basis, :gas_price_current,
                    :mtm_value, :delivery_start, :delivery_end
                )
                ON DUPLICATE KEY UPDATE
                    instrument_type   = VALUES(instrument_type),
                    location          = VALUES(location),
                    zone              = VALUES(zone),
                    volume_mw         = VALUES(volume_mw),
                    deal_price        = VALUES(deal_price),
                    market_price      = VALUES(market_price),
                    basis             = VALUES(basis),
                    gas_price_current = VALUES(gas_price_current),
                    mtm_value         = VALUES(mtm_value),
                    delivery_start    = VALUES(delivery_start),
                    delivery_end      = VALUES(delivery_end),
                    calculated_at     = CURRENT_TIMESTAMP
                """
            ),
            {
                "calc_date": price_date,
                "deal_number": d["deal_number"],
                "instrument_type": instrument,
                "location": d["location"],
                "zone": d["zone"],
                "volume_mw": volume_mw,
                "deal_price": deal_price,
                "market_price": market_price,
                "basis": basis,
                "gas_price_current": gas_price_current,
                "mtm_value": round(mtm_value, 4),
                "delivery_start": d["delivery_start"],
                "delivery_end": d["delivery_end"],
            },
        )

        processed += 1
        total_mtm += mtm_value

    await db.commit()

    return {
        "calc_date": price_date,
        "deals_processed": processed,
        "deals_skipped": len(skipped),
        "skipped_deals": skipped,
        "total_mtm_value": round(total_mtm, 4),
    }


async def get_mtm_summary(db: AsyncSession):
    """MTM by zone, total P&L, count of deals — for the latest calculated date."""
    latest = await db.execute(text("SELECT MAX(calc_date) FROM mtm_results"))
    calc_date = latest.scalar()

    if not calc_date:
        return {
            "calc_date": None,
            "total_deals": 0,
            "total_mtm_value": 0,
            "by_zone": [],
        }

    by_zone = await db.execute(
        text(
            """
            SELECT zone,
                   COUNT(*)       AS deals,
                   SUM(volume_mw) AS volume_mw,
                   SUM(mtm_value) AS mtm_value
            FROM mtm_results
            WHERE calc_date = :d
            GROUP BY zone
            ORDER BY zone
            """
        ),
        {"d": calc_date},
    )

    totals = await db.execute(
        text(
            "SELECT COUNT(*) AS total_deals, SUM(mtm_value) AS total_mtm_value "
            "FROM mtm_results WHERE calc_date = :d"
        ),
        {"d": calc_date},
    )
    trow = totals.mappings().fetchone()

    return {
        "calc_date": str(calc_date),
        "total_deals": trow["total_deals"] or 0,
        "total_mtm_value": float(trow["total_mtm_value"] or 0),
        "by_zone": [dict(r) for r in by_zone.mappings()],
    }


async def get_mtm_by_deal(db: AsyncSession, calc_date: str | None = None):
    """MTM per deal with all details, for calc_date (defaults to latest)."""
    if not calc_date:
        latest = await db.execute(text("SELECT MAX(calc_date) FROM mtm_results"))
        calc_date = latest.scalar()
        if not calc_date:
            return []

    result = await db.execute(
        text(
            "SELECT * FROM mtm_results WHERE calc_date = :d ORDER BY zone, deal_number"
        ),
        {"d": calc_date},
    )
    return [dict(r) for r in result.mappings()]


async def get_market_prices(db: AsyncSession, price_date: str):
    """Prices already entered for a given date, across all locations."""
    result = await db.execute(
        text(
            """
            SELECT id, price_date, hour_ending, location, price, source, loaded_at
            FROM market_prices
            WHERE price_date = :d
            ORDER BY location, hour_ending
            """
        ),
        {"d": price_date},
    )
    return [dict(r) for r in result.mappings()]


async def upload_market_prices(db: AsyncSession, prices: list[dict]):
    """Manual price upload — upserts on (price_date, hour_ending, location)."""
    inserted = 0
    for p in prices:
        await db.execute(
            text(
                """
                INSERT INTO market_prices (price_date, hour_ending, location, price, source)
                VALUES (:price_date, :hour_ending, :location, :price, :source)
                ON DUPLICATE KEY UPDATE
                    price      = VALUES(price),
                    source     = VALUES(source),
                    loaded_at  = CURRENT_TIMESTAMP
                """
            ),
            {
                "price_date": p["price_date"],
                "hour_ending": int(p.get("hour_ending", 0)),
                "location": p["location"],
                "price": float(p["price"]),
                "source": p.get("source", "MANUAL"),
            },
        )
        inserted += 1

    await db.commit()
    return {"status": "ok", "inserted": inserted}
