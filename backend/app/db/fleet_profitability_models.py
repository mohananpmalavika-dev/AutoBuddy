"""
Fleet Profitability Dashboard Models
Pydantic models for fleet performance metrics, profitability analysis, and optimization insights
"""

from pydantic import BaseModel, Field
from datetime import datetime
from .models_features import get_ist_now
from typing import List, Optional, Dict, Any
from enum import Enum


class VehicleStatus(str, Enum):
    """Vehicle operational status"""
    ACTIVE = "active"
    IDLE = "idle"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"


class ProfitabilityTier(str, Enum):
    """Profitability tier classification"""
    PREMIUM = "premium"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    LOSS = "loss"


class MetricsFrequency(str, Enum):
    """Frequency for metrics calculation"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class VehicleProfileMetrics(BaseModel):
    """Individual vehicle profitability metrics"""
    vehicle_id: str = Field(..., example="veh_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    vehicle_number: str = Field(..., example="KA01AB1234")
    vehicle_type: str = Field(default="sedan", example="sedan")
    status: VehicleStatus = Field(default=VehicleStatus.ACTIVE)
    daily_revenue: float = Field(ge=0, default=2500.0, example=2500.0)
    daily_cost: float = Field(ge=0, default=1200.0, example=1200.0)
    daily_profit: float = Field(default=1300.0, example=1300.0)
    profit_margin: float = Field(ge=-100, le=100, default=52.0, example=52.0, description="Percentage")
    utilization_rate: float = Field(ge=0, le=100, default=85.0, example=85.0, description="Percentage")
    rides_completed: int = Field(ge=0, default=45, example=45)
    average_rating: float = Field(ge=0, le=5, default=4.7, example=4.7)
    fuel_efficiency: float = Field(ge=0, default=12.5, example=12.5, description="km/liter")
    maintenance_cost: float = Field(ge=0, default=150.0, example=150.0)
    tier: ProfitabilityTier = Field(default=ProfitabilityTier.HIGH)
    updated_at: datetime = Field(default_factory=get_ist_now)

    model_config = {
        "json_schema_extra": {
            "example": {
                "vehicle_id": "veh_001",
                "fleet_id": "fleet_bangalore_001",
                "vehicle_number": "KA01AB1234",
                "vehicle_type": "sedan",
                "status": "active",
                "daily_revenue": 2500.0,
                "daily_cost": 1200.0,
                "daily_profit": 1300.0,
                "profit_margin": 52.0,
                "utilization_rate": 85.0,
                "rides_completed": 45,
                "average_rating": 4.7,
                "fuel_efficiency": 12.5,
                "maintenance_cost": 150.0,
                "tier": "high",
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class FleetPortfolioMetrics(BaseModel):
    """Overall fleet profitability metrics"""
    portfolio_id: str = Field(..., example="portfolio_bangalore_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    total_vehicles: int = Field(ge=0, default=500, example=500)
    active_vehicles: int = Field(ge=0, default=450, example=450)
    idle_vehicles: int = Field(ge=0, default=30, example=30)
    maintenance_vehicles: int = Field(ge=0, default=20, example=20)
    total_daily_revenue: float = Field(ge=0, default=1250000.0, example=1250000.0)
    total_daily_cost: float = Field(ge=0, default=600000.0, example=600000.0)
    total_daily_profit: float = Field(ge=-1000000, default=650000.0, example=650000.0)
    overall_margin: float = Field(ge=-100, le=100, default=52.0, example=52.0, description="Percentage")
    average_utilization: float = Field(ge=0, le=100, default=75.0, example=75.0, description="Percentage")
    average_rating: float = Field(ge=0, le=5, default=4.6, example=4.6)
    total_rides_today: int = Field(ge=0, default=22500, example=22500)
    premium_tier_vehicles: int = Field(ge=0, default=50, example=50)
    loss_making_vehicles: int = Field(ge=0, default=5, example=5)
    updated_at: datetime = Field(default_factory=get_ist_now)

    model_config = {
        "json_schema_extra": {
            "example": {
                "portfolio_id": "portfolio_bangalore_001",
                "fleet_id": "fleet_bangalore_001",
                "total_vehicles": 500,
                "active_vehicles": 450,
                "idle_vehicles": 30,
                "maintenance_vehicles": 20,
                "total_daily_revenue": 1250000.0,
                "total_daily_cost": 600000.0,
                "total_daily_profit": 650000.0,
                "overall_margin": 52.0,
                "average_utilization": 75.0,
                "average_rating": 4.6,
                "total_rides_today": 22500,
                "premium_tier_vehicles": 50,
                "loss_making_vehicles": 5,
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class CostBreakdown(BaseModel):
    """Detailed cost breakdown"""
    breakdown_id: str = Field(..., example="breakdown_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    vehicle_id: str = Field(..., example="veh_001")
    fuel_cost: float = Field(ge=0, default=400.0, example=400.0)
    maintenance_cost: float = Field(ge=0, default=150.0, example=150.0)
    insurance_cost: float = Field(ge=0, default=100.0, example=100.0)
    driver_payment: float = Field(ge=0, default=400.0, example=400.0)
    platform_commission: float = Field(ge=0, default=150.0, example=150.0)
    other_costs: float = Field(ge=0, default=50.0, example=50.0)
    total_cost: float = Field(ge=0, default=1250.0, example=1250.0)
    period: str = Field(default="daily", example="daily")
    timestamp: datetime = Field(default_factory=get_ist_now)

    model_config = {
        "json_schema_extra": {
            "example": {
                "breakdown_id": "breakdown_001",
                "fleet_id": "fleet_bangalore_001",
                "vehicle_id": "veh_001",
                "fuel_cost": 400.0,
                "maintenance_cost": 150.0,
                "insurance_cost": 100.0,
                "driver_payment": 400.0,
                "platform_commission": 150.0,
                "other_costs": 50.0,
                "total_cost": 1250.0,
                "period": "daily",
                "timestamp": "2025-01-01T12:00:00Z"
            }
        }
    }


class VehicleOptimizationTip(BaseModel):
    """AI-driven optimization recommendation for vehicle"""
    tip_id: str = Field(..., example="tip_001")
    vehicle_id: str = Field(..., example="veh_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    current_performance: str = Field(default="moderate", example="moderate")
    recommendation: str = Field(..., example="Increase operational hours in peak zones")
    potential_profit_increase: float = Field(ge=0, default=500.0, example=500.0, description="Daily profit increase estimate")
    implementation_difficulty: str = Field(default="low", example="low")
    estimated_roi_days: int = Field(ge=0, default=7, example=7)
    priority: str = Field(default="high", example="high")
    impact_area: str = Field(default="utilization", example="utilization")
    created_at: datetime = Field(default_factory=get_ist_now)

    model_config = {
        "json_schema_extra": {
            "example": {
                "tip_id": "tip_001",
                "vehicle_id": "veh_001",
                "fleet_id": "fleet_bangalore_001",
                "current_performance": "moderate",
                "recommendation": "Increase operational hours in peak zones",
                "potential_profit_increase": 500.0,
                "implementation_difficulty": "low",
                "estimated_roi_days": 7,
                "priority": "high",
                "impact_area": "utilization",
                "created_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class ROIAnalysis(BaseModel):
    """Return on Investment analysis for vehicle"""
    roi_id: str = Field(..., example="roi_001")
    vehicle_id: str = Field(..., example="veh_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    vehicle_cost: float = Field(ge=0, default=800000.0, example=800000.0)
    months_in_operation: int = Field(ge=0, default=6, example=6)
    cumulative_profit: float = Field(default=50000.0, example=50000.0)
    roi_percentage: float = Field(default=6.25, example=6.25, description="Percentage")
    break_even_months: float = Field(ge=0, default=16.0, example=16.0)
    months_to_positive_roi: int = Field(ge=0, default=3, example=3)
    annual_projected_profit: float = Field(default=150000.0, example=150000.0)
    annual_roi_percentage: float = Field(default=18.75, example=18.75, description="Percentage")
    projected_payoff_months: float = Field(ge=0, default=64.0, example=64.0)
    status: str = Field(default="on_track", example="on_track")

    model_config = {
        "json_schema_extra": {
            "example": {
                "roi_id": "roi_001",
                "vehicle_id": "veh_001",
                "fleet_id": "fleet_bangalore_001",
                "vehicle_cost": 800000.0,
                "months_in_operation": 6,
                "cumulative_profit": 50000.0,
                "roi_percentage": 6.25,
                "break_even_months": 16.0,
                "months_to_positive_roi": 3,
                "annual_projected_profit": 150000.0,
                "annual_roi_percentage": 18.75,
                "projected_payoff_months": 64.0,
                "status": "on_track"
            }
        }
    }


class DriverPerformanceMetrics(BaseModel):
    """Driver performance impact on profitability"""
    driver_id: str = Field(..., example="driver_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    vehicle_id: str = Field(..., example="veh_001")
    average_rating: float = Field(ge=0, le=5, default=4.8, example=4.8)
    total_rides: int = Field(ge=0, default=1500, example=1500)
    ride_acceptance_rate: float = Field(ge=0, le=100, default=92.0, example=92.0, description="Percentage")
    cancellation_rate: float = Field(ge=0, le=100, default=3.0, example=3.0, description="Percentage")
    average_ride_value: float = Field(ge=0, default=275.0, example=275.0)
    daily_revenue_generated: float = Field(ge=0, default=2500.0, example=2500.0)
    revenue_premium: float = Field(default=300.0, example=300.0, description="Premium over fleet average")
    fuel_efficiency_ratio: float = Field(ge=0, default=1.1, example=1.1)
    customer_complaint_rate: float = Field(ge=0, le=100, default=1.2, example=1.2, description="Percentage")
    safety_score: float = Field(ge=0, le=100, default=95.0, example=95.0, description="Percentage")
    profit_contribution: float = Field(default=1200.0, example=1200.0, description="Estimated daily profit")

    model_config = {
        "json_schema_extra": {
            "example": {
                "driver_id": "driver_001",
                "fleet_id": "fleet_bangalore_001",
                "vehicle_id": "veh_001",
                "average_rating": 4.8,
                "total_rides": 1500,
                "ride_acceptance_rate": 92.0,
                "cancellation_rate": 3.0,
                "average_ride_value": 275.0,
                "daily_revenue_generated": 2500.0,
                "revenue_premium": 300.0,
                "fuel_efficiency_ratio": 1.1,
                "customer_complaint_rate": 1.2,
                "safety_score": 95.0,
                "profit_contribution": 1200.0
            }
        }
    }


class MaintenanceAlert(BaseModel):
    """Predictive maintenance alert to optimize profitability"""
    alert_id: str = Field(..., example="alert_maint_001")
    vehicle_id: str = Field(..., example="veh_001")
    fleet_id: str = Field(..., example="fleet_bangalore_001")
    alert_type: str = Field(default="scheduled_service", example="scheduled_service")
    description: str = Field(..., example="Oil change due - 50,000 km service")
    estimated_downtime_hours: int = Field(ge=0, default=4, example=4)
    estimated_cost: float = Field(ge=0, default=2000.0, example=2000.0)
    estimated_revenue_loss: float = Field(ge=0, default=1000.0, example=1000.0)
    recommended_action: str = Field(default="schedule_immediately", example="schedule_immediately")
    urgency: str = Field(default="medium", example="medium")
    due_date: datetime = Field(default_factory=get_ist_now)

    model_config = {
        "json_schema_extra": {
            "example": {
                "alert_id": "alert_maint_001",
                "vehicle_id": "veh_001",
                "fleet_id": "fleet_bangalore_001",
                "alert_type": "scheduled_service",
                "description": "Oil change due - 50,000 km service",
                "estimated_downtime_hours": 4,
                "estimated_cost": 2000.0,
                "estimated_revenue_loss": 1000.0,
                "recommended_action": "schedule_immediately",
                "urgency": "medium",
                "due_date": "2025-01-15T00:00:00Z"
            }
        }
    }
