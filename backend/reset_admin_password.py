
from getpass import getpass

from database import SessionLocal
from models import User
from auth import hash_password

def main():
    mobile = input("Enter your admin account mobile number: ").strip()
    new_password = getpass("Enter your new password: ")
    confirm_password = getpass("Confirm your new password: ")

    if not new_password:
        print("Password cannot be empty.")
        return

    if new_password != confirm_password:
        print("Passwords do not match.")
        return

    db = SessionLocal()

    try:
        user = db.query(User).filter(User.mobile == mobile).first()

        if user is None:
            print("No account found with that mobile number.")
            return

        if user.role != "admin":
            print("This account is not an admin account.")
            return

        user.password_hash = hash_password(new_password)
        db.commit()

        print("Admin password updated successfully!")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()

if __name__ == "__main__":
    main()

