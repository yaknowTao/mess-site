
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

import models

from database import Base, engine, get_db
from models import MenuItem
from schemas import MenuItemResponse
from auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)


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