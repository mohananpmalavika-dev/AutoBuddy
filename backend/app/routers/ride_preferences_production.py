"""
Ride Preferences API - Production Implementation
Endpoints for managing passenger ride preferences (music, temperature, communication, vehicle type)
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.models_features import PassengerPreferences
from app.db.deps import get_db
from app.utils.rbac import get_current_user_secure
from app.schemas.ride_preferences_schema import RidePreferencesRequest, RidePreferencesResponse, RidePreferenceSummary
from app.utils.time_helpers import get_ist_now

router = APIRouter(prefix="/api/v3/preferences", tags=["ride-preferences"])

# ============================================================================
# SERVICE FUNCTIONS
# ============================================================================

async def get_or_create_preferences(db: Session, passenger_id: str) -> PassengerPreferences:
    """Get existing preferences or create default preferences for passenger"""
    stmt = select(PassengerPreferences).where(PassengerPreferences.passenger_id == passenger_id)
    prefs = db.execute(stmt).scalar_one_or_none()

    if not prefs:
        prefs = PassengerPreferences(
            id=str(uuid.uuid4()),
            passenger_id=passenger_id,
            music_preference="neutral",
            ac_preference="cool",
            communication_level="normal",
            vehicle_type_preference=None,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return prefs


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/ride/{passenger_id}", response_model=RidePreferencesResponse)
async def get_ride_preferences(
    passenger_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get passenger's ride preferences"""
    # Verify user is requesting their own preferences or is admin
    if user["id"] != passenger_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    prefs = await get_or_create_preferences(db, passenger_id)
    return RidePreferencesResponse(
        passenger_id=prefs.passenger_id,
        music_preference=prefs.music_preference,
        ac_preference=prefs.ac_preference,
        communication_level=prefs.communication_level,
        vehicle_type_preference=prefs.vehicle_type_preference.split(',') if prefs.vehicle_type_preference else None,
    )


@router.patch("/ride/{passenger_id}", response_model=RidePreferencesResponse)
async def update_ride_preferences(
    passenger_id: str,
    request: RidePreferencesRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Update passenger's ride preferences"""
    # Verify user is updating their own preferences or is admin
    if user["id"] != passenger_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    prefs = await get_or_create_preferences(db, passenger_id)

    # Update preferences
    prefs.music_preference = request.music_preference
    prefs.ac_preference = request.ac_preference
    prefs.communication_level = request.communication_level
    prefs.vehicle_type_preference = ','.join(request.vehicle_type_preference) if request.vehicle_type_preference else None
    prefs.updated_at = get_ist_now()

    db.commit()
    db.refresh(prefs)

    return RidePreferencesResponse(
        passenger_id=prefs.passenger_id,
        music_preference=prefs.music_preference,
        ac_preference=prefs.ac_preference,
        communication_level=prefs.communication_level,
        vehicle_type_preference=prefs.vehicle_type_preference.split(',') if prefs.vehicle_type_preference else None,
    )


@router.post("/ride/{passenger_id}/reset")
async def reset_ride_preferences(
    passenger_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Reset ride preferences to defaults"""
    if user["id"] != passenger_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    prefs = await get_or_create_preferences(db, passenger_id)

    # Reset to defaults
    prefs.music_preference = "neutral"
    prefs.ac_preference = "cool"
    prefs.communication_level = "normal"
    prefs.vehicle_type_preference = None
    prefs.updated_at = get_ist_now()

    db.commit()
    db.refresh(prefs)

    return {
        "message": "Preferences reset to defaults",
        "passenger_id": passenger_id,
        "preferences": RidePreferencesResponse(
            passenger_id=prefs.passenger_id,
            music_preference=prefs.music_preference,
            ac_preference=prefs.ac_preference,
            communication_level=prefs.communication_level,
            vehicle_type_preference=None,
        ),
    }


@router.get("/ride/{passenger_id}/summary", response_model=RidePreferenceSummary)
async def get_ride_preferences_summary(
    passenger_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get quick summary of ride preferences for display"""
    if user["id"] != passenger_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    prefs = await get_or_create_preferences(db, passenger_id)

    return RidePreferenceSummary(
        music=prefs.music_preference,
        temperature=prefs.ac_preference,
        communication=prefs.communication_level,
        vehicles=prefs.vehicle_type_preference.split(',') if prefs.vehicle_type_preference else None,
    )
