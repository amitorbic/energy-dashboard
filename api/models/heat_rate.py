from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from utils.database import Base

class HRProfileMaster(Base):
    """Checks the 265 profiles during upload to catch mismatches."""
    __tablename__ = "hr_profiles_master"
    
    id = Column(Integer, primary_key=True, index=True)
    ercot_hr_header = Column(String(150), unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class HeatRate(Base):
    """The live warehouse for all 265 profiles and their 60 months of data."""
    __tablename__ = "heat_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    profile_name = Column(String(150), index=True) # Matches ercot_hr_header
    market_date = Column(DateTime, index=True)
    value = Column(Float)

class HeatRateHistory(Base):
    __tablename__ = "heat_rates_history"
    
    # ADD THIS LINE HERE:
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    profile_name = Column(String(150))
    market_date = Column(DateTime)
    value = Column(Float)
    upload_date = Column(DateTime, server_default=func.now())