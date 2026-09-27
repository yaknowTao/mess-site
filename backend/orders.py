from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session,selectinload 
from sqlalchemy import func

from auth import get_current_user, require_admin
from database import get_db
from models import (MenuItem, Order, OrderItem, User, CustomerTransaction,OrderPaymentAllocation)
from schemas import (
    OrderCreate, OrderResponse, MyOrderResponse,
    OrderUpsert, AdminOrderResponse, MoneyTransactionCreate,)

router = APIRouter(prefix="/orders", tags=["Orders"])

CENT = Decimal("0.01")


def update_order_payment_status(order: Order) -> None:
    """Keep amount_paid and payment_status consistent."""
    if order.amount_paid <= Decimal("0.00"):
        order.amount_paid = Decimal("0.00")
        order.payment_status = "unpaid"
    elif order.amount_paid >= order.total_amount:
        order.amount_paid = order.total_amount
        order.payment_status = "paid"
    else:
        order.payment_status = "partial"


def get_order_due(order: Order) -> Decimal:
    return max(
        order.total_amount - order.amount_paid,
        Decimal("0.00"),
    )


def get_available_credit(db: Session, user_id: int) -> Decimal:
    """
    Available credit is the unused portion of deposit transactions.
    Direct payments are allocated to meal orders, not stored as credit.
    """
    deposits = (
        db.query(CustomerTransaction)
        .filter(
            CustomerTransaction.user_id == user_id,
            CustomerTransaction.transaction_type == "deposit",
        )
        .all()
    )

    available = Decimal("0.00")

    for transaction in deposits:
        allocated = (
            db.query(OrderPaymentAllocation)
            .filter(
                OrderPaymentAllocation.transaction_id == transaction.id,
            )
            .with_entities(
                func.coalesce(func.sum(OrderPaymentAllocation.amount), 0)
            )
            .scalar()
        )

        available += transaction.amount - Decimal(allocated)

    return max(available, Decimal("0.00"))


def get_oldest_unpaid_orders(
    db: Session,
    user_id: int,
) -> list[Order]:
    return (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.amount_paid < Order.total_amount,
            Order.total_amount > 0,
        )
        .order_by(Order.date.asc(), Order.id.asc())
        .with_for_update()
        .all()
    )


def allocate_transaction_to_orders(
    db: Session,
    transaction: CustomerTransaction,
) -> Decimal:
    """
    Allocate a transaction to the customer's oldest outstanding orders.
    Returns the amount allocated.
    """
    remaining = transaction.amount
    amount_allocated = Decimal("0.00")

    orders = get_oldest_unpaid_orders(db, transaction.user_id)

    for order in orders:
        if remaining <= 0:
            break

        due = get_order_due(order)

        if due <= 0:
            continue

        applied = min(remaining, due)

        allocation = OrderPaymentAllocation(
            transaction_id=transaction.id,
            order_id=order.id,
            amount=applied,
        )
        db.add(allocation)

        order.amount_paid += applied
        update_order_payment_status(order)

        remaining -= applied
        amount_allocated += applied

    return amount_allocated


def apply_available_credit(
    db: Session,
    user_id: int,
) -> Decimal:
    """
    Apply unused deposit credit to the customer's oldest outstanding orders.
    Returns the amount applied.
    """
    deposits = (
        db.query(CustomerTransaction)
        .filter(
            CustomerTransaction.user_id == user_id,
            CustomerTransaction.transaction_type == "deposit",
        )
        .order_by(
            CustomerTransaction.created_at.asc(),
            CustomerTransaction.id.asc(),
        )
        .all()
    )

    total_applied = Decimal("0.00")

    for deposit in deposits:
        allocated = (
            db.query(
                func.coalesce(func.sum(OrderPaymentAllocation.amount), 0)
            )
            .filter(
                OrderPaymentAllocation.transaction_id == deposit.id,
            )
            .scalar()
        )

        remaining = deposit.amount - Decimal(allocated)

        if remaining <= 0:
            continue

        orders = get_oldest_unpaid_orders(db, user_id)

        for order in orders:
            if remaining <= 0:
                break

            due = get_order_due(order)

            if due <= 0:
                continue

            applied = min(remaining, due)

            db.add(
                OrderPaymentAllocation(
                    transaction_id=deposit.id,
                    order_id=order.id,
                    amount=applied,
                )
            )

            order.amount_paid += applied
            update_order_payment_status(order)

            remaining -= applied
            total_applied += applied

    return total_applied

@router.get('/my',response_model=list[MyOrderResponse])
def get_my_orders(
    db:Session=Depends(get_db),
    current_user:User=Depends(get_current_user),
):
    orders=(
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(Order.user_id==current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return orders


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Prevent duplicate menu item entries in one request.
    item_ids = [item.menu_item_id for item in data.items]

    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(
            status_code=400,
            detail="Each menu item should appear only once",
        )

    total = Decimal("0.00")
    order_items = []

    try:
        # Create the order for the authenticated user.
        order = Order(
            user_id=current_user.id,
            date=date.today(),
            meal_type=data.meal_type,
            eating=True,
            total_amount=Decimal("0.00"),
            payment_status="unpaid",
        )

        db.add(order)
        db.flush()

        for requested_item in data.items:
            menu_item = db.get(MenuItem, requested_item.menu_item_id)

            if menu_item is None or not menu_item.is_available:
                raise HTTPException(
                    status_code=400,
                    detail=f"Menu item {requested_item.menu_item_id} is unavailable",
                )

            unit_price = Decimal(menu_item.price)
            line_total = unit_price * requested_item.quantity
            total += line_total

            order_items.append(
                OrderItem(
                    order_id=order.id,
                    menu_item_id=menu_item.id,
                    quantity=requested_item.quantity,
                    unit_price=unit_price,
                )
            )

        order.total_amount = total
        db.add_all(order_items)
        db.commit()
        db.refresh(order)

        return order

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="You already have an order for this meal today",
        )

    except Exception:
        db.rollback()
        raise

@router.put('/{meal_type}',response_model=MyOrderResponse)
def upsert_meal_order(
    meal_type:str,
    data:OrderUpsert,
    db:Session=Depends(get_db),
    current_user:User=Depends(get_current_user),
):
    print("ORDER REQUEST:", data.model_dump())
    meal_type=meal_type.lower()
    if meal_type not in {"lunch","dinner" }:
        raise HTTPException(
            status_code=400,
            detail='Meal type must be Lunch or Dinner',
        )
    if data.eating and not data.items:
        raise HTTPException(
            status_code=400,
            detail='Select atleast one menu item or selct Not eating',
        )
    
    item_ids=[item.menu_item_id for item in data.items]

    if len(item_ids) !=len(set(item_ids)):
        raise HTTPException(
            status_code=400,
            detail='Each menu item should only appear once',
        )
    try:
        order=(
            db.query(Order)
            .filter(
                Order.user_id==current_user.id,
                Order.date==date.today(),
                Order.meal_type==meal_type,
            )
            .first()
        )
        if order and order.amount_paid > Decimal("0.00"):
            raise HTTPException(
                status_code=409,
                detail="This order has a payment applied and can't be edited",
            )
        if order is None:
            order=Order(
                user_id=current_user.id,
                date=date.today(),
                meal_type=meal_type,
                eating=data.eating,
                total_amount=Decimal('0.00'),
                payment_status='unpaid',
            )
            db.add(order)
            db.flush()
        else:
            #Remove the previous item selections
            order.items.clear()

        order.eating=data.eating
        total=Decimal('0.00')

        if data.eating:
            for requested_item in data.items:
                menu_item = db.get(
                    MenuItem,
                    requested_item.menu_item_id,
                )

                print("FOUND MENU ITEM:", menu_item)

                if menu_item is None or not menu_item.is_available:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Menu item {requested_item.menu_item_id} is unavailable",
                    )

                unit_price = Decimal(menu_item.price)
                line_total = unit_price * requested_item.quantity
                total += line_total

                order.items.append(
                    OrderItem(
                        menu_item_id=menu_item.id,
                        quantity=requested_item.quantity,
                        unit_price=unit_price,
                    )
                )

        order.total_amount = total
        order.amount_paid = Decimal("0.00")
        update_order_payment_status(order)

        db.flush()

        # Automatically use any unused deposit credit.
        apply_available_credit(db, current_user.id)

        db.commit()
        db.refresh(order)

        return order

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

@router.get("/admin", response_model=list[AdminOrderResponse])
def get_orders_for_admin(
    order_date: date | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target_date = order_date or date.today()

    orders = (
        db.query(Order)
        .join(User, Order.user_id == User.id)
        .options(selectinload(Order.items))
        .filter(Order.date == target_date)
        .order_by(Order.meal_type, User.name)
        .all()
    )

    # Collect menu item IDs so we can fetch their names in one query.
    menu_item_ids = {
        item.menu_item_id
        for order in orders
        for item in order.items
    }

    menu_items = (
        db.query(MenuItem)
        .filter(MenuItem.id.in_(menu_item_ids))
        .all()
        if menu_item_ids
        else []
    )

    menu_item_names = {
        item.id: item.name
        for item in menu_items
    }

    result = []

    for order in orders:
        customer = db.get(User, order.user_id)

        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "customer_name": customer.name,
            "customer_mobile": customer.mobile_number,
            "date": order.date,
            "meal_type": order.meal_type,
            "eating": order.eating,
            "total_amount": order.total_amount,
            "amount_paid":order.amount_paid,
            "payment_status": order.payment_status,
            "items": [
                {
                    "menu_item_id": item.menu_item_id,
                    "menu_item_name": menu_item_names.get(
                        item.menu_item_id,
                        "Unavailable item",
                    ),
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                }
                for item in order.items
            ],
        })

    return result

@router.post("/admin/customers/{user_id}/deposit")
def add_customer_deposit(
    user_id: int,
    data: MoneyTransactionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    customer = db.get(User, user_id)

    if customer is None or customer.role != "customer":
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    transaction = CustomerTransaction(
        user_id=user_id,
        transaction_type="deposit",
        amount=data.amount.quantize(CENT),
        note=data.note,
    )

    try:
        db.add(transaction)
        db.flush()

        # Deposit pays oldest outstanding meals first.
        amount_applied = allocate_transaction_to_orders(
            db,
            transaction,
        )

        db.commit()
        db.refresh(transaction)

        return {
            "message": "Deposit recorded",
            "transaction_id": transaction.id,
            "customer_id": user_id,
            "deposit_amount": transaction.amount,
            "amount_applied": amount_applied,
            "available_credit": get_available_credit(db, user_id),
        }

    except Exception:
        db.rollback()
        raise


@router.post("/admin/customers/{user_id}/payment")
def record_customer_payment(
    user_id: int,
    data: MoneyTransactionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    customer = db.get(User, user_id)

    if customer is None or customer.role != "customer":
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    total_due = sum(
        (
            get_order_due(order)
            for order in get_oldest_unpaid_orders(db, user_id)
        ),
        Decimal("0.00"),
    )

    amount = data.amount.quantize(CENT)

    if amount > total_due:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Direct payment cannot exceed outstanding dues "
                f"of {total_due}"
            ),
        )

    transaction = CustomerTransaction(
        user_id=user_id,
        transaction_type="payment",
        amount=amount,
        note=data.note,
    )

    try:
        db.add(transaction)
        db.flush()

        amount_applied = allocate_transaction_to_orders(
            db,
            transaction,
        )

        db.commit()
        db.refresh(transaction)

        return {
            "message": "Direct payment recorded",
            "transaction_id": transaction.id,
            "customer_id": user_id,
            "payment_amount": transaction.amount,
            "amount_applied": amount_applied,
        }

    except Exception:
        db.rollback()
        raise


@router.post("/admin/customers/{user_id}/apply-credit")
def apply_customer_credit(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    customer = db.get(User, user_id)

    if customer is None or customer.role != "customer":
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    try:
        amount_applied = apply_available_credit(db, user_id)
        db.commit()

        return {
            "message": "Available credit applied",
            "customer_id": user_id,
            "amount_applied": amount_applied,
            "remaining_credit": get_available_credit(db, user_id),
        }

    except Exception:
        db.rollback()
        raise


@router.get("/account/me")
def get_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.date.desc(), Order.id.desc())
        .all()
    )

    transactions = (
        db.query(CustomerTransaction)
        .filter(CustomerTransaction.user_id == current_user.id)
        .order_by(
            CustomerTransaction.created_at.desc(),
            CustomerTransaction.id.desc(),
        )
        .all()
    )

    total_due = sum(
        (get_order_due(order) for order in orders),
        Decimal("0.00"),
    )

    return {
        "user_id": current_user.id,
        "customer_name": current_user.name,
        "total_due": total_due,
        "available_credit": get_available_credit(
            db,
            current_user.id,
        ),
        "orders": orders,
        "transactions": transactions,
    }


@router.get("/admin/customers/{user_id}/account")
def get_customer_account(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    customer = db.get(User, user_id)

    if customer is None or customer.role != "customer":
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.date.desc(), Order.id.desc())
        .all()
    )

    transactions = (
        db.query(CustomerTransaction)
        .filter(CustomerTransaction.user_id == user_id)
        .order_by(
            CustomerTransaction.created_at.desc(),
            CustomerTransaction.id.desc(),
        )
        .all()
    )

    total_due = sum(
        (get_order_due(order) for order in orders),
        Decimal("0.00"),
    )

    return {
        "user_id": customer.id,
        "customer_name": customer.name,
        "total_due": total_due,
        "available_credit": get_available_credit(db, user_id),
        "orders": orders,
        "transactions": transactions,
    }