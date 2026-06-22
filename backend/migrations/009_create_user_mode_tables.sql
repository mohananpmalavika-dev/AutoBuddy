-- 3-Mode Feature Segmentation System - Database Migration
-- Location: backend/migrations/009_create_user_mode_tables.sql
-- 
-- Run this migration to create tables for the 3-mode system
-- Usage: psql -U postgres -d autobuddy_production -f 009_create_user_mode_tables.sql

-- ============================================================================
-- CREATE USER MODE PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_mode_profiles (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Current mode
    current_mode VARCHAR(50) NOT NULL DEFAULT 'simple' CHECK (current_mode IN ('simple', 'smart', 'pro')),
    previous_mode VARCHAR(50) CHECK (previous_mode IN ('simple', 'smart', 'pro')),
    mode_upgraded_at TIMESTAMP WITH TIME ZONE,
    
    -- Feature toggles for Smart Mode
    ai_suggestions_enabled BOOLEAN DEFAULT TRUE,
    voice_commands_enabled BOOLEAN DEFAULT TRUE,
    family_assistant_enabled BOOLEAN DEFAULT FALSE,
    
    -- Feature toggles for Pro Mode
    fleet_management_enabled BOOLEAN DEFAULT FALSE,
    analytics_dashboard_enabled BOOLEAN DEFAULT FALSE,
    corporate_billing_enabled BOOLEAN DEFAULT FALSE,
    
    -- Trial information
    is_pro_trial BOOLEAN DEFAULT FALSE,
    pro_trial_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Subscription information
    is_pro_subscriber BOOLEAN DEFAULT FALSE,
    pro_subscription_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_user_mode_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_user_mode_user_id ON user_mode_profiles(user_id);
CREATE INDEX idx_user_mode_current_mode ON user_mode_profiles(current_mode);
CREATE INDEX idx_user_mode_trial_expires ON user_mode_profiles(pro_trial_expires_at) 
    WHERE is_pro_trial = TRUE;
CREATE INDEX idx_user_mode_subscription_expires ON user_mode_profiles(pro_subscription_expires_at) 
    WHERE is_pro_subscriber = TRUE;

-- ============================================================================
-- CREATE FEATURE DEFINITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_definitions (
    id VARCHAR(255) PRIMARY KEY,
    
    -- Feature identification
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    
    -- Access control
    access_mode VARCHAR(50) NOT NULL DEFAULT 'simple' CHECK (access_mode IN ('simple', 'smart', 'pro', 'all')),
    
    -- Implementation details
    component_path VARCHAR(500),
    router_name VARCHAR(100),
    
    -- Feature metadata
    is_experimental BOOLEAN DEFAULT FALSE,
    is_deprecated BOOLEAN DEFAULT FALSE,
    
    -- Version tracking
    introduced_in_version VARCHAR(50),
    deprecated_in_version VARCHAR(50),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feature_name ON feature_definitions(name);
CREATE INDEX idx_feature_access_mode ON feature_definitions(access_mode);
CREATE INDEX idx_feature_deprecated ON feature_definitions(is_deprecated);

-- ============================================================================
-- INSERT DEFAULT FEATURES
-- ============================================================================

-- Simple Mode Features
INSERT INTO feature_definitions (id, name, description, access_mode, component_path, router_name, introduced_in_version) VALUES
    ('feature-001', 'book_ride', 'Book a ride immediately', 'simple', 'screens/BookRideScreen', 'BookRide', '1.0.0'),
    ('feature-002', 'schedule_ride', 'Schedule a ride for future', 'simple', 'screens/ScheduleRideScreen', 'ScheduleRide', '1.0.0'),
    ('feature-003', 'track_ride', 'Track current ride in real-time', 'simple', 'screens/TrackRideScreen', 'TrackRide', '1.0.0')
ON CONFLICT (name) DO NOTHING;

-- Smart Mode Features
INSERT INTO feature_definitions (id, name, description, access_mode, component_path, router_name, introduced_in_version) VALUES
    ('feature-004', 'ai_suggestions', 'AI-powered ride suggestions and optimization', 'smart', 'screens/AISuggestionsScreen', 'AISuggestions', '1.1.0'),
    ('feature-005', 'family_assistant', 'Family and group ride management', 'smart', 'screens/FamilyAssistantScreen', 'FamilyAssistant', '1.1.0'),
    ('feature-006', 'voice_booking', 'Voice-enabled ride booking', 'smart', 'screens/VoiceBookingScreen', 'VoiceBooking', '1.1.0')
ON CONFLICT (name) DO NOTHING;

-- Pro Mode Features
INSERT INTO feature_definitions (id, name, description, access_mode, component_path, router_name, introduced_in_version) VALUES
    ('feature-007', 'fleet_management', 'Fleet operations and management console', 'pro', 'screens/FleetManagementScreen', 'FleetManagement', '1.2.0'),
    ('feature-008', 'analytics_dashboard', 'Advanced analytics and insights', 'pro', 'screens/AnalyticsDashboardScreen', 'AnalyticsDashboard', '1.2.0'),
    ('feature-009', 'corporate_billing', 'Corporate account management and billing', 'pro', 'screens/CorporateBillingScreen', 'CorporateBilling', '1.2.0')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- CREATE FUNCTION TO CHECK FEATURE ACCESS
-- ============================================================================
CREATE OR REPLACE FUNCTION check_user_feature_access(
    p_user_id VARCHAR,
    p_feature_name VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_mode VARCHAR;
    v_feature_mode VARCHAR;
    v_is_trial BOOLEAN;
    v_is_subscriber BOOLEAN;
    v_trial_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get user's current mode
    SELECT current_mode, is_pro_trial, is_pro_subscriber, pro_trial_expires_at
    INTO v_user_mode, v_is_trial, v_is_subscriber, v_trial_expires
    FROM user_mode_profiles
    WHERE user_id = p_user_id;
    
    -- If no profile exists, default to simple
    IF v_user_mode IS NULL THEN
        v_user_mode := 'simple';
    END IF;
    
    -- Get feature's access mode
    SELECT access_mode INTO v_feature_mode
    FROM feature_definitions
    WHERE name = p_feature_name AND is_deprecated = FALSE;
    
    -- Feature doesn't exist
    IF v_feature_mode IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Available to all modes
    IF v_feature_mode = 'all' THEN
        RETURN TRUE;
    END IF;
    
    -- Simple mode features are available to all
    IF v_feature_mode = 'simple' THEN
        RETURN TRUE;
    END IF;
    
    -- Smart mode features
    IF v_feature_mode = 'smart' THEN
        RETURN v_user_mode IN ('smart', 'pro');
    END IF;
    
    -- Pro mode features
    IF v_feature_mode = 'pro' THEN
        -- Must be in pro mode and have active trial or subscription
        IF v_user_mode = 'pro' THEN
            -- Check trial validity
            IF v_is_trial THEN
                IF v_trial_expires IS NOT NULL AND NOW() <= v_trial_expires THEN
                    RETURN TRUE;
                END IF;
            END IF;
            
            -- Check subscription
            IF v_is_subscriber THEN
                RETURN TRUE;
            END IF;
        END IF;
        
        RETURN FALSE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE FUNCTION TO AUTO-UPDATE TIMESTAMP
-- ============================================================================
CREATE OR REPLACE FUNCTION update_user_mode_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
DROP TRIGGER IF EXISTS trg_user_mode_updated_at ON user_mode_profiles;
CREATE TRIGGER trg_user_mode_updated_at
BEFORE UPDATE ON user_mode_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_mode_updated_at();

-- ============================================================================
-- CREATE VIEWS FOR ANALYTICS
-- ============================================================================

-- User mode distribution
CREATE OR REPLACE VIEW v_user_mode_distribution AS
SELECT
    current_mode,
    COUNT(*) as user_count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM user_mode_profiles
GROUP BY current_mode
ORDER BY user_count DESC;

-- Pro trial metrics
CREATE OR REPLACE VIEW v_pro_trial_metrics AS
SELECT
    COUNT(*) as total_trials,
    COUNT(CASE WHEN NOW() <= pro_trial_expires_at THEN 1 END) as active_trials,
    COUNT(CASE WHEN NOW() > pro_trial_expires_at THEN 1 END) as expired_trials,
    ROUND(
        100.0 * COUNT(CASE WHEN is_pro_subscriber = TRUE THEN 1 END) / 
        COUNT(*), 
        2
    ) as trial_to_subscription_rate
FROM user_mode_profiles
WHERE is_pro_trial = TRUE;

-- Pro subscribers
CREATE OR REPLACE VIEW v_pro_subscribers AS
SELECT
    id,
    user_id,
    current_mode,
    is_pro_trial,
    is_pro_subscriber,
    pro_trial_expires_at,
    pro_subscription_expires_at,
    CASE 
        WHEN is_pro_trial AND NOW() <= pro_trial_expires_at THEN 'active_trial'
        WHEN is_pro_trial AND NOW() > pro_trial_expires_at THEN 'expired_trial'
        WHEN is_pro_subscriber AND NOW() <= pro_subscription_expires_at THEN 'active_subscription'
        WHEN is_pro_subscriber AND NOW() > pro_subscription_expires_at THEN 'expired_subscription'
        ELSE 'inactive'
    END as subscription_status
FROM user_mode_profiles
WHERE is_pro_trial = TRUE OR is_pro_subscriber = TRUE;

-- Feature usage statistics
CREATE OR REPLACE VIEW v_feature_statistics AS
SELECT
    fd.name,
    fd.access_mode,
    COUNT(DISTINCT ump.user_id) as accessible_users,
    COUNT(CASE WHEN fd.access_mode = 'simple' THEN 1 END) as simple_count,
    COUNT(CASE WHEN fd.access_mode = 'smart' AND (ump.current_mode = 'smart' OR ump.current_mode = 'pro') THEN 1 END) as smart_count,
    COUNT(CASE WHEN fd.access_mode = 'pro' AND ump.current_mode = 'pro' THEN 1 END) as pro_count
FROM feature_definitions fd
LEFT JOIN user_mode_profiles ump ON TRUE
WHERE fd.is_deprecated = FALSE
GROUP BY fd.id, fd.name, fd.access_mode;

-- ============================================================================
-- GRANT PERMISSIONS (optional - for production)
-- ============================================================================
-- GRANT SELECT ON user_mode_profiles TO readonly_user;
-- GRANT SELECT ON feature_definitions TO readonly_user;
-- GRANT SELECT ON v_user_mode_distribution TO readonly_user;
-- GRANT SELECT ON v_pro_trial_metrics TO readonly_user;
-- GRANT SELECT ON v_pro_subscribers TO readonly_user;
-- GRANT SELECT ON v_feature_statistics TO readonly_user;

-- ============================================================================
-- VERIFY MIGRATION
-- ============================================================================
-- Run these queries to verify successful migration:

-- SELECT 'user_mode_profiles table' as check_name, COUNT(*) as record_count FROM user_mode_profiles
-- UNION ALL
-- SELECT 'feature_definitions table', COUNT(*) FROM feature_definitions
-- UNION ALL
-- SELECT 'Features registered', COUNT(*) FROM feature_definitions WHERE is_deprecated = FALSE;
