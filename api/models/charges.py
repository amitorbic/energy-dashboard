from sqlalchemy import Column, Integer, String, Double, DateTime, func
from utils.database import Base

class TDSPCharge(Base):
    __tablename__ = "tdsp"
    serial = Column(Integer, primary_key=True, autoincrement=True)
    profile = Column(String(150), unique=True, nullable=False)
    value = Column(Double, default=0.0)
    upload_date = Column(DateTime, server_default=func.now(), onupdate=func.now())

class SupplierCharge(Base):
    __tablename__ = "txu" # Keeping your existing table name 'txu'
    serial = Column(Integer, primary_key=True, autoincrement=True)
    profile = Column(String(150), unique=True, nullable=False)
    value = Column(Double, default=0.0)
    upload_date = Column(DateTime, server_default=func.now(), onupdate=func.now())

# Prior Tables for Archiving
class PriorTDSP(Base):
    __tablename__ = "prior_tdsp"
    serial = Column(Integer, primary_key=True)
    profile = Column(String(150))
    value = Column(Double)
    upload_date = Column(DateTime)

class PriorSupplier(Base):
    __tablename__ = "prior_txu"
    serial = Column(Integer, primary_key=True)
    profile = Column(String(150))
    value = Column(Double)
    upload_date = Column(DateTime)