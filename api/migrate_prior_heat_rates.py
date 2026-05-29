"""
migrate_prior_heat_rates.py

Converts prior_heat_rates from wide format (200+ columns) to normalized format
matching heat_rates table:
  id | market_date | profile_name | value

Run once:
  cd C:\AmeriPower\ameripower-api
  python migrate_prior_heat_rates.py
"""

import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")  # your existing DB URL

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def migrate():
    async with AsyncSessionLocal() as db:

        # ── 1. Create prior_heat_rates_new with normalized schema ────────────
        await db.execute(text("""
            CREATE TABLE IF NOT EXISTS prior_heat_rates_new (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                market_date  DATE NOT NULL,
                profile_name VARCHAR(150) NOT NULL,
                value        FLOAT NOT NULL,
                INDEX idx_market_date (market_date),
                INDEX idx_profile_name (profile_name)
            )
        """))
        await db.commit()
        print("Created prior_heat_rates_new table")

        # ── 2. Fetch all rows from old wide table ────────────────────────────
        result = await db.execute(text("SELECT * FROM prior_heat_rates"))
        rows = result.mappings().all()
        print(f"Found {len(rows)} rows in prior_heat_rates")

        if not rows:
            print("No data to migrate — prior_heat_rates is empty")
            return

        # ── 3. Get column names (skip serial and date) ───────────────────────
        all_cols = list(rows[0].keys())
        profile_cols = [c for c in all_cols if c not in ("serial", "date")]
        print(f"Found {len(profile_cols)} profile columns")

        # ── 4. Insert normalized rows ────────────────────────────────────────
        inserted = 0
        skipped  = 0

        for row in rows:
            raw_date = row["date"]

            # Skip header/meter rows
            if not raw_date or raw_date in ("Meter", "Grand Total", ""):
                skipped += 1
                continue

            # Parse date — old format is "Nov-24" or "11/01/2024"
            try:
                if "-" in str(raw_date) and len(str(raw_date)) <= 7:
                    # Format: "Nov-24" → 2024-11-01
                    from datetime import datetime
                    dt = datetime.strptime(str(raw_date), "%b-%y")
                    market_date = dt.date().replace(day=1)
                elif "/" in str(raw_date):
                    from datetime import datetime
                    dt = datetime.strptime(str(raw_date), "%m/%d/%Y")
                    market_date = dt.date()
                else:
                    # Try direct date parse
                    from datetime import date
                    market_date = date.fromisoformat(str(raw_date))
            except Exception as e:
                print(f"  Skipping row with unparseable date '{raw_date}': {e}")
                skipped += 1
                continue

            # Insert one row per profile
            for profile_name in profile_cols:
                val = row[profile_name]
                if val is None:
                    continue
                try:
                    float_val = float(val)
                except (TypeError, ValueError):
                    continue

                await db.execute(text("""
                    INSERT INTO prior_heat_rates_new (market_date, profile_name, value)
                    VALUES (:market_date, :profile_name, :value)
                """), {
                    "market_date":  market_date,
                    "profile_name": profile_name,
                    "value":        float_val,
                })
                inserted += 1

        await db.commit()
        print(f"Inserted {inserted} rows, skipped {skipped} rows")

        # ── 5. Rename tables ─────────────────────────────────────────────────
        await db.execute(text("RENAME TABLE prior_heat_rates TO prior_heat_rates_old"))
        await db.execute(text("RENAME TABLE prior_heat_rates_new TO prior_heat_rates"))
        await db.commit()
        print("Renamed tables: prior_heat_rates_old (backup), prior_heat_rates (new normalized)")
        print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
