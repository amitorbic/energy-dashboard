from pydantic import BaseModel
from typing import Optional

class LoginRequest(BaseModel):
    login: str      # username or email
    password: str

class LoginResponse(BaseModel):
    success:              bool
    token:                Optional[str] = None
    user_id:              Optional[int] = None
    username:             Optional[str] = None
    role:                 Optional[int] = None
    email:                Optional[str] = None
    rep_id:               Optional[int] = None
    company_name:         Optional[str] = None
    modules:              Optional[list[str]] = None
    must_change_password: Optional[bool] = None
    message:              Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

class UserResponse(BaseModel):
    uid:   int
    name:  str
    email: str
    role:  int
    class Config:
        from_attributes = True
