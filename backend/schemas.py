
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# -------------------------
# MENU
# -------------------------

class MenuItemResponse(BaseModel):
    id: int
    name: str
    category: str
    price: Decimal
    unit: str
    is_available: bool

    model_config = ConfigDict(from_attributes=True)


# -------------------------
# AUTHENTICATION
# -------------------------

class OTPRequest(BaseModel):
    mobile_number: str = Field(
        min_length=10,
        max_length=15,
    )

    name: str | None = None


class OTPVerify(BaseModel):
    mobile_number: str
    otp: str
    name: str | None = None


class UserResponse(BaseModel):
    id: int
    name: str
    mobile_number: str
    role: str

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse