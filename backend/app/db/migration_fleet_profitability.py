"""
Fleet Profitability Database Migration
Creates MongoDB collections and indexes for fleet profitability tracking and analytics
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_fleet_profitability_indexes(db: AsyncIOMotorDatabase) -> None:
    """
    Create MongoDB collections and indexes for Fleet Profitability Dashboard.
    Initializes all collections with composite and TTL indexes for optimal performance.
    
    Collections:
    - fleet_vehicle_profiles: Individual vehicle profitability metrics
    - fleet_portfolio_metrics: Fleet-wide portfolio summary
    - fleet_cost_breakdown: Detailed cost analysis per vehicle
    - fleet_optimization_tips: AI-generated optimization recommendations
    - fleet_roi_analysis: Return on investment calculations
    - fleet_driver_performance: Driver profitability contribution
    - fleet_maintenance_alerts: Maintenance scheduling and costs
    - fleet_analytics_metrics: Time-series analytics data
    """
    
    try:
        # ========================================================================
        # Collection 1: Fleet Vehicle Profiles
        # ========================================================================
        # Individual vehicle metrics with daily profitability tracking
        collection = db["fleet_vehicle_profiles"]
        
        # Composite index: (fleet_id, updated_at) for time-series queries
        await collection.create_index([("fleet_id", 1), ("updated_at", -1)])
        logger.info("✓ Created composite index on fleet_vehicle_profiles: (fleet_id, updated_at)")
        
        # Status filter index for quick status lookups
        await collection.create_index([("status", 1)])
        logger.info("✓ Created status index on fleet_vehicle_profiles")
        
        # TTL index: 30 days (for historical data retention)
        await collection.create_index([("created_at", 1)], expireAfterSeconds=2592000)
        logger.info("✓ Created TTL index (30 days) on fleet_vehicle_profiles")
        
        
        # ========================================================================
        # Collection 2: Fleet Portfolio Metrics
        # ========================================================================
        # Fleet-wide aggregate metrics and KPIs
        collection = db["fleet_portfolio_metrics"]
        
        # Composite index: (fleet_id, updated_at)
        await collection.create_index([("fleet_id", 1), ("updated_at", -1)])
        logger.info("✓ Created composite index on fleet_portfolio_metrics: (fleet_id, updated_at)")
        
        # TTL index: 24 hours (keep recent metrics only)
        await collection.create_index([("updated_at", 1)], expireAfterSeconds=86400)
        logger.info("✓ Created TTL index (24 hours) on fleet_portfolio_metrics")
        
        
        # ========================================================================
        # Collection 3: Fleet Cost Breakdown
        # ========================================================================
        # Detailed cost analysis and breakdowns
        collection = db["fleet_cost_breakdown"]
        
        # Composite index: (fleet_id, vehicle_id) for quick lookups
        await collection.create_index([("fleet_id", 1), ("vehicle_id", 1)])
        logger.info("✓ Created composite index on fleet_cost_breakdown: (fleet_id, vehicle_id)")
        
        # Period filter index
        await collection.create_index([("period", 1)])
        logger.info("✓ Created period index on fleet_cost_breakdown")
        
        # TTL index: 30 days
        await collection.create_index([("timestamp", 1)], expireAfterSeconds=2592000)
        logger.info("✓ Created TTL index (30 days) on fleet_cost_breakdown")
        
        
        # ========================================================================
        # Collection 4: Fleet Optimization Tips
        # ========================================================================
        # AI-generated actionable recommendations
        collection = db["fleet_optimization_tips"]
        
        # Vehicle ID index for targeting specific vehicles
        await collection.create_index([("vehicle_id", 1)])
        logger.info("✓ Created vehicle_id index on fleet_optimization_tips")
        
        # Priority filter index
        await collection.create_index([("priority", 1)])
        logger.info("✓ Created priority index on fleet_optimization_tips")
        
        # TTL index: 7 days (tips are time-sensitive)
        await collection.create_index([("created_at", 1)], expireAfterSeconds=604800)
        logger.info("✓ Created TTL index (7 days) on fleet_optimization_tips")
        
        
        # ========================================================================
        # Collection 5: Fleet ROI Analysis
        # ========================================================================
        # Return on Investment calculations and payback analysis
        collection = db["fleet_roi_analysis"]
        
        # Composite index: (vehicle_id, months_in_operation)
        await collection.create_index([("vehicle_id", 1), ("months_in_operation", 1)])
        logger.info("✓ Created composite index on fleet_roi_analysis: (vehicle_id, months_in_operation)")
        
        # Status filter index for tracking vehicles by ROI status
        await collection.create_index([("status", 1)])
        logger.info("✓ Created status index on fleet_roi_analysis")
        
        
        # ========================================================================
        # Collection 6: Fleet Driver Performance
        # ========================================================================
        # Driver contribution to fleet profitability
        collection = db["fleet_driver_performance"]
        
        # Composite index: (fleet_id, driver_id)
        await collection.create_index([("fleet_id", 1), ("driver_id", 1)])
        logger.info("✓ Created composite index on fleet_driver_performance: (fleet_id, driver_id)")
        
        # Vehicle ID index for driver-vehicle matching
        await collection.create_index([("vehicle_id", 1)])
        logger.info("✓ Created vehicle_id index on fleet_driver_performance")
        
        
        # ========================================================================
        # Collection 7: Fleet Maintenance Alerts
        # ========================================================================
        # Maintenance scheduling and cost tracking
        collection = db["fleet_maintenance_alerts"]
        
        # Composite index: (vehicle_id, urgency)
        await collection.create_index([("vehicle_id", 1), ("urgency", 1)])
        logger.info("✓ Created composite index on fleet_maintenance_alerts: (vehicle_id, urgency)")
        
        # Due date index for alerting
        await collection.create_index([("due_date", 1)])
        logger.info("✓ Created due_date index on fleet_maintenance_alerts")
        
        # TTL index: 30 days (alerts auto-expire)
        await collection.create_index([("created_at", 1)], expireAfterSeconds=2592000)
        logger.info("✓ Created TTL index (30 days) on fleet_maintenance_alerts")
        
        
        # ========================================================================
        # Collection 8: Fleet Analytics Metrics
        # ========================================================================
        # Time-series analytics and historical trends
        collection = db["fleet_analytics_metrics"]
        
        # Composite index: (fleet_id, timestamp) for time-series queries
        await collection.create_index([("fleet_id", 1), ("timestamp", -1)])
        logger.info("✓ Created composite index on fleet_analytics_metrics: (fleet_id, timestamp)")
        
        # Metrics type index for filtering analytics
        await collection.create_index([("metrics_type", 1)])
        logger.info("✓ Created metrics_type index on fleet_analytics_metrics")
        
        # TTL index: 30 days (retain historical data)
        await collection.create_index([("timestamp", 1)], expireAfterSeconds=2592000)
        logger.info("✓ Created TTL index (30 days) on fleet_analytics_metrics")
        
        
        # ========================================================================
        # Summary
        # ========================================================================
        logger.info("=" * 70)
        logger.info("FLEET PROFITABILITY DATABASE MIGRATION COMPLETE")
        logger.info("=" * 70)
        logger.info("✓ 8 collections created")
        logger.info("✓ 20 indexes created (composite, status, TTL, time-series)")
        logger.info("✓ TTL policies configured (7d-30d auto-cleanup)")
        logger.info("=" * 70)
        
    except Exception as e:
        logger.error(f"❌ Fleet Profitability migration failed: {str(e)}")
        raise
