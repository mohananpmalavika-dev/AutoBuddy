-- Migration: create road_hazards and hazard_reports tables
-- Run with: psql $DATABASE_URL -f 010_create_road_hazards.sql

CREATE TABLE IF NOT EXISTS road_hazards (
    id SERIAL PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    severity INTEGER,
    type VARCHAR(64),
    source VARCHAR(64),
    speed_kmph DOUBLE PRECISION,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_road_hazards_location ON road_hazards USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_road_hazards_created ON road_hazards USING btree (created_at DESC);

CREATE TABLE IF NOT EXISTS hazard_reports (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(128),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    description VARCHAR(512),
    image_url VARCHAR(1024),
    status VARCHAR(32) DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports USING btree (status);
