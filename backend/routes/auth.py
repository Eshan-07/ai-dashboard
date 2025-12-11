
import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from utils.mongo import users_collection
from utils.email import send_welcome_email_smtp
import logging

# Logger
logger = logging.getLogger(__name__)

router = APIRouter()

# Environment Variables
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

class TokenIn(BaseModel):
    id_token: str

def verify_google_id_token(token: str):
    try:
        if not GOOGLE_CLIENT_ID:
             raise ValueError("GOOGLE_CLIENT_ID is not set in environment")
        
        # Verify the token
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)
        return idinfo
    except ValueError as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")
    except Exception as e:
        logger.error(f"Unexpected token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")

@router.get("/ping")
def ping():
    return {"msg": "auth router alive"}

@router.post("/google")
async def google_auth(token_in: TokenIn, background_tasks: BackgroundTasks):
    """
    Verifies Google ID token.
    If user does not exist, creates user + sends welcome email.
    If user exists, logs them in (returns success).
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Server misconfiguration: GOOGLE_CLIENT_ID missing")

    idinfo = verify_google_id_token(token_in.id_token)
    
    email = idinfo.get("email")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture", "")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in token")

    # Check if user exists
    existing_user = await users_collection.find_one({"email": email})

    if existing_user:
        # Existing user
        return {
            "status": "success",
            "message": "Logged in",
            "user": {
                "email": email,
                "name": existing_user.get("name"),
                "picture": existing_user.get("picture")
            },
            "is_new": False
        }
    else:
        # New user
        logger.info(f"Creating NEW user: {email}")
        new_user = {
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": str(idinfo.get("exp")) # or current timestamp
        }
        await users_collection.insert_one(new_user)
        
        # Send welcome email in background
        logger.info("Triggering background email task...")
        background_tasks.add_task(send_welcome_email_smtp, to_email=email, to_name=name)
        
        new_user["id"] = str(new_user["_id"])
        del new_user["_id"]

        return {
            "status": "success",
            "message": "User created",
            "user": new_user,
            "is_new": True
        }

# --- Email/Password Auth ---

from passlib.context import CryptContext

# 1. Setup Password Hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# 2. Models
class UserSignup(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# 3. Routes

@router.post("/signup")
async def signup(user_in: UserSignup, background_tasks: BackgroundTasks):
    # Check if user exists
    existing_user = await users_collection.find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Hash password
    hashed_pwd = get_password_hash(user_in.password)

    # Create user document
    new_user = {
        "email": user_in.email,
        "name": user_in.name,
        "password_hash": hashed_pwd,
        "created_at": "now", # In real app use datetime.utcnow()
        # "picture": "" # Optional
    }
    
    await users_collection.insert_one(new_user)

    # Send welcome email (Background)
    logger.info(f"Triggering background email task for {user_in.email}...")
    background_tasks.add_task(send_welcome_email_smtp, to_email=user_in.email, to_name=user_in.name)

    # Return success (sanitize _id)
    new_user["id"] = str(new_user["_id"])
    del new_user["_id"]
    del new_user["password_hash"] # Don't return hash

    return {
        "status": "success",
        "message": "Account created successfully",
        "user": new_user,
        "is_new": True
    }

@router.post("/login")
async def login(user_in: UserLogin):
    # Find user
    user = await users_collection.find_one({"email": user_in.email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    # Check password (if user has one - Google users might not)
    if not user.get("password_hash"):
         raise HTTPException(status_code=400, detail="Please log in with Google")

    if not verify_password(user_in.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    # Success
    user["id"] = str(user["_id"])
    del user["_id"]
    del user["password_hash"]

    return {
        "status": "success",
        "message": "Logged in successfully",
        "user": user,
        "is_new": False
    }
