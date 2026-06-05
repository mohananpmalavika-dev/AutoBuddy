"""
Driver Heatmaps & Demand Forecasting Database Migration
MongoDB collections setup with indexes for real-time heatmap and forecast data
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_heatmap_indexes(db: AsyncIOMotorDatabase):
    """Create indexes for heatmap and forecasting collections"""
    try:
        # 1. Driver Location Updates Collection
        location_collection = db["heatmap_driver_locations"]
        await location_collection.create_index([("driver_id", 1), ("city_id", 1)])
        await location_collection.create_index([("city_id", 1), ("timestamp", -1)])
        await location_collection.create_index([("city_id", 1), ("available", 1)])
        await location_collection.create_index([("location", "2dsphere")], sparse=True)
        await location_collection.create_index([("timestamp", 1)], expireAfterSeconds=1800)  # 30 min TTL
        logger.info("✓ heatmap_driver_locations collection indexed")

        # 2. Heatmap Grid Cells Collection
        grid_collection = db["heatmap_grid_cells"]
        await grid_collection.create_index([("cell_id", 1)])
        await grid_collection.create_index([("city_id", 1), ("updated_at", -1)])
        await grid_collection.create_index([("city_id", 1), ("cell_status", 1)])
        await grid_collection.create_index([("location", "2dsphere")], sparse=True)
        await grid_collection.create_index([("updated_at", 1)], expireAfterSeconds=1800)  # 30 min TTL
        logger.info("✓ heatmap_grid_cells collection indexed")

        # 3. City Heatmaps Collection
        heatmap_collection = db["heatmap_city_heatmaps"]
        await heatmap_collection.create_index([("city_id", 1)])
        await heatmap_collection.create_index([("city_id", 1), ("timestamp", -1)])
        await heatmap_collection.create_index([("timestamp", 1)], expireAfterSeconds=3600)  # 1 hour TTL
        logger.info("✓ heatmap_city_heatmaps collection indexed")

        # 4. Demand Forecasts Collection
        forecast_collection = db["heatmap_demand_forecasts"]
        await forecast_collection.create_index([("forecast_id", 1)])
        await forecast_collection.create_index([("city_id", 1), ("forecast_period", -1)])
        await forecast_collection.create_index([("city_id", 1), ("accuracy", 1)])
        await forecast_collection.create_index([("updated_at", 1)], expireAfterSeconds=86400)  # 24 hour TTL
        logger.info("✓ heatmap_demand_forecasts collection indexed")

        # 5. Supply Gap Alerts Collection
        alert_collection = db["heatmap_supply_gap_alerts"]
        await alert_collection.create_index([("alert_id", 1)])
        await alert_collection.create_index([("city_id", 1), ("created_at", -1)])
        await alert_collection.create_index([("city_id", 1), ("severity", 1)])
        await alert_collection.create_index([("city_id", 1), ("resolved", 1)])
        await alert_collection.create_index([("created_at", 1)], expireAfterSeconds=604800)  # 7 day TTL
        logger.info("✓ heatmap_supply_gap_alerts collection indexed")

        # 6. Driver Trend Analysis Collection
        trend_collection = db["heatmap_driver_trends"]
        await trend_collection.create_index([("trend_id", 1)])
        await trend_collection.create_index([("city_id", 1), ("analysis_period", 1)])
        await trend_collection.create_index([("city_id", 1), ("updated_at", -1)])
        await trend_collection.create_index([("updated_at", 1)], expireAfterSeconds=2592000)  # 30 day TTL
        logger.info("✓ heatmap_driver_trends collection indexed")

        # 7. Incentive Recommendations Collection
        recommendation_collection = db["heatmap_incentive_recommendations"]
        await recommendation_collection.create_index([("recommendation_id", 1)])
        await recommendation_collection.create_index([("city_id", 1), ("zone_id", 1)])
        await recommendation_collection.create_index([("city_id", 1), ("valid_until", 1)])
        await recommendation_collection.create_index([("valid_until", 1)], expireAfterSeconds=3600)  # 1 hour TTL
        logger.info("✓ heatmap_incentive_recommendations collection indexed")

        # 8. Heatmap Analytics Metrics Collection
        metrics_collection = db["heatmap_analytics_metrics"]
        await metrics_collection.create_index([("city_id", 1), ("timestamp", -1)])
        await metrics_collection.create_index([("city_id", 1), ("metric_type", 1)])
        await metrics_collection.create_index([("timestamp", 1)], expireAfterSeconds=2592000)  # 30 day TTL
        logger.info("✓ heatmap_analytics_metrics collection indexed")

        logger.info("✓ All heatmap collections initialized successfully")

    except Exception as e:
        logger.error(f"✗ Heatmap collection initialization failed: {str(e)}")
        raise
