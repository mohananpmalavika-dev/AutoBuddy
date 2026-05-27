"""
API Routes for Passenger Features
Implements CRUD operations for all 10 features
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from app.db.models_features import (
    PassengerRating, SavedPlace, PassengerPreferences, ScheduledRide,
    PaymentMethod, PassengerWallet, WalletTransaction, FavoriteDriver,
    EmergencyContact, PromoCode, PromoCodeUsage, SupportTicket, TicketMessage,
    AccessibilitySetting
)
from app.schemas.features_schemas import (
    RatingCreate, RatingResponse,
    SavedPlaceCreate, SavedPlaceResponse,
    PreferencesUpdate, PreferencesResponse,
    ScheduledRideCreate, ScheduledRideResponse,
    PaymentMethodCreate, PaymentMethodResponse,
    EmergencyContactCreate, EmergencyContactResponse,
    PromoCodeResponse, PromoCodeValidateRequest,
    SupportTicketCreate, SupportTicketResponse, TicketMessageCreate,
    AccessibilitySettingsUpdate, AccessibilitySettingsResponse
)
from app.core.auth import get_current_passenger
from app.db.database import get_db

router = APIRouter(prefix="/api/v1/passengers", tags=["passenger-features"])


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
    prefs = db.query(PassengerPreferences)\
        .filter(PassengerPreferences.passenger_id == current_passenger["id"]).first()
    
    if not prefs:
        # Create default preferences if not exist
        prefs = PassengerPreferences(
            id=f"prefs-{uuid.uuid4()}",
            passenger_id=current_passenger["id"]
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    
    return prefs


@router.patch("/preferences", response_model=PreferencesResponse)
def update_preferences(
    prefs_update: PreferencesUpdate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update passenger preferences"""
    prefs = db.query(PassengerPreferences)\
        .filter(PassengerPreferences.passenger_id == current_passenger["id"]).first()
    
    if not prefs:
        prefs = PassengerPreferences(
            id=f"prefs-{uuid.uuid4()}",
            passenger_id=current_passenger["id"]
        )
        db.add(prefs)
    
    # Update only provided fields
    update_data = prefs_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(prefs, field):
            setattr(prefs, field, value)
    
    db.commit()
    db.refresh(prefs)
    return prefs


# ============================================================================
# Feature #5: Scheduled Rides
# ============================================================================

@router.post("/scheduled-rides", response_model=ScheduledRideResponse)
def create_scheduled_ride(
    ride: ScheduledRideCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Create a new scheduled ride"""
    scheduled_ride = ScheduledRide(
        id=f"sched-ride-{uuid.uuid4()}",
        passenger_id=current_passenger["id"],
        pickup_location=ride.pickup_location,
        pickup_latitude=ride.pickup_latitude,
        pickup_longitude=ride.pickup_longitude,
        dropoff_location=ride.dropoff_location,
        dropoff_latitude=ride.dropoff_latitude,
        dropoff_longitude=ride.dropoff_longitude,
        scheduled_time=ride.scheduled_time,
        ride_type=ride.ride_type,
        notes=ride.notes,
        recurring=ride.recurring or False,
        recurrence_pattern=ride.recurrence_pattern
    )
    db.add(scheduled_ride)
    db.commit()
    db.refresh(scheduled_ride)
    return scheduled_ride


@router.get("/scheduled-rides", response_model=List[ScheduledRideResponse])
def get_scheduled_rides(
    current_passenger: dict = Depends(get_current_passenger),
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get scheduled rides for passenger"""
    query = db.query(ScheduledRide).filter(ScheduledRide.passenger_id == current_passenger["id"])
    
    if status:
        query = query.filter(ScheduledRide.status == status)
    
    rides = query.offset(skip).limit(limit).all()
    return rides


@router.patch("/scheduled-rides/{ride_id}", response_model=ScheduledRideResponse)
def update_scheduled_ride(
    ride_id: str,
    ride_update: ScheduledRideCreate,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Update a scheduled ride"""
    ride = db.query(ScheduledRide).filter(
        ScheduledRide.id == ride_id,
        ScheduledRide.passenger_id == current_passenger["id"]
    ).first()
    
    if not ride:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")
    
    ride.pickup_location = ride_update.pickup_location
    ride.dropoff_location = ride_update.dropoff_location
    ride.scheduled_time = ride_update.scheduled_time
    ride.notes = ride_update.notes
    
    db.commit()
    db.refresh(ride)
    return ride


@router.delete("/scheduled-rides/{ride_id}")
def cancel_scheduled_ride(
    ride_id: str,
    current_passenger: dict = Depends(get_current_passenger),
    db: Session = Depends(get_db)
):
    """Cancel a scheduled ride"""
    ride = db.query(ScheduledRide).filter(
        ScheduledRide.id == ride_id,
        ScheduledRide.passenger_id == current_passenger["id"]
    ).first()
    
    if not ride:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")
    
    ride.status = "cancelled"
    db.commit()
    return {"message": "Scheduled ride cancelled"}


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
        PromoCode.valid_from <= datetime.utcnow(),
        PromoCode.valid_until >= datetime.utcnow()
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


@router.post("/support/tickets/{ticket_id}/messages")
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
    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket_msg)
    
    return {"message": "Message added to ticket"}


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
