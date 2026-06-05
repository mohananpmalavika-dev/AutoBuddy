"""
TIER 2 Database Migration Script
Creates tables for:
- RideFilterPreferences
- VehicleMaintenance
- VehicleDocumentExpiry
- EarningTarget
- DriverPaymentMethod
- PayoutScheduleConfig
- PayoutHistory
"""

import subprocess
import sys
from pathlib import Path

# SQL Migration Script
SQL_MIGRATION = """
-- TIER 2 Driver Features Tables

-- 1. Ride Filter Preferences
CREATE TABLE IF NOT EXISTS ride_filter_preferences (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL UNIQUE,
    max_pickup_distance_km FLOAT,
    min_passenger_rating FLOAT CHECK (min_passenger_rating >= 1 AND min_passenger_rating <= 5),
    allowed_areas JSONB,
    blocked_areas JSONB,
    time_slot_restrictions JSONB,
    auto_decline_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ride_filters_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE
);
CREATE INDEX idx_ride_filters_driver ON ride_filter_preferences(driver_id);
CREATE INDEX idx_ride_filters_auto_decline ON ride_filter_preferences(auto_decline_enabled);

-- 2. Vehicle Maintenance Records
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    vehicle_id VARCHAR(255) NOT NULL,
    maintenance_type VARCHAR(100) NOT NULL,
    service_date TIMESTAMP WITH TIME ZONE NOT NULL,
    next_due_date TIMESTAMP WITH TIME ZONE,
    cost DECIMAL(10, 2),
    receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maintenance_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE
);
CREATE INDEX idx_maintenance_driver ON vehicle_maintenance(driver_id);
CREATE INDEX idx_maintenance_vehicle ON vehicle_maintenance(vehicle_id);
CREATE INDEX idx_maintenance_due_date ON vehicle_maintenance(next_due_date);
CREATE INDEX idx_maintenance_type ON vehicle_maintenance(maintenance_type);
CREATE INDEX idx_maintenance_driver_vehicle ON vehicle_maintenance(driver_id, vehicle_id);

-- 3. Vehicle Document Expiry Tracking
CREATE TABLE IF NOT EXISTS vehicle_document_expiry (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    vehicle_id VARCHAR(255) NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    alert_days_before INTEGER DEFAULT 30 CHECK (alert_days_before >= 1 AND alert_days_before <= 90),
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doc_expiry_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE
);
CREATE INDEX idx_doc_expiry_driver ON vehicle_document_expiry(driver_id);
CREATE INDEX idx_doc_expiry_vehicle ON vehicle_document_expiry(vehicle_id);
CREATE INDEX idx_doc_expiry_date ON vehicle_document_expiry(expiry_date);
CREATE INDEX idx_doc_expiry_type ON vehicle_document_expiry(document_type);

-- 4. Earning Targets
CREATE TABLE IF NOT EXISTS earning_target (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    target_amount DECIMAL(10, 2) NOT NULL CHECK (target_amount > 0),
    current_earnings DECIMAL(10, 2) DEFAULT 0,
    target_period VARCHAR(20) DEFAULT 'weekly' CHECK (target_period IN ('weekly', 'monthly')),
    bonus_multiplier DECIMAL(3, 2) DEFAULT 1.5 CHECK (bonus_multiplier >= 1.0 AND bonus_multiplier <= 5.0),
    bonus_earned DECIMAL(10, 2) DEFAULT 0,
    target_week_start TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_target_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE
);
CREATE INDEX idx_target_driver ON earning_target(driver_id);
CREATE INDEX idx_target_period ON earning_target(target_period);
CREATE INDEX idx_target_week_start ON earning_target(target_week_start);
CREATE INDEX idx_target_status ON earning_target(status);
CREATE INDEX idx_target_driver_period ON earning_target(driver_id, target_period);

-- 5. Driver Payment Methods
CREATE TABLE IF NOT EXISTS driver_payment_method (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    method_type VARCHAR(50) NOT NULL CHECK (method_type IN ('bank_transfer', 'upi', 'wallet', 'razorpay')),
    account_holder_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(255),
    ifsc_code VARCHAR(11),
    upi_id VARCHAR(255),
    verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed')),
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_method_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE,
    CONSTRAINT unique_default_payment UNIQUE (driver_id, is_default) WHERE is_default = TRUE
);
CREATE INDEX idx_payment_method_driver ON driver_payment_method(driver_id);
CREATE INDEX idx_payment_method_status ON driver_payment_method(verification_status);
CREATE INDEX idx_payment_method_default ON driver_payment_method(is_default);
CREATE INDEX idx_payment_method_type ON driver_payment_method(method_type);

-- 6. Payout Schedule Configuration
CREATE TABLE IF NOT EXISTS payout_schedule_config (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL UNIQUE,
    payment_method_id INTEGER NOT NULL,
    schedule_type VARCHAR(50) DEFAULT 'weekly' CHECK (schedule_type IN ('daily', 'weekly', 'monthly', 'manual')),
    schedule_day INTEGER,
    schedule_time VARCHAR(5),
    minimum_balance_threshold DECIMAL(10, 2) DEFAULT 1000 CHECK (minimum_balance_threshold >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payout_config_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE,
    CONSTRAINT fk_payout_config_method FOREIGN KEY (payment_method_id) REFERENCES driver_payment_method(id) ON DELETE RESTRICT
);
CREATE INDEX idx_payout_config_driver ON payout_schedule_config(driver_id);
CREATE INDEX idx_payout_config_schedule_type ON payout_schedule_config(schedule_type);

-- 7. Payout History
CREATE TABLE IF NOT EXISTS payout_history (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    payment_method_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    transaction_id VARCHAR(255),
    failure_reason TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payout_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE CASCADE,
    CONSTRAINT fk_payout_method FOREIGN KEY (payment_method_id) REFERENCES driver_payment_method(id) ON DELETE RESTRICT
);
CREATE INDEX idx_payout_driver ON payout_history(driver_id);
CREATE INDEX idx_payout_status ON payout_history(status);
CREATE INDEX idx_payout_created ON payout_history(created_at);
CREATE INDEX idx_payout_processed ON payout_history(processed_at);
CREATE INDEX idx_payout_driver_status ON payout_history(driver_id, status);
"""

def run_migration():
    """Execute the migration"""
    print("Starting TIER 2 Database Migration...")
    
    try:
        from app.db.database import get_db_connection
        
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Execute migration SQL
        cursor.execute(SQL_MIGRATION)
        connection.commit()
        
        print("✅ TIER 2 Migration completed successfully!")
        print("Created tables:")
        print("  - ride_filter_preferences")
        print("  - vehicle_maintenance")
        print("  - vehicle_document_expiry")
        print("  - earning_target")
        print("  - driver_payment_method")
        print("  - payout_schedule_config")
        print("  - payout_history")
        
        cursor.close()
        connection.close()
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
