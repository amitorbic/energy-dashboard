from sqlalchemy import Column, Integer, Float, DateTime, String
from datetime import datetime
from utils.database import Base

class Consumption(Base):
    __tablename__ = "consumption"
    
    serial = Column(Integer, primary_key=True, autoincrement=True)
    date   = Column(String(255), nullable=False)
    days   = Column(Integer, nullable=False)
    
    # SQLAlchemy can handle spaces if you wrap the name in quotes
    bushilf_coast = Column("Bushilf Coast", Float)
    bushilf_east  = Column("Bushilf East", Float)
    
    # The column we added for the "Never" timestamp fix
    upload_date = Column(DateTime, default=datetime.utcnow)
class PriorConsumption(Base):
    __tablename__ = "prior_consumption"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    market_date  = Column(String(20), nullable=False)
    profile_name = Column(String(150), nullable=False)
    value        = Column(Float, nullable=False)
    uploaded_at  = Column(DateTime, default=datetime.utcnow)