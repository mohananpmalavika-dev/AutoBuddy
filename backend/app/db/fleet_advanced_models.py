"""
Fleet Owner Portal - Advanced Models for Uber/Ola Level Features

Features:
1. Fleet Dashboard & KPIs
2. Fleet Wallet & Settlements
3. Driver Assignment System
4. Driver Attendance & Performance
5. Fleet Incentive Management
6. Live Fleet Tracking & Heatmaps
7. Revenue Forecasting
8. AI Fleet Optimization
9. Role-Based Access
10. Bulk Operations
"""

from datetime import datetime
from .models_features import get_ist_now, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# 1. FLEET DASHBOARD & KPIs
# ============================================================================

class FleetHealthStatus(str, Enum):
    EXCELLENT = "excellent"      # 90-100% KPIs
    GOOD = "good"                # 75-89%
    FAIR = "fair"                # 60-74%
    POOR = "poor"                # <60%


class FleetKPIMetrics(BaseModel):
    """Fleet-wide performance metrics"""
    fleet_id: str
    
    # Vehicle metrics
    total_vehicles: int = 0
    active_vehicles: int = 0
    inactive_vehicles: int = 0
    vehicle_utilization: float = 0.0  # percentage
    vehicle_health_score: float = 0.0  # 0-100
    
    # Driver metrics
    total_drivers: int = 0
    active_drivers: int = 0
    offline_drivers: int = 0
    driver_availability: float = 0.0  # percentage
    avg_driver_rating: float = 4.5
    
    # Operations metrics
    total_rides_today: int = 0
    total_earnings_today: float = 0.0
    avg_acceptance_rate: float = 0.0  # percentage
    avg_completion_rate: float = 0.0  # percentage
    avg_cancellation_rate: float = 0.0  # percentage
    
    # Health indicators
    health_status: FleetHealthStatus = FleetHealthStatus.GOOD
    health_score: float = 85.0  # 0-100
    red_flags: List[str] = []  # Issues requiring attention
    
    created_at: datetime = Field(default_factory=get_ist_now)
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "fleet_id": "FLEET_123",
                "total_vehicles": 50,
                "active_vehicles": 45,
                "vehicle_health_score": 92.5,
                "total_drivers": 60,
                "active_drivers": 48,
                "avg_driver_rating": 4.7,
                "health_status": "good",
                "health_score": 88.5
            }
        }


class FleetHealthSnapshot(BaseModel):
    """Historical health snapshots for trends"""
    fleet_id: str
    health_score: float
    vehicle_utilization: float
    driver_availability: float
    avg_rating: float
    acceptance_rate: float
    timestamp: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 2. FLEET WALLET & SETTLEMENTS
# ============================================================================

class SettlementStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class FleetWallet(BaseModel):
    """Fleet owner's central wallet"""
    fleet_id: str
    
    # Current balance
    total_earnings: float = 0.0
    pending_amount: float = 0.0  # Awaiting settlement
    available_balance: float = 0.0  # Can withdraw
    
    # Deductions
    total_commission_paid: float = 0.0
    total_driver_payouts: float = 0.0
    total_withdrawals: float = 0.0
    
    # Settings
    settlement_frequency: str = "weekly"  # daily, weekly, monthly
    last_settlement_date: Optional[datetime] = None
    next_settlement_date: Optional[datetime] = None
    
    updated_at: datetime = Field(default_factory=get_ist_now)


class FleetSettlement(BaseModel):
    """Settlement record"""
    settlement_id: str
    fleet_id: str
    
    # Earnings
    total_rides: int
    gross_earnings: float
    platform_commission: float
    commission_percentage: float
    net_earnings: float
    
    # Deductions
    maintenance_deduction: float = 0.0
    insurance_deduction: float = 0.0
    other_deductions: float = 0.0
    
    # Driver payouts
    driver_payouts_total: float
    drivers_paid: int
    
    # Settlement details
    settlement_period_start: datetime
    settlement_period_end: datetime
    settlement_date: datetime
    status: SettlementStatus = SettlementStatus.PENDING
    
    created_at: datetime = Field(default_factory=get_ist_now)


class FleetWithdrawal(BaseModel):
    """Withdrawal request from fleet wallet"""
    withdrawal_id: str
    fleet_id: str
    
    amount: float
    withdrawal_method: str  # "bank_transfer", "upi", "wallet"
    bank_account: Optional[Dict[str, Any]] = None
    
    status: str = "pending"  # pending, processing, completed, failed
    requested_at: datetime = Field(default_factory=get_ist_now)
    processed_at: Optional[datetime] = None
    
    reference_number: Optional[str] = None
    failure_reason: Optional[str] = None


class DriverPayout(BaseModel):
    """Individual driver payout from fleet"""
    payout_id: str
    fleet_id: str
    driver_id: str
    
    period_start: datetime
    period_end: datetime
    
    total_earnings: float
    platform_commission: float
    net_amount: float
    
    # Driver deductions
    fuel_advance_repaid: float = 0.0
    damaged_vehicle_charges: float = 0.0
    other_charges: float = 0.0
    
    # Final amount to driver
    final_payout: float
    
    payment_status: str = "pending"
    paid_via: Optional[str] = None
    paid_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 3. DRIVER ASSIGNMENT SYSTEM
# ============================================================================

class DriverAssignmentStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TRANSFERRED = "transferred"
    REPLACED = "replaced"


class FleetDriverAssignment(BaseModel):
    """Assign driver to fleet"""
    assignment_id: str
    fleet_id: str
    driver_id: str
    vehicle_id: str
    
    # Assignment details
    assignment_date: datetime
    status: DriverAssignmentStatus = DriverAssignmentStatus.ACTIVE
    
    # Shift timings
    assigned_shift: str  # "morning", "afternoon", "evening", "night", "full_day"
    shift_start_time: Optional[str] = None  # HH:MM format
    shift_end_time: Optional[str] = None
    
    # Performance tracking
    total_rides_assigned: int = 0
    completed_rides: int = 0
    cancelled_rides: int = 0
    
    # Deactivation details
    reason_for_reassignment: Optional[str] = None
    reassigned_to_driver_id: Optional[str] = None
    reassignment_date: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)
    updated_at: datetime = Field(default_factory=get_ist_now)


class DriverReassignmentRequest(BaseModel):
    """Request to reassign driver to different vehicle/shift"""
    request_id: str
    fleet_id: str
    driver_id: str
    
    current_vehicle_id: str
    new_vehicle_id: Optional[str] = None
    new_shift: Optional[str] = None
    
    reason: str  # "performance", "vehicle_breakdown", "driver_request", "admin_decision"
    priority: str = "normal"  # high, normal, low
    
    status: str = "pending"  # pending, approved, rejected, completed
    requested_by: str  # admin_id
    requested_at: datetime = Field(default_factory=get_ist_now)
    processed_at: Optional[datetime] = None
    
    notes: Optional[str] = None


class TemporaryDriverReplacement(BaseModel):
    """Temporary replacement when driver is unavailable"""
    replacement_id: str
    fleet_id: str
    
    original_driver_id: str
    replacement_driver_id: str
    vehicle_id: str
    
    # Duration
    start_date: datetime
    end_date: datetime
    reason: str  # "leave", "accident", "medical", "maintenance", "other"
    
    # Status tracking
    is_active: bool = True
    rides_completed: int = 0
    
    created_at: datetime = Field(default_factory=get_ist_now)


class DriverTransferRecord(BaseModel):
    """History of driver transfers between fleets"""
    transfer_id: str
    
    driver_id: str
    from_fleet_id: str
    to_fleet_id: str
    
    transfer_date: datetime
    transfer_reason: str
    
    from_fleet_manager: str
    to_fleet_manager: str
    
    # Transfer details
    previous_vehicle_id: str
    new_vehicle_id: str
    performance_summary: Optional[str] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 4. DRIVER ATTENDANCE & PERFORMANCE
# ============================================================================

class DriverAttendanceRecord(BaseModel):
    """Daily attendance tracking for drivers"""
    attendance_id: str
    fleet_id: str
    driver_id: str
    
    date: str  # YYYY-MM-DD format
    
    # Hours tracking
    scheduled_hours: float
    online_hours: float
    active_hours: float  # actively on ride
    idle_hours: float  # online but not on ride
    
    # Rides
    total_rides: int
    completed_rides: int
    cancelled_rides: int
    
    # Missed opportunities
    missed_requests: int
    avg_response_time: float  # seconds
    
    # Performance score
    attendance_score: float  # 0-100
    performance_notes: Optional[str] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


class DriverPerformanceRanking(BaseModel):
    """Performance ranking of drivers in fleet"""
    fleet_id: str
    
    rankings: List[Dict[str, Any]] = []  # [{rank, driver_id, name, rating, acceptance%, completion%, cancellation%, revenue_score}]
    
    # Top performers
    top_performer_driver_id: str
    top_performer_metrics: Optional[Dict[str, Any]] = None
    
    # Poor performers (need attention)
    poor_performers: List[str] = []  # driver_ids
    
    # Average metrics
    avg_rating: float = 4.5
    avg_acceptance_rate: float = 0.0
    avg_completion_rate: float = 0.0
    avg_cancellation_rate: float = 0.0
    
    updated_at: datetime = Field(default_factory=get_ist_now)


class DriverMonthlyPerformance(BaseModel):
    """Monthly performance summary for driver"""
    performance_id: str
    fleet_id: str
    driver_id: str
    
    month_year: str  # "2026-05"
    
    # Attendance
    days_worked: int
    total_hours: float
    
    # Rides
    total_rides: int
    avg_rating_received: float
    acceptance_rate: float
    completion_rate: float
    cancellation_rate: float
    
    # Revenue
    gross_revenue: float
    net_earnings: float
    
    # Ranking in fleet
    rank_in_fleet: int
    percentile: float  # Top X% of drivers
    
    # Performance trend
    trend: str  # "improving", "stable", "declining"
    trend_percentage: float
    
    created_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 5. DRIVER INCENTIVE MANAGEMENT
# ============================================================================

class IncentiveType(str, Enum):
    WEEKLY_BONUS = "weekly_bonus"
    PERFORMANCE_BONUS = "performance_bonus"
    RIDE_MILESTONE = "ride_milestone"
    RATING_BONUS = "rating_bonus"
    REFERRAL_BONUS = "referral_bonus"
    SPECIAL_EVENT = "special_event"


class DriverIncentive(BaseModel):
    """Incentive structure for drivers"""
    incentive_id: str
    fleet_id: str
    driver_id: str
    
    incentive_type: IncentiveType
    
    # Incentive details
    title: str
    description: str
    incentive_amount: float
    
    # Conditions
    condition: str  # e.g., "complete_50_rides", "maintain_4.8_rating", "top_10_performers"
    condition_met: bool = False
    progress: float = 0.0  # percentage towards condition
    
    # Timeline
    start_date: datetime
    end_date: datetime
    status: str = "active"  # active, completed, expired, cancelled
    
    # Payout
    disbursement_date: Optional[datetime] = None
    payment_status: str = "pending"  # pending, approved, paid, rejected
    
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=get_ist_now)


class FleetIncentiveProgram(BaseModel):
    """Fleet-wide incentive program"""
    program_id: str
    fleet_id: str
    
    # Program details
    program_name: str
    description: str
    
    # Incentives
    incentives: List[DriverIncentive] = []
    
    # Budget
    total_budget: float
    allocated_so_far: float
    remaining_budget: float
    
    # Timeline
    start_date: datetime
    end_date: datetime
    active: bool = True
    
    # Performance
    total_incentives_disbursed: float = 0.0
    drivers_benefited: int = 0
    
    created_at: datetime = Field(default_factory=get_ist_now)


class WeeklyIncentiveTarget(BaseModel):
    """Weekly incentive targets for drivers"""
    target_id: str
    fleet_id: str
    
    week_start: datetime
    week_end: datetime
    
    # Targets for different performance levels
    rides_for_bonus_tier_1: int = 50  # ₹500 bonus
    rides_for_bonus_tier_2: int = 75  # ₹800 bonus
    rides_for_bonus_tier_3: int = 100  # ₹1200 bonus
    
    tier_1_bonus: float = 500.0
    tier_2_bonus: float = 800.0
    tier_3_bonus: float = 1200.0
    
    # Performance bonus (top 10% of drivers)
    top_performers_bonus: float = 2000.0
    
    # Conditions
    min_rating_required: float = 4.5
    max_cancellation_rate: float = 5.0  # %
    
    created_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 6. LIVE FLEET TRACKING & HEATMAPS
# ============================================================================

class VehicleLocation(BaseModel):
    """Real-time vehicle location"""
    location_id: str
    fleet_id: str
    vehicle_id: str
    driver_id: str
    
    # Location
    latitude: float
    longitude: float
    
    # Status
    status: str  # "active", "idle", "offline", "on_ride"
    is_on_ride: bool = False
    current_ride_id: Optional[str] = None
    
    # Movement
    speed: float  # km/h
    bearing: float  # 0-360 degrees
    
    accuracy: float  # GPS accuracy in meters
    timestamp: datetime = Field(default_factory=get_ist_now)


class FleetLiveMap(BaseModel):
    """Real-time map data for all fleet vehicles"""
    fleet_id: str
    
    # Vehicle locations
    vehicles: List[VehicleLocation] = []
    
    # Summary
    active_vehicles: int = 0
    idle_vehicles: int = 0
    offline_vehicles: int = 0
    
    # Active rides
    active_rides: int = 0
    completed_rides_today: int = 0
    
    updated_at: datetime = Field(default_factory=get_ist_now)


class HeatmapGrid(BaseModel):
    """Grid-based heatmap for demand/supply"""
    heatmap_id: str
    fleet_id: str
    
    # Grid info
    grid_size: int = 50  # meters
    
    # Grid cells
    cells: List[Dict[str, Any]] = []  # [{lat, lng, demand_level, supply_count, revenue_potential}]
    
    # Summary
    high_demand_zones: int = 0
    low_demand_zones: int = 0
    balanced_zones: int = 0
    
    # Recommendations
    recommendations: List[str] = []  # Where to send vehicles
    
    generated_at: datetime = Field(default_factory=get_ist_now)


class ZoneDemandHeatmap(BaseModel):
    """Demand in specific zones"""
    heatmap_id: str
    fleet_id: str
    
    # Zone info
    zone_name: str
    zone_coordinates: Dict[str, float]  # {lat, lng, radius}
    
    # Demand metrics
    current_demand_level: str  # "low", "medium", "high", "very_high"
    demand_score: float  # 0-100
    
    # Supply
    available_vehicles: int
    demand_requests_pending: int
    
    # Revenue opportunity
    avg_fare_in_zone: float
    estimated_revenue_opportunity: float
    
    # Time-series data
    hourly_demand: Dict[int, float] = {}  # {hour: demand_level}
    
    updated_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 7. REVENUE FORECASTING & AI
# ============================================================================

class RevenueForecast(BaseModel):
    """Revenue forecast for fleet"""
    forecast_id: str
    fleet_id: str
    
    # Forecast horizon
    forecast_date: datetime
    forecast_for_date: str  # date being forecasted
    
    # Predictions
    predicted_rides: int
    predicted_revenue: float
    predicted_earnings: float
    
    # Confidence
    confidence_level: float  # 0-100
    
    # Actual (once date passes)
    actual_rides: Optional[int] = None
    actual_revenue: Optional[float] = None
    
    # Variance
    variance_percentage: Optional[float] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


class AIFleetOptimization(BaseModel):
    """AI-powered fleet optimization recommendations"""
    recommendation_id: str
    fleet_id: str
    
    # Recommendation type
    rec_type: str  # "driver_allocation", "zone_assignment", "shift_optimization", "vehicle_deployment"
    
    title: str
    description: str
    
    # Suggestion
    suggestion: str
    expected_impact: Dict[str, Any]  # {metric: change_amount, estimated_increase_percentage}
    
    # Implementation
    implementation_steps: List[str]
    estimated_implementation_time: str  # e.g., "2 hours"
    
    # Priority
    priority: str = "medium"  # high, medium, low
    impact_score: float  # 0-100
    
    # Status
    status: str = "pending"  # pending, approved, implemented, rejected
    
    created_at: datetime = Field(default_factory=get_ist_now)
    implemented_at: Optional[datetime] = None


# ============================================================================
# 8. ROLE-BASED ACCESS CONTROL
# ============================================================================

class FleetRoleType(str, Enum):
    OWNER = "owner"
    MANAGER = "manager"
    ACCOUNTANT = "accountant"
    OPERATOR = "operator"
    VIEWER = "viewer"


class FleetUserRole(BaseModel):
    """User role in fleet organization"""
    role_id: str
    fleet_id: str
    user_id: str
    
    role: FleetRoleType
    
    # Permissions
    can_add_drivers: bool = False
    can_remove_drivers: bool = False
    can_view_earnings: bool = True
    can_withdraw_money: bool = False
    can_manage_vehicles: bool = False
    can_view_analytics: bool = True
    can_manage_incentives: bool = False
    can_approve_documents: bool = False
    can_view_all_data: bool = False
    
    # Custom permissions
    custom_permissions: List[str] = []
    
    assigned_at: datetime = Field(default_factory=get_ist_now)
    last_modified: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 9. BULK OPERATIONS
# ============================================================================

class BulkOperationType(str, Enum):
    APPROVE_DRIVERS = "approve_drivers"
    UPLOAD_DOCUMENTS = "upload_documents"
    REGISTER_VEHICLES = "register_vehicles"
    ASSIGN_DRIVERS = "assign_drivers"
    UPDATE_INCENTIVES = "update_incentives"


class BulkOperation(BaseModel):
    """Bulk operation for fleet management"""
    operation_id: str
    fleet_id: str
    
    # Operation details
    operation_type: BulkOperationType
    description: str
    
    # Data
    total_items: int
    processed_items: int = 0
    successful_items: int = 0
    failed_items: int = 0
    
    # Status
    status: str = "pending"  # pending, processing, completed, failed
    progress_percentage: float = 0.0
    
    # Results
    success_details: List[Dict[str, Any]] = []
    error_details: List[Dict[str, Any]] = []
    
    initiated_by: str  # user_id
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


class BulkDriverApproval(BaseModel):
    """Bulk approve multiple drivers"""
    batch_id: str
    fleet_id: str
    
    # Drivers to approve
    driver_ids: List[str]
    
    # Batch details
    approval_criteria: str  # auto or manual
    approved_by: str  # admin_id
    
    # Results
    approved_count: int = 0
    rejected_count: int = 0
    
    status: str = "pending"
    created_at: datetime = Field(default_factory=get_ist_now)


class BulkDocumentUpload(BaseModel):
    """Bulk upload documents for drivers/vehicles"""
    upload_id: str
    fleet_id: str
    
    # Upload details
    document_type: str  # "driver_license", "insurance", "vehicle_rc", "pollution_cert"
    entity_type: str  # "driver" or "vehicle"
    
    # Files
    total_files: int
    uploaded_files: int = 0
    processed_files: int = 0
    
    # Storage
    storage_location: str
    file_mapping: List[Dict[str, str]] = []  # [{entity_id: file_path}]
    
    status: str = "pending"
    completed_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


# ============================================================================
# 10. MAINTENANCE & COMPLIANCE
# ============================================================================

class DocumentExpiryAlert(BaseModel):
    """Alert for expiring documents"""
    alert_id: str
    fleet_id: str
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    
    # Document info
    document_type: str  # insurance, permit, pollution_cert, fitness_cert
    expiry_date: datetime
    days_until_expiry: int
    
    # Alert
    alert_severity: str = "medium"  # low, medium, high, critical
    alert_sent: bool = True
    alert_sent_at: Optional[datetime] = None
    
    # Status
    status: str = "active"  # active, renewed, ignored
    renewed_date: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)


class FleetComplianceReport(BaseModel):
    """Fleet compliance status report"""
    report_id: str
    fleet_id: str
    
    # Compliance checks
    insurance_valid_count: int
    insurance_expiring_count: int
    insurance_expired_count: int
    
    permits_valid_count: int
    permits_expiring_count: int
    permits_expired_count: int
    
    drivers_verified_count: int
    drivers_pending_verification_count: int
    
    pollution_certs_valid_count: int
    fitness_certs_valid_count: int
    
    # Overall compliance score
    compliance_score: float  # 0-100
    compliance_status: str  # "compliant", "at_risk", "non_compliant"
    
    # Issues
    critical_issues: List[str] = []
    warnings: List[str] = []
    
    generated_at: datetime = Field(default_factory=get_ist_now)
