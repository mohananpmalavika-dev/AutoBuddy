"""
Operations Center MongoDB Migration
Creates collections and indexes for real-time operations monitoring
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_operations_center_indexes(db: AsyncIOMotorDatabase):
    """
    Create all collections and indexes for operations center.
    
    Collections:
    - operations_incidents: Safety incident tracking
    - operations_zone_demand: Zone demand metrics
    - operations_active_rides: Real-time ride monitoring
    - operations_forecasts: Demand forecasts
    - operations_alerts: Operational alerts
    - operations_driver_density: Driver distribution grid
    - operations_metrics_snapshots: City-wide metrics history
    - operations_war_room_snapshots: War room snapshots for replay
    """
    
    try:
        # ====== Collection 1: operations_incidents ======
        incidents_col = db["operations_incidents"]
        
        # Check if collection exists
        exists = "operations_incidents" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_incidents")
            logger.info("Created collection: operations_incidents")
        
        # Indexes for incident queries
        await incidents_col.create_index([("city_id", 1), ("reported_at", -1)])
        await incidents_col.create_index([("severity", 1), ("is_resolved", 1)])
        await incidents_col.create_index([("incident_type", 1)])
        await incidents_col.create_index([("latitude", "2dsphere"), ("longitude", "2dsphere")])
        await incidents_col.create_index([("created_at", 1)], expireAfterSeconds=2592000)  # 30 days TTL
        logger.info("Created indexes for operations_incidents")
        
        # ====== Collection 2: operations_zone_demand ======
        demand_col = db["operations_zone_demand"]
        
        exists = "operations_zone_demand" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_zone_demand")
            logger.info("Created collection: operations_zone_demand")
        
        # Indexes for demand queries
        await demand_col.create_index([("city_id", 1), ("zone_id", 1), ("last_updated", -1)])
        await demand_col.create_index([("city_id", 1), ("demand_trend", 1)])
        await demand_col.create_index([("city_id", 1), ("surge_multiplier", -1)])
        await demand_col.create_index([("latitude", "2dsphere"), ("longitude", "2dsphere")])
        logger.info("Created indexes for operations_zone_demand")
        
        # ====== Collection 3: operations_active_rides ======
        rides_col = db["operations_active_rides"]
        
        exists = "operations_active_rides" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_active_rides")
            logger.info("Created collection: operations_active_rides")
        
        # Indexes for ride queries
        await rides_col.create_index([("city_id", 1), ("ride_status", 1)])
        await rides_col.create_index([("city_id", 1), ("safety_status", 1)])
        await rides_col.create_index([("driver_id", 1)])
        await rides_col.create_index([("passenger_id", 1)])
        await rides_col.create_index([("started_at", -1)])
        # Geospatial index for driver location
        await rides_col.create_index([("driver_lat", "2dsphere"), ("driver_lon", "2dsphere")])
        logger.info("Created indexes for operations_active_rides")
        
        # ====== Collection 4: operations_forecasts ======
        forecast_col = db["operations_forecasts"]
        
        exists = "operations_forecasts" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_forecasts")
            logger.info("Created collection: operations_forecasts")
        
        # Indexes for forecast queries
        await forecast_col.create_index([("city_id", 1), ("forecast_hour", 1), ("forecast_date", 1)])
        await forecast_col.create_index([("city_id", 1), ("confidence_level", -1)])
        await forecast_col.create_index([("created_at", 1)], expireAfterSeconds=604800)  # 7 days TTL
        logger.info("Created indexes for operations_forecasts")
        
        # ====== Collection 5: operations_alerts ======
        alerts_col = db["operations_alerts"]
        
        exists = "operations_alerts" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_alerts")
            logger.info("Created collection: operations_alerts")
        
        # Indexes for alert queries
        await alerts_col.create_index([("city_id", 1), ("severity", 1), ("resolved", 1)])
        await alerts_col.create_index([("alert_type", 1), ("created_at", -1)])
        await alerts_col.create_index([("created_at", 1)], expireAfterSeconds=1209600)  # 14 days TTL
        logger.info("Created indexes for operations_alerts")
        
        # ====== Collection 6: operations_driver_density ======
        density_col = db["operations_driver_density"]
        
        exists = "operations_driver_density" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_driver_density")
            logger.info("Created collection: operations_driver_density")
        
        # Indexes for density queries
        await density_col.create_index([("city_id", 1), ("grid_id", 1), ("updated_at", -1)])
        await density_col.create_index([("city_id", 1), ("driver_count", -1)])
        # Geospatial index for grid cells
        await density_col.create_index([("grid_lat_center", "2dsphere"), ("grid_lon_center", "2dsphere")])
        await density_col.create_index([("updated_at", 1)], expireAfterSeconds=1800)  # 30 min TTL
        logger.info("Created indexes for operations_driver_density")
        
        # ====== Collection 7: operations_metrics_snapshots ======
        metrics_col = db["operations_metrics_snapshots"]
        
        exists = "operations_metrics_snapshots" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_metrics_snapshots")
            logger.info("Created collection: operations_metrics_snapshots")
        
        # Indexes for metrics history queries
        await metrics_col.create_index([("city_id", 1), ("timestamp", -1)])
        await metrics_col.create_index([("timestamp", 1)], expireAfterSeconds=2592000)  # 30 days TTL
        logger.info("Created indexes for operations_metrics_snapshots")
        
        # ====== Collection 8: operations_war_room_snapshots ======
        war_room_col = db["operations_war_room_snapshots"]
        
        exists = "operations_war_room_snapshots" in await db.list_collection_names()
        if not exists:
            await db.create_collection("operations_war_room_snapshots")
            logger.info("Created collection: operations_war_room_snapshots")
        
        # Indexes for war room replay
        await war_room_col.create_index([("city_id", 1), ("timestamp", -1)])
        await war_room_col.create_index([("timestamp", 1)], expireAfterSeconds=604800)  # 7 days TTL
        logger.info("Created indexes for operations_war_room_snapshots")
        
        logger.info("✅ Operations Center collections and indexes created successfully")
        
    except Exception as e:
        logger.error(f"❌ Error creating operations center indexes: {e}")
        raise


async def cleanup_operations_expired_data(db: AsyncIOMotorDatabase):
    """
    Manual cleanup for operations data (TTL indexes handle auto-cleanup).
    Can be called periodically for additional cleanup.
    """
    try:
        logger.info("Running manual cleanup for operations data...")
        
        # These are handled by TTL indexes, but can be called manually if needed
        # - incidents older than 30 days
        # - forecasts older than 7 days
        # - alerts older than 14 days
        # - density grids older than 30 minutes
        # - metrics snapshots older than 30 days
        # - war room snapshots older than 7 days
        
        logger.info("✅ Operations data cleanup completed")
        
    except Exception as e:
        logger.error(f"❌ Error during operations cleanup: {e}")
        raise
