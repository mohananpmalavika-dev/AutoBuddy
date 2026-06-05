"""
Advanced Features Database Models
Features: Dynamic Surge Pricing, AI Dispatch, Fraud Detection, 
Driver Earnings Optimization, Women Safety, Fleet Owner Portal
"""

from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# 5. DYNAMIC SURGE PRICING MODELS
# ============================================================================

class SurgeType(str, Enum):
    RAIN = "rain"
    FESTIVAL = "festival"
    EVENT = "event"
    AIRPORT = "airport"
    DEMAND = "demand"


class WeatherCondition(BaseModel):
    """Real-time weather data for rain surge"""
    condition: str  # "clear", "rain", "heavy_rain", "thunder", "hail"
    temperature: float
    humidity: float
    wind_speed: float
    visibility: float
    rain_intensity: float  # 0-100


class RainSurgeData(BaseModel):
    """Rain-triggered surge pricing"""
    id: Optional[str] = Field(default=None, alias="_id")
    grid_latitude: float
    grid_longitude: float
    weather: WeatherCondition
    base_surge_multiplier: float  # 1.0 - 3.0
    active_from: datetime
    active_until: datetime
    rides_completed_since_rain: int = 0
    total_surge_revenue_generated: float = 0.0


class FestivalSurge(BaseModel):
    """Festival-triggered surge pricing"""
    id: Optional[str] = Field(default=None, alias="_id")
    festival_name: str
    location_center: Dict  # {"lat": float, "lon": float}
    radius_km: float  # Surge applies within radius
    surge_multiplier: float  # 1.5 - 2.5x
    active_from: datetime
    active_until: datetime
    expected_demand: str  # "low", "medium", "high", "critical"
    rides_booked: int = 0
    rides_completed: int = 0


class EventSurge(BaseModel):
    """Event-triggered surge pricing"""
    id: Optional[str] = Field(default=None, alias="_id")
    event_name: str
    venue_name: str
    location_center: Dict  # {"lat": float, "lon": float}
    radius_km: float
    surge_multiplier: float  # 1.5 - 2.5x
    active_from: datetime
    active_until: datetime
    event_capacity: int
    expected_attendees: int
    rides_needed_estimate: int


class AirportSurge(BaseModel):
    """Airport-specific surge pricing (peak arrival/departure hours)"""
    id: Optional[str] = Field(default=None, alias="_id")
    airport_code: str
    airport_name: str
    peak_arrival_hours: List[int]  # e.g., [7, 8, 9, 17, 18, 19]
    peak_departure_hours: List[int]
    surge_multiplier_arrival: float  # 1.5 - 2.0x
    surge_multiplier_departure: float
    rides_queued: int = 0
    avg_wait_time_minutes: float = 0.0


class SurgeAudit(BaseModel):
    """Audit trail for surge pricing"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    original_fare: float
    surge_multiplier: float
    surge_types_applied: List[str]  # Multiple surges can stack
    final_fare: float
    surge_revenue: float  # final_fare - original_fare
    created_at: datetime


# ============================================================================
# 6. AI DISPATCH ENGINE MODELS
# ============================================================================

class DispatchScore(BaseModel):
    """AI score for driver matching"""
    driver_id: str
    driver_name: str
    driver_rating: float  # 4.0 - 5.0
    acceptance_rate: float  # % of rides accepted
    cancellation_rate: float  # % of rides cancelled
    average_earnings_per_hour: float
    earnings_balance: float  # How much they've earned this week
    distance_from_pickup: float  # km
    predicted_arrival_time: int  # seconds
    acceptance_probability: float  # ML prediction: 0.0-1.0
    match_score: float  # Overall score: 0.0-100.0
    rank: int  # 1 = best match


class DispatchLog(BaseModel):
    """Audit trail for dispatch decisions"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    passenger_id: str
    offered_to_drivers: List[Dict]  # [{"driver_id": str, "score": float, "accepted": bool}]
    accepted_by_driver_id: str
    total_drivers_offered: int
    time_to_accept_seconds: int
    algorithm_version: str  # e.g., "v2.1-ml"
    created_at: datetime


class DriverPerformanceMetrics(BaseModel):
    """ML features for dispatch AI"""
    id: Optional[str] = Field(default=None, alias="_id")
    driver_id: str
    total_rides_completed: int
    rating: float
    acceptance_rate: float
    cancellation_rate: float
    average_rating: float
    ride_completion_time_accuracy: float  # How accurate are their ETAs
    earnings_this_week: float
    earnings_this_month: float
    preferred_zones: List[str]  # Grid zones they prefer
    peak_hours: List[int]  # Hours they're most active
    response_time_seconds: float  # Avg time to respond to offer
    vehicle_type: str
    vehicle_rating: float
    documents_verified: bool
    last_updated: datetime


class DispatchConfig(BaseModel):
    """Configuration for dispatch algorithm"""
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    distance_weight: float = 0.25  # How much to weight proximity
    rating_weight: float = 0.20
    acceptance_prob_weight: float = 0.20
    earnings_balance_weight: float = 0.15
    eta_weight: float = 0.10
    demand_forecast_weight: float = 0.10
    max_drivers_to_offer: int = 5
    min_acceptance_probability: float = 0.6
    active: bool = True
    created_at: datetime


# ============================================================================
# 7. FRAUD DETECTION MODELS
# ============================================================================

class FraudDetectionType(str, Enum):
    GPS_SPOOF = "gps_spoof"
    FAKE_BOOKING = "fake_booking"
    MULTI_ACCOUNT = "multi_account"
    SUSPICIOUS_BEHAVIOR = "suspicious_behavior"
    DRIVER_IMPERSONATION = "driver_impersonation"
    PAYMENT_FRAUD = "payment_fraud"


class GPSAnomaly(BaseModel):
    """GPS spoofing detection"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    driver_id: str
    timestamp: datetime
    reported_location: Dict  # {"lat": float, "lon": float}
    expected_location: Dict
    distance_variance_meters: float
    speed_calculated: float  # km/h based on GPS
    max_possible_speed: float  # 150 km/h assumed max
    is_anomaly: bool
    anomaly_score: float  # 0.0-1.0, >0.8 = likely spoof
    confidence: float


class FakeBookingDetector(BaseModel):
    """Detects fake/test bookings"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    passenger_id: str
    trip_source: str
    trip_destination: str
    distance_km: float
    booking_to_cancel_time_seconds: int
    cancel_reason: Optional[str]
    passenger_booking_count_today: int
    passenger_cancellation_rate: float
    is_likely_fake: bool
    fake_score: float  # 0.0-1.0, >0.7 = likely fake
    pattern_detected: Optional[str]  # e.g., "rapid_booking_cancel"
    created_at: datetime


class MultiAccountDetection(BaseModel):
    """Multi-account fraud detection"""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    phone_numbers: List[str]
    email_addresses: List[str]
    payment_methods: List[str]
    device_ids: List[str]
    ip_addresses: List[str]
    related_accounts: List[str]
    account_created_dates: List[datetime]
    is_multi_account: bool
    multi_account_score: float  # 0.0-1.0, >0.75 = likely fraud
    confidence: float
    created_at: datetime


class SuspiciousBehavior(BaseModel):
    """General suspicious behavior detection"""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    user_type: str  # "passenger" or "driver"
    behavior_type: str  # "sudden_location_change", "rapid_bookings", "unusual_payment"
    severity: str  # "low", "medium", "high", "critical"
    description: str
    timestamp: datetime
    booking_id: Optional[str]
    is_resolved: bool = False
    action_taken: Optional[str]  # "account_flagged", "manual_review", "account_suspended"


class FraudCase(BaseModel):
    """Complete fraud case record"""
    id: Optional[str] = Field(default=None, alias="_id")
    case_id: str  # FRAUD-XXXXX-YYYY
    user_id: str
    user_type: str
    fraud_types: List[str]  # Multiple types can be detected
    severity: str  # "low", "medium", "high", "critical"
    evidence: List[Dict]  # Supporting evidence records
    status: str  # "open", "under_review", "resolved", "false_positive"
    created_at: datetime
    resolved_at: Optional[datetime]
    action: Optional[str]  # "warning", "account_suspension", "refund_issued"


# ============================================================================
# 8. DRIVER EARNINGS OPTIMIZATION MODELS
# ============================================================================

class EarningsHeatmap(BaseModel):
    """Zone-based earnings data"""
    id: Optional[str] = Field(default=None, alias="_id")
    grid_latitude: float
    grid_longitude: float
    timestamp: datetime
    average_earnings_per_ride: float
    rides_completed_today: int
    rides_completed_this_week: int
    peak_hours: List[int]
    surge_count_today: int
    average_wait_time: float  # minutes
    driver_density: int


class PeakHourPrediction(BaseModel):
    """ML-based peak hour predictions"""
    id: Optional[str] = Field(default=None, alias="_id")
    zone: str  # Grid location
    date: str  # YYYY-MM-DD
    hour: int  # 0-23
    predicted_demand_score: float  # 0.0-100.0
    predicted_surge_probability: float  # 0.0-1.0
    expected_surge_multiplier: float
    recommended_driver_count: int
    predicted_earnings_per_ride: float
    predicted_rides_available: int
    confidence_level: float


class EarningsPrediction(BaseModel):
    """Personalized earnings prediction for driver"""
    id: Optional[str] = Field(default=None, alias="_id")
    driver_id: str
    date: str  # YYYY-MM-DD
    predicted_earnings_today: float
    recommended_zones: List[Dict]  # [{"zone": str, "expected_earnings": float, "peak_hours": []}]
    peak_hours_today: List[int]
    recommended_vehicle_type: str  # For fleet owners
    traffic_forecast: str  # Impact on availability
    weather_forecast: str  # Potential rain surge
    confidence: float


class DriverEarningsHistory(BaseModel):
    """Daily earnings aggregation"""
    id: Optional[str] = Field(default=None, alias="_id")
    driver_id: str
    date: str  # YYYY-MM-DD
    total_earnings: float
    rides_completed: int
    total_distance: float
    online_hours: float
    peak_hour_rides: int
    surge_rides: int
    accepted_rides: int
    cancelled_rides: int
    average_rating: float
    completion_rate: float


# ============================================================================
# 9. WOMEN SAFETY SUITE MODELS
# ============================================================================

class WomenOnlyRide(BaseModel):
    """Women-only ride options"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    passenger_id: str
    driver_id: str
    driver_gender: str  # "female"
    safety_verification_completed: bool
    trusted_contact_notified: bool
    live_tracking_enabled: bool
    emergency_alert_triggered: bool
    created_at: datetime


class TrustedContact(BaseModel):
    """Emergency contacts for women safety"""
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    contact_name: str
    contact_phone: str
    contact_email: str
    relationship: str  # "family", "friend", "colleague"
    can_receive_location: bool = True
    can_receive_alerts: bool = True
    is_primary: bool = False
    created_at: datetime


class SafetyVerification(BaseModel):
    """Driver safety verification for women-only rides"""
    id: Optional[str] = Field(default=None, alias="_id")
    driver_id: str
    verification_type: str  # "background_check", "license_verification", "video_call"
    status: str  # "pending", "verified", "failed"
    verified_at: Optional[datetime]
    verified_by: str  # Admin ID
    documents: List[str]  # Document URLs
    background_check_clean: bool
    license_valid: bool
    vehicle_documents_valid: bool
    notes: str


class EmergencyAlert(BaseModel):
    """Emergency alerts during ride"""
    id: Optional[str] = Field(default=None, alias="_id")
    booking_id: str
    user_id: str
    alert_type: str  # "safety_concern", "driver_behavior", "accident"
    severity: str  # "low", "medium", "high", "critical"
    location: Dict  # {"lat": float, "lon": float}
    description: str
    triggered_at: datetime
    authorities_notified: bool
    trusted_contacts_notified: bool
    emergency_services_called: bool
    call_recording: Optional[str]  # URL to recording
    resolved: bool
    resolution: Optional[str]


class SafetyRating(BaseModel):
    """Safety-specific ratings for drivers (separate from service rating)"""
    id: Optional[str] = Field(default=None, alias="_id")
    driver_id: str
    passenger_id: str
    booking_id: str
    safety_score: float  # 1.0-5.0
    professionalism_score: float
    vehicle_cleanliness: float
    comments: Optional[str]
    would_ride_again_with_driver: bool
    created_at: datetime


# ============================================================================
# 10. FLEET OWNER PORTAL MODELS
# ============================================================================

class FleetOwnerAccount(BaseModel):
    """Fleet owner business account"""
    id: Optional[str] = Field(default=None, alias="_id")
    owner_id: str
    company_name: str
    owner_name: str
    owner_email: str
    owner_phone: str
    company_registration_number: str
    gst_number: str
    bank_account: str
    total_vehicles: int = 0
    total_drivers: int = 0
    account_status: str  # "active", "suspended", "under_review"
    created_at: datetime
    monthly_commission_rate: float  # 15%, 18%, 20% based on volume
    total_fleet_earnings: float = 0.0
    total_commission_paid: float = 0.0


class FleetVehicle(BaseModel):
    """Vehicle under fleet owner"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str  # Fleet owner's ID
    vehicle_registration: str
    vehicle_type: str  # "economy", "comfort", "premium", "xl"
    make_model: str
    year: int
    license_plate: str
    color: str
    vin: str  # Vehicle Identification Number
    insurance_valid: bool
    insurance_expiry: datetime
    pollution_certificate_valid: bool
    pollution_certificate_expiry: datetime
    last_service_date: datetime
    mileage: float
    assigned_driver_id: Optional[str]
    status: str  # "active", "maintenance", "inactive"
    earnings_this_month: float = 0.0
    rides_completed: int = 0


class FleetDriver(BaseModel):
    """Driver assigned to fleet owner"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str  # Fleet owner's ID
    driver_id: str
    driver_name: str
    driver_phone: str
    driver_license: str
    license_expiry: datetime
    documents_verified: bool
    background_check_passed: bool
    assigned_vehicle_ids: List[str]  # Can drive multiple vehicles
    commission_split: Dict  # {"fleet": 60, "driver": 40} percentages
    status: str  # "active", "on_leave", "terminated"
    rating: float
    total_rides: int
    earnings_this_month: float
    joined_date: datetime


class FleetDriverAssignment(BaseModel):
    """Assignment of driver to vehicle"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str
    driver_id: str
    vehicle_id: str
    assigned_at: datetime
    unassigned_at: Optional[datetime]
    assignment_duration_days: int
    rides_completed: int
    earnings_generated: float


class FleetEarningsReport(BaseModel):
    """Monthly earnings report for fleet owner"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str
    report_month: str  # "YYYY-MM"
    total_rides: int
    total_earnings: float
    platform_commission: float  # AutoBuddy's cut
    fleet_net_earnings: float
    earnings_by_vehicle: List[Dict]  # Vehicle-wise breakdown
    earnings_by_driver: List[Dict]  # Driver-wise breakdown
    top_performer_driver_id: str
    top_performer_vehicle_id: str
    generated_at: datetime


class FleetPayment(BaseModel):
    """Payment settlement to fleet owner"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str
    report_month: str
    amount: float
    commission_deducted: float
    net_payout: float
    payment_status: str  # "pending", "processed", "failed"
    payment_method: str  # "bank_transfer", "check"
    reference_number: str
    processed_at: Optional[datetime]


class FleetManagementPolicy(BaseModel):
    """Policies for fleet driver behavior"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str
    min_driver_rating: float  # 4.2
    max_cancellation_rate: float  # 10%
    max_acceptance_rate_requirement: float  # 80%
    vehicle_maintenance_interval: int  # days
    insurance_validity_check: bool
    pollution_check_validity: bool
    driver_training_required: bool
    safety_score_minimum: float


class FleetAnalytics(BaseModel):
    """Analytics dashboard data for fleet owner"""
    id: Optional[str] = Field(default=None, alias="_id")
    fleet_id: str
    date: str  # YYYY-MM-DD
    total_rides: int
    total_earnings: float
    average_ride_value: float
    driver_utilization_rate: float  # % of drivers online
    vehicle_utilization_rate: float  # % of vehicles in use
    total_distance: float
    average_trip_duration: float
    peak_hours: List[int]
    active_drivers_count: int
    active_vehicles_count: int
    top_zone: str
