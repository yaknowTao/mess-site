from getpass import getpass

from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import engine
from models import User


password_hasher = PasswordHash.recommended()


def main():
    name = input("Admin name: ").strip()
    mobile = input("Admin mobile number: ").strip()

    if not name:
        print("Name cannot be empty.")
        return

    if not mobile.isdigit() or not 10 <= len(mobile) <= 15:
        print("Enter a valid mobile number.")
        return

    with Session(engine) as db:
        existing_user = db.scalar(
            select(User).where(User.mobile_number == mobile)
        )

        if existing_user:
            print(
                "A user with this mobile number already exists. "
                "No changes were made."
            )
            print(
                "Choose a different number, or manually verify "
                "the existing account before promoting it."
            )
            return

        password = getpass("Choose admin password (min 8 characters): ")
        confirm_password = getpass("Confirm admin password: ")

        if len(password) < 8:
            print("Password must be at least 8 characters.")
            return

        if password != confirm_password:
            print("Passwords do not match.")
            return

        admin = User(
            name=name,
            mobile_number=mobile,
            password_hash=password_hasher.hash(password),
            role="admin",
            must_change_password=False,
            is_active=True,
        )

        db.add(admin)
        db.commit()

        print("Admin account created successfully.")


if __name__ == "__main__":
    main()