from sqlalchemy import Column, Integer, Float, DateTime, String
from datetime import datetime
from utils.database import Base

class GasStrip(Base):
    __tablename__ = "gas_strip"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(DateTime, nullable=False) # The Market Date
    value = Column(Float, nullable=False) # The Price

class GasStripHistory(Base):
    __tablename__ = "gas_strip_history"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(DateTime, nullable=False)    # The Market Date
    value = Column(Float, nullable=False)   # The Price
    uploaded_at = Column(DateTime, default=datetime.utcnow) # The "Start Date" / Batch Date
