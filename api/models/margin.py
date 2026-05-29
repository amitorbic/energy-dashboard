from sqlalchemy import Column, Integer, Float, DateTime, String, text
from utils.database import Base
from datetime import datetime

class Margin(Base):
    __tablename__ = "margin"
    
    serial = Column(Integer, primary_key=True, autoincrement=True)
    term   = Column(Integer, nullable=False)
    # The profile columns (CPL_BUSHILF_SOUTH, etc.) are handled dynamically 
    # via Raw SQL to avoid mapping 25+ individual columns here.
    upload_date = Column(DateTime, default=datetime.utcnow)

class PriorMargin(Base):
    __tablename__ = "prior_margin"
    serial = Column(Integer, primary_key=True, autoincrement=True)
    term   = Column(Integer, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow)