
import asyncio
from utils.mongo import users_collection

async def reset():
    print("Connecting to DB...")
    # debug count
    count = await users_collection.count_documents({})
    print(f"Current user count: {count}")
    
    cursor = users_collection.find({})
    async for user in cursor:
        print(f"Found user: {user.get('email')}")

    print("Resetting users...")
    result = await users_collection.delete_many({})
    print(f"Deleted {result.deleted_count} users.")

if __name__ == "__main__":
    asyncio.run(reset())
