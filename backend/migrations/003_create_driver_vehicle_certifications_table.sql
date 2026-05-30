-- Migration: 003_create_driver_vehicle_certifications_table
-- Date: 2026-05-30
-- Description: Track which drivers are certified to operate which vehicle types

CREATE TABLE IF NOT EXISTS driver_vehicle_certifications (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(100) NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    certification_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    verification_status VARCHAR(50) DEFAULT 'PENDING',
    verified_by VARCHAR(100),
    verified_date TIMESTAMP,
    document_url VARCHAR(500),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE
);

CREATE INDEX idx_driver_certifications_driver ON driver_vehicle_certifications(driver_id);
CREATE INDEX idx_driver_certifications_vehicle ON driver_vehicle_certifications(vehicle_type_id);
CREATE INDEX idx_driver_certifications_status ON driver_vehicle_certifications(verification_status);
CREATE INDEX idx_driver_certifications_active ON driver_vehicle_certifications(is_active);
