-- Migration: 002_create_ride_products_table
-- Date: 2026-05-30
-- Description: Create ride_products table for variant pricing within vehicle types

CREATE TABLE IF NOT EXISTS ride_products (
    id SERIAL PRIMARY KEY,
    vehicle_type_id INTEGER NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    price_multiplier DECIMAL(3, 2) DEFAULT 1.0,
    surge_multiplier_range_min DECIMAL(3, 2) DEFAULT 1.0,
    surge_multiplier_range_max DECIMAL(4, 2) DEFAULT 3.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX idx_ride_products_vehicle_type ON ride_products(vehicle_type_id);
CREATE INDEX idx_ride_products_active ON ride_products(is_active);
CREATE INDEX idx_ride_products_code ON ride_products(product_code);

-- Insert default ride products
INSERT INTO ride_products (vehicle_type_id, product_name, product_code, description, price_multiplier)
SELECT 
    vt.id,
    CASE vt.vehicle_type_name
        WHEN 'Auto' THEN 'Auto Standard'
        WHEN 'Taxi' THEN 'Taxi Standard'
        WHEN 'XL' THEN 'XL Premium'
        WHEN 'Mini Truck' THEN 'Mini Truck Standard'
        WHEN 'Full Truck' THEN 'Full Truck Standard'
    END,
    LOWER(REPLACE(vt.vehicle_type_name, ' ', '_')) || '_standard',
    CASE vt.vehicle_type_name
        WHEN 'Auto' THEN 'Standard auto ride'
        WHEN 'Taxi' THEN 'Standard taxi ride'
        WHEN 'XL' THEN 'Premium XL ride'
        WHEN 'Mini Truck' THEN 'Standard mini truck transport'
        WHEN 'Full Truck' THEN 'Standard full truck transport'
    END,
    1.0
FROM vehicle_types vt
WHERE vt.is_active = TRUE;

-- Add premium variants for passenger vehicles
INSERT INTO ride_products (vehicle_type_id, product_name, product_code, description, price_multiplier)
SELECT 
    vt.id,
    vt.vehicle_type_name || ' Premium',
    LOWER(REPLACE(vt.vehicle_type_name, ' ', '_')) || '_premium',
    'Premium variant with extra comfort features',
    1.5
FROM vehicle_types vt
WHERE vt.vehicle_type_name IN ('Taxi', 'XL')
  AND vt.is_active = TRUE;
