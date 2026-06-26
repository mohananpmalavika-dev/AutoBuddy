-- Migration: 008_extend_passenger_preferences
-- Date: 2026-06-20
-- Description: Add ride preference fields to passenger_preferences table for music, temperature, communication, vehicle type

-- Use separate ADD COLUMN statements (Postgres doesn't support adding multiple columns
-- in a single ADD COLUMN IF NOT EXISTS (...) clause).
ALTER TABLE passenger_preferences
  ADD COLUMN IF NOT EXISTS music_preference VARCHAR(20) DEFAULT 'neutral';

ALTER TABLE passenger_preferences
  ADD COLUMN IF NOT EXISTS ac_preference VARCHAR(20) DEFAULT 'cool';

ALTER TABLE passenger_preferences
  ADD COLUMN IF NOT EXISTS communication_level VARCHAR(20) DEFAULT 'normal';

ALTER TABLE passenger_preferences
  ADD COLUMN IF NOT EXISTS vehicle_type_preference VARCHAR(500);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_passenger_music_pref ON passenger_preferences(music_preference);
CREATE INDEX IF NOT EXISTS idx_passenger_comm_level ON passenger_preferences(communication_level);
