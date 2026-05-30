-- Migration: 001_create_vehicle_types_table
-- Date: 2026-05-30
-- Description: Create vehicle_types table for multi-vehicle booking platform

CREATE TABLE IF NOT EXISTS vehicle_types (
    id SERIAL PRIMARY KEY,
    vehicle_type_name VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    capacity_passengers INTEGER NOT NULL,
    capacity_luggage_cubic_meters FLOAT,
    estimated_fare_per_km DECIMAL(10, 2) NOT NULL,
    estimated_fare_per_minute DECIMAL(10, 2) NOT NULL,
    base_fare DECIMAL(10, 2) NOT NULL,
    minimum_fare DECIMAL(10, 2) NOT NULL,
    maximum_passengers INTEGER NOT NULL,
    image_url VARCHAR(500),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_vehicle_types_active ON vehicle_types(is_active);
CREATE INDEX idx_vehicle_types_category ON vehicle_types(category);
CREATE INDEX idx_vehicle_types_name ON vehicle_types(vehicle_type_name);

-- Insert default vehicle types
INSERT INTO vehicle_types (
    vehicle_type_name,
    category,
    capacity_passengers,
    capacity_luggage_cubic_meters,
    estimated_fare_per_km,
    estimated_fare_per_minute,
    base_fare,
    minimum_fare,
    maximum_passengers,
    image_url,
    description,
    is_active
) VALUES
    ('Auto', 'ECONOMY', 3, 0.2, 15.00, 0.50, 30.00, 50.00, 3, 'https://cdn.autobuddy.com/auto.png', 'Budget-friendly auto-rickshaw for 3 passengers', TRUE),
    ('Taxi', 'COMFORT', 4, 0.4, 18.00, 0.60, 40.00, 75.00, 4, 'https://cdn.autobuddy.com/taxi.png', 'Comfortable sedan taxi for 4 passengers', TRUE),
    ('XL', 'PREMIUM', 6, 0.6, 22.00, 0.75, 60.00, 100.00, 6, 'https://cdn.autobuddy.com/xl.png', 'Premium sedan with extra space for 6 passengers', TRUE),
    ('Mini Truck', 'GOODS', 2, 5.0, 25.00, 0.80, 80.00, 150.00, 2, 'https://cdn.autobuddy.com/mini-truck.png', 'Mini truck for small goods transport (5 cubic meters)', TRUE),
    ('Full Truck', 'GOODS', 2, 15.0, 35.00, 1.00, 150.00, 250.00, 2, 'https://cdn.autobuddy.com/full-truck.png', 'Full truck for large goods transport (15 cubic meters)', TRUE);

-- Grant permissions if using role-based access
-- GRANT SELECT ON vehicle_types TO app_user;
