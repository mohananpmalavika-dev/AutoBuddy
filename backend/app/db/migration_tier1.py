"""
Database Migration Script for TIER 1 Features
Creates all necessary tables and indexes for GPS tracking, SOS alerts, and expense tracking
"""

# SQL Migration - Run this on your PostgreSQL database

SQL_MIGRATION = """
-- ============================================================================
-- TIER 1 Feature #1: GPS Location Tracking Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS driver_gps_locations (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    ride_id VARCHAR(36),
    
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy FLOAT,
    speed FLOAT,
    altitude FLOAT,
    address VARCHAR(500),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_driver_id FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_driver_id ON driver_gps_locations(driver_id);
CREATE INDEX IF NOT EXISTS ix_ride_id ON driver_gps_locations(ride_id);
CREATE INDEX IF NOT EXISTS ix_driver_location_ride_time ON driver_gps_locations(driver_id, ride_id, created_at);
CREATE INDEX IF NOT EXISTS ix_driver_location_recent ON driver_gps_locations(driver_id, created_at DESC);

-- ============================================================================
-- TIER 1 Feature #2: SOS Emergency Alerts Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sos_alerts (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    ride_id VARCHAR(36),
    
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address VARCHAR(500),
    
    status VARCHAR(50) DEFAULT 'active',
    authorities_notified BOOLEAN DEFAULT FALSE,
    admin_notified BOOLEAN DEFAULT FALSE,
    passenger_notified BOOLEAN DEFAULT FALSE,
    
    contact_phone VARCHAR(20),
    contact_name VARCHAR(255),
    
    response_time_minutes FLOAT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_driver_sos FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ride_sos FOREIGN KEY (ride_id) REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_sos_driver_id ON sos_alerts(driver_id);
CREATE INDEX IF NOT EXISTS ix_sos_ride_id ON sos_alerts(ride_id);
CREATE INDEX IF NOT EXISTS ix_sos_status ON sos_alerts(status);
CREATE INDEX IF NOT EXISTS ix_sos_driver_status ON sos_alerts(driver_id, status);
CREATE INDEX IF NOT EXISTS ix_sos_created_at ON sos_alerts(created_at DESC);

-- ============================================================================
-- TIER 1 Feature #3: Driver Expense Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS driver_expenses (
    id VARCHAR(36) PRIMARY KEY,
    ride_id VARCHAR(36) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    
    expense_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    receipt_url VARCHAR(500),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_driver_expense FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ride_expense FOREIGN KEY (ride_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT chk_expense_type CHECK (expense_type IN ('toll', 'parking', 'fuel', 'maintenance', 'other')),
    CONSTRAINT chk_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS ix_expense_ride_id ON driver_expenses(ride_id);
CREATE INDEX IF NOT EXISTS ix_expense_driver_id ON driver_expenses(driver_id);
CREATE INDEX IF NOT EXISTS ix_expense_driver_date ON driver_expenses(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_expense_type ON driver_expenses(expense_type);

-- ============================================================================
-- TIER 1 Feature #4: Location Statistics (Optional, for Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS driver_location_stats (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    date VARCHAR(10) NOT NULL,
    
    total_distance_km FLOAT DEFAULT 0.0,
    avg_speed_kmh FLOAT,
    max_speed_kmh FLOAT,
    min_speed_kmh FLOAT,
    
    active_hours FLOAT DEFAULT 0.0,
    rides_completed INT DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_driver_stats FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_driver_date UNIQUE(driver_id, date)
);

CREATE INDEX IF NOT EXISTS ix_driver_stats_date ON driver_location_stats(driver_id, date DESC);

-- ============================================================================
-- Update Bookings Table (Add expense tracking columns)
-- ============================================================================

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS total_expenses DECIMAL(10, 2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS net_earnings DECIMAL(10, 2);

-- Trigger to update net_earnings when expenses change
-- This is database-specific and depends on your current setup

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
    'driver_gps_locations', 'sos_alerts', 'driver_expenses', 'driver_location_stats'
);

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('driver_gps_locations', 'sos_alerts', 'driver_expenses')
ORDER BY tablename;
"""

# Python-based migration using SQLAlchemy (Alternative)
def run_migration(db_session):
    """
    Run migration using SQLAlchemy ORM
    
    Usage:
        from backend.app.db.database import SessionLocal
        session = SessionLocal()
        run_migration(session)
    """
    from backend.app.db.tier1_models import (
        DriverGPSLocation, SOSAlert, DriverExpense, 
        DriverLocationStats, Base
    )
    
    # Create all tables
    Base.metadata.create_all(bind=db_session.get_bind())
    
    print("✅ Migration completed successfully!")
    print("Created tables:")
    print("  - driver_gps_locations")
    print("  - sos_alerts")
    print("  - driver_expenses")
    print("  - driver_location_stats")


# Migration execution script
if __name__ == "__main__":
    import sys
    import os
    
    # Add project root to path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    from backend.app.db.database import SessionLocal
    
    try:
        db = SessionLocal()
        run_migration(db)
        db.close()
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        sys.exit(1)
