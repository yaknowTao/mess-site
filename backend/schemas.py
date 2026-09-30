from datetime import date,datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


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


class LoginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mobile_number: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mobile_number: str = Field(min_length=10, max_length=15)
    temporary_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    temporary_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    name: str
    mobile_number: str
    role: str
    must_change_password: bool
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# -------------------------
# ORDERS
# -------------------------

class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1)


class OrderCreate(BaseModel):
    meal_type: str = "lunch"
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderResponse(BaseModel):
    id: int
    date: date
    meal_type: str
    total_amount: Decimal
    payment_status: str

    model_config = ConfigDict(from_attributes=True)

class OrderItemResponse(BaseModel):
    id:int
    menu_item_id:int
    quantity:int
    unit_price:Decimal

    model_config=ConfigDict(from_attributes=True)

class MyOrderResponse(BaseModel):
    id:int
    date:date
    meal_type:str
    eating:bool
    total_amount:Decimal
    amount_paid:Decimal
    payment_status:str
    created_at:datetime

    order_status:str
    admin_seen_at:datetime|None
    update_requested_at:datetime|None

    items:list[OrderItemResponse]

    model_config=ConfigDict(from_attributes=True)

class OrderUpsert(BaseModel):
    order_date:date|None=None
    eating:bool=True
    items:list[OrderItemCreate]=Field(default_factory=list)

class AdminOrderItemResponse(BaseModel):
    menu_item_id: int
    menu_item_name: str
    quantity: int
    unit_price: Decimal

class AdminOrderResponse(BaseModel):
    id: int
    user_id: int
    customer_name: str
    customer_mobile: str
    date: date
    meal_type: str
    eating: bool
    total_amount: Decimal
    amount_paid:Decimal
    payment_status: str

    order_status:str
    admin_seen_at:datetime|None
    update_requested_at:datetime|None
    payment_request_status: str | None = None
    payment_request_id: int | None = None

    items: list[AdminOrderItemResponse]

# -------------------------
# CUSTOMER PAYMENTS
# -------------------------

class MoneyTransactionCreate(BaseModel):
    user_id: int
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


class CustomerTransactionResponse(BaseModel):
    id: int
    user_id: int
    transaction_type: str
    amount: Decimal
    note: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomerAccountOrderItemResponse(BaseModel):
    menu_item_id: int
    quantity: int
    unit_price: Decimal
    menu_item_name: str


class CustomerAccountOrderResponse(BaseModel):
    id: int
    date: date
    meal_type: str
    eating: bool
    total_amount: Decimal
    amount_paid: Decimal
    payment_status: str
    order_status: str
    payment_request_status: str | None = None
    items: list[CustomerAccountOrderItemResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomerAccountResponse(BaseModel):
    user_id: int
    customer_name: str
    total_due: Decimal
    available_credit: Decimal
    orders: list[CustomerAccountOrderResponse]
    transactions: list[CustomerTransactionResponse]


class ApplyCreditResponse(BaseModel):
    message: str
    user_id: int
    amount_applied: Decimal
    remaining_credit: Decimal

class MessDayOffResponse(BaseModel):
    id: int
    date: date
    reason: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
