#!/usr/bin/env python3
"""
Seed script for Total Mobility Platform data
Initializes vehicle types, ride types, and coverage areas in MongoDB
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.vehicle_subtypes_model import EXTENDED_VEHICLE_TYPES
from app.models.ride_types_model import DEFAULT_RIDE_TYPES

async def seed_data():
    """Seed all database collections"""
    
    # Get MongoDB connection
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "autobuddy")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connecting to MongoDB: {mongo_url}")
    print(f"Database: {db_name}")
    
    try:
        # Test connection
        await client.admin.command('ping')
        print("✅ MongoDB connection successful")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        return
    
    try:
        # Clear and seed vehicle types
        vehicle_collection = db["vehicle_types"]
        count = await vehicle_collection.count_documents({})
        
        if count == 0:
            print("\n📝 Seeding vehicle types...")
            result = await vehicle_collection.insert_many(EXTENDED_VEHICLE_TYPES)
            print(f"✅ Inserted {len(result.inserted_ids)} vehicle types")
        else:
            print(f"\n⏭️  Vehicle types already exist ({count} documents). Skipping.")
        
        # Clear and seed ride types
        ride_collection = db["ride_types"]
        count = await ride_collection.count_documents({})
        
        if count == 0:
            print("\n📝 Seeding ride types...")
            result = await ride_collection.insert_many(DEFAULT_RIDE_TYPES)
            print(f"✅ Inserted {len(result.inserted_ids)} ride types")
        else:
            print(f"\n⏭️  Ride types already exist ({count} documents). Skipping.")
        
        # Create indexes
        print("\n🔑 Creating indexes...")
        try:
            await vehicle_collection.create_index("_id", unique=True)
            await vehicle_collection.create_index("active")
            print("✅ Vehicle type indexes created")
        except Exception as e:
            print(f"⚠️  Vehicle type indexes error: {e}")
        
        try:
            await ride_collection.create_index("_id", unique=True)
            await ride_collection.create_index("active")
            print("✅ Ride type indexes created")
        except Exception as e:
            print(f"⚠️  Ride type indexes error: {e}")
        
        # Display seeded data
        print("\n📊 Seeded Vehicle Types:")
        vehicles = await vehicle_collection.find().to_list(None)
        for v in vehicles:
            print(f"  - {v.get('name')} ({v.get('_id')}): {len(v.get('subtypes', []))} subtypes, multiplier {v.get('base_multiplier')}")
        
        print("\n📊 Seeded Ride Types:")
        rides = await ride_collection.find().to_list(None)
        for r in rides:
            vehicles_supported = ", ".join(r.get('allowed_vehicle_types', []))
            print(f"  - {r.get('name')} ({r.get('_id')}): supports {vehicles_supported}")
        
        print("\n✅ Seeding complete!")
        
    except Exception as e:
        print(f"\n❌ Seeding failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()
        print("\n🔌 MongoDB connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("Total Mobility Platform - Database Seeding Script")
    print("=" * 60)
    asyncio.run(seed_data())
