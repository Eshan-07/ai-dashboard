import asyncio
from utils.mongo import db

async def test_connection():
    try:
        await db.command("ping")
        print("✅ MongoDB connection successful!")
    except Exception as e:
        print("❌ Connection failed:", e)

asyncio.run(test_connection())
