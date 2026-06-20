-- Migration: 008_extend_passenger_preferences
-- Date: 2026-06-20
-- Description: Add ride preference fields to passenger_preferences table for music, temperature, communication, vehicle type

-- Add new columns for ride preferences
ALTER TABLE passenger_preferences ADD COLUMN IF NOT EXISTS (
  music_preference VARCHAR(20) DEFAULT 'neutral',
  ac_preference VARCHAR(20) DEFAULT 'cool',
  communication_level VARCHAR(20) DEFAULT 'normal',
  vehicle_type_preference VARCHAR(500)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_passenger_music_pref ON passenger_preferences(music_preference);
CREATE INDEX IF NOT EXISTS idx_passenger_comm_level ON passenger_preferences(communication_level);
