
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

import models

from database import Base, engine, get_db
from models import MenuItem, User
from auth import require_admin
from schemas import MenuItemResponse
from auth import router as auth_router
from orders import router as orders_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)
@app.get("/health")
def health():
    return {"status": "ok"}
app.include_router(auth_router)
app.include_router(orders_router)



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "MessMate API is running"
    }


@app.get("/db-check")
def database_check():
    with engine.connect() as connection:
        connection.execute(select(1))

    return {
        "database": "connected"
    }


@app.get("/menu/admin", response_model=list[MenuItemResponse])
def get_all_menu_items(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return db.query(MenuItem).order_by(MenuItem.is_available.desc(), MenuItem.name).all()


@app.get(
    "/menu",
    response_model=list[MenuItemResponse],
)
def get_menu(db: Session = Depends(get_db)):
    statement = select(MenuItem).where(
        MenuItem.is_available == True
    )

    menu_items = db.scalars(statement).all()

    return menu_items

@app.post("/menu", response_model=MenuItemResponse)
def create_menu_item(
    data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Menu item name is required")
    try:
        price = float(data.get("price", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Enter a valid price")
    if price < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")
    item = MenuItem(
        name=name,
        category=str(data.get("category") or "main"),
        price=price,
        unit=str(data.get("unit") or "portion"),
        is_available=True,
    )
    db.add(item); db.commit(); db.refresh(item)
    return item


@app.patch("/menu/{item_id}", response_model=MenuItemResponse)
def update_menu_item(
    item_id: int,
    data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    if "name" in data: item.name = str(data["name"]).strip()
    if "category" in data: item.category = str(data["category"]).strip() or "main"
    if "unit" in data: item.unit = str(data["unit"]).strip() or "portion"
    if "price" in data:
        try: price = float(data["price"])
        except (TypeError, ValueError): raise HTTPException(status_code=400, detail="Enter a valid price")
        if price < 0: raise HTTPException(status_code=400, detail="Price cannot be negative")
        item.price = price
    if "is_available" in data: item.is_available = bool(data["is_available"])
    db.commit(); db.refresh(item)
    return item


@app.delete("/menu/{item_id}")
def archive_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    # Soft-delete so old orders keep their historical item references.
    item.is_available = False
    db.commit()
    return {"message": "Menu item removed from the active menu", "id": item.id}
