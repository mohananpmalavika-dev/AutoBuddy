#!/bin/bash
# Phase 1 PostgreSQL Setup & Seeding Script
# Location: backend/scripts/init_postgres.sh
# Purpose: Initialize PostgreSQL database with all tables and seed data

set -e

echo "=========================================="
echo "AutoBuddy Phase 1 - PostgreSQL Setup"
echo "=========================================="

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-autobuddy_phase1}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"

echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"

# Check if PostgreSQL is running
echo ""
echo "Checking PostgreSQL connection..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1" > /dev/null 2>&1 || {
    echo "ERROR: Cannot connect to PostgreSQL"
    echo "Make sure PostgreSQL is running and credentials are correct"
    exit 1
}
echo "✓ PostgreSQL is accessible"

# Create database if it doesn't exist
echo ""
echo "Creating database..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME"
echo "✓ Database created/exists"

# Run migrations
echo ""
echo "Running migrations..."

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

for migration in $(ls $MIGRATIONS_DIR/*.sql | sort); do
    echo "  Applying: $(basename $migration)"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration" > /dev/null 2>&1
done

echo "✓ All migrations applied"

# Verify tables
echo ""
echo "Verifying tables..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\dt" | grep -E "(vehicle_types|ride_products|driver_vehicle_certifications|ride_pricing_overrides|dispatch_preferences|vehicle_inventory)"

echo ""
echo "=========================================="
echo "✓ PostgreSQL Setup Complete!"
echo "=========================================="
echo ""
echo "Database is ready for Phase 1 API server"
echo ""
echo "To start the FastAPI server:"
echo "  cd backend"
echo "  uvicorn app.main:app --reload"
echo ""
