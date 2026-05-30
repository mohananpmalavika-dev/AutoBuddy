"""
Vehicle Type Migration Script
Migrates old freeform vehicle types to canonical vehicle_type_id system
Maps old types like 'sedan', 'standard', '4_wheeler' to canonical IDs: auto, taxi, xl, traveller, bus, minitruck, truck

Usage:
  python migrate_vehicle_types.py --backup --run
  
Options:
  --backup: Create backup collections before migration (recommended)
  --run: Actually perform the migration (without this, dry-run only)
  --vehicle-collection: Collection to migrate (default: vehicles)
  --booking-collection: Collection to migrate bookings (default: bookings)
  --driver-collection: Collection to migrate driver vehicles (default: drivers)
"""

import asyncio
import logging
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Dict, List
import argparse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Mapping of old vehicle types to new canonical vehicle_type_id
VEHICLE_TYPE_MAPPING = {
    # Passengers
    'sedan': 'taxi',
    'taxi': 'taxi',
    'auto': 'auto',
    'standard': 'auto',
    '2wheeler': 'auto',
    '4wheeler': 'xl',
    'suv': 'xl',
    'hatchback': 'taxi',
    'van': 'traveller',
    'minibus': 'bus',
    'bus': 'bus',
    'coach': 'bus',
    
    # Cargo
    'minitruck': 'minitruck',
    'mini truck': 'minitruck',
    'mini-truck': 'minitruck',
    'truck': 'truck',
    '2.5t': 'truck',
    '5t': 'truck',
    '10t': 'truck',
    
    # Fallback for unknown types
}

class VehicleTypeMigrator:
    def __init__(self, db: AsyncIOMotorDatabase, dry_run: bool = True):
        self.db = db
        self.dry_run = dry_run
        self.stats = {
            'users_updated': 0,
            'bookings_updated': 0,
            'drivers_updated': 0,
            'errors': 0,
        }
        
    async def backup_collections(self) -> Dict[str, str]:
        """Create backup of collections before migration"""
        backup_info = {}
        collections = [
            ('vehicles', f'vehicles_backup_{get_ist_now().isoformat()}'),
            ('bookings', f'bookings_backup_{get_ist_now().isoformat()}'),
            ('drivers', f'drivers_backup_{get_ist_now().isoformat()}'),
        ]
        
        for original_name, backup_name in collections:
            try:
                original = self.db[original_name]
                backup = self.db[backup_name]
                
                # Copy all documents
                docs = await original.find({}).to_list(None)
                if docs:
                    result = await backup.insert_many(docs)
                    backup_info[original_name] = backup_name
                    logger.info(f"✓ Backed up {original_name} → {backup_name} ({len(result.inserted_ids)} docs)")
                else:
                    logger.info(f"✓ {original_name} is empty, no backup needed")
            except Exception as e:
                logger.error(f"✗ Failed to backup {original_name}: {str(e)}")
                
        return backup_info

    async def migrate_user_vehicles(self) -> int:
        """Migrate vehicle_type field in users collection"""
        users_collection = self.db['users']
        updated = 0
        
        try:
            # Find all users with vehicle info
            users = await users_collection.find({'vehicle_type': {'$exists': True}}).to_list(None)
            
            for user in users:
                old_type = str(user.get('vehicle_type', '')).lower().strip()
                if not old_type:
                    continue
                    
                new_type = VEHICLE_TYPE_MAPPING.get(old_type, 'taxi')  # Default to taxi
                
                if old_type != new_type:
                    if not self.dry_run:
                        await users_collection.update_one(
                            {'_id': user['_id']},
                            {
                                '$set': {
                                    'vehicle_type_id': new_type,
                                    'migrated_from': old_type,
                                    'migrated_at': get_ist_now()
                                },
                                '$unset': {'vehicle_type': ''}
                            }
                        )
                    updated += 1
                    logger.info(f"  {user.get('name', 'Unknown')} → {old_type} → {new_type}")
                    
        except Exception as e:
            logger.error(f"Error migrating users: {str(e)}")
            self.stats['errors'] += 1
            
        self.stats['users_updated'] = updated
        return updated

    async def migrate_bookings(self) -> int:
        """Migrate vehicle_type field in bookings collection"""
        bookings_collection = self.db['bookings']
        updated = 0
        
        try:
            # Find all bookings with vehicle_type
            bookings = await bookings_collection.find({'vehicle_type': {'$exists': True}}).to_list(None)
            
            for booking in bookings:
                old_type = str(booking.get('vehicle_type', '')).lower().strip()
                if not old_type:
                    continue
                    
                new_type = VEHICLE_TYPE_MAPPING.get(old_type, 'taxi')
                
                if old_type != new_type or 'vehicle_type_id' not in booking:
                    if not self.dry_run:
                        await bookings_collection.update_one(
                            {'_id': booking['_id']},
                            {
                                '$set': {
                                    'vehicle_type_id': new_type,
                                    'migrated_vehicle_type_from': old_type,
                                    'migrated_at': get_ist_now()
                                },
                                '$unset': {'vehicle_type': ''}
                            }
                        )
                    updated += 1
                    
        except Exception as e:
            logger.error(f"Error migrating bookings: {str(e)}")
            self.stats['errors'] += 1
            
        self.stats['bookings_updated'] = updated
        return updated

    async def migrate_driver_vehicles(self) -> int:
        """Migrate vehicle_type field in driver vehicles"""
        drivers_collection = self.db['drivers']
        updated = 0
        
        try:
            # Find all drivers with vehicles array
            drivers = await drivers_collection.find({'vehicles': {'$exists': True}}).to_list(None)
            
            for driver in drivers:
                vehicles = driver.get('vehicles', [])
                updates_needed = False
                
                for vehicle in vehicles:
                    old_type = str(vehicle.get('vehicle_type', '')).lower().strip()
                    if old_type:
                        new_type = VEHICLE_TYPE_MAPPING.get(old_type, 'taxi')
                        if old_type != new_type:
                            vehicle['vehicle_type_id'] = new_type
                            vehicle['migrated_from'] = old_type
                            updates_needed = True
                            updated += 1
                
                if updates_needed and not self.dry_run:
                    await drivers_collection.update_one(
                        {'_id': driver['_id']},
                        {'$set': {'vehicles': vehicles, 'migrated_at': get_ist_now()}}
                    )
                    
        except Exception as e:
            logger.error(f"Error migrating driver vehicles: {str(e)}")
            self.stats['errors'] += 1
            
        self.stats['drivers_updated'] = updated
        return updated

    async def run_migration(self, backup: bool = True):
        """Run complete migration"""
        logger.info("=" * 60)
        logger.info(f"Vehicle Type Migration - {'DRY RUN' if self.dry_run else 'LIVE MIGRATION'}")
        logger.info("=" * 60)
        
        # Create backups
        if backup:
            logger.info("\n📦 Creating backups...")
            await self.backup_collections()
        
        # Run migrations
        logger.info("\n🔄 Migrating user vehicles...")
        users_count = await self.migrate_user_vehicles()
        logger.info(f"✓ Users updated: {users_count}")
        
        logger.info("\n🔄 Migrating bookings...")
        bookings_count = await self.migrate_bookings()
        logger.info(f"✓ Bookings updated: {bookings_count}")
        
        logger.info("\n🔄 Migrating driver vehicles...")
        drivers_count = await self.migrate_driver_vehicles()
        logger.info(f"✓ Drivers updated: {drivers_count}")
        
        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Users updated: {users_count}")
        logger.info(f"Bookings updated: {bookings_count}")
        logger.info(f"Drivers updated: {drivers_count}")
        logger.info(f"Errors: {self.stats['errors']}")
        
        if self.dry_run:
            logger.info("\n⚠️  DRY RUN MODE - No changes were made")
            logger.info("Run with --run flag to execute migration")
        else:
            logger.info("\n✅ Migration completed successfully")
        
        logger.info("=" * 60)

async def main():
    parser = argparse.ArgumentParser(
        description='Migrate vehicle types to canonical vehicle_type_id system'
    )
    parser.add_argument(
        '--run',
        action='store_true',
        help='Actually perform the migration (default: dry-run only)'
    )
    parser.add_argument(
        '--backup',
        action='store_true',
        default=True,
        help='Create backup collections before migration (default: True)'
    )
    parser.add_argument(
        '--mongo-uri',
        default='mongodb://localhost:27017',
        help='MongoDB connection URI'
    )
    parser.add_argument(
        '--database',
        default='autobuddy',
        help='Database name'
    )
    
    args = parser.parse_args()
    
    # Connect to MongoDB
    try:
        client = AsyncIOMotorClient(args.mongo_uri)
        db = client[args.database]
        
        # Verify connection
        await db.command('ping')
        logger.info(f"✓ Connected to MongoDB: {args.database}")
        
    except Exception as e:
        logger.error(f"✗ Failed to connect to MongoDB: {str(e)}")
        return
    
    # Run migration
    migrator = VehicleTypeMigrator(db, dry_run=not args.run)
    await migrator.run_migration(backup=args.backup)
    
    # Close connection
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
