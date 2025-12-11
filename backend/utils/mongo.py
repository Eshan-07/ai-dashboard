# backend/utils/mongo.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Read MongoDB URI and database name
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "ai_dashboard")

if not MONGODB_URI:
    raise RuntimeError("❌ MONGODB_URI not found in environment variables. Check your .env file!")

# Create an async MongoDB client
client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGODB_DB]

# Optional: define common collections
users_collection = db["users"]
datasets_collection = db["datasets"]
queries_collection = db["queries"]

print("✅ MongoDB client initialized successfully!")
