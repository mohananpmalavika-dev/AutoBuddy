"""
Live Operations Center Database Models
Real-time command center for city operations monitoring
"""

from pydantic import BaseModel, Field
from datetime import datetime
from .models_features import get_ist_now
from typing import List, Optional, Dict, Any
from enum import Enum


class SafetyIncidentType(str, Enum):
    SOS_ALERT = "sos_alert"
    ACCIDENT = "accident"
    HARASSMENT = "harassment"
    VEHICLE_ISSUE = "vehicle_issue"
    ROUTE_SAFETY = "route_safety"
    HEALTH_EMERGENCY = "health_emergency"


class IncidentSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SafetyIncident(BaseModel):
    """Real-time safety incident tracking."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    incident_type: SafetyIncidentType
    severity: IncidentSeverity
    latitude: float
    longitude: float
    ride_id: Optional[str] = None
    driver_id: Optional[str] = None
    passenger_id: Optional[str] = None
    description: str
    reported_at: datetime = Field(default_factory=get_ist_now)
    resolved_at: Optional[datetime] = None
    is_resolved: bool = False
    responder_id: Optional[str] = None
    response_time_seconds: Optional[int] = None
    priority: int = Field(ge=1, le=5)  # 1=highest priority
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "incident_type": "sos_alert",
                "severity": "high",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "description": "Driver reported threatening passenger"
            }
        }


class ZoneDemandMetric(BaseModel):
    """Demand metrics by geographic zone."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    zone_id: str
    zone_name: str
    latitude: float  # Zone center
    longitude: float
    current_demand_score: float = Field(ge=0, le=100)  # 0-100 scale
    active_ride_count: int
    available_driver_count: int
    waiting_passenger_count: int
    avg_wait_time_minutes: float
    surge_multiplier: float = Field(ge=1.0)
    demand_trend: str  # "increasing", "stable", "decreasing"
    peak_hours: List[int] = Field(default_factory=list)  # Hours when peak demand expected
    last_updated: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "zone_id": "zone_downtown",
                "zone_name": "Downtown",
                "current_demand_score": 85,
                "active_ride_count": 234,
                "available_driver_count": 45,
                "surge_multiplier": 1.5
            }
        }


class ActiveRideSnapshot(BaseModel):
    """Snapshot of active ride for monitoring."""
    ride_id: str
    city_id: str
    passenger_name: str
    driver_name: str
    driver_rating: float
    passenger_pickup: str
    passenger_dropoff: str
    pickup_lat: float
    pickup_lon: float
    dropoff_lat: float
    dropoff_lon: float
    driver_lat: float  # Current driver location
    driver_lon: float
    ride_status: str  # "accepted", "en_route", "arrived", "in_ride"
    pickup_eta_minutes: int
    estimated_duration_minutes: int
    started_at: datetime
    safety_status: str  # "normal", "alert", "incident"
    is_priority_ride: bool = False
    
    class Config:
        json_schema_extra = {
            "example": {
                "ride_id": "ride_123",
                "passenger_name": "Rahul K.",
                "driver_name": "Amit S.",
                "ride_status": "in_ride",
                "safety_status": "normal"
            }
        }


class DemandForecast(BaseModel):
    """AI-powered demand forecasting by hour/day."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    forecast_hour: int  # 0-23
    forecast_date: str  # YYYY-MM-DD
    predicted_demand_score: float = Field(ge=0, le=100)
    confidence_level: float = Field(ge=0, le=1.0)  # 0-100%
    predicted_surge_multiplier: float
    predicted_ride_count: int
    predicted_driver_supply: int
    recommended_surge_pricing: float
    recommendations: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "forecast_hour": 18,
                "predicted_demand_score": 82,
                "confidence_level": 0.92,
                "recommendations": ["Increase driver incentives", "Prepare fleet"]
            }
        }


class OperationsWarRoomSnapshot(BaseModel):
    """Command center overview snapshot."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    timestamp: datetime = Field(default_factory=get_ist_now)
    
    # City-wide metrics
    total_active_rides: int
    total_available_drivers: int
    total_waiting_passengers: int
    average_ride_duration_minutes: float
    average_driver_rating: float = Field(ge=0, le=5.0)
    
    # Safety metrics
    active_incidents_count: int
    critical_incidents_count: int
    incidents_resolved_last_hour: int
    avg_incident_response_time_minutes: float
    
    # Demand metrics
    city_demand_score: float = Field(ge=0, le=100)
    peak_zone: str
    peak_zone_demand: float
    current_surge_multiplier: float = Field(ge=1.0)
    
    # Performance metrics
    ride_completion_rate: float = Field(ge=0, le=1.0)  # % of rides completed
    cancellation_rate: float = Field(ge=0, le=1.0)
    average_pickup_eta_minutes: float
    
    # Alerts
    alerts: List[str] = Field(default_factory=list)
    critical_alerts: List[str] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "total_active_rides": 456,
                "total_available_drivers": 234,
                "city_demand_score": 78,
                "active_incidents_count": 3,
                "alerts": ["High demand in downtown", "Low driver supply"]
            }
        }


class DriverDensityGrid(BaseModel):
    """Geographic grid of driver density."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    grid_id: str  # e.g., "GRID_001_001"
    grid_lat_center: float
    grid_lon_center: float
    driver_count: int
    driver_count_5min: int  # Drivers that will arrive in 5 mins
    driver_count_15min: int  # Drivers that will arrive in 15 mins
    average_driver_rating: float
    vehicle_types: Dict[str, int] = Field(default_factory=dict)  # {"auto": 5, "bike": 3}
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "grid_id": "GRID_001_001",
                "driver_count": 12,
                "average_driver_rating": 4.6
            }
        }


class IncidentAlert(BaseModel):
    """Real-time alert for operations team."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    alert_type: str  # "incident", "supply_shortage", "demand_surge", "performance"
    severity: str  # "critical", "high", "medium", "low"
    title: str
    message: str
    action_required: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime = Field(default_factory=get_ist_now)
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved: bool = False
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "alert_type": "supply_shortage",
                "severity": "high",
                "title": "Driver shortage in downtown",
                "message": "Only 5 drivers available in downtown zone",
                "action_required": "Activate driver incentives"
            }
        }


class LiveCityMetrics(BaseModel):
    """Real-time city-wide metrics."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    city_id: str
    timestamp: datetime = Field(default_factory=get_ist_now)
    
    # Supply-demand balance
    online_drivers: int
    online_passengers: int
    active_rides: int
    idle_drivers: int
    waiting_passengers: int
    
    # Revenue & economics
    gross_revenue_today: float
    platform_fee_today: float
    average_ride_value: float
    total_distance_km: float
    
    # Quality metrics
    average_driver_rating: float = Field(ge=0, le=5.0)
    average_passenger_rating: float = Field(ge=0, le=5.0)
    ride_completion_rate: float = Field(ge=0, le=1.0)
    cancellation_rate: float = Field(ge=0, le=1.0)
    
    # Safety
    sla_incidents_last_hour: int
    critical_incidents: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "city_id": "city_001",
                "online_drivers": 450,
                "active_rides": 234,
                "average_driver_rating": 4.7,
                "gross_revenue_today": 150000
            }
        }
