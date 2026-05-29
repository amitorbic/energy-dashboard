from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi import HTTPException
import io

# Location to settlement zone mapping
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

VALID_LOCATIONS = list(LOCATION_TO_ZONE.keys())


async def add_dam_entry(data: dict, db: AsyncSession):
    """Insert one or more DAM entries — supports full day (hours dict) or single hour"""
    location = data.get("location", "").upper()
    if location not in VALID_LOCATIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid location. Must be one of: {', '.join(VALID_LOCATIONS)}",
        )

    zone = LOCATION_TO_ZONE[location]
    oper_date = data["oper_date"]
    deal_number = data.get("deal_number")
    counterparty = data.get("counterparty")
    buy_sell = data.get("buy_sell", "Buy")

    # Support both single hour and full day entry
    hours_data = data.get("hours")  # dict: {"1": {"volume": 10, "price": 25.50}, ...}

    if hours_data:
        # Full day entry
        inserted = 0
        updated = 0
        for he_str, vals in hours_data.items():
            he = int(he_str)
            vol = float(vals.get("volume_mw", 0))
            price = float(vals.get("dam_price", 0))
            if vol == 0:
                continue

            # Upsert — if exists update, else insert
            existing = await db.execute(
                text(
                    """
                SELECT id FROM dam_purchases
                WHERE oper_date = :d AND hour_ending = :h AND location = :loc
            """
                ),
                {"d": oper_date, "h": he, "loc": location},
            )
            row = existing.fetchone()

            if row:
                await db.execute(
                    text(
                        """
                    UPDATE dam_purchases SET
                        volume_mw    = :vol,
                        dam_price    = :price,
                        deal_number  = :dn,
                        counterparty = :cp,
                        buy_sell     = :bs,
                        zone         = :zone,
                        source       = 'MANUAL'
                    WHERE id = :id
                """
                    ),
                    {
                        "vol": vol,
                        "price": price,
                        "dn": deal_number,
                        "cp": counterparty,
                        "bs": buy_sell,
                        "zone": zone,
                        "id": row[0],
                    },
                )
                updated += 1
            else:
                await db.execute(
                    text(
                        """
                    INSERT INTO dam_purchases
                        (oper_date, hour_ending, zone, location, volume_mw,
                         dam_price, deal_number, counterparty, buy_sell, source)
                    VALUES
                        (:d, :h, :zone, :loc, :vol,
                         :price, :dn, :cp, :bs, 'MANUAL')
                """
                    ),
                    {
                        "d": oper_date,
                        "h": he,
                        "zone": zone,
                        "loc": location,
                        "vol": vol,
                        "price": price,
                        "dn": deal_number,
                        "cp": counterparty,
                        "bs": buy_sell,
                    },
                )
                inserted += 1

        await db.commit()
        return {"status": "saved", "inserted": inserted, "updated": updated}

    else:
        # Single hour entry
        he = int(data.get("hour_ending", 1))
        vol = float(data.get("volume_mw", 0))
        price = float(data.get("dam_price", 0))

        existing = await db.execute(
            text(
                """
            SELECT id FROM dam_purchases
            WHERE oper_date = :d AND hour_ending = :h AND location = :loc
        """
            ),
            {"d": oper_date, "h": he, "loc": location},
        )
        row = existing.fetchone()

        if row:
            await db.execute(
                text(
                    """
                UPDATE dam_purchases SET
                    volume_mw = :vol, dam_price = :price,
                    deal_number = :dn, counterparty = :cp,
                    buy_sell = :bs, zone = :zone, source = 'MANUAL'
                WHERE id = :id
            """
                ),
                {
                    "vol": vol,
                    "price": price,
                    "dn": deal_number,
                    "cp": counterparty,
                    "bs": buy_sell,
                    "zone": zone,
                    "id": row[0],
                },
            )
        else:
            await db.execute(
                text(
                    """
                INSERT INTO dam_purchases
                    (oper_date, hour_ending, zone, location, volume_mw,
                     dam_price, deal_number, counterparty, buy_sell, source)
                VALUES
                    (:d, :h, :zone, :loc, :vol,
                     :price, :dn, :cp, :bs, 'MANUAL')
            """
                ),
                {
                    "d": oper_date,
                    "h": he,
                    "zone": zone,
                    "loc": location,
                    "vol": vol,
                    "price": price,
                    "dn": deal_number,
                    "cp": counterparty,
                    "bs": buy_sell,
                },
            )

        await db.commit()
        return {"status": "saved", "hour_ending": he}


async def get_dam_entries(oper_date: str, location: str, db: AsyncSession):
    conditions = []
    params = {}

    if oper_date:
        conditions.append("oper_date = :oper_date")
        params["oper_date"] = oper_date
    if location:
        conditions.append("CONVERT(location USING utf8mb4) = :location")
        params["location"] = location

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    result = await db.execute(
        text(
            f"""
        SELECT
            id, oper_date, hour_ending, zone, location,
            volume_mw, dam_price, deal_number,
            counterparty, buy_sell, source, created_at,
            ROUND(volume_mw * dam_price, 2) as total_cost
        FROM dam_purchases
        {where}
        ORDER BY oper_date DESC, location, hour_ending
    """
        ),
        params,
    )

    return [dict(row) for row in result.mappings()]


async def delete_dam_entry(dam_id: int, db: AsyncSession):
    await db.execute(text("DELETE FROM dam_purchases WHERE id = :id"), {"id": dam_id})
    await db.commit()


async def get_dam_summary(oper_date: str, db: AsyncSession):
    date_filter = "WHERE oper_date = :d" if oper_date else ""
    params = {"d": oper_date} if oper_date else {}

    # By location summary
    by_location = await db.execute(
        text(
            f"""
        SELECT
            location,
            zone,
            COUNT(*)                as hours,
            SUM(volume_mw)          as total_mw,
            AVG(volume_mw)          as avg_mw,
            AVG(dam_price)          as avg_price,
            MIN(dam_price)          as min_price,
            MAX(dam_price)          as max_price,
            SUM(volume_mw * dam_price) as total_cost
        FROM dam_purchases
        {date_filter}
        GROUP BY location, zone
        ORDER BY zone, location
    """
        ),
        params,
    )

    # Hourly profile (for selected date)
    hourly = await db.execute(
        text(
            f"""
        SELECT
            hour_ending,
            SUM(volume_mw)          as total_mw,
            AVG(dam_price)          as avg_price,
            SUM(volume_mw * dam_price) as total_cost
        FROM dam_purchases
        {date_filter}
        GROUP BY hour_ending
        ORDER BY hour_ending
    """
        ),
        params,
    )

    # Overall stats
    stats = await db.execute(
        text(
            f"""
        SELECT
            COUNT(DISTINCT oper_date)   as days,
            COUNT(DISTINCT deal_number) as deals,
            SUM(volume_mw)              as total_mw,
            AVG(dam_price)              as avg_dam_price,
            MIN(dam_price)              as min_price,
            MAX(dam_price)              as max_price,
            SUM(volume_mw * dam_price)  as total_cost
        FROM dam_purchases
        {date_filter}
    """
        ),
        params,
    )

    stats_row = stats.mappings().fetchone()

    return {
        "stats": dict(stats_row) if stats_row else {},
        "by_location": [dict(r) for r in by_location.mappings()],
        "hourly": [dict(r) for r in hourly.mappings()],
    }


async def upload_dam_file(contents: bytes, oper_date: str, db: AsyncSession):
    """
    Parse DAM upload spreadsheet
    Format: 2 rows per deal
      Row 1: QSE/REP | Deal Name | HE01-HE24 | Counterparty | Buy/Sell | Location | Book
      Row 2: Prices:  |           | price per hour
    """
    try:
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to read Excel file: {str(e)}"
        )

    rows = list(ws.iter_rows(values_only=True))

    # Find header row — look for QSE/REP or Deal Name
    header_row = None
    for i, row in enumerate(rows):
        if row and any(str(c or "").strip() in ["QSE/REP", "Deal Name"] for c in row):
            header_row = i
            break

    if header_row is None:
        raise HTTPException(status_code=400, detail="Could not find header row in file")

    # Parse column indices from header
    header = rows[header_row]
    col_map = {}
    for i, cell in enumerate(header):
        val = str(cell or "").strip()
        if val == "QSE/REP":
            col_map["qse"] = i
        elif val == "Deal Name":
            col_map["deal"] = i
        elif val == "Counterparty":
            col_map["counterparty"] = i
        elif val == "Buy/Sell":
            col_map["buy_sell"] = i
        elif val == "Location":
            col_map["location"] = i
        # HE columns 01-24
        try:
            he_num = int(val.lstrip("0") or "0")
            if 1 <= he_num <= 24:
                col_map[f"he_{he_num}"] = i
        except:
            pass

    inserted = 0
    updated = 0
    skipped = 0
    errors = []

    # Process data rows — pairs of (volume row, price row)
    data_start = header_row + 1
    i = data_start

    while i < len(rows) - 1:
        vol_row = rows[i]
        price_row = rows[i + 1] if i + 1 < len(rows) else None

        # Check if this is a volume row (has QSE/REP value)
        if not vol_row:
            i += 1
            continue

        qse = str(vol_row[col_map.get("qse", 0)] or "").strip()
        if not qse or qse.lower() in ["", "prices:"]:
            i += 1
            continue

        deal_name = str(vol_row[col_map.get("deal", 1)] or "").strip()
        counterparty = (
            str(vol_row[col_map.get("counterparty", -1)] or "").strip()
            if "counterparty" in col_map
            else ""
        )
        buy_sell = (
            str(vol_row[col_map.get("buy_sell", -1)] or "Buy").strip()
            if "buy_sell" in col_map
            else "Buy"
        )
        location = (
            str(vol_row[col_map.get("location", -1)] or "").strip().upper()
            if "location" in col_map
            else ""
        )

        if not deal_name or not location:
            i += 2
            skipped += 1
            continue

        if location not in VALID_LOCATIONS:
            errors.append(f"Unknown location '{location}' for deal {deal_name}")
            i += 2
            skipped += 1
            continue

        zone = LOCATION_TO_ZONE[location]

        # Process each hour
        for he in range(1, 25):
            he_col = col_map.get(f"he_{he}")
            if he_col is None:
                continue

            vol = vol_row[he_col] if he_col < len(vol_row) else None
            price = price_row[he_col] if price_row and he_col < len(price_row) else None

            # Skip empty hours
            try:
                vol = float(vol) if vol is not None and str(vol).strip() != "" else 0
                price = (
                    float(price)
                    if price is not None and str(price).strip() != ""
                    else 0
                )
            except:
                vol, price = 0, 0

            if vol == 0:
                continue

            # Upsert
            try:
                existing = await db.execute(
                    text(
                        """
                    SELECT id FROM dam_purchases
                    WHERE oper_date = :d AND hour_ending = :h AND location = :loc
                """
                    ),
                    {"d": oper_date, "h": he, "loc": location},
                )
                row = existing.fetchone()

                if row:
                    await db.execute(
                        text(
                            """
                        UPDATE dam_purchases SET
                            volume_mw = :vol, dam_price = :price,
                            deal_number = :dn, counterparty = :cp,
                            buy_sell = :bs, zone = :zone, source = 'MIS_AUTO'
                        WHERE id = :id
                    """
                        ),
                        {
                            "vol": vol,
                            "price": price,
                            "dn": deal_name,
                            "cp": counterparty,
                            "bs": buy_sell,
                            "zone": zone,
                            "id": row[0],
                        },
                    )
                    updated += 1
                else:
                    await db.execute(
                        text(
                            """
                        INSERT INTO dam_purchases
                            (oper_date, hour_ending, zone, location,
                             volume_mw, dam_price, deal_number,
                             counterparty, buy_sell, source)
                        VALUES
                            (:d, :h, :zone, :loc,
                             :vol, :price, :dn,
                             :cp, :bs, 'MIS_AUTO')
                    """
                        ),
                        {
                            "d": oper_date,
                            "h": he,
                            "zone": zone,
                            "loc": location,
                            "vol": vol,
                            "price": price,
                            "dn": deal_name,
                            "cp": counterparty,
                            "bs": buy_sell,
                        },
                    )
                    inserted += 1
            except Exception as e:
                errors.append(f"HE{he:02d} {location}: {str(e)}")

        i += 2  # skip to next deal pair

    await db.commit()

    return {
        "status": "complete",
        "oper_date": oper_date,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
