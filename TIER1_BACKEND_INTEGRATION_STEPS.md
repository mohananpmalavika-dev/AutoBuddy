# Integration Instructions for TIER 1 Backend Routes
# Add this to your backend/app/main.py file

# ============================================================================
# Step 1: Add Imports (at the top of main.py)
# ============================================================================

from backend.app.routers import tier1_driver_features

# ============================================================================
# Step 2: Register Router (in the app creation section)
# ============================================================================

# Add this line after your other router includes:
app.include_router(tier1_driver_features.router)

# ============================================================================
# Complete main.py Example (Relevant Sections)
# ============================================================================

"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import all routers
from backend.app.routers import (
    auth,
    bookings,
    drivers,
    passengers,
    payments,
    analytics,
    safety,
    notifications_addon,
    revenue,
    # ... other routers ...
    tier1_driver_features  # ← ADD THIS IMPORT
)

# Initialize FastAPI app
app = FastAPI(
    title="AutoBuddy API",
    description="Ride-sharing platform API",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth.router)
app.include_router(bookings.router)
app.include_router(drivers.router)
app.include_router(passengers.router)
app.include_router(payments.router)
app.include_router(analytics.router)
app.include_router(safety.router)
app.include_router(notifications_addon.router)
app.include_router(revenue.router)
# ... other routers ...
app.include_router(tier1_driver_features.router)  # ← ADD THIS LINE

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
"""

# ============================================================================
# Step 3: Run Database Migration
# ============================================================================

"""
From terminal, run:

    cd backend
    python -m app.db.migration_tier1

Or from Python:

    from backend.app.db.database import SessionLocal
    from backend.app.db.migration_tier1 import run_migration
    
    session = SessionLocal()
    run_migration(session)
"""

# ============================================================================
# Step 4: Verify Routes are Registered
# ============================================================================

"""
Run the app and check the auto-generated docs:

    cd backend
    python -m start_dev.py

Then visit:
    http://localhost:8000/docs

You should see these new endpoint groups:
    - POST /api/drivers/location (GPS update)
    - GET /api/drivers/location (Get current location)
    - GET /api/drivers/location/history (Get location history)
    - POST /api/drivers/sos (Trigger SOS)
    - POST /api/drivers/sos/{sos_id}/cancel (Cancel SOS)
    - GET /api/drivers/sos (Get SOS history)
    - POST /api/drivers/rides/{ride_id}/expenses (Add expense)
    - GET /api/drivers/rides/{ride_id}/expenses (List expenses)
    - DELETE /api/drivers/expenses/{expense_id} (Delete expense)
    - PATCH /api/drivers/expenses/{expense_id} (Update expense)
    - GET /api/drivers/expenses/summary/{ride_id} (Expense summary)
"""

# ============================================================================
# Step 5: Integration Checklist
# ============================================================================

INTEGRATION_CHECKLIST = """
Backend Integration Checklist for TIER 1 Features:

Database Setup:
□ Run migration script (migration_tier1.py)
□ Verify tables created in PostgreSQL
□ Verify indexes created
□ Update bookings table with new columns

Code Integration:
□ Add tier1_models.py to db/ folder
□ Add tier1_driver_features.py to routers/ folder
□ Import tier1_driver_features in main.py
□ Add router to app with app.include_router()

Testing:
□ Start dev server: python start_dev.py
□ Visit http://localhost:8000/docs
□ Test GPS location endpoint (POST /api/drivers/location)
□ Test SOS alert endpoint (POST /api/drivers/sos)
□ Test expense tracking endpoints
□ Verify all responses return correct status codes

API Endpoints - Ready to Test:
✅ POST /api/drivers/location - Store GPS location
✅ GET /api/drivers/location - Get latest location
✅ GET /api/drivers/location/history - Get location history
✅ POST /api/drivers/sos - Trigger SOS alert
✅ POST /api/drivers/sos/{sos_id}/cancel - Cancel SOS
✅ GET /api/drivers/sos - Get SOS alerts
✅ POST /api/drivers/rides/{ride_id}/expenses - Add expense
✅ GET /api/drivers/rides/{ride_id}/expenses - List expenses
✅ DELETE /api/drivers/expenses/{expense_id} - Remove expense
✅ PATCH /api/drivers/expenses/{expense_id} - Edit expense
✅ GET /api/drivers/expenses/summary/{ride_id} - Expense summary

Environment Variables to Configure:
- TWILIO_ACCOUNT_SID (for SOS SMS alerts)
- TWILIO_AUTH_TOKEN
- EMERGENCY_NUMBER (emergency contact)
- ADMIN_NOTIFICATION_EMAIL
- EMERGENCY_SERVICE_WEBHOOK (for authorities)

Optional: WebSocket Integration
- Add sos_alerts namespace to Socket.io
- Add location_updates namespace for real-time tracking
- Update passenger clients to subscribe to driver location events
"""

print(INTEGRATION_CHECKLIST)
