
from decimal import Decimal

from sqlalchemy import select

from database import SessionLocal
from models import MenuItem


sample_menu = [
    MenuItem(
        name="Rice",
        category="main",
        price=Decimal("20.00"),
        unit="portion",
    ),
    MenuItem(
        name="Roti",
        category="main",
        price=Decimal("5.00"),
        unit="piece",
    ),
    MenuItem(
        name="Dal",
        category="main",
        price=Decimal("15.00"),
        unit="portion",
    ),
    MenuItem(
        name="Sabji",
        category="main",
        price=Decimal("20.00"),
        unit="portion",
    ),
]


with SessionLocal() as db:
    existing_item = db.scalar(
        select(MenuItem.id).limit(1)
    )

    if existing_item is None:
        db.add_all(sample_menu)
        db.commit()
        print("Sample menu inserted.")
    else:
        print("Menu already contains items.")