"""
Migration — adds service_zip, tdsp_name, pricing_zone to parsed_bills.

Run from the api/ directory:
    python scripts/migrate_parsed_bills_v2.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from utils.database import engine

ALTER_STATEMENTS = [
    "ALTER TABLE parsed_bills ADD COLUMN IF NOT EXISTS service_zip VARCHAR(10) NULL AFTER bill_date",
    "ALTER TABLE parsed_bills ADD COLUMN IF NOT EXISTS tdsp_name VARCHAR(255) NULL AFTER service_zip",
    "ALTER TABLE parsed_bills ADD COLUMN IF NOT EXISTS pricing_zone VARCHAR(50) NULL AFTER tdsp_name",
]


async def main():
    print("Running parsed_bills v2 migration…")
    async with engine.begin() as conn:
        for stmt in ALTER_STATEMENTS:
            await conn.execute(__import__("sqlalchemy").text(stmt))
            col = stmt.split("ADD COLUMN IF NOT EXISTS ")[1].split(" ")[0]
            print(f"OK  {col}")
    await engine.dispose()
    print("\nDone. Restart FastAPI server.")


if __name__ == "__main__":
    asyncio.run(main())
