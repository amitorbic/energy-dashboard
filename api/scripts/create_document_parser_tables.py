"""
One-time script — creates the three document parser tables in MySQL.

Run from the api/ directory:
    python scripts/create_document_parser_tables.py

Tables created:
    bill_templates      — learned extraction patterns per utility provider
    parsed_bills        — confirmed bill extractions
    parsed_contracts    — competitor contract competitive intelligence
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from utils.database import engine, Base
from models.document_parser import BillTemplate, ParsedBill, ParsedContract


async def main():
    print("Connecting to database…")
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[
                BillTemplate.__table__,
                ParsedBill.__table__,
                ParsedContract.__table__,
            ],
        )
    await engine.dispose()
    print("OK  bill_templates       created (or already exists)")
    print("OK  parsed_bills         created (or already exists)")
    print("OK  parsed_contracts     created (or already exists)")
    print("\nDone. You can now restart the FastAPI server.")


if __name__ == "__main__":
    asyncio.run(main())
