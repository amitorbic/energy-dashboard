"""
Migration — adds tdsp_rate and energy_charges to parsed_bills.

Run from the api/ directory:
    python scripts/migrate_parsed_bills_v3.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from utils.database import engine

ALTER_STATEMENTS = [
    "ALTER TABLE parsed_bills ADD COLUMN IF NOT EXISTS tdsp_rate FLOAT NULL AFTER energy_rate",
    "ALTER TABLE parsed_bills ADD COLUMN IF NOT EXISTS energy_charges FLOAT NULL AFTER total_average_rate",
]


async def main():
    print("Running parsed_bills v3 migration...")
    async with engine.begin() as conn:
        for stmt in ALTER_STATEMENTS:
            await conn.execute(__import__("sqlalchemy").text(stmt))
            col = stmt.split("ADD COLUMN IF NOT EXISTS ")[1].split(" ")[0]
            print(f"OK  {col}")
    await engine.dispose()
    print("\nDone. Restart FastAPI server.")


if __name__ == "__main__":
    asyncio.run(main())
