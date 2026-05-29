"""
Enterprise Features Models:
1. Airport Bookings
2. Corporate Ride Accounts
3. Multi-Stop Smart Routing
4. Live Driver Heatmap
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, Index, Enum, JSON, DECIMAL
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
import enum

Base = declarative_base()

IST_TZ = timezone(timedelta(hours=5, minutes=30))
def get_ist_now():
    return datetime.now(IST_TZ)


# ============================================================================
# 1. AIRPORT BOOKING MODULE
# ============================================================================

class AirportTerminal(Base):
    """Airport terminals for quick selection"""
    __tablename__ = "airport_terminals"

    id = Column(String, primary_key=True)
    airport_code = Column(String, nullable=False, index=True)  # "COK", "BLR", etc.
    airport_name = Column(String, nullable=False)  # "Cochin International"
    terminal_name = Column(String, nullable=False)  # "T1", "T2", etc.
    terminal_code = Column(String, nullable=False)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    pickup_zone_name = Column(String, nullable=True)  # "Domestic Pickup", "International"
    wait_time_limit_minutes = Column(Integer, default=15)  # How long driver can wait
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_ist_now)


class AirportBooking(Base):
    """Airport-specific bookings with flight tracking"""
    __tablename__ = "airport_bookings"

    id = Column(String, primary_key=True)
    booking_id = Column(String, nullable=False, unique=True, index=True)  # Link to main booking
    passenger_id = Column(String, nullable=False, index=True)
    
    # Flight details
    flight_number = Column(String, nullable=False)  # "AI101", "UK123"
    flight_status = Column(String, default="scheduled")  # scheduled, delayed, cancelled
    scheduled_arrival_time = Column(DateTime, nullable=False)
    estimated_arrival_time = Column(DateTime, nullable=False)
    actual_arrival_time = Column(DateTime, nullable=True)
    
    # Airport details
    airport_code = Column(String, nullable=False, index=True)
    terminal_id = Column(String, nullable=False)  # Reference to AirportTerminal
    pickup_zone = Column(String, nullable=False)
    
    # Service options
    meet_and_greet = Column(Boolean, default=False)
    meet_and_greet_person_name = Column(String, nullable=True)
    meet_and_greet_sign_text = Column(String, nullable=True)
    
    luggage_help = Column(Boolean, default=False)
    luggage_count = Column(Integer, nullable=True)
    
    # Pricing
    base_fare = Column(DECIMAL(10, 2), nullable=False)
    airport_fee = Column(DECIMAL(10, 2), nullable=False)
    meet_greet_fee = Column(DECIMAL(10, 2), default=0)
    total_fare = Column(DECIMAL(10, 2), nullable=False)
    
    # Driver assignment
    driver_id = Column(String, nullable=True)
    driver_arrival_time = Column(DateTime, nullable=True)
    driver_wait_start = Column(DateTime, nullable=True)
    
    # Status tracking
    status = Column(String, default="confirmed")  # confirmed, driver_assigned, arrived, completed
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)


class FlightTracker(Base):
    """Real-time flight status tracking"""
    __tablename__ = "flight_trackers"

    id = Column(String, primary_key=True)
    flight_number = Column(String, nullable=False, index=True)
    airline = Column(String, nullable=False)
    
    scheduled_arrival = Column(DateTime, nullable=False)
    estimated_arrival = Column(DateTime, nullable=True)
    actual_arrival = Column(DateTime, nullable=True)
    
    status = Column(String, default="scheduled")  # scheduled, departed, delayed, cancelled, arrived
    delay_minutes = Column(Integer, default=0)
    
    last_updated = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    data_source = Column(String)  # "flightapi", "manual", "airline"


# ============================================================================
# 2. CORPORATE RIDE ACCOUNTS
# ============================================================================

class CorporateAccount(Base):
    """Corporate/Company account management"""
    __tablename__ = "corporate_accounts"

    id = Column(String, primary_key=True)
    company_name = Column(String, nullable=False)
    registration_number = Column(String, nullable=True, unique=True)
    
    admin_email = Column(String, nullable=False, index=True)
    admin_phone = Column(String, nullable=False)
    
    headquarters_address = Column(Text, nullable=True)
    employees_count = Column(Integer, default=0)
    
    # Billing
    monthly_budget = Column(DECIMAL(12, 2), nullable=False)
    current_month_spent = Column(DECIMAL(12, 2), default=0)
    billing_cycle_start = Column(DateTime, nullable=False)
    payment_method = Column(String)  # "invoice", "card", "prepaid"
    
    # Features & Permissions
    cost_allocation_enabled = Column(Boolean, default=True)  # Department/project codes
    approval_workflow_enabled = Column(Boolean, default=False)
    expense_reports_enabled = Column(Boolean, default=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)


class EmployeeRideAccount(Base):
    """Employee accounts linked to corporate account"""
    __tablename__ = "employee_ride_accounts"

    id = Column(String, primary_key=True)
    employee_id = Column(String, nullable=False, unique=True, index=True)
    corporate_account_id = Column(String, nullable=False, index=True)
    
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=False)
    department = Column(String, nullable=True)
    cost_center = Column(String, nullable=True)
    project_code = Column(String, nullable=True)
    
    # Permissions
    daily_limit = Column(DECIMAL(10, 2), nullable=False, default=500)
    monthly_limit = Column(DECIMAL(10, 2), nullable=False, default=10000)
    
    requires_approval = Column(Boolean, default=False)
    approval_manager_id = Column(String, nullable=True)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_ist_now)


class CorporateRideRequest(Base):
    """Ride requests from corporate employees"""
    __tablename__ = "corporate_ride_requests"

    id = Column(String, primary_key=True)
    booking_id = Column(String, nullable=False, unique=True, index=True)
    corporate_account_id = Column(String, nullable=False, index=True)
    employee_id = Column(String, nullable=False, index=True)
    
    department = Column(String, nullable=True)
    cost_center = Column(String, nullable=True)
    project_code = Column(String, nullable=True)
    
    # Approval workflow
    requires_approval = Column(Boolean, default=False)
    approval_status = Column(String, default="pending")  # pending, approved, rejected
    approved_by = Column(String, nullable=True)
    approval_reason = Column(Text, nullable=True)
    
    fare = Column(DECIMAL(10, 2), nullable=False)
    is_billable = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)


class CorporateBillingReport(Base):
    """Monthly billing reports for corporates"""
    __tablename__ = "corporate_billing_reports"

    id = Column(String, primary_key=True)
    corporate_account_id = Column(String, nullable=False, index=True)
    
    billing_month = Column(String, nullable=False)  # "2026-05"
    total_rides = Column(Integer, default=0)
    total_amount = Column(DECIMAL(12, 2), default=0)
    
    department_breakdown = Column(JSON, nullable=True)  # {dept_name: amount}
    employee_breakdown = Column(JSON, nullable=True)  # {employee_id: amount}
    
    report_url = Column(String, nullable=True)  # PDF download link
    generated_at = Column(DateTime, default=get_ist_now)


# ============================================================================
# 3. MULTI-STOP SMART ROUTING
# ============================================================================

class MultiStopBooking(Base):
    """Booking with multiple stops"""
    __tablename__ = "multi_stop_bookings"

    id = Column(String, primary_key=True)
    booking_id = Column(String, nullable=False, unique=True, index=True)
    passenger_id = Column(String, nullable=False, index=True)
    
    stops_count = Column(Integer, default=2)  # Min 2, max 10
    total_distance = Column(Float, nullable=False)
    total_duration_minutes = Column(Integer, nullable=False)
    
    # Pricing
    base_fare = Column(DECIMAL(10, 2), nullable=False)
    multi_stop_fee = Column(DECIMAL(10, 2), default=0)  # Extra fee for multi-stop
    total_fare = Column(DECIMAL(10, 2), nullable=False)
    
    # Status
    current_stop_index = Column(Integer, default=0)  # 0-indexed stop number
    status = Column(String, default="pending")  # pending, accepted, in_progress, completed
    
    # Route optimization
    route_optimized = Column(Boolean, default=False)
    optimization_algorithm = Column(String, nullable=True)  # "nearest_neighbor", "tsp", "genetic"
    
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)


class RouteStop(Base):
    """Individual stops in a multi-stop route"""
    __tablename__ = "route_stops"

    id = Column(String, primary_key=True)
    multi_stop_booking_id = Column(String, nullable=False, index=True)
    
    stop_sequence = Column(Integer, nullable=False)  # 0, 1, 2, ...
    
    # Location
    location_name = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String, nullable=False)
    
    # Passenger info
    passenger_name = Column(String, nullable=True)
    passenger_phone = Column(String, nullable=True)
    delivery_instructions = Column(Text, nullable=True)
    
    # Status
    status = Column(String, default="pending")  # pending, in_progress, completed, skipped
    arrival_time = Column(DateTime, nullable=True)
    departure_time = Column(DateTime, nullable=True)
    
    # Distance from previous stop
    distance_from_previous_km = Column(Float, nullable=True)
    eta_minutes_from_previous = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now)


class RouteOptimization(Base):
    """Route optimization history and results"""
    __tablename__ = "route_optimizations"

    id = Column(String, primary_key=True)
    multi_stop_booking_id = Column(String, nullable=False, index=True)
    
    original_order = Column(JSON, nullable=False)  # [stop_ids in order]
    optimized_order = Column(JSON, nullable=False)  # [stop_ids in optimized order]
    
    optimization_time_ms = Column(Integer, nullable=False)
    algorithm_used = Column(String, nullable=False)
    
    original_distance_km = Column(Float, nullable=False)
    optimized_distance_km = Column(Float, nullable=False)
    distance_saved_km = Column(Float, nullable=False)
    
    original_time_minutes = Column(Integer, nullable=False)
    optimized_time_minutes = Column(Integer, nullable=False)
    time_saved_minutes = Column(Integer, nullable=False)
    
    cost_savings = Column(DECIMAL(10, 2), nullable=False)
    
    created_at = Column(DateTime, default=get_ist_now)


# ============================================================================
# 4. LIVE DRIVER HEATMAP
# ============================================================================

class DriverDensitySnapshot(Base):
    """Periodic snapshots of driver density/heatmap data"""
    __tablename__ = "driver_density_snapshots"

    id = Column(String, primary_key=True)
    
    # Grid-based location (0.01 degree ≈ 1km)
    grid_latitude = Column(Float, nullable=False, index=True)  # Rounded to 0.01
    grid_longitude = Column(Float, nullable=False, index=True)  # Rounded to 0.01
    
    # Metrics
    active_drivers_count = Column(Integer, default=0)
    pending_requests_count = Column(Integer, default=0)
    accepted_requests_count = Column(Integer, default=0)
    average_wait_time_seconds = Column(Integer, default=0)
    
    # Demand level
    demand_level = Column(String, default="low")  # low, medium, high, critical
    surge_multiplier = Column(Float, default=1.0)
    
    # Trend
    trend = Column(String, default="stable")  # stable, increasing, decreasing
    
    snapshot_time = Column(DateTime, default=get_ist_now, index=True)
    last_updated = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_density_grid_time', 'grid_latitude', 'grid_longitude', 'snapshot_time'),
    )


class HotspotZone(Base):
    """Identified high-demand hotspot zones"""
    __tablename__ = "hotspot_zones"

    id = Column(String, primary_key=True)
    zone_name = Column(String, nullable=False, index=True)  # "IT Park", "Airport", "Business District"
    
    # Bounding box
    north_latitude = Column(Float, nullable=False)
    south_latitude = Column(Float, nullable=False)
    east_longitude = Column(Float, nullable=False)
    west_longitude = Column(Float, nullable=False)
    
    # Characteristics
    zone_type = Column(String, nullable=False)  # "commercial", "residential", "airport", "tourist"
    avg_peak_hour_demand = Column(Integer, default=0)
    typical_surge_multiplier = Column(Float, default=1.2)
    
    peak_hours = Column(JSON, nullable=True)  # {"monday": {"start": 9, "end": 12}}
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_ist_now)


class DemandPrediction(Base):
    """Demand prediction for driver positioning"""
    __tablename__ = "demand_predictions"

    id = Column(String, primary_key=True)
    
    # Location
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    
    # Time
    prediction_for_datetime = Column(DateTime, nullable=False, index=True)
    prediction_made_at = Column(DateTime, default=get_ist_now)
    
    # Predictions
    predicted_demand_level = Column(String, default="medium")  # low, medium, high, critical
    confidence_score = Column(Float, default=0.0)  # 0.0 to 1.0
    
    recommended_driver_count = Column(Integer, default=0)
    predicted_requests_count = Column(Integer, default=0)
    
    # Model info
    model_version = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_ist_now)


class DriverPositioningRecommendation(Base):
    """AI recommendations for driver positioning"""
    __tablename__ = "driver_positioning_recommendations"

    id = Column(String, primary_key=True)
    
    # Target zone
    target_latitude = Column(Float, nullable=False)
    target_longitude = Column(Float, nullable=False)
    target_zone_name = Column(String, nullable=True)
    
    # Recommendation details
    reason = Column(String, nullable=False)  # "high_demand_predicted", "low_supply", "surge_opportunity"
    priority = Column(Integer, default=0)  # Priority score for ordering
    
    estimated_requests_in_next_hour = Column(Integer, default=0)
    estimated_earning_potential = Column(DECIMAL(10, 2), nullable=False)
    
    # For drivers
    recommended_for_driver_count = Column(Integer, default=5)
    instructions = Column(Text, nullable=True)
    
    valid_until = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=get_ist_now)
