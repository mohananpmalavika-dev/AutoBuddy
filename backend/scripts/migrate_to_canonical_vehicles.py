"""
MIGRATION SCRIPT: Consolidate Vehicle Data to Canonical Model
Purpose: Migrate existing vehicle data from multiple sources to unified canonical_vehicles collection

This script:
1. Maps old vehicle types to new canonical IDs
2. Migrates FleetVehicle records
3. Updates driver vehicle_type references
4. Validates data consistency
5. Creates backup collections before migration

Run: python backend/scripts/migrate_to_canonical_vehicles.py
"""

import asyncio
import logging
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import errors

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# MAPPING: Old → Canonical Vehicle Types
# ============================================================================

VEHICLE_TYPE_MAPPING = {
    # Old vehicle_types.py system
    "2_wheeler": "auto",        # 2-Wheeler → Auto (3-wheeler)
    "3_wheeler": "auto",        # 3-Wheeler → Auto
    "4_wheeler": "taxi",        # 4-Wheeler → Taxi
    "6_wheeler": "traveller",   # 6-Wheeler → Traveller
    "7_wheeler": "bus",         # 7-Wheeler → Bus
    
    # Old vehicle_types_extended.py system
    "auto": "auto",
    "taxi": "taxi",
    "xl": "xl",
    "traveller": "traveller",
    "bus": "bus",
    "mini_truck": "minitruck",
    "mini_trucks": "minitruck",
    "truck": "truck",
    
    # Fleet system (ride_products)
    "economy": "auto",          # Economy → Auto
    "comfort": "taxi",          # Comfort → Taxi
    "premium": "xl",            # Premium → XL
    "xl": "traveller",          # XL (old) → Traveller
    
    # Generic/fallback
    "standard": "taxi",
    "basic": "auto",
    "deluxe": "xl",
}


# ============================================================================
# MIGRATION FUNCTIONS
# ============================================================================

async def backup_collection(db: AsyncIOMotorDatabase, collection_name: str) -> str:
    """Create backup of collection before migration"""
    backup_name = f"{collection_name}_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    
    try:
        # Copy all documents
        docs = await db[collection_name].find({}).to_list(None)
        if docs:
            await db[backup_name].insert_many(docs)
            logger.info(f"✓ Backed up {len(docs)} documents from {collection_name} to {backup_name}")
        else:
            logger.info(f"✓ No documents to backup in {collection_name}")
        
        return backup_name
    except Exception as e:
        logger.error(f"Error backing up {collection_name}: {str(e)}")
        raise


async def migrate_fleet_vehicles(db: AsyncIOMotorDatabase) -> int:
    """Migrate FleetVehicle records to use canonical vehicle_type_id"""
    try:
        fleet_vehicles = await db.fleet_vehicles.find({}).to_list(None)
        migrated = 0
        
        for vehicle in fleet_vehicles:
            old_type = vehicle.get("vehicle_type", "standard")
            canonical_type = VEHICLE_TYPE_MAPPING.get(old_type, "taxi")
            
            if vehicle.get("vehicle_type_id") != canonical_type:
                await db.fleet_vehicles.update_one(
                    {"_id": vehicle["_id"]},
                    {
                        "$set": {
                            "vehicle_type_id": canonical_type,
                            "vehicle_type": canonical_type,  # Keep for compatibility
                            "last_migrated": datetime.utcnow()
                        }
                    }
                )
                migrated += 1
        
        logger.info(f"✓ Migrated {migrated} FleetVehicle records")
        return migrated
    except Exception as e:
        logger.error(f"Error migrating fleet vehicles: {str(e)}")
        return 0


async def migrate_driver_vehicles(db: AsyncIOMotorDatabase) -> int:
    """Update driver vehicle_type references to canonical IDs"""
    try:
        drivers = await db.users.find({"role": "driver", "vehicle_type": {"$exists": True}}).to_list(None)
        migrated = 0
        
        for driver in drivers:
            old_type = driver.get("vehicle_type", "standard")
            canonical_type = VEHICLE_TYPE_MAPPING.get(old_type, "taxi")
            
            if driver.get("vehicle_type_id") != canonical_type:
                await db.users.update_one(
                    {"_id": driver["_id"]},
                    {
                        "$set": {
                            "vehicle_type_id": canonical_type,
                            "vehicle_type": canonical_type,  # Keep for compatibility
                            "last_migrated": datetime.utcnow()
                        }
                    }
                )
                migrated += 1
        
        logger.info(f"✓ Migrated {migrated} driver vehicle references")
        return migrated
    except Exception as e:
        logger.error(f"Error migrating driver vehicles: {str(e)}")
        return 0


async def validate_canonical_vehicles(db: AsyncIOMotorDatabase) -> bool:
    """Validate canonical vehicles collection"""
    try:
        expected_types = ["auto", "taxi", "xl", "traveller", "bus", "minitruck", "truck"]
        
        count = await db.vehicles.count_documents({})
        logger.info(f"Canonical vehicles collection has {count} documents")
        
        missing = []
        for vtype in expected_types:
            doc = await db.vehicles.find_one({"vehicle_type_id": vtype})
            if not doc:
                missing.append(vtype)
        
        if missing:
            logger.warning(f"Missing canonical vehicle types: {missing}")
            return False
        
        logger.info("✓ All canonical vehicle types present")
        return True
    except Exception as e:
        logger.error(f"Error validating canonical vehicles: {str(e)}")
        return False


async def print_migration_summary(db: AsyncIOMotorDatabase):
    """Print migration statistics"""
    try:
        print("\n" + "="*70)
        print("MIGRATION SUMMARY")
        print("="*70)
        
        # Count documents in key collections
        vehicle_types_count = await db.vehicle_types.count_documents({})
        vehicle_types_ext_count = await db.vehicle_types_extended.count_documents({})
        canonical_count = await db.vehicles.count_documents({})
        fleet_vehicles_count = await db.fleet_vehicles.count_documents({})
        drivers_with_vehicle = await db.users.count_documents({"role": "driver", "vehicle_type": {"$exists": True}})
        
        print(f"\nOld system collections:")
        print(f"  • vehicle_types:          {vehicle_types_count} documents")
        print(f"  • vehicle_types_extended: {vehicle_types_ext_count} documents")
        
        print(f"\nCanonical system:")
        print(f"  • vehicles (canonical):   {canonical_count} documents")
        
        print(f"\nMigrated data:")
        print(f"  • fleet_vehicles:        {fleet_vehicles_count} documents")
        print(f"  • drivers with vehicles: {drivers_with_vehicle} documents")
        
        # Sample canonical vehicles
        sample = await db.vehicles.find({}, {"vehicle_type_id": 1, "name": 1, "base_multiplier": 1}).to_list(None)
        print(f"\nCanonical vehicle types:")
        for v in sample:
            print(f"  • {v.get('vehicle_type_id')}: {v.get('name')} ({v.get('base_multiplier')}x)")
        
        print("\n" + "="*70 + "\n")
    except Exception as e:
        logger.error(f"Error printing summary: {str(e)}")


# ============================================================================
# MAIN MIGRATION FUNCTION
# ============================================================================

async def run_migration():
    """Run complete migration to canonical vehicles"""
    
    # Connect to database
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.autobuddy
    
    try:
        logger.info("\n🔄 Starting Canonical Vehicles Migration\n")
        
        # Step 1: Create backups
        logger.info("Step 1: Creating backups...")
        await backup_collection(db, "fleet_vehicles")
        await backup_collection(db, "users")
        
        # Step 2: Validate canonical vehicles exist
        logger.info("\nStep 2: Validating canonical vehicles collection...")
        valid = await validate_canonical_vehicles(db)
        if not valid:
            logger.warning("Canonical vehicles validation found issues, but continuing...")
        
        # Step 3: Migrate data
        logger.info("\nStep 3: Migrating data...")
        fleet_migrated = await migrate_fleet_vehicles(db)
        drivers_migrated = await migrate_driver_vehicles(db)
        
        # Step 4: Print summary
        logger.info("\nStep 4: Generating summary...")
        await print_migration_summary(db)
        
        logger.info("✅ MIGRATION COMPLETE!")
        logger.info("\nNext steps:")
        logger.info("  1. Test vehicle-related endpoints")
        logger.info("  2. Verify ride creation and fare calculation")
        logger.info("  3. Check admin vehicle management")
        logger.info("  4. If issues: restore from backup collections")
        logger.info("  5. Once verified: remove backup collections")
        
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        logger.error("Backups created - review them manually if needed")
        raise
    finally:
        client.close()


# ============================================================================
# ROLLBACK FUNCTION (In case of issues)
# ============================================================================

async def rollback_migration():
    """Restore from backup (if needed)"""
    logger.warning("ROLLBACK not yet implemented - restore manually from backup collections")


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--rollback":
        asyncio.run(rollback_migration())
    else:
        asyncio.run(run_migration())
