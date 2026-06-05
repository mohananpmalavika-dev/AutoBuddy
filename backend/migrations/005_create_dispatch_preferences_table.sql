-- Migration: 005_create_dispatch_preferences_table
-- Date: 2026-05-30
-- Description: Driver availability and dispatch preferences

CREATE TABLE IF NOT EXISTS dispatch_preferences (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(100) NOT NULL UNIQUE,
    available_vehicle_type_ids INTEGER[],
    preferred_vehicle_type_id INTEGER,
    accepts_pooled_rides BOOLEAN DEFAULT FALSE,
    accepts_scheduled_rides BOOLEAN DEFAULT FALSE,
    accepts_goods_transport BOOLEAN DEFAULT FALSE,
    minimum_rating DECIMAL(3, 2) DEFAULT 4.0,
    maximum_ride_distance_km FLOAT DEFAULT 50.0,
    service_area_latitude DECIMAL(10, 8),
    service_area_longitude DECIMAL(11, 8),
    service_area_radius_km FLOAT DEFAULT 10.0,
    is_online BOOLEAN DEFAULT FALSE,
    last_active_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dispatch_prefs_driver ON dispatch_preferences(driver_id);
CREATE INDEX idx_dispatch_prefs_online ON dispatch_preferences(is_online);
CREATE INDEX idx_dispatch_prefs_vehicle ON dispatch_preferences(preferred_vehicle_type_id);
