from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

async def update_manual_charges(table_name: str, prior_table: str, charges: dict, db: AsyncSession):
    try:
        # 1. Archive to Prior
        await db.execute(text(f"TRUNCATE TABLE `{prior_table}`"))
        await db.execute(text(f"INSERT INTO `{prior_table}` SELECT * FROM `{table_name}`"))
        
        # 2. Update Values
        # We use an UPSERT (ON DUPLICATE KEY UPDATE) so it works whether 
        # the profile exists or not.
        sync_time = datetime.utcnow()
        for profile, val in charges.items():
            query = text(f"""
                INSERT INTO `{table_name}` (profile, value, upload_date) 
                VALUES (:p, :v, :u)
                ON DUPLICATE KEY UPDATE value = :v, upload_date = :u
            """)
            await db.execute(query, {"p": profile, "v": float(val), "u": sync_time})
            
        await db.commit()
        return {"status": "success"}
    except Exception as e:
        await db.rollback()
        raise e