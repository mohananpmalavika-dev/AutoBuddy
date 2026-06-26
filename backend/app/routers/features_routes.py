"""
API Routes for Passenger Features
Implements CRUD operations for all 10 features
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from typing import List, Optional
from datetime import datetime
from app.utils.time_helpers import get_ist_now
import uuid

from app.db.models_features import (
    PassengerRating, SavedPlace, PassengerPreferences, ScheduledRide,
    PaymentMethod, PassengerWallet, WalletTransaction, FavoriteDriver,
    EmergencyContact, PromoCode, PromoCodeUsage, SupportTicket, TicketMessage,
    AccessibilitySetting
)
from app.schemas.features_schemas import (
    RatingCreate, RatingUpdate, RatingResponse,
    SavedPlaceCreate, SavedPlaceResponse,
    PreferencesUpdate, PreferencesResponse,
    ScheduledRideCreate, ScheduledRideResponse,
    PaymentMethodCreate, PaymentMethodResponse,
    EmergencyContactCreate, EmergencyContactResponse,
    PromoCodeResponse, PromoCodeValidateRequest,
    SupportTicketCreate, SupportTicketResponse, TicketMessageCreate, TicketMessageResponse,
    SupportTicketStatusUpdate, AccessibilitySettingsUpdate, AccessibilitySettingsResponse
)
from app.core.auth import get_current_passenger
from app.db.database import get_db

router = APIRouter(prefix="/api/v1/passengers", tags=["passenger-features"])

PREFERENCE_EXTRA_DEFAULTS = {
    "ride_status_notifications": True,
    "driver_arrival_notification": True,
    "surge_pricing_notification": True,
    "ac_preferred": False,
    "music_preferred": False,
    "quiet_ride": False,
    "pet_friendly": False,
    "luggage_assistance": False,
    "driver_gender_preference": "any",
    "prefer_high_rated_drivers": True,
    "prefer_favorite_drivers": False,
    "avoid_previously_blocked_drivers": True,
    "wheelchair_access": False,
    "audio_navigation": False,
    "text_large": False,
    "high_contrast": False,
    "reduce_motion": False,
    "screen_reader": False,
    "haptic_feedback": True,
}


def serialize_preferences(prefs: PassengerPreferences) -> dict:
    """Return DB-backed preference columns plus flexible passenger settings."""
    try:
        data = prefs.to_dict()
    except Exception as e:
        print("serialize_preferences: prefs.to_dict() failed", str(e))
        data = {
            "id": getattr(prefs, "id", None),
            "passenger_id": getattr(prefs, "passenger_id", None),
            "push_notifications": getattr(prefs, "push_notifications", True),
            "email_notifications": getattr(prefs, "email_notifications", True),
            "sms_notifications": getattr(prefs, "sms_notifications", True),
            "promotional_offers": getattr(prefs, "promotional_offers", False),
            "default_payment_method": getattr(prefs, "default_payment_method", "wallet"),
            "save_card_details": getattr(prefs, "save_card_details", True),
            "biometric_payment": getattr(prefs, "biometric_payment", False),
            "profile_public": getattr(prefs, "profile_public", False),
            "share_location_with_driver": getattr(prefs, "share_location_with_driver", True),
            "analytics_enabled": getattr(prefs, "analytics_enabled", True),
            "language": getattr(prefs, "language", "en"),
            "timezone": getattr(prefs, "timezone", None),
            "ac_preference": getattr(prefs, "ac_preference", "cool"),
            "communication_level": getattr(prefs, "communication_level", "normal"),
            "vehicle_type_preference": getattr(prefs, "vehicle_type_preference", None),
            "additional_settings": getattr(prefs, "additional_settings", {}) or {},
        }

    extra_settings = getattr(prefs, "additional_settings", {}) or {}
    if not isinstance(extra_settings, dict):
        extra_settings = {}
    return {
        **PREFERENCE_EXTRA_DEFAULTS,
        **data,
        **extra_settings,
        "timezone": data.get("timezone") or extra_settings.get("timezone") or "local",
    }


# ============================================================================
# Feature #2: Ratings
# ============================================================================

@router.post("/ratings", response_model=RatingResponse)
def submit_rating(
    rating: RatingCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Submit a rating for a driver after a trip"""
    rating_obj = PassengerRating(
        id=f"rating-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        driver_id=rating.driver_id,
        booking_id=rating.booking_id,
        score=rating.score,
        feedback=rating.feedback
    )
    db.add(rating_obj)
    db.commit()
    db.refresh(rating_obj)
    return rating_obj


@router.get("/ratings", response_model=List[RatingResponse])
def get_passenger_ratings(
    current_passenger: dict = Depends(get_current_passenger),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all ratings given by passenger"""
    ratings = db.query(PassengerRating)\
        .filter(PassengerRating.passenger_id == current_passenger["id"])\
        .offset(skip).limit(limit).all()
    return ratings


@router.get("/ratings/{rating_id}", response_model=RatingResponse)
def get_rating(
    rating_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get a specific rating"""
    rating = db.query(PassengerRating).filter(
        PassengerRating.id == rating_id,
        PassengerRating.passenger_id == current_passenger["id"]
    ).first()
    
    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")
    return rating


@router.patch("/ratings/{rating_id}", response_model=RatingResponse)
def update_rating(
    rating_id: str,
    rating_update: RatingUpdate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update an existing rating owned by the passenger"""
    rating = db.query(PassengerRating).filter(
        PassengerRating.id == rating_id,
        PassengerRating.passenger_id == current_passenger["id"]
    ).first()

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    update_data = rating_update.dict(exclude_unset=True)
    if "score" in update_data and update_data["score"] is not None:
        rating.score = update_data["score"]
    if "feedback" in update_data:
        rating.feedback = update_data["feedback"]

    db.commit()
    db.refresh(rating)
    return rating


@router.delete("/ratings/{rating_id}")
def delete_rating(
    rating_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Delete a rating"""
    rating = db.query(PassengerRating).filter(
        PassengerRating.id == rating_id,
        PassengerRating.passenger_id == current_passenger["id"]
    ).first()
    
    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")
    
    db.delete(rating)
    db.commit()
    return {"message": "Rating deleted"}


# ============================================================================
# Feature #3: Saved Places
# ============================================================================

@router.post("/saved-places", response_model=SavedPlaceResponse)
def create_saved_place(
    place: SavedPlaceCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Create a new saved place"""
    saved_place = SavedPlace(
        id=f"place-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        name=place.name,
        address=place.address,
        place_type=place.place_type,
        latitude=place.latitude,
        longitude=place.longitude,
        is_favorite=place.is_favorite or False,
        is_primary=place.is_primary or False
    )
    db.add(saved_place)
    db.commit()
    db.refresh(saved_place)
    return saved_place


@router.get("/saved-places", response_model=List[SavedPlaceResponse])
def get_saved_places(
    current_passenger: dict = Depends(get_current_passenger),
    place_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all saved places for passenger"""
    query = db.query(SavedPlace).filter(SavedPlace.passenger_id == current_passenger["id"])
    
    if place_type:
        query = query.filter(SavedPlace.place_type == place_type)
    
    places = query.offset(skip).limit(limit).all()
    return places


@router.put("/saved-places/{place_id}", response_model=SavedPlaceResponse)
def update_saved_place(
    place_id: str,
    place_update: SavedPlaceCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update a saved place"""
    place = db.query(SavedPlace).filter(
        SavedPlace.id == place_id,
        SavedPlace.passenger_id == current_passenger["id"]
    ).first()
    
    if not place:
        raise HTTPException(status_code=404, detail="Saved place not found")
    
    place.name = place_update.name
    place.address = place_update.address
    place.place_type = place_update.place_type
    place.latitude = place_update.latitude
    place.longitude = place_update.longitude
    place.is_favorite = place_update.is_favorite or False
    place.is_primary = place_update.is_primary or False
    
    db.commit()
    db.refresh(place)
    return place


@router.delete("/saved-places/{place_id}")
def delete_saved_place(
    place_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Delete a saved place"""
    place = db.query(SavedPlace).filter(
        SavedPlace.id == place_id,
        SavedPlace.passenger_id == current_passenger["id"]
    ).first()
    
    if not place:
        raise HTTPException(status_code=404, detail="Saved place not found")
    
    db.delete(place)
    db.commit()
    return {"message": "Saved place deleted"}


# ============================================================================
# Feature #4: Preferences
# ============================================================================

@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get passenger preferences"""
    try:
        if not current_passenger or not current_passenger.get("id"):
            raise HTTPException(status_code=401, detail="Passenger ID not found in token")
        
        passenger_id = current_passenger["id"]
        
        prefs = None
        try:
            prefs = db.query(PassengerPreferences).filter(
                PassengerPreferences.passenger_id == passenger_id
            ).first()
        except Exception as e:
            # Guard against missing DB columns or schema/runtime issues.
            print("Preferences DB query error:", str(e))
            import traceback
            print(traceback.format_exc())
            prefs = None
        
        if not prefs:
            # Create default in-memory preferences without raising 500.
            prefs = PassengerPreferences(
                id=f"prefs-{uuid.uuid4()}",
                passenger_id=passenger_id
            )
            try:
                db.add(prefs)
                db.commit()
                db.refresh(prefs)
            except Exception as e:
                print("Preferences DB create/commit error:", str(e))
                print(traceback.format_exc())
                # Fall back to in-memory defaults on DB failure
                prefs = PassengerPreferences(
                    id=f"prefs-{uuid.uuid4()}",
                    passenger_id=passenger_id
                )
        
        return serialize_preferences(prefs)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Unhandled error in get_preferences: {str(e)}")
        print(traceback.format_exc())
        # Fall back to safe defaults rather than returning 500.
        return serialize_preferences(PassengerPreferences(
            id=f"prefs-{uuid.uuid4()}",
            passenger_id=current_passenger.get("id") if current_passenger else "unknown"
        ))


@router.patch("/preferences", response_model=PreferencesResponse)
def update_preferences(
    prefs_update: PreferencesUpdate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update passenger preferences"""
    prefs = None
    try:
        prefs = db.query(PassengerPreferences)\
            .filter(PassengerPreferences.passenger_id == current_passenger["id"]).first()
    except Exception as e:
        print("Preferences DB query error on PATCH:", str(e))
        import traceback
        print(traceback.format_exc())
        prefs = None
    
    if not prefs:
        prefs = PassengerPreferences(
            id=f"prefs-{uuid.uuid4()}",
            passenger_id=current_passenger["id"]
        )
        try:
            db.add(prefs)
            db.commit()
            db.refresh(prefs)
        except Exception as e:
            print("Preferences DB create/commit error on PATCH:", str(e))
            import traceback
            print(traceback.format_exc())
            prefs = PassengerPreferences(
                id=f"prefs-{uuid.uuid4()}",
                passenger_id=current_passenger["id"]
            )

    update_data = prefs_update.dict(exclude_unset=True)
    additional_settings = dict(getattr(prefs, "additional_settings", {}) or {})
    for field, value in update_data.items():
        if hasattr(prefs, field):
            try:
                setattr(prefs, field, value)
            except Exception as e:
                print(f"Failed to set preference field {field}: {str(e)}")
                additional_settings[field] = value
        else:
            additional_settings[field] = value
    prefs.additional_settings = additional_settings

    try:
        db.commit()
        db.refresh(prefs)
    except Exception as e:
        print("Preferences DB commit/refresh error on PATCH:", str(e))
        import traceback
        print(traceback.format_exc())
        # Fall back to existing in-memory prefs if DB write fails
        prefs = PassengerPreferences(
            id=getattr(prefs, "id", f"prefs-{uuid.uuid4()}"),
            passenger_id=current_passenger["id"]
        )
        prefs.additional_settings = additional_settings

    return serialize_preferences(prefs)


# ============================================================================
# Feature #5: Scheduled Rides
# ============================================================================

SCHEDULED_RIDES_DEPRECATED_DETAIL = (
    "Scheduled rides are managed as real bookings now. Use /api/bookings "
    "with ride_product='scheduled' and scheduled_for, then read scheduled "
    "rides from /api/bookings."
)


def raise_scheduled_rides_deprecated():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=SCHEDULED_RIDES_DEPRECATED_DETAIL,
    )


@router.post("/scheduled-rides", response_model=ScheduledRideResponse)
def create_scheduled_ride(
    ride: ScheduledRideCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Deprecated: scheduled rides must be created as dispatchable bookings."""
    _ = ride, current_passenger, db
    raise_scheduled_rides_deprecated()


@router.get("/scheduled-rides", response_model=List[ScheduledRideResponse])
def get_scheduled_rides(
    current_passenger: dict = Depends(get_current_passenger),
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Deprecated: scheduled ride lists come from booking history now."""
    _ = current_passenger, status, skip, limit, db
    raise_scheduled_rides_deprecated()


@router.patch("/scheduled-rides/{ride_id}", response_model=ScheduledRideResponse)
def update_scheduled_ride(
    ride_id: str,
    ride_update: ScheduledRideCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Deprecated: scheduled bookings should be cancelled/rebooked via /api/bookings."""
    _ = ride_id, ride_update, current_passenger, db
    raise_scheduled_rides_deprecated()


@router.delete("/scheduled-rides/{ride_id}")
def cancel_scheduled_ride(
    ride_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Deprecated: cancel scheduled bookings through /api/bookings/{id}/cancel."""
    _ = ride_id, current_passenger, db
    raise_scheduled_rides_deprecated()


# ============================================================================
# Feature #6: Payment Methods
# ============================================================================

@router.post("/payment-methods", response_model=PaymentMethodResponse)
def add_payment_method(
    method: PaymentMethodCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Add a new payment method"""
    payment_method = PaymentMethod(
        id=f"payment-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        method_type=method.method_type,
        card_last_four=method.card_last_four,
        card_brand=method.card_brand,
        card_expiry=method.card_expiry,
        upi_id=method.upi_id,
        bank_name=method.bank_name,
        is_default=method.is_default or False
    )
    
    # If this is default, unset other defaults
    if payment_method.is_default:
        db.query(PaymentMethod)\
            .filter(
                PaymentMethod.passenger_id == current_passenger["id"],
                PaymentMethod.is_default == True
            ).update({"is_default": False})
    
    db.add(payment_method)
    db.commit()
    db.refresh(payment_method)
    return payment_method


@router.get("/payment-methods", response_model=List[PaymentMethodResponse])
def get_payment_methods(
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get all payment methods"""
    methods = db.query(PaymentMethod)\
        .filter(PaymentMethod.passenger_id == current_passenger["id"]).all()
    return methods


@router.delete("/payment-methods/{method_id}")
def remove_payment_method(
    method_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Remove a payment method"""
    method = db.query(PaymentMethod).filter(
        PaymentMethod.id == method_id,
        PaymentMethod.passenger_id == current_passenger["id"]
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    db.delete(method)
    db.commit()
    return {"message": "Payment method removed"}


# ============================================================================
# Feature #7: Favorites & Emergency Contacts
# ============================================================================

@router.post("/emergency-contacts", response_model=EmergencyContactResponse)
def add_emergency_contact(
    contact: EmergencyContactCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Add an emergency contact"""
    emergency_contact = EmergencyContact(
        id=f"emergency-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        contact_name=contact.contact_name,
        phone_number=contact.phone_number,
        relation=contact.relation,
        is_primary=contact.is_primary or False,
        notify_on_rides=contact.notify_on_rides or False
    )
    db.add(emergency_contact)
    db.commit()
    db.refresh(emergency_contact)
    return emergency_contact


@router.get("/emergency-contacts", response_model=List[EmergencyContactResponse])
def get_emergency_contacts(
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get all emergency contacts"""
    contacts = db.query(EmergencyContact)\
        .filter(EmergencyContact.passenger_id == current_passenger["id"]).all()
    return contacts


@router.delete("/emergency-contacts/{contact_id}")
def remove_emergency_contact(
    contact_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Remove an emergency contact"""
    contact = db.query(EmergencyContact).filter(
        EmergencyContact.id == contact_id,
        EmergencyContact.passenger_id == current_passenger["id"]
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    
    db.delete(contact)
    db.commit()
    return {"message": "Emergency contact removed"}


# ============================================================================
# Feature #8: Promo Codes
# ============================================================================

@router.get("/promo-codes", response_model=List[PromoCodeResponse])
def get_available_promo_codes(
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get active promo codes visible to the passenger"""
    now = get_ist_now()
    promos = db.query(PromoCode).filter(
        PromoCode.is_active == True,
        PromoCode.valid_from <= now,
        PromoCode.valid_until >= now
    ).order_by(PromoCode.valid_until.asc()).limit(20).all()
    return promos


@router.post("/promo-codes/validate", response_model=PromoCodeResponse)
def validate_promo_code(
    request: PromoCodeValidateRequest,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Validate and apply a promo code"""
    promo = db.query(PromoCode).filter(
        PromoCode.code.ilike(request.code),
        PromoCode.is_active == True,
        PromoCode.valid_from <= get_ist_now(),
        PromoCode.valid_until >= get_ist_now()
    ).first()
    
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found or expired")
    
    # Check usage limits
    if promo.usage_limit:
        current_usage = db.query(PromoCodeUsage).filter(
            PromoCodeUsage.promo_code_id == promo.id
        ).count()
        
        if current_usage >= promo.usage_limit:
            raise HTTPException(status_code=400, detail="Promo code usage limit exceeded")
    
    # Check per-user usage
    user_usage = db.query(PromoCodeUsage).filter(
        PromoCodeUsage.promo_code_id == promo.id,
        PromoCodeUsage.passenger_id == current_passenger["id"]
    ).count()
    
    if user_usage >= promo.usage_per_user:
        raise HTTPException(status_code=400, detail="You have already used this promo code")
    
    # Check minimum fare
    if request.ride_fare < promo.min_ride_fare:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum ride fare ₹{promo.min_ride_fare} required"
        )
    
    return promo


# ============================================================================
# Feature #9: Support Tickets
# ============================================================================

@router.post("/support/tickets", response_model=SupportTicketResponse)
def create_support_ticket(
    ticket: SupportTicketCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Create a new support ticket"""
    support_ticket = SupportTicket(
        id=f"ticket-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        subject=ticket.subject,
        description=ticket.description,
        category=ticket.category,
        priority=ticket.priority or "normal"
    )
    
    db.add(support_ticket)
    db.commit()
    db.refresh(support_ticket)
    return support_ticket


@router.get("/support/tickets", response_model=List[SupportTicketResponse])
def get_support_tickets(
    current_passenger: dict = Depends(get_current_passenger),
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all support tickets for passenger"""
    query = db.query(SupportTicket).filter(SupportTicket.passenger_id == current_passenger["id"])
    
    if status:
        query = query.filter(SupportTicket.status == status)
    
    tickets = query.offset(skip).limit(limit).all()
    return tickets


@router.get("/support/tickets/{ticket_id}/messages", response_model=List[TicketMessageResponse])
def get_ticket_messages(
    ticket_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get messages for a support ticket"""
    ticket = db.query(SupportTicket).filter(
        SupportTicket.id == ticket_id,
        SupportTicket.passenger_id == current_passenger["id"]
    ).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")

    return db.query(TicketMessage).filter(
        TicketMessage.ticket_id == ticket_id
    ).order_by(TicketMessage.created_at.asc()).all()


@router.post("/support/tickets/{ticket_id}/messages", response_model=TicketMessageResponse)
def add_ticket_message(
    ticket_id: str,
    message: TicketMessageCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Add a message to a support ticket"""
    ticket = db.query(SupportTicket).filter(
        SupportTicket.id == ticket_id,
        SupportTicket.passenger_id == current_passenger["id"]
    ).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    
    ticket_msg = TicketMessage(
        id=f"msg-{uuid.uuid4()}",
        ticket_id=ticket_id,
        sender_type="passenger",
        sender_id=current_passenger["id"],
        sender_name=current_passenger.get("name", "Passenger"),
        message_text=message.message_text,
        attachment_url=message.attachment_url
    )
    
    db.add(ticket_msg)
    ticket.updated_at = get_ist_now()
    db.commit()
    db.refresh(ticket_msg)
    
    return ticket_msg


@router.patch("/support/tickets/{ticket_id}/status", response_model=SupportTicketResponse)
def update_support_ticket_status(
    ticket_id: str,
    status_update: SupportTicketStatusUpdate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Allow a passenger to close or reopen their own support ticket"""
    allowed_statuses = {"open", "in_progress", "waiting_for_user", "resolved", "closed"}
    if status_update.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid ticket status")

    ticket = db.query(SupportTicket).filter(
        SupportTicket.id == ticket_id,
        SupportTicket.passenger_id == current_passenger["id"]
    ).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")

    ticket.status = status_update.status
    ticket.updated_at = get_ist_now()
    if status_update.status in {"resolved", "closed"}:
        ticket.resolved_at = ticket.updated_at
    db.commit()
    db.refresh(ticket)
    return ticket


# ============================================================================
# Feature #10: Accessibility Settings
# ============================================================================

@router.get("/accessibility", response_model=AccessibilitySettingsResponse)
def get_accessibility_settings(
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Get accessibility settings"""
    settings = db.query(AccessibilitySetting)\
        .filter(AccessibilitySetting.passenger_id == current_passenger["id"]).first()
    
    if not settings:
        # Create default settings if not exist
        settings = AccessibilitySetting(
            id=f"a11y-{uuid.uuid4()}",
            passenger_id=current_passenger["id"]
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


@router.patch("/accessibility", response_model=AccessibilitySettingsResponse)
def update_accessibility_settings(
    settings_update: AccessibilitySettingsUpdate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update accessibility settings"""
    settings = db.query(AccessibilitySetting)\
        .filter(AccessibilitySetting.passenger_id == current_passenger["id"]).first()
    
    if not settings:
        settings = AccessibilitySetting(
            id=f"a11y-{uuid.uuid4()}",
            passenger_id=current_passenger["id"]
        )
        db.add(settings)
    
    # Update only provided fields
    update_data = settings_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(settings, field):
            setattr(settings, field, value)
    
    db.commit()
    db.refresh(settings)
    return settings
