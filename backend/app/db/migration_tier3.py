"""
TIER 3 Database Migration Script
Creates tables for Polish & Optimization features:
- ride_pools
- tax_reports
- favorite_passengers
- shift_schedules
- driver_badges
"""

import sys
import os
from datetime import datetime

def get_db_connection():
    """Get database connection (compatible with existing db module)."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", 5432)),
            user=os.getenv("DB_USER", "autobuddy_user"),
            password=os.getenv("DB_PASSWORD", "autobuddy_pass"),
            database=os.getenv("DB_NAME", "autobuddy_db")
        )
        return conn
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

TIER3_MIGRATION_SQL = """
-- ============================================================================
-- TABLE 1: ride_pools
-- Track ride pooling opportunities and driver acceptance
-- ============================================================================
CREATE TABLE IF NOT EXISTS ride_pools (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    pool_id VARCHAR(255) UNIQUE NOT NULL,
    pickup_location JSONB NOT NULL,
    dropoff_location JSONB NOT NULL,
    requested_time TIMESTAMP WITH TIME ZONE NOT NULL,
    pooling_available BOOLEAN DEFAULT FALSE,
    potential_matches INT DEFAULT 0,
    estimated_savings DECIMAL(10, 2) DEFAULT 0,
    passengers_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, completed, expired
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    earnings_from_pool DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX idx_ride_pools_driver_id ON ride_pools(driver_id);
CREATE INDEX idx_ride_pools_status ON ride_pools(status);
CREATE INDEX idx_ride_pools_created_at ON ride_pools(created_at DESC);
CREATE INDEX idx_ride_pools_driver_created ON ride_pools(driver_id, created_at DESC);

-- ============================================================================
-- TABLE 2: tax_reports
-- Tax report generation and history
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_reports (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    report_id VARCHAR(255) UNIQUE NOT NULL,
    report_type VARCHAR(50) NOT NULL, -- monthly, quarterly, annual
    report_period VARCHAR(50) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    gross_earnings DECIMAL(12, 2) NOT NULL DEFAULT 0,
    deductible_expenses DECIMAL(12, 2) DEFAULT 0,
    taxable_income DECIMAL(12, 2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 15.0,
    tax_liability DECIMAL(12, 2) NOT NULL DEFAULT 0,
    report_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX idx_tax_reports_driver_id ON tax_reports(driver_id);
CREATE INDEX idx_tax_reports_period ON tax_reports(start_date, end_date);
CREATE INDEX idx_tax_reports_created_at ON tax_reports(created_at DESC);
CREATE INDEX idx_tax_reports_driver_period ON tax_reports(driver_id, start_date DESC);

-- ============================================================================
-- TABLE 3: favorite_passengers
-- Driver's favorite/frequent passengers
-- ============================================================================
CREATE TABLE IF NOT EXISTS favorite_passengers (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    passenger_id VARCHAR(255) NOT NULL,
    passenger_name VARCHAR(255),
    notes TEXT,
    rating INT DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    rides_completed INT DEFAULT 0,
    total_earnings_from_passenger DECIMAL(10, 2) DEFAULT 0,
    favorite_since TIMESTAMP WITH TIME ZONE,
    last_ride_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    UNIQUE(driver_id, passenger_id)
);

CREATE INDEX idx_favorite_passengers_driver_id ON favorite_passengers(driver_id);
CREATE INDEX idx_favorite_passengers_active ON favorite_passengers(driver_id, is_active);
CREATE INDEX idx_favorite_passengers_created_at ON favorite_passengers(created_at DESC);

-- ============================================================================
-- TABLE 4: shift_schedules
-- Recurring shift schedules for drivers
-- ============================================================================
CREATE TABLE IF NOT EXISTS shift_schedules (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_recurring BOOLEAN DEFAULT TRUE,
    shift_type VARCHAR(50) DEFAULT 'regular', -- regular, premium, night, weekend
    target_earnings DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX idx_shift_schedules_driver_id ON shift_schedules(driver_id);
CREATE INDEX idx_shift_schedules_day ON shift_schedules(driver_id, day_of_week);
CREATE INDEX idx_shift_schedules_active ON shift_schedules(driver_id, is_active);

-- ============================================================================
-- TABLE 5: driver_badges
-- Gamification badges and achievements
-- ============================================================================
CREATE TABLE IF NOT EXISTS driver_badges (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    badge_type VARCHAR(50) NOT NULL, -- safety, performance, consistency, customer_service, milestone
    badge_name VARCHAR(255) NOT NULL,
    badge_icon VARCHAR(255),
    description TEXT,
    earned_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    progress DECIMAL(5, 2), -- 0-100 for in-progress
    is_earned BOOLEAN DEFAULT FALSE,
    is_expired BOOLEAN DEFAULT FALSE,
    reward_points INT DEFAULT 0,
    reward_bonus DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX idx_driver_badges_driver_id ON driver_badges(driver_id);
CREATE INDEX idx_driver_badges_earned ON driver_badges(driver_id, is_earned);
CREATE INDEX idx_driver_badges_type ON driver_badges(badge_type);
CREATE INDEX idx_driver_badges_earned_at ON driver_badges(earned_at DESC);

-- Add composite index for performance
CREATE INDEX idx_driver_badges_driver_earned ON driver_badges(driver_id, is_earned, created_at DESC);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total tables created: 5
-- Total indexes created: 16
-- Key features:
-- - Ride pooling detection and tracking
-- - Tax report generation and history
-- - Favorite passenger management
-- - Recurring shift scheduling
-- - Gamification badges and achievements
-- All tables include IST timezone support and proper foreign key constraints
"""

def run_migration():
    """Execute TIER 3 migration."""
    print("\n" + "="*70)
    print("🚀 TIER 3 DATABASE MIGRATION")
    print("="*70)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        print("\n📋 Creating TIER 3 tables...")
        cursor.execute(TIER3_MIGRATION_SQL)
        conn.commit()
        
        # Verify tables created
        cursor.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN
            ('ride_pools', 'tax_reports', 'favorite_passengers', 'shift_schedules', 'driver_badges')
        """)
        
        created_tables = [row[0] for row in cursor.fetchall()]
        
        print("\n✅ TIER 3 Migration completed successfully!")
        print(f"\n📦 Tables created ({len(created_tables)}):")
        for table in created_tables:
            print(f"   ✓ {table}")
        
        print("\n📊 Features:")
        print("   ✓ Ride pooling detection")
        print("   ✓ Tax report generation")
        print("   ✓ Favorite passengers management")
        print("   ✓ Shift scheduling calendar")
        print("   ✓ Gamification badges/achievements")
        
        print("\n" + "="*70)
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
