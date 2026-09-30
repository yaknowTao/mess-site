from datetime import date,datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session,selectinload 
from sqlalchemy import func

from auth import get_current_user, require_admin
from database import get_db
from models import (MenuItem, Order, OrderItem, User, CustomerTransaction, OrderPaymentAllocation, CustomerPaymentRequest, MessDayOff)
from schemas import (
    OrderCreate, OrderResponse, MyOrderResponse,
    OrderUpsert, AdminOrderResponse, MoneyTransactionCreate, MessDayOffResponse,)


router = APIRouter(prefix="/orders", tags=["Orders"])

CENT = Decimal("0.01")

INDIA_TZ=ZoneInfo('Asia/Kolkata')

def validate_order_date_and_cutoff(order_date: date, meal_type: str):
    now = datetime.now(INDIA_TZ)
    today = now.date()

    if order_date < today:
        raise HTTPException(
            status_code=400,
            detail="You cannot place or update orders for past dates.",
        )

    if order_date == today:
        current_minutes = now.hour * 60 + now.minute

        if meal_type == "lunch" and current_minutes >= 10 * 60:
            raise HTTPException(
                status_code=409,
                detail="The lunch order cutoff is 10:00 AM.",
            )

        if meal_type == "dinner" and current_minutes >= 18 * 60:
            raise HTTPException(
                status_code=409,
                detail="The dinner order cutoff is 6:00 PM.",
            )

def get_day_off(db: Session, target_date: date) -> MessDayOff | None:
    return db.query(MessDayOff).filter(MessDayOff.date == target_date).first()


def ensure_mess_open(db: Session, target_date: date) -> None:
    day_off = get_day_off(db, target_date)
    if day_off:
        reason = f" Reason: {day_off.reason}" if day_off.reason else ""
        raise HTTPException(
            status_code=409,
            detail=f"The mess is closed on {target_date}.{reason}",
        )


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
            Order.order_status=='Completed',
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
    ensure_mess_open(db, date.today())

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

    target_date=data.order_date or datetime.now(INDIA_TZ).date()
    validate_order_date_and_cutoff(target_date,meal_type)
    ensure_mess_open(db, target_date)

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
                Order.date==target_date,
                Order.meal_type==meal_type,
            )
            .first()
        )
        if order and order.order_status !='Submitted':
            raise HTTPException(
                status_code=409,
                detail='This order cannot be editted directly. Request an update from the admin.',
            )

        if order is None:
            order=Order(
                user_id=current_user.id,
                date=target_date,
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


        db.flush()

        db.commit()
        db.refresh(order)

        return order

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

@router.patch("/{order_id}/request-update")
def request_order_update(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    # Customers can request updates only for their own orders.
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only request updates for your own orders",
        )

    if order.order_status != "Seen":
        raise HTTPException(
            status_code=409,
            detail="You can request an update only after the admin has seen the order",
        )

    if order.update_requested_at is not None:
        raise HTTPException(
            status_code=409,
            detail="An update has already been requested for this order",
        )

    order.update_requested_at = datetime.now(INDIA_TZ)

    try:
        db.commit()
        db.refresh(order)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Update requested successfully",
        "order_id": order.id,
        "order_status": order.order_status,
        "update_requested_at": order.update_requested_at,
    }

@router.get("/days-off", response_model=list[MessDayOffResponse])
def list_days_off(
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(MessDayOff)
    if from_date:
        query = query.filter(MessDayOff.date >= from_date)
    if to_date:
        query = query.filter(MessDayOff.date <= to_date)
    return query.order_by(MessDayOff.date.asc()).all()


@router.get("/admin/calendar")
def get_admin_calendar(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    first = date(year, month, 1)
    next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    rows = (
        db.query(Order.date, func.count(Order.id))
        .filter(Order.date >= first, Order.date < next_month)
        .group_by(Order.date)
        .all()
    )
    day_offs = db.query(MessDayOff).filter(MessDayOff.date >= first, MessDayOff.date < next_month).all()
    return {
        "order_counts": {row[0].isoformat(): row[1] for row in rows},
        "days_off": [
            {"id": item.id, "date": item.date, "reason": item.reason}
            for item in day_offs
        ],
    }


@router.post("/admin/days-off", response_model=MessDayOffResponse)
def create_day_off(
    target_date: date,
    reason: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    today = datetime.now(INDIA_TZ).date()
    if target_date < today:
        raise HTTPException(status_code=400, detail="A day off can only be set for today or a future date.")

    existing = get_day_off(db, target_date)
    if existing:
        return existing

    completed = (
        db.query(Order)
        .filter(Order.date == target_date, Order.order_status == "Completed")
        .count()
    )
    if completed:
        raise HTTPException(
            status_code=409,
            detail="This date already has completed orders, so it cannot be closed retroactively.",
        )

    day_off = MessDayOff(date=target_date, reason=(reason or "").strip() or None)
    db.add(day_off)

    # A closure cancels every existing order on that date. Since completed orders
    # are blocked above, no completed payment due is accidentally cancelled.
    db.query(Order).filter(Order.date == target_date).update(
        {"order_status": "Cancelled", "admin_seen_at": None, "update_requested_at": None},
        synchronize_session=False,
    )

    db.commit()
    db.refresh(day_off)
    return day_off


@router.delete("/admin/days-off/{target_date}")
def remove_day_off(
    target_date: date,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    day_off = get_day_off(db, target_date)
    if not day_off:
        raise HTTPException(status_code=404, detail="Day off not found")
    db.delete(day_off)
    # Cancelled orders on a closure are restored to Submitted if the admin
    # reopens the date. There is currently no other cancellation path.
    db.query(Order).filter(
        Order.date == target_date,
        Order.order_status == "Cancelled",
    ).update(
        {"order_status": "Submitted"},
        synchronize_session=False,
    )
    db.commit()
    return {"message": "Day reopened and cancelled orders restored", "date": target_date}


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
            "order_status":order.order_status,
            "admin_seen_at":order.admin_seen_at,
            "update_requested_at":order.update_requested_at,
            "payment_request_status": (db.query(CustomerPaymentRequest.status)
                .filter(CustomerPaymentRequest.order_id == order.id)
                .order_by(CustomerPaymentRequest.requested_at.desc(), CustomerPaymentRequest.id.desc())
                .limit(1).scalar()),
            "payment_request_id": (db.query(CustomerPaymentRequest.id)
                .filter(CustomerPaymentRequest.order_id == order.id, CustomerPaymentRequest.status == "pending")
                .order_by(CustomerPaymentRequest.requested_at.desc(), CustomerPaymentRequest.id.desc())
                .limit(1).scalar()),
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

@router.patch("/admin/{order_id}/reopen")
def reopen_order_for_update(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    if order.order_status != "Seen":
        raise HTTPException(
            status_code=409,
            detail="Only seen orders can be reopened",
        )

    if order.update_requested_at is None:
        raise HTTPException(
            status_code=409,
            detail="This order has no pending update request",
        )

    order.order_status = "Submitted"
    order.admin_seen_at = None
    order.update_requested_at = None

    try:
        db.commit()
        db.refresh(order)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Update request approved. Order reopened for customer editing.",
        "order_id": order.id,
        "order_status": order.order_status,
        "update_requested_at": order.update_requested_at,
    }

@router.patch("/admin/{order_id}/seen")
def mark_order_as_seen(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    if order.order_status != "Submitted":
        raise HTTPException(
            status_code=409,
            detail="Only submitted orders can be marked as seen",
        )

    order.order_status = "Seen"
    order.admin_seen_at = datetime.now(INDIA_TZ)

    db.commit()
    db.refresh(order)

    return {
        "message": "Order marked as seen",
        "order_id": order.id,
        "order_status": order.order_status,
        "admin_seen_at": order.admin_seen_at,
    }

@router.patch("/admin/{order_id}/preparing")
def mark_order_as_preparing(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.order_status != "Seen":
        raise HTTPException(
            status_code=409,
            detail="Only seen orders can be marked as preparing",
        )

    if order.update_requested_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Review the customer's update request before preparing this order",
        )

    order.order_status = "Preparing"

    db.commit()
    db.refresh(order)

    return {
        "message": "Order marked as preparing",
        "order_id": order.id,
        "order_status": order.order_status,
    }


@router.patch("/admin/{order_id}/completed")
def mark_order_as_completed(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.order_status != "Preparing":
        raise HTTPException(
            status_code=409,
            detail="Only preparing orders can be marked as completed",
        )

    # Lock the order as completed first.
    order.order_status = "Completed"
    db.flush()

    # Apply any available deposit credit to completed orders with a due.
    apply_available_credit(db, order.user_id)

    db.commit()
    db.refresh(order)

    return {
        "message": "Order marked as completed",
        "order_id": order.id,
        "order_status": order.order_status,
        "total_amount": order.total_amount,
        "amount_paid": order.amount_paid,
        "payment_status": order.payment_status,
    }

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


@router.post("/{order_id}/payment-request")
def request_payment_confirmation(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.get(Order, order_id)
    if order is None or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.order_status != "Completed":
        raise HTTPException(status_code=409, detail="Payment can only be requested for completed orders")
    due = get_order_due(order)
    if due <= 0:
        raise HTTPException(status_code=409, detail="This order has no outstanding balance")
    pending = db.query(CustomerPaymentRequest).filter(
        CustomerPaymentRequest.order_id == order.id,
        CustomerPaymentRequest.status == "pending",
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="A payment confirmation request is already pending")

    request = CustomerPaymentRequest(order_id=order.id, user_id=current_user.id, amount=due)
    db.add(request)
    db.commit()
    db.refresh(request)
    return {"message": "Payment confirmation requested", "request_id": request.id,
            "status": request.status, "amount": request.amount}


@router.patch("/admin/payment-requests/{request_id}/confirm")
def confirm_customer_payment_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    request = db.get(CustomerPaymentRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Payment request not found")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This payment request has already been handled")
    order = db.get(Order, request.order_id)
    if order is None or order.order_status != "Completed":
        raise HTTPException(status_code=409, detail="Only completed orders can be paid")
    amount = min(request.amount, get_order_due(order))
    if amount <= 0:
        request.status = "confirmed"
        request.confirmed_at = datetime.now(INDIA_TZ)
        db.commit()
        return {"message": "Order was already paid", "request_id": request.id}

    transaction = CustomerTransaction(
        user_id=request.user_id,
        transaction_type="payment",
        amount=amount,
        note=f"Customer payment request for order #{order.id} confirmed",
    )
    db.add(transaction)
    db.flush()
    allocate_transaction_to_orders(db, transaction, request.user_id)
    request.status = "confirmed"
    request.confirmed_at = datetime.now(INDIA_TZ)
    request.transaction_id = transaction.id
    db.commit()
    db.refresh(request)
    return {"message": "Customer payment confirmed", "request_id": request.id,
            "transaction_id": transaction.id, "amount": amount}


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
        (
            get_order_due(order)
            for order in orders
            if order.order_status == "Completed"
        ),
        Decimal("0.00"),
    )

    account_orders = []
    for order in orders:
        latest_request = (db.query(CustomerPaymentRequest)
            .filter(CustomerPaymentRequest.order_id == order.id)
            .order_by(CustomerPaymentRequest.requested_at.desc(), CustomerPaymentRequest.id.desc())
            .first())
        item_ids = [item.menu_item_id for item in order.items]
        menu_items = db.query(MenuItem).filter(MenuItem.id.in_(item_ids)).all() if item_ids else []
        names = {item.id: item.name for item in menu_items}
        account_orders.append({
            "id": order.id, "date": order.date, "meal_type": order.meal_type,
            "eating": order.eating, "total_amount": order.total_amount,
            "amount_paid": order.amount_paid, "payment_status": order.payment_status,
            "order_status": order.order_status,
            "payment_request_status": latest_request.status if latest_request else None,
            "created_at": order.created_at,
            "items": [{"menu_item_id": item.menu_item_id, "quantity": item.quantity,
                       "unit_price": item.unit_price,
                       "menu_item_name": names.get(item.menu_item_id, "Unavailable item")}
                      for item in order.items],
        })

    return {
        "user_id": current_user.id,
        "customer_name": current_user.name,
        "total_due": total_due,
        "available_credit": get_available_credit(db, current_user.id),
        "orders": account_orders,
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
        (get_order_due(order) for order in orders if order.order_status == "Completed"),
        Decimal("0.00"),
    )

    account_orders = []
    for order in orders:
        latest_request = (db.query(CustomerPaymentRequest)
            .filter(CustomerPaymentRequest.order_id == order.id)
            .order_by(CustomerPaymentRequest.requested_at.desc(), CustomerPaymentRequest.id.desc())
            .first())
        item_ids = [item.menu_item_id for item in order.items]
        menu_items = db.query(MenuItem).filter(MenuItem.id.in_(item_ids)).all() if item_ids else []
        names = {item.id: item.name for item in menu_items}
        account_orders.append({
            "id": order.id, "date": order.date, "meal_type": order.meal_type,
            "eating": order.eating, "total_amount": order.total_amount,
            "amount_paid": order.amount_paid, "payment_status": order.payment_status,
            "order_status": order.order_status,
            "payment_request_status": latest_request.status if latest_request else None,
            "created_at": order.created_at,
            "items": [{"menu_item_id": item.menu_item_id, "quantity": item.quantity,
                       "unit_price": item.unit_price,
                       "menu_item_name": names.get(item.menu_item_id, "Unavailable item")}
                      for item in order.items],
        })

    return {
        "user_id": customer.id,
        "customer_name": customer.name,
        "total_due": total_due,
        "available_credit": get_available_credit(db, user_id),
        "orders": account_orders,
        "transactions": transactions,
    }