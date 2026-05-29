import pandas as pd
import io
import traceback
from datetime import datetime
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, text, select
from models.heat_rate import HeatRate, HeatRateHistory, HRProfileMaster


async def upload_heat_rate_data(file: UploadFile, db: AsyncSession):
    try:
        content = await file.read()
        # 1. Read Excel as-is
        raw_df = pd.read_excel(io.BytesIO(content))

        # 2. Transpose — This moves the 'Meter' names from the side to the top
        df = raw_df.set_index(raw_df.columns[0]).transpose()
        df.index.name = "market_date"
        df = df.reset_index()

        # 3. Extract Profile Names and Sync with Master Table
        excel_profiles = [
            str(col).strip() for col in df.columns if col != "market_date"
        ]

        result = await db.execute(select(HRProfileMaster.ercot_hr_header))
        master_list = set(result.scalars().all())
        new_profiles = set(excel_profiles) - master_list

        # Add any brand new profiles to your Master registry
        for profile in new_profiles:
            db.add(HRProfileMaster(ercot_hr_header=profile))

        # Flush ensures Master table is updated before we proceed
        await db.flush()

        # 4. THE MELT — This turns the "Wide" table into a "Long" table
        # This is what prevents the "Row size too large" error
        melted_df = pd.melt(
            df, id_vars=["market_date"], var_name="profile_name", value_name="value"
        )

        # 5. Update LIVE Table (heat_rates)
        # 4b. Backup current to prior before overwriting
        await db.execute(text("TRUNCATE TABLE prior_heat_rates"))
        await db.execute(
            text(
                """
              INSERT INTO prior_heat_rates (market_date, profile_name, value)
              SELECT market_date, profile_name, value FROM heat_rates
        """
            )
        )

        # 5. Update LIVE Table (heat_rates)
        await db.execute(text("TRUNCATE TABLE heat_rates"))
        # ... rest of existing code unchanged ...

        # Prepare data for bulk insert
        live_insert_data = []
        for _, row in melted_df.iterrows():
            live_insert_data.append(
                {
                    "d": pd.to_datetime(row["market_date"]).strftime("%Y-%m-%d"),
                    "p": str(row["profile_name"]),
                    "v": float(row["value"]),
                }
            )

        insert_query = text(
            "INSERT INTO heat_rates (market_date, profile_name, value) VALUES (:d, :p, :v)"
        )
        await db.execute(insert_query, live_insert_data)

        # 6. Update HISTORY Table (heat_rates_history)
        upload_timestamp = datetime.now()
        for _, row in melted_df.iterrows():
            db.add(
                HeatRateHistory(
                    profile_name=str(row["profile_name"]),
                    market_date=pd.to_datetime(row["market_date"]),
                    value=float(row["value"]),
                    upload_date=upload_timestamp,
                )
            )

        # 7. Final Commit for everything
        await db.commit()

        return {
            "status": "success",
            "message": f"Successfully updated {len(excel_profiles)} profiles.",
            "total_rows_inserted": len(live_insert_data),
        }

    except Exception as e:
        await db.rollback()
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload Failed: {str(e)}")


async def get_latest_timestamp(db: AsyncSession):
    from sqlalchemy import select, desc

    try:
        # Query the most recent upload time from history
        result = await db.execute(
            select(HeatRateHistory.uploaded_at)
            .order_by(desc(HeatRateHistory.uploaded_at))
            .limit(1)
        )
        timestamp = result.scalars().first()
        return {"latest": timestamp}
    except Exception:
        traceback.print_exc()
        return {"latest": None}


# Inside controllers/heat_rate.py


async def fetch_heat_rate_dates(db: AsyncSession):
    """
    Fetches all unique dates available in the heat_rates table
    so the frontend can populate the date dropdown.
    """
    try:
        # We use 'date' here because that's the column name in your screenshot
        stmt = select(HeatRate.date).distinct().order_by(HeatRate.date.desc())
        result = await db.execute(stmt)
        dates = result.scalars().all()
        return {"status": "success", "dates": dates}
    except Exception as e:
        print(f"Error fetching dates: {e}")
        return {"status": "error", "message": str(e)}


async def get_latest_timestamp(db: AsyncSession):
    # Match the model attribute 'upload_date'
    stmt = (
        select(HeatRateHistory.upload_date)
        .order_by(HeatRateHistory.upload_date.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar()


async def get_last_updated(db: AsyncSession):
    try:
        # Check the 'upload_date' column we created in the HeatRateHistory model
        stmt = (
            select(HeatRateHistory.upload_date)
            .order_by(HeatRateHistory.upload_date.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        last_date = result.scalar()

        if not last_date:
            return {"status": "success", "last_updated": None}

        return {
            "status": "success",
            "last_updated": last_date.strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception as e:
        print(f"Error in get_last_updated: {e}")
        return {"status": "error", "message": str(e)}
