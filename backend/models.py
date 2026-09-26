
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100))

    mobile_number: Mapped[str] = mapped_column(
        String(15),
        unique=True,
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        default="customer",
    )


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100))

    category: Mapped[str] = mapped_column(
        String(50),
        default="main",
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2)
    )

    unit: Mapped[str] = mapped_column(
        String(30),
        default="portion",
    )

    is_available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )


class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "date",
            "meal_type",
            name="unique_user_meal_per_day",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        index=True,
    )

    date: Mapped[date] = mapped_column(Date)

    meal_type: Mapped[str] = mapped_column(
        String(20)
    )

    eating: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
    )

    payment_status: Mapped[str] = mapped_column(
        String(20),
        default="unpaid",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id"),
        index=True,
    )

    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id"),
    )

    quantity: Mapped[int] = mapped_column(Integer)

    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2)
    )