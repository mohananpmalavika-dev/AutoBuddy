-- Production Database Migrations
-- AutoBuddy Database Setup
-- Run these migrations in order to prepare database for production

-- Migration 1: Create saved_places table (if not exists)
-- This table stores saved locations for passengers (home, work, favorite places)
CREATE TABLE IF NOT EXISTS saved_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    place_type VARCHAR(50) NOT NULL, -- 'home', 'work', 'favorite'
    is_favorite BOOLEAN DEFAULT FALSE,
    is_primary BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_primary_per_passenger UNIQUE (passenger_id, is_primary) WHERE is_primary = TRUE
);

-- Migration 2: Create scheduled_rides table
-- Stores rides scheduled for future dates
CREATE TABLE IF NOT EXISTS scheduled_rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pickup_location JSONB NOT NULL, -- {address, latitude, longitude}
    dropoff_location JSONB NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    trip_type VARCHAR(50) NOT NULL DEFAULT 'ride',
    estimated_fare DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
    ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
    recurring BOOLEAN DEFAULT FALSE,
    recurring_pattern VARCHAR(50), -- 'daily', 'weekly', 'monthly'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration 3: Create accessibility_settings table
-- Stores accessibility preferences for each user
CREATE TABLE IF NOT EXISTS accessibility_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    high_contrast BOOLEAN DEFAULT FALSE,
    large_text BOOLEAN DEFAULT FALSE,
    screen_reader_enabled BOOLEAN DEFAULT FALSE,
    keyboard_navigation BOOLEAN DEFAULT FALSE,
    haptic_feedback BOOLEAN DEFAULT TRUE,
    audio_descriptions BOOLEAN DEFAULT FALSE,
    voice_commands_enabled BOOLEAN DEFAULT FALSE,
    text_to_speech_enabled BOOLEAN DEFAULT FALSE,
    reduced_animations BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration 4: Create push_notification_subscriptions table
-- Stores push notification preferences and tokens
CREATE TABLE IF NOT EXISTS push_notification_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL, -- 'android', 'ios', 'web'
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_device_token_per_user UNIQUE (user_id, device_token)
);

-- Migration 5: Add missing columns to existing tables
-- Add to support_tickets table if not exists
ALTER TABLE IF EXISTS support_tickets
    ADD COLUMN IF NOT EXISTS escalation_level VARCHAR(50) DEFAULT 'level1',
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Add to wallet_transactions table if not exists
ALTER TABLE IF EXISTS wallet_transactions
    ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(255),
    ADD COLUMN IF NOT EXISTS refund_initiated_by UUID REFERENCES users(id);

-- Add to vehicles table if not exists
ALTER TABLE IF EXISTS vehicles
    ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE,
    ADD COLUMN IF NOT EXISTS pollution_cert_expiry_date DATE,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'pending';

-- Migration 6: Create critical indexes for production
-- These indexes are essential for query performance
CREATE INDEX IF NOT EXISTS idx_saved_places_passenger_id ON saved_places(passenger_id);
CREATE INDEX IF NOT EXISTS idx_saved_places_is_favorite ON saved_places(passenger_id, is_favorite);

CREATE INDEX IF NOT EXISTS idx_scheduled_rides_passenger_id ON scheduled_rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_rides_status ON scheduled_rides(status, scheduled_time);

CREATE INDEX IF NOT EXISTS idx_rides_driver_id_created_at ON rides(driver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_id_created_at ON bookings(passenger_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, created_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_assigned_to ON support_tickets(status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_passenger_id ON support_tickets(passenger_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ratings_user_id_created_at ON ratings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_rideable_type ON ratings(rideable_type, rideable_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_action_type ON audit_logs(user_id, action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id_created_at ON wallet_transactions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_push_notifications_user_id_active ON push_notification_subscriptions(user_id, is_active);

-- Migration 7: Create views for common queries
-- View for driver daily earnings
CREATE OR REPLACE VIEW v_driver_daily_earnings AS
SELECT 
    d.id as driver_id,
    d.name as driver_name,
    DATE(r.created_at) as earning_date,
    COUNT(r.id) as total_rides,
    SUM(r.final_fare) as total_earnings,
    AVG(rating.rating) as avg_rating
FROM drivers d
LEFT JOIN rides r ON d.id = r.driver_id AND DATE(r.created_at) = CURRENT_DATE
LEFT JOIN ratings rating ON r.id = rating.rideable_id AND rating.rideable_type = 'ride'
GROUP BY d.id, d.name, DATE(r.created_at);

-- View for platform daily summary
CREATE OR REPLACE VIEW v_platform_daily_summary AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_rides,
    SUM(final_fare) as total_revenue,
    COUNT(DISTINCT driver_id) as active_drivers,
    COUNT(DISTINCT passenger_id) as active_passengers,
    AVG(final_fare) as avg_fare,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_rides,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_rides
FROM rides
GROUP BY DATE(created_at);

-- Migration 8: Grant proper permissions for production
-- Ensure proper read-only accounts for reporting
CREATE ROLE IF NOT EXISTS readonly_user WITH LOGIN PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE autobuddy_production TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;

-- Verify migrations
-- Run this to verify all migrations completed successfully:
-- SELECT version, description, success FROM schema_version ORDER BY installed_rank DESC LIMIT 10;
