import pandas as pd
import io
from fastapi import UploadFile, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

# controllers/margin.py
async def upload_margin_matrix(file: UploadFile, db: AsyncSession):
    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        
        # Ensure 'term' exists and is named correctly
        df.columns = [str(c).strip() for c in df.columns]
        if 'term' not in df.columns:
             # If the first column isn't named 'term', rename it
             df.rename(columns={df.columns[0]: 'term'}, inplace=True)

        # 1. Archive
        await db.execute(text("TRUNCATE TABLE `prior_margin`"))
        await db.execute(text("INSERT INTO `prior_margin` SELECT * FROM `margin`"))
        await db.execute(text("TRUNCATE TABLE `margin`"))
        await db.commit()

        sync_time = datetime.utcnow()
        # 2. Insert rows one by one
        for _, row in df.iterrows():
            data_dict = row.to_dict()
            data_dict['upload_date'] = sync_time
            
            # Filter out 'serial' if Pandas picked it up as NaN
            data_dict = {k: v for k, v in data_dict.items() if k != 'serial'}
            
            # Construct SQL: Use backticks for every column name
            cols = ", ".join([f"`{k}`" for k in data_dict.keys()])
            placeholders = ", ".join([f":{k.replace(' ', '_')}" for k in data_dict.keys()])
            
            # Map values to the safe placeholders
            params = {k.replace(' ', '_'): v for k, v in data_dict.items()}
            
            await db.execute(text(f"INSERT INTO margin ({cols}) VALUES ({placeholders})"), params)

        await db.commit()
        return {"status": "success"}
    except Exception as e:
        await db.rollback()
        print(f"BACKEND CRASH: {str(e)}") # LOOK AT YOUR TERMINAL FOR THIS
        raise e