-- Migration: 006_create_vehicle_inventory_table
-- Date: 2026-05-30
-- Description: Track driver vehicle fleet and capacity

CREATE TABLE IF NOT EXISTS vehicle_inventory (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(100) NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    vehicle_registration_number VARCHAR(20) NOT NULL UNIQUE,
    vehicle_make VARCHAR(100),
    vehicle_model VARCHAR(100),
    vehicle_year INTEGER,
    vehicle_color VARCHAR(50),
    seats_available INTEGER,
    trunk_space_cubic_meters FLOAT,
    permit_type VARCHAR(50),
    permit_expiry_date DATE,
    insurance_provider VARCHAR(100),
    insurance_expiry_date DATE,
    pollution_certificate_expiry_date DATE,
    fitness_certificate_expiry_date DATE,
    inspection_status VARCHAR(50) DEFAULT 'PENDING',
    inspection_date TIMESTAMP,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT
);

CREATE INDEX idx_vehicle_inventory_driver ON vehicle_inventory(driver_id);
CREATE INDEX idx_vehicle_inventory_type ON vehicle_inventory(vehicle_type_id);
CREATE INDEX idx_vehicle_inventory_active ON vehicle_inventory(is_active);
CREATE INDEX idx_vehicle_inventory_registration ON vehicle_inventory(vehicle_registration_number);
