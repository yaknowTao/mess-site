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
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    password_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
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
        Numeric(10, 2),
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

    meal_type: Mapped[str] = mapped_column(String(20))

    eating: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
    )

    # Total amount paid toward this order so far.
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    # unpaid, partial, or paid
    payment_status: Mapped[str] = mapped_column(
        String(20),
        default="unpaid",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
    )

    payment_allocations: Mapped[list["OrderPaymentAllocation"]] = (
        relationship(
            back_populates="order",
            cascade="all, delete-orphan",
        )
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
        Numeric(10, 2),
    )

    order: Mapped["Order"] = relationship(
        back_populates="items",
    )


class CustomerTransaction(Base):
    __tablename__ = "customer_transactions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    # The customer this money belongs to.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        index=True,
    )

    # deposit = money added to customer credit
    # payment = direct payment received for outstanding meals
    transaction_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    allocations: Mapped[list["OrderPaymentAllocation"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
    )


class OrderPaymentAllocation(Base):
    __tablename__ = "order_payment_allocations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("customer_transactions.id"),
        index=True,
    )

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id"),
        index=True,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    transaction: Mapped["CustomerTransaction"] = relationship(
        back_populates="allocations",
    )

    order: Mapped["Order"] = relationship(
        back_populates="payment_allocations",
    )