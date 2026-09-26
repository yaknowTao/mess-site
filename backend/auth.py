import os
import secrets
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import OTPRequest, OTPVerify, TokenResponse

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Authentication"])

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is missing")

security = HTTPBearer()

# Development only: temporary OTP storage
otp_store = {}


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


@router.post("/request-otp")
def request_otp(
    data: OTPRequest,
    db: Session = Depends(get_db),
):
    mobile = data.mobile_number.strip()

    # Generate a six-digit OTP
    otp = f"{secrets.randbelow(1000000):06d}"

    otp_store[mobile] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc)
        + timedelta(minutes=5),
        "name": data.name,
    }

    # Development only. Never log OTPs in production.
    print(f"Development OTP for {mobile}: {otp}")

    return {
        "message": "OTP generated. Check backend terminal."
    }


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(
    data: OTPVerify,
    db: Session = Depends(get_db),
):
    mobile = data.mobile_number.strip()

    challenge = otp_store.get(mobile)

    if not challenge:
        raise HTTPException(
            status_code=400,
            detail="Request an OTP first",
        )

    if datetime.now(timezone.utc) > challenge["expires"]:
        otp_store.pop(mobile, None)

        raise HTTPException(
            status_code=400,
            detail="OTP expired",
        )

    if not secrets.compare_digest(
        data.otp,
        challenge["otp"],
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    user = db.query(User).filter(
        User.mobile_number == mobile
    ).first()

    if user is None:
        name = (data.name or challenge["name"] or "").strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail="Name is required for new users",
            )

        user = User(
            name=name,
            mobile_number=mobile,
            role="customer",
        )

        db.add(user)
        db.commit()
        db.refresh(user)

    otp_store.pop(mobile, None)

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me")
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = int(payload["sub"])

    except (JWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    return user