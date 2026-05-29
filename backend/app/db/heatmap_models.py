"""
Driver Heatmaps & Demand Forecasting Models
Pydantic models for real-time driver location tracking, demand heatmaps, and predictive forecasting
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum


class GridCellStatus(str, Enum):
    """Status of a grid cell in heatmap"""
    HIGH_DEMAND = "high_demand"
    MEDIUM_DEMAND = "medium_demand"
    LOW_DEMAND = "low_demand"
    NO_DEMAND = "no_demand"


class ForecastAccuracy(str, Enum):
    """Accuracy level of forecast"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DriverLocationUpdate(BaseModel):
    """Real-time driver location update"""
    driver_id: str = Field(..., example="driver_12345")
    latitude: float = Field(..., ge=-90, le=90, example=12.9352)
    longitude: float = Field(..., ge=-180, le=180, example=77.6245)
    city_id: str = Field(..., example="city_bangalore")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    available: bool = Field(default=True, example=True)
    ride_status: str = Field(default="idle", example="idle")
    rating: float = Field(ge=0, le=5, default=4.8, example=4.8)
    total_rides: int = Field(ge=0, default=500, example=500)

    model_config = {
        "json_schema_extra": {
            "example": {
                "driver_id": "driver_12345",
                "latitude": 12.9352,
                "longitude": 77.6245,
                "city_id": "city_bangalore",
                "timestamp": "2025-01-01T12:00:00Z",
                "available": True,
                "ride_status": "idle",
                "rating": 4.8,
                "total_rides": 500
            }
        }
    }


class HeatmapGridCell(BaseModel):
    """Individual cell in demand heatmap grid"""
    cell_id: str = Field(..., example="cell_BLR_001_001")
    grid_x: int = Field(..., example=10)
    grid_y: int = Field(..., example=15)
    latitude: float = Field(..., ge=-90, le=90, example=12.9352)
    longitude: float = Field(..., ge=-180, le=180, example=77.6245)
    city_id: str = Field(..., example="city_bangalore")
    demand_score: float = Field(ge=0, le=100, example=75.5, description="Demand intensity 0-100")
    active_drivers: int = Field(ge=0, default=12, example=12)
    waiting_requests: int = Field(ge=0, default=25, example=25)
    cell_status: GridCellStatus = Field(default=GridCellStatus.HIGH_DEMAND)
    surge_multiplier: float = Field(ge=1.0, le=5.0, default=1.2, example=1.2)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "json_schema_extra": {
            "example": {
                "cell_id": "cell_BLR_001_001",
                "grid_x": 10,
                "grid_y": 15,
                "latitude": 12.9352,
                "longitude": 77.6245,
                "city_id": "city_bangalore",
                "demand_score": 75.5,
                "active_drivers": 12,
                "waiting_requests": 25,
                "cell_status": "high_demand",
                "surge_multiplier": 1.2,
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class CityHeatmap(BaseModel):
    """Complete heatmap for a city"""
    heatmap_id: str = Field(..., example="heatmap_bangalore_001")
    city_id: str = Field(..., example="city_bangalore")
    grid_cells: List[HeatmapGridCell] = Field(default_factory=list)
    total_active_drivers: int = Field(ge=0, default=500, example=500)
    total_waiting_requests: int = Field(ge=0, default=1200, example=1200)
    average_demand_score: float = Field(ge=0, le=100, default=65.0, example=65.0)
    peak_zone_id: str = Field(default="cell_BLR_005_008", example="cell_BLR_005_008")
    low_supply_zones: int = Field(ge=0, default=3, example=3)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "json_schema_extra": {
            "example": {
                "heatmap_id": "heatmap_bangalore_001",
                "city_id": "city_bangalore",
                "grid_cells": [],
                "total_active_drivers": 500,
                "total_waiting_requests": 1200,
                "average_demand_score": 65.0,
                "peak_zone_id": "cell_BLR_005_008",
                "low_supply_zones": 3,
                "timestamp": "2025-01-01T12:00:00Z"
            }
        }
    }


class DemandForecast(BaseModel):
    """Demand forecast for future time periods"""
    forecast_id: str = Field(..., example="forecast_bangalore_001")
    city_id: str = Field(..., example="city_bangalore")
    forecast_period: str = Field(..., example="2025-01-01T14:00:00Z")
    forecasted_demand_score: float = Field(ge=0, le=100, example=82.5)
    confidence_level: float = Field(ge=0, le=100, example=85.0, description="Forecast confidence 0-100")
    accuracy: ForecastAccuracy = Field(default=ForecastAccuracy.HIGH)
    recommended_drivers_needed: int = Field(ge=0, default=450, example=450)
    recommended_incentive_multiplier: float = Field(ge=1.0, le=3.0, default=1.3, example=1.3)
    peak_hours: List[str] = Field(default_factory=list, example=["18:00", "19:00", "20:00"])
    low_demand_hours: List[str] = Field(default_factory=list, example=["02:00", "03:00", "04:00"])
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "json_schema_extra": {
            "example": {
                "forecast_id": "forecast_bangalore_001",
                "city_id": "city_bangalore",
                "forecast_period": "2025-01-01T14:00:00Z",
                "forecasted_demand_score": 82.5,
                "confidence_level": 85.0,
                "accuracy": "high",
                "recommended_drivers_needed": 450,
                "recommended_incentive_multiplier": 1.3,
                "peak_hours": ["18:00", "19:00", "20:00"],
                "low_demand_hours": ["02:00", "03:00", "04:00"],
                "created_at": "2025-01-01T12:00:00Z",
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class SupplyGapAlert(BaseModel):
    """Alert for supply-demand gaps"""
    alert_id: str = Field(..., example="alert_gap_001")
    city_id: str = Field(..., example="city_bangalore")
    zone_id: str = Field(..., example="cell_BLR_005_008")
    latitude: float = Field(..., ge=-90, le=90, example=12.9352)
    longitude: float = Field(..., ge=-180, le=180, example=77.6245)
    demand_requests: int = Field(ge=0, default=50, example=50)
    available_drivers: int = Field(ge=0, default=5, example=5)
    gap_percentage: float = Field(ge=0, le=200, default=90.0, example=90.0)
    recommended_action: str = Field(default="increase_incentive", example="increase_incentive")
    severity: str = Field(default="high", example="high")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved: bool = Field(default=False)

    model_config = {
        "json_schema_extra": {
            "example": {
                "alert_id": "alert_gap_001",
                "city_id": "city_bangalore",
                "zone_id": "cell_BLR_005_008",
                "latitude": 12.9352,
                "longitude": 77.6245,
                "demand_requests": 50,
                "available_drivers": 5,
                "gap_percentage": 90.0,
                "recommended_action": "increase_incentive",
                "severity": "high",
                "created_at": "2025-01-01T12:00:00Z",
                "resolved": False
            }
        }
    }


class DriverTrendAnalysis(BaseModel):
    """Trend analysis for driver behavior and demand patterns"""
    trend_id: str = Field(..., example="trend_bangalore_001")
    city_id: str = Field(..., example="city_bangalore")
    analysis_period: str = Field(..., example="weekly")
    average_drivers_online: int = Field(ge=0, default=450, example=450)
    peak_demand_time: str = Field(default="18:00-20:00", example="18:00-20:00")
    low_demand_time: str = Field(default="02:00-04:00", example="02:00-04:00")
    average_ride_duration_minutes: float = Field(ge=0, default=15.5, example=15.5)
    average_wait_time_minutes: float = Field(ge=0, default=3.2, example=3.2)
    total_completed_rides: int = Field(ge=0, default=50000, example=50000)
    cancellation_rate: float = Field(ge=0, le=100, default=5.2, example=5.2)
    demand_volatility: float = Field(ge=0, le=100, default=45.0, example=45.0)
    predictions_for_next_period: Dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "json_schema_extra": {
            "example": {
                "trend_id": "trend_bangalore_001",
                "city_id": "city_bangalore",
                "analysis_period": "weekly",
                "average_drivers_online": 450,
                "peak_demand_time": "18:00-20:00",
                "low_demand_time": "02:00-04:00",
                "average_ride_duration_minutes": 15.5,
                "average_wait_time_minutes": 3.2,
                "total_completed_rides": 50000,
                "cancellation_rate": 5.2,
                "demand_volatility": 45.0,
                "predictions_for_next_period": {"day": "Friday", "expected_demand": "high"},
                "updated_at": "2025-01-01T12:00:00Z"
            }
        }
    }


class IncentiveRecommendation(BaseModel):
    """AI-driven incentive recommendations"""
    recommendation_id: str = Field(..., example="rec_001")
    city_id: str = Field(..., example="city_bangalore")
    zone_id: str = Field(..., example="cell_BLR_005_008")
    current_demand_score: float = Field(ge=0, le=100, default=75.0, example=75.0)
    recommended_multiplier: float = Field(ge=1.0, le=3.0, default=1.5, example=1.5)
    estimated_driver_response: int = Field(ge=0, default=50, example=50)
    expected_revenue_impact: float = Field(default=5000.0, example=5000.0)
    cost_estimate: float = Field(default=1200.0, example=1200.0)
    roi_percentage: float = Field(default=316.67, example=316.67)
    recommendation_reason: str = Field(default="High demand, low supply gap", example="High demand, low supply gap")
    valid_until: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "json_schema_extra": {
            "example": {
                "recommendation_id": "rec_001",
                "city_id": "city_bangalore",
                "zone_id": "cell_BLR_005_008",
                "current_demand_score": 75.0,
                "recommended_multiplier": 1.5,
                "estimated_driver_response": 50,
                "expected_revenue_impact": 5000.0,
                "cost_estimate": 1200.0,
                "roi_percentage": 316.67,
                "recommendation_reason": "High demand, low supply gap",
                "valid_until": "2025-01-01T13:00:00Z"
            }
        }
    }
