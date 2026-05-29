from fastapi import UploadFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete,select, desc
import pandas as pd
from models.gas_strip import GasStrip, GasStripHistory
from datetime import datetime
import os
import traceback


async def upload_gas_strip_data(file: UploadFile, session: AsyncSession):
    # 1. Validate file extension
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    
    try:
        # 2. Read the Excel file
        df = pd.read_excel(file.file)
        
        # 3. Clean column names (lowercase and remove spaces)
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        print(f"Detected columns: {list(df.columns)}")

        # 4. Check for the specific headers in your file ('date' and 'price')
        if 'date' not in df.columns or 'price' not in df.columns:
            raise ValueError(f"Missing columns. Found: {list(df.columns)}. Expected: ['date', 'price']")
        
        # 5. Convert date column and set the 'Start Date' (uploaded_at)
        df['date'] = pd.to_datetime(df['date'])
        upload_time = datetime.now()

        # 6. TRANSACTION START: Clear the Current table
        await session.execute(delete(GasStrip))
        
        # 7. Insert into both Current and History tables
        for _, row in df.iterrows():
            # Update Current Live Table
            session.add(GasStrip(
                date=row['date'], 
                value=row['price'] # Mapping 'price' from Excel to 'value' in DB
            ))
            
            # Append to History Archive
            session.add(GasStripHistory(
                date=row['date'], 
                value=row['price'], 
                uploaded_at=upload_time
            ))
        
        # 8. Commit everything at once
        await session.commit()
        return {"success": True, "message": "Data uploaded successfully and history archived."}

    except ValueError as ve:
        # Handle validation errors (like missing columns) with a 400
        await session.rollback()
        print(f"Validation Error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    
    except Exception as e:
        # Handle unexpected crashes (like DB connection loss) with a 500
        await session.rollback()
        print("BACKEND CRASH:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal Server Error")

async def fetch_dates(session: AsyncSession):
    from sqlalchemy import select, distinct
    result = await session.execute(
        select(distinct(GasStripHistory.uploaded_at))
        .order_by(GasStripHistory.uploaded_at.desc())
    )
    return {"dates": [r[0].isoformat() for r in result.fetchall()]}

def download_sample():
    sample_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'gas_strip.xlsx')
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail="Sample file not found")
    return FileResponse(sample_path)
async def get_last_updated_timestamp(session: AsyncSession):
    # We use select() on the History table
    result = await session.execute(
        select(GasStripHistory.uploaded_at).order_by(desc(GasStripHistory.uploaded_at)).limit(1)
    )
    last_timestamp = result.scalars().first()
    
    # Print this to your Uvicorn terminal to see if it's finding anything
    print(f"DEBUG: Last timestamp found: {last_timestamp}")
    
    return {"last_updated": last_timestamp}
