import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
)

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Authentication"])

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is missing")

security = HTTPBearer()
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int):
    expires = datetime.now(timezone.utc) + timedelta(days=7)

    payload = {
        "sub": str(user_id),
        "exp": expires,
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = int(payload["sub"])

    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found or disabled",
        )

    return user


def require_admin(
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return current_user


@router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    name = data.name.strip()
    mobile = data.mobile_number.strip()

    user = db.query(User).filter(
        User.mobile_number == mobile
    ).first()

    # Use a general message so the response doesn't reveal
    # whether a particular name or mobile number exists.
    if (
        user is None
        or not user.is_active
        or user.name.casefold() != name.casefold()
        or not user.password_hash
        or not verify_password(data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid name, mobile number, or password",
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="No password is set for this account",
        )

    if not verify_password(
        data.current_password,
        current_user.password_hash,
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    current_user.password_hash = hash_password(data.new_password)
    current_user.must_change_password = False

    db.commit()

    return {"message": "Password changed successfully"}


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_customer(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    mobile = data.mobile_number.strip()

    existing_user = db.query(User).filter(
        User.mobile_number == mobile
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="A user with this mobile number already exists",
        )

    user = User(
        name=data.name.strip(),
        mobile_number=mobile,
        password_hash=hash_password(data.temporary_password),
        role="customer",
        must_change_password=True,
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.get("/users", response_model=list[UserResponse])
def list_customers(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return (
        db.query(User)
        .filter(User.role == "customer")
        .order_by(User.name)
        .all()
    )


@router.post("/users/{user_id}/reset-password")
def reset_customer_password(
    user_id: int,
    data: PasswordResetRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.role == "customer",
    ).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    user.password_hash = hash_password(data.temporary_password)
    user.must_change_password = True

    db.commit()

    return {"message": "Temporary password set successfully"}


@router.delete("/users/{user_id}", response_model=UserResponse)
def deactivate_customer(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.role == "customer",
    ).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found",
        )

    user.is_active = False
    db.commit()
    db.refresh(user)

    return user