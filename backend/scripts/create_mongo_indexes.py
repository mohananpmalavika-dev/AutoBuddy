#!/usr/bin/env python3
"""
MongoDB Index Creation Script
Creates all required indexes for optimal query performance in AutoBuddy

Usage:
    python scripts/create_mongo_indexes.py
    python scripts/create_mongo_indexes.py --env production
    python scripts/create_mongo_indexes.py --drop-existing
"""

import asyncio
import argparse
import sys
import os
from typing import List, Dict, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    from pymongo import ASCENDING, DESCENDING, TEXT, GEOSPHERE
    from pymongo.errors import OperationFailure
except ImportError:
    print("❌ Error: Required packages not installed")
    print("   Run: pip install motor pymongo")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️  Warning: python-dotenv not installed, using system environment variables")

# Configuration
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/autobuddy_db")
DB_NAME = os.getenv("DB_NAME", "autobuddy_db")

# Index Definitions
# Format: {collection: [(fields, options), ...]}
INDEXES = {
    "users": [
        ([("email", ASCENDING)], {"unique": True, "name": "idx_email_unique"}),
        ([("phone", ASCENDING)], {"unique": True, "name": "idx_phone_unique"}),
        ([("role", ASCENDING)], {"name": "idx_role"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
        ([("is_active", ASCENDING)], {"name": "idx_is_active"}),
        ([("email", ASCENDING), ("is_active", ASCENDING)], {"name": "idx_email_active"}),
    ],
    
    "rides": [
        ([("passenger_id", ASCENDING)], {"name": "idx_passenger_id"}),
        ([("driver_id", ASCENDING)], {"name": "idx_driver_id"}),
        ([("status", ASCENDING)], {"name": "idx_status"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
        ([("scheduled_time", ASCENDING)], {"name": "idx_scheduled_time"}),
        ([("pickup_location", GEOSPHERE)], {"name": "idx_pickup_geosphere"}),
        ([("dropoff_location", GEOSPHERE)], {"name": "idx_dropoff_geosphere"}),
        ([("passenger_id", ASCENDING), ("status", ASCENDING)], {"name": "idx_passenger_status"}),
        ([("driver_id", ASCENDING), ("status", ASCENDING)], {"name": "idx_driver_status"}),
        ([("status", ASCENDING), ("created_at", DESCENDING)], {"name": "idx_status_created"}),
    ],
    
    "drivers": [
        ([("user_id", ASCENDING)], {"unique": True, "name": "idx_user_id_unique"}),
        ([("is_available", ASCENDING)], {"name": "idx_is_available"}),
        ([("current_location", GEOSPHERE)], {"name": "idx_current_location"}),
        ([("rating", DESCENDING)], {"name": "idx_rating"}),
        ([("total_rides", DESCENDING)], {"name": "idx_total_rides"}),
        ([("is_available", ASCENDING), ("current_location", GEOSPHERE)], {"name": "idx_available_location"}),
        ([("vehicle_type", ASCENDING), ("is_available", ASCENDING)], {"name": "idx_vehicle_available"}),
    ],
    
    "vehicles": [
        ([("driver_id", ASCENDING)], {"name": "idx_driver_id"}),
        ([("registration_number", ASCENDING)], {"unique": True, "name": "idx_registration_unique"}),
        ([("vehicle_type", ASCENDING)], {"name": "idx_vehicle_type"}),
        ([("is_verified", ASCENDING)], {"name": "idx_is_verified"}),
    ],
    
    "payments": [
        ([("ride_id", ASCENDING)], {"name": "idx_ride_id"}),
        ([("user_id", ASCENDING)], {"name": "idx_user_id"}),
        ([("status", ASCENDING)], {"name": "idx_status"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
        ([("payment_method", ASCENDING)], {"name": "idx_payment_method"}),
        ([("transaction_id", ASCENDING)], {"unique": True, "sparse": True, "name": "idx_transaction_id"}),
        ([("user_id", ASCENDING), ("status", ASCENDING)], {"name": "idx_user_status"}),
    ],
    
    "bookings": [
        ([("user_id", ASCENDING)], {"name": "idx_user_id"}),
        ([("ride_id", ASCENDING)], {"name": "idx_ride_id"}),
        ([("status", ASCENDING)], {"name": "idx_status"}),
        ([("booking_time", DESCENDING)], {"name": "idx_booking_time"}),
        ([("user_id", ASCENDING), ("status", ASCENDING)], {"name": "idx_user_status"}),
    ],
    
    "notifications": [
        ([("user_id", ASCENDING)], {"name": "idx_user_id"}),
        ([("is_read", ASCENDING)], {"name": "idx_is_read"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
        ([("user_id", ASCENDING), ("is_read", ASCENDING)], {"name": "idx_user_unread"}),
        ([("created_at", DESCENDING)], {"expireAfterSeconds": 2592000, "name": "idx_ttl_30days"}),  # 30 days TTL
    ],
    
    "reviews": [
        ([("ride_id", ASCENDING)], {"name": "idx_ride_id"}),
        ([("reviewer_id", ASCENDING)], {"name": "idx_reviewer_id"}),
        ([("reviewee_id", ASCENDING)], {"name": "idx_reviewee_id"}),
        ([("rating", DESCENDING)], {"name": "idx_rating"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
    ],
    
    "sessions": [
        ([("user_id", ASCENDING)], {"name": "idx_user_id"}),
        ([("token", ASCENDING)], {"unique": True, "name": "idx_token_unique"}),
        ([("expires_at", ASCENDING)], {"expireAfterSeconds": 0, "name": "idx_expires_ttl"}),  # Auto-delete expired
    ],
    
    "support_tickets": [
        ([("user_id", ASCENDING)], {"name": "idx_user_id"}),
        ([("ride_id", ASCENDING)], {"name": "idx_ride_id"}),
        ([("status", ASCENDING)], {"name": "idx_status"}),
        ([("priority", DESCENDING)], {"name": "idx_priority"}),
        ([("created_at", DESCENDING)], {"name": "idx_created_at"}),
        ([("status", ASCENDING), ("priority", DESCENDING)], {"name": "idx_status_priority"}),
    ],
    
    "promo_codes": [
        ([("code", ASCENDING)], {"unique": True, "name": "idx_code_unique"}),
        ([("is_active", ASCENDING)], {"name": "idx_is_active"}),
        ([("valid_from", ASCENDING), ("valid_until", ASCENDING)], {"name": "idx_validity"}),
    ],
    
    "referrals": [
        ([("referrer_id", ASCENDING)], {"name": "idx_referrer_id"}),
        ([("referee_id", ASCENDING)], {"name": "idx_referee_id"}),
        ([("referral_code", ASCENDING)], {"unique": True, "name": "idx_code_unique"}),
    ],
}


class IndexManager:
    """Manages MongoDB index creation and verification"""
    
    def __init__(self, mongo_url: str, db_name: str):
        self.client = AsyncIOMotorClient(mongo_url)
        self.db = self.client[db_name]
        self.results: Dict[str, Any] = {
            "created": [],
            "existing": [],
            "failed": [],
            "dropped": []
        }
    
    async def create_index(self, collection_name: str, fields: List, options: Dict) -> bool:
        """Create a single index"""
        try:
            collection = self.db[collection_name]
            result = await collection.create_index(fields, **options)
            return True
        except OperationFailure as e:
            # Index might already exist
            if "already exists" in str(e):
                return "exists"
            raise
    
    async def drop_all_indexes(self, collection_name: str) -> int:
        """Drop all indexes except _id"""
        try:
            collection = self.db[collection_name]
            result = await collection.drop_indexes()
            return len(result) if result else 0
        except Exception as e:
            print(f"   ⚠️  Warning dropping indexes for {collection_name}: {e}")
            return 0
    
    async def create_all_indexes(self, drop_existing: bool = False) -> None:
        """Create all indexes defined in INDEXES"""
        print(f"📊 MongoDB Index Manager")
        print(f"   Database: {DB_NAME}")
        print(f"   Collections: {len(INDEXES)}")
        print(f"   Drop existing: {drop_existing}\n")
        
        for collection_name, index_list in INDEXES.items():
            print(f"📁 {collection_name}")
            
            # Drop existing indexes if requested
            if drop_existing:
                dropped = await self.drop_all_indexes(collection_name)
                if dropped > 0:
                    print(f"   🗑️  Dropped {dropped} existing indexes")
                    self.results["dropped"].append(collection_name)
            
            # Create indexes
            for fields, options in index_list:
                index_name = options.get("name", "unnamed")
                try:
                    result = await self.create_index(collection_name, fields, options)
                    
                    if result is True:
                        print(f"   ✅ Created: {index_name}")
                        self.results["created"].append(f"{collection_name}.{index_name}")
                    elif result == "exists":
                        print(f"   ⏭️  Exists: {index_name}")
                        self.results["existing"].append(f"{collection_name}.{index_name}")
                    
                except Exception as e:
                    print(f"   ❌ Failed: {index_name} - {e}")
                    self.results["failed"].append(f"{collection_name}.{index_name}: {e}")
            
            print()  # Blank line between collections
    
    async def verify_indexes(self) -> None:
        """Verify all indexes exist"""
        print("🔍 Verifying indexes...")
        
        all_verified = True
        for collection_name in INDEXES.keys():
            collection = self.db[collection_name]
            existing_indexes = await collection.index_information()
            expected_count = len(INDEXES[collection_name]) + 1  # +1 for _id index
            actual_count = len(existing_indexes)
            
            if actual_count >= expected_count:
                print(f"   ✅ {collection_name}: {actual_count}/{expected_count} indexes")
            else:
                print(f"   ⚠️  {collection_name}: {actual_count}/{expected_count} indexes (missing some)")
                all_verified = False
        
        return all_verified
    
    def print_summary(self) -> None:
        """Print execution summary"""
        print("\n" + "=" * 60)
        print("📊 SUMMARY")
        print("=" * 60)
        print(f"✅ Created: {len(self.results['created'])} indexes")
        print(f"⏭️  Already existed: {len(self.results['existing'])} indexes")
        print(f"❌ Failed: {len(self.results['failed'])} indexes")
        
        if self.results['dropped']:
            print(f"🗑️  Dropped indexes from: {len(self.results['dropped'])} collections")
        
        if self.results['failed']:
            print("\n❌ Failed indexes:")
            for failure in self.results['failed']:
                print(f"   - {failure}")
        
        print("=" * 60)
    
    async def close(self):
        """Close database connection"""
        self.client.close()


async def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(description="Create MongoDB indexes for AutoBuddy")
    parser.add_argument(
        "--env",
        choices=["development", "staging", "production"],
        default="development",
        help="Environment to run against"
    )
    parser.add_argument(
        "--drop-existing",
        action="store_true",
        help="Drop existing indexes before creating new ones"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify indexes, don't create"
    )
    args = parser.parse_args()
    
    # Confirmation for production
    if args.env == "production" and not args.verify_only:
        print("⚠️  WARNING: You are about to modify PRODUCTION database indexes!")
        confirm = input("   Type 'yes' to continue: ")
        if confirm.lower() != "yes":
            print("❌ Aborted")
            return
    
    # Initialize manager
    manager = IndexManager(MONGO_URL, DB_NAME)
    
    try:
        if args.verify_only:
            await manager.verify_indexes()
        else:
            await manager.create_all_indexes(drop_existing=args.drop_existing)
            await manager.verify_indexes()
            manager.print_summary()
        
        print("\n✅ Index management completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        await manager.close()


if __name__ == "__main__":
    asyncio.run(main())
