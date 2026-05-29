"""
Database Migration Script for Fleet Advanced Features
Creates MongoDB collections and indexes for all fleet portal features
"""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def create_fleet_advanced_indexes(db: AsyncIOMotorDatabase) -> None:
    """
    Create all necessary MongoDB collections and indexes for Fleet Portal features.
    This ensures optimal query performance for all fleet operations.
    """
    try:
        # Collection names
        collections = [
            "fleet_kpi_metrics",
            "fleet_health_snapshots",
            "fleet_wallets",
            "fleet_settlements",
            "fleet_withdrawals",
            "driver_payouts",
            "fleet_driver_assignments",
            "driver_reassignment_requests",
            "temporary_driver_replacements",
            "driver_transfer_records",
            "driver_attendance_records",
            "driver_performance_rankings",
            "driver_monthly_performance",
            "driver_incentives",
            "fleet_incentive_programs",
            "weekly_incentive_targets",
            "vehicle_locations",
            "fleet_live_maps",
            "heatmap_grids",
            "zone_demand_heatmaps",
            "revenue_forecasts",
            "ai_fleet_optimizations",
            "fleet_user_roles",
            "document_expiry_alerts",
            "fleet_compliance_reports",
            "bulk_operations",
            "bulk_driver_approvals",
            "bulk_document_uploads",
        ]

        # Create collections and indexes
        for collection_name in collections:
            collection = db[collection_name]
            logger.info(f"Initializing collection: {collection_name}")

        # Dashboard indexes
        await db["fleet_kpi_metrics"].create_index([("fleet_id", 1), ("updated_at", -1)])
        await db["fleet_kpi_metrics"].create_index([("fleet_id", 1)])
        await db["fleet_kpi_metrics"].create_index([("updated_at", -1)])

        await db["fleet_health_snapshots"].create_index([("fleet_id", 1), ("date", -1)])
        await db["fleet_health_snapshots"].create_index([("fleet_id", 1)])

        # Wallet indexes
        await db["fleet_wallets"].create_index([("fleet_id", 1)], unique=True)
        await db["fleet_wallets"].create_index([("owner_id", 1)])

        await db["fleet_settlements"].create_index([("fleet_id", 1), ("settlement_date", -1)])
        await db["fleet_settlements"].create_index([("status", 1)])

        await db["fleet_withdrawals"].create_index([("fleet_id", 1), ("created_at", -1)])
        await db["fleet_withdrawals"].create_index([("status", 1)])

        await db["driver_payouts"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["driver_payouts"].create_index([("payout_date", -1)])

        # Assignment indexes
        await db["fleet_driver_assignments"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["fleet_driver_assignments"].create_index([("assignment_status", 1)])
        await db["fleet_driver_assignments"].create_index([("vehicle_id", 1)])

        await db["driver_reassignment_requests"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["driver_reassignment_requests"].create_index([("status", 1)])

        await db["temporary_driver_replacements"].create_index([("fleet_id", 1), ("start_date", -1)])
        await db["temporary_driver_replacements"].create_index([("original_driver_id", 1)])

        await db["driver_transfer_records"].create_index([("driver_id", 1), ("transfer_date", -1)])

        # Performance indexes
        await db["driver_attendance_records"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["driver_attendance_records"].create_index([("date", -1)])

        await db["driver_performance_rankings"].create_index([("fleet_id", 1), ("rank", 1)])
        await db["driver_performance_rankings"].create_index([("driver_id", 1)])

        await db["driver_monthly_performance"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["driver_monthly_performance"].create_index([("month_year", -1)])

        # Incentive indexes
        await db["driver_incentives"].create_index([("fleet_id", 1), ("driver_id", 1)])
        await db["driver_incentives"].create_index([("incentive_type", 1)])

        await db["fleet_incentive_programs"].create_index([("fleet_id", 1)], unique=True)
        await db["fleet_incentive_programs"].create_index([("status", 1)])

        await db["weekly_incentive_targets"].create_index([("fleet_id", 1), ("week_start", -1)])

        # Map/Location indexes
        await db["vehicle_locations"].create_index([("fleet_id", 1), ("vehicle_id", 1)])
        await db["vehicle_locations"].create_index([("updated_at", -1)])
        # Geospatial index for location-based queries
        await db["vehicle_locations"].create_index([("location", "2dsphere")])

        await db["fleet_live_maps"].create_index([("fleet_id", 1)], unique=True)

        await db["heatmap_grids"].create_index([("fleet_id", 1), ("grid_cell_id", 1)])
        await db["heatmap_grids"].create_index([("timestamp", -1)])
        await db["heatmap_grids"].create_index([("grid_cell_id", 1)])

        await db["zone_demand_heatmaps"].create_index([("fleet_id", 1), ("zone_id", 1)])
        await db["zone_demand_heatmaps"].create_index([("updated_at", -1)])

        # Forecasting indexes
        await db["revenue_forecasts"].create_index([("fleet_id", 1), ("forecast_date", 1)])
        await db["revenue_forecasts"].create_index([("created_at", -1)])

        # AI indexes
        await db["ai_fleet_optimizations"].create_index([("fleet_id", 1), ("created_at", -1)])

        # Role/Access indexes
        await db["fleet_user_roles"].create_index([("fleet_id", 1), ("user_id", 1)], unique=True)
        await db["fleet_user_roles"].create_index([("role_type", 1)])

        # Compliance indexes
        await db["document_expiry_alerts"].create_index([("fleet_id", 1)])
        await db["document_expiry_alerts"].create_index([("expiry_date", 1)])

        await db["fleet_compliance_reports"].create_index([("fleet_id", 1), ("report_date", -1)])

        # Bulk operation indexes
        await db["bulk_operations"].create_index([("fleet_id", 1), ("created_at", -1)])
        await db["bulk_operations"].create_index([("status", 1)])

        await db["bulk_driver_approvals"].create_index([("fleet_id", 1), ("bulk_op_id", 1)])

        await db["bulk_document_uploads"].create_index([("fleet_id", 1), ("bulk_op_id", 1)])

        logger.info("✓ Fleet Advanced collections and indexes created successfully")

    except Exception as e:
        logger.error(f"Error creating fleet advanced indexes: {e}")
        raise


# SQL Migration (for reference if PostgreSQL backend is used)
SQL_MIGRATION = """
-- ============================================================================
-- Fleet Advanced Features Database Schema
-- ============================================================================

-- Dashboard Tables
CREATE TABLE IF NOT EXISTS fleet_kpi_metrics (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    total_revenue DECIMAL(12, 2),
    active_drivers INT,
    active_vehicles INT,
    completed_rides INT,
    average_rating FLOAT,
    health_score INT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fleet_kpi_metrics_fleet_id ON fleet_kpi_metrics(fleet_id);
CREATE INDEX idx_fleet_kpi_metrics_updated_at ON fleet_kpi_metrics(fleet_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fleet_health_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    health_status VARCHAR(50),
    health_score INT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fleet_health_fleet_date ON fleet_health_snapshots(fleet_id, date DESC);

-- Wallet Tables
CREATE TABLE IF NOT EXISTS fleet_wallets (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL UNIQUE,
    owner_id VARCHAR(255) NOT NULL,
    total_balance DECIMAL(12, 2),
    available_balance DECIMAL(12, 2),
    pending_balance DECIMAL(12, 2),
    currency VARCHAR(3),
    last_settlement_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fleet_wallets_fleet_id ON fleet_wallets(fleet_id);
CREATE INDEX idx_fleet_wallets_owner_id ON fleet_wallets(owner_id);

CREATE TABLE IF NOT EXISTS fleet_settlements (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    settlement_date DATE NOT NULL,
    total_rides INT,
    gross_revenue DECIMAL(12, 2),
    platform_fee DECIMAL(12, 2),
    net_settlement DECIMAL(12, 2),
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fleet_settlements_fleet_date ON fleet_settlements(fleet_id, settlement_date DESC);
CREATE INDEX idx_fleet_settlements_status ON fleet_settlements(status);

CREATE TABLE IF NOT EXISTS fleet_withdrawals (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    bank_account VARCHAR(255),
    status VARCHAR(50),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fleet_withdrawals_fleet_id ON fleet_withdrawals(fleet_id, created_at DESC);
CREATE INDEX idx_fleet_withdrawals_status ON fleet_withdrawals(status);

CREATE TABLE IF NOT EXISTS driver_payouts (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2),
    payout_date DATE NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_driver_payouts_fleet_driver ON driver_payouts(fleet_id, driver_id);
CREATE INDEX idx_driver_payouts_date ON driver_payouts(payout_date DESC);

-- Assignment Tables
CREATE TABLE IF NOT EXISTS fleet_driver_assignments (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    vehicle_id VARCHAR(255),
    assignment_status VARCHAR(50),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fleet_driver_assign ON fleet_driver_assignments(fleet_id, driver_id);
CREATE INDEX idx_assignment_status ON fleet_driver_assignments(assignment_status);
CREATE INDEX idx_vehicle_id ON fleet_driver_assignments(vehicle_id);

-- Performance Tables
CREATE TABLE IF NOT EXISTS driver_performance_rankings (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    rank INT,
    performance_score FLOAT,
    total_rides INT,
    rating FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_driver_perf_fleet_rank ON driver_performance_rankings(fleet_id, rank);
CREATE INDEX idx_driver_perf_driver_id ON driver_performance_rankings(driver_id);

-- Location Tables
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    vehicle_id VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    speed FLOAT,
    status VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_vehicle_locations_fleet_vehicle ON vehicle_locations(fleet_id, vehicle_id);
CREATE INDEX idx_vehicle_locations_updated_at ON vehicle_locations(updated_at DESC);

CREATE TABLE IF NOT EXISTS heatmap_grids (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    grid_cell_id VARCHAR(50),
    demand_score INT,
    ride_count INT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_heatmap_fleet_cell ON heatmap_grids(fleet_id, grid_cell_id);
CREATE INDEX idx_heatmap_timestamp ON heatmap_grids(timestamp DESC);

-- Compliance Tables
CREATE TABLE IF NOT EXISTS fleet_compliance_reports (
    id VARCHAR(36) PRIMARY KEY,
    fleet_id VARCHAR(255) NOT NULL,
    report_date DATE NOT NULL,
    compliance_status VARCHAR(50),
    violations_count INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fleet_compliance_date ON fleet_compliance_reports(fleet_id, report_date DESC);
"""
