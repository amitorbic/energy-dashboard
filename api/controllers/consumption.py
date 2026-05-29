import pandas as pd
import io
from fastapi import UploadFile, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

async def upload_consumption_data(file: UploadFile, db: AsyncSession):
    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))

        # 1. ARCHIVE: Move Current to Prior (Fast SQL Move)
        await db.execute(text("TRUNCATE TABLE `prior_consumption`"))
        await db.execute(text("INSERT INTO `prior_consumption` SELECT * FROM `consumption`"))
        await db.execute(text("TRUNCATE TABLE `consumption`"))
        await db.commit()

        # 2. PREPARE BATCH INSERT
        # We manually add 'upload_date' to every row for the frontend badge
        sync_time = datetime.utcnow()
        
        records = df.to_dict(orient='records')
        
        for record in records:
            # Add the timestamp that kills the "Never" message
            record['upload_date'] = sync_time
            
            # Create a 'safe' dictionary for SQLAlchemy binding (no spaces in keys)
            # But keep the original column names (with spaces) for the SQL string
            safe_binds = {}
            columns = []
            placeholders = []
            
            for k, v in record.items():
                safe_key = str(k).replace(" ", "_")
                # Handle Pandas Timestamps (convert to string)
                if isinstance(v, pd.Timestamp):
                    v = v.strftime('%Y-%m-%d %H:%M:%S')
                
                safe_binds[safe_key] = v
                columns.append(f"`{k}`") # Use backticks for SQL columns with spaces
                placeholders.append(f":{safe_key}") # Use underscores for Python bindings
            
            # Construct the dynamic SQL
            col_string = ", ".join(columns)
            val_string = ", ".join(placeholders)
            insert_sql = text(f"INSERT INTO `consumption` ({col_string}) VALUES ({val_string})")
            
            await db.execute(insert_sql, safe_binds)

        await db.commit()
        return {"status": "success", "rows": len(records)}

    except Exception as e:
        await db.rollback()
        print(f"UPLOAD ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload Failed: {str(e)}")