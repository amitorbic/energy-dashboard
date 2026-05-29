from sqlalchemy import Column, Integer, String
from utils.database import Base

class User(Base):
    __tablename__ = "users"
    uid      = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name     = Column(String(255), nullable=False)
    email    = Column(String(255), nullable=False)
    password = Column(String(255), nullable=False)  # MD5 hashed
    role     = Column(Integer, nullable=False, default=3)
    # role: 1=admin, 2=manager, 3=user
