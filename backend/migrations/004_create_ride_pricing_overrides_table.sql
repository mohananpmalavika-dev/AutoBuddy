-- Migration: 004_create_ride_pricing_overrides_table
-- Date: 2026-05-30
-- Description: Dynamic pricing rules by location, time, surge conditions

CREATE TABLE IF NOT EXISTS ride_pricing_overrides (
    id SERIAL PRIMARY KEY,
    vehicle_type_id INTEGER NOT NULL,
    ride_product_id INTEGER,
    pricing_rule_name VARCHAR(100) NOT NULL,
    location_latitude DECIMAL(10, 8),
    location_longitude DECIMAL(11, 8),
    location_radius_km FLOAT,
    time_from TIME,
    time_to TIME,
    day_of_week_start INTEGER,
    day_of_week_end INTEGER,
    surge_multiplier DECIMAL(4, 2) DEFAULT 1.0,
    base_fare_override DECIMAL(10, 2),
    per_km_override DECIMAL(10, 2),
    per_minute_override DECIMAL(10, 2),
    priority_order INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE,
    FOREIGN KEY (ride_product_id) REFERENCES ride_products(id) ON DELETE SET NULL
);

CREATE INDEX idx_pricing_overrides_vehicle ON ride_pricing_overrides(vehicle_type_id);
CREATE INDEX idx_pricing_overrides_active ON ride_pricing_overrides(is_active);
CREATE INDEX idx_pricing_overrides_priority ON ride_pricing_overrides(priority_order);
