"""
Airport Ride System MongoDB Migration
Creates collections and indexes for airport operations
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_airport_indexes(db: AsyncIOMotorDatabase):
    """
    Create all collections and indexes for airport ride system.
    
    Collections:
    - airport_terminals: Terminal information
    - airport_flights: Real-time flight data
    - airport_ride_requests: Ride bookings
    - airport_parking_spots: Parking management
    - airport_demand_metrics: Real-time demand data
    - airport_queues: Queue management
    - airport_alerts: Operational alerts
    - airport_service_metrics: Performance analytics
    """
    
    try:
        # ====== Collection 1: airport_terminals ======
        terminals_col = db["airport_terminals"]
        
        exists = "airport_terminals" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_terminals")
            logger.info("Created collection: airport_terminals")
        
        await terminals_col.create_index([("airport_code", 1)], unique=True)
        await terminals_col.create_index([("city", 1)])
        await terminals_col.create_index([("latitude", "2dsphere"), ("longitude", "2dsphere")])
        logger.info("Created indexes for airport_terminals")
        
        # ====== Collection 2: airport_flights ======
        flights_col = db["airport_flights"]
        
        exists = "airport_flights" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_flights")
            logger.info("Created collection: airport_flights")
        
        await flights_col.create_index([("terminal_id", 1), ("flight_number", 1)])
        await flights_col.create_index([("terminal_id", 1), ("flight_status", 1)])
        await flights_col.create_index([("departure_time", 1)])
        await flights_col.create_index([("flight_status", 1)])
        logger.info("Created indexes for airport_flights")
        
        # ====== Collection 3: airport_ride_requests ======
        rides_col = db["airport_ride_requests"]
        
        exists = "airport_ride_requests" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_ride_requests")
            logger.info("Created collection: airport_ride_requests")
        
        await rides_col.create_index([("terminal_id", 1), ("ride_phase", 1)])
        await rides_col.create_index([("terminal_id", 1), ("ride_status", 1)])
        await rides_col.create_index([("flight_id", 1)])
        await rides_col.create_index([("created_at", -1)])
        await rides_col.create_index([("created_at", 1)], expireAfterSeconds=2592000)  # 30 days TTL
        logger.info("Created indexes for airport_ride_requests")
        
        # ====== Collection 4: airport_parking_spots ======
        parking_col = db["airport_parking_spots"]
        
        exists = "airport_parking_spots" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_parking_spots")
            logger.info("Created collection: airport_parking_spots")
        
        await parking_col.create_index([("terminal_id", 1), ("spot_number", 1)])
        await parking_col.create_index([("terminal_id", 1), ("status", 1)])
        await parking_col.create_index([("terminal_id", 1), ("level", 1)])
        logger.info("Created indexes for airport_parking_spots")
        
        # ====== Collection 5: airport_demand_metrics ======
        demand_col = db["airport_demand_metrics"]
        
        exists = "airport_demand_metrics" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_demand_metrics")
            logger.info("Created collection: airport_demand_metrics")
        
        await demand_col.create_index([("terminal_id", 1), ("ride_phase", 1), ("timestamp", -1)])
        await demand_col.create_index([("terminal_id", 1), ("timestamp", -1)])
        await demand_col.create_index([("timestamp", 1)], expireAfterSeconds=1800)  # 30 min TTL
        logger.info("Created indexes for airport_demand_metrics")
        
        # ====== Collection 6: airport_queues ======
        queues_col = db["airport_queues"]
        
        exists = "airport_queues" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_queues")
            logger.info("Created collection: airport_queues")
        
        await queues_col.create_index([("terminal_id", 1), ("ride_phase", 1)])
        await queues_col.create_index([("last_updated", -1)])
        logger.info("Created indexes for airport_queues")
        
        # ====== Collection 7: airport_alerts ======
        alerts_col = db["airport_alerts"]
        
        exists = "airport_alerts" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_alerts")
            logger.info("Created collection: airport_alerts")
        
        await alerts_col.create_index([("terminal_id", 1), ("severity", 1)])
        await alerts_col.create_index([("terminal_id", 1), ("resolved", 1)])
        await alerts_col.create_index([("created_at", 1)], expireAfterSeconds=604800)  # 7 days TTL
        logger.info("Created indexes for airport_alerts")
        
        # ====== Collection 8: airport_service_metrics ======
        metrics_col = db["airport_service_metrics"]
        
        exists = "airport_service_metrics" in await db.list_collection_names()
        if not exists:
            await db.create_collection("airport_service_metrics")
            logger.info("Created collection: airport_service_metrics")
        
        await metrics_col.create_index([("terminal_id", 1), ("metric_period", 1), ("timestamp", -1)])
        await metrics_col.create_index([("terminal_id", 1), ("timestamp", -1)])
        logger.info("Created indexes for airport_service_metrics")
        
        logger.info("✅ Airport Ride System collections and indexes created successfully")
        
    except Exception as e:
        logger.error(f"❌ Error creating airport indexes: {e}")
        raise
