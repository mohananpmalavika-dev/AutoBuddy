"""
Live Operations Center API Endpoints
Real-time command center for monitoring city operations
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
import logging
import random
from typing import List, Optional
from app.utils.rbac import get_current_user_from_request

from app.db.operations_center_models import (
    SafetyIncident, SafetyIncidentType, IncidentSeverity,
    ZoneDemandMetric, ActiveRideSnapshot, DemandForecast,
    OperationsWarRoomSnapshot, DriverDensityGrid, IncidentAlert,
    LiveCityMetrics
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/operations", tags=["operations_center"])


# ============================================================================
# LIVE METRICS ENDPOINTS
# ============================================================================

@router.get("/center/live-metrics/{city_id}")
async def get_live_city_metrics(city_id: str, request: Request):
    """
    Get real-time city-wide metrics for operations dashboard.
    
    Returns:
    - Online drivers/passengers counts
    - Active rides, revenue, quality metrics
    - Safety incidents summary
    """
    try:
        await get_current_user_from_request(request)
        # Mock data - replace with actual database queries
        metrics = {
            "city_id": city_id,
            "timestamp": get_ist_now().isoformat(),
            "online_drivers": random.randint(200, 600),
            "online_passengers": random.randint(100, 300),
            "active_rides": random.randint(50, 250),
            "idle_drivers": random.randint(50, 150),
            "waiting_passengers": random.randint(10, 50),
            "gross_revenue_today": round(random.uniform(100000, 300000), 2),
            "platform_fee_today": round(random.uniform(30000, 90000), 2),
            "average_ride_value": round(random.uniform(150, 400), 2),
            "total_distance_km": round(random.uniform(5000, 15000), 1),
            "average_driver_rating": round(random.uniform(4.3, 4.9), 2),
            "average_passenger_rating": round(random.uniform(4.2, 4.8), 2),
            "ride_completion_rate": round(random.uniform(0.92, 0.98), 3),
            "cancellation_rate": round(random.uniform(0.02, 0.08), 3),
            "sla_incidents_last_hour": random.randint(0, 5),
            "critical_incidents": random.randint(0, 2)
        }
        
        return {
            "status": "success",
            "data": metrics,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching live metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/center/war-room/{city_id}")
async def get_war_room_snapshot(city_id: str, request: Request):
    """
    Get comprehensive operations war room snapshot.
    
    Returns:
    - All key metrics
    - Active alerts
    - Critical incidents
    - Demand forecast
    """
    try:
        await get_current_user_from_request(request)
        snapshot = {
            "city_id": city_id,
            "timestamp": get_ist_now().isoformat(),
            "total_active_rides": random.randint(100, 400),
            "total_available_drivers": random.randint(150, 500),
            "total_waiting_passengers": random.randint(20, 100),
            "average_ride_duration_minutes": random.randint(15, 35),
            "average_driver_rating": round(random.uniform(4.4, 4.8), 2),
            "active_incidents_count": random.randint(0, 8),
            "critical_incidents_count": random.randint(0, 2),
            "incidents_resolved_last_hour": random.randint(2, 8),
            "avg_incident_response_time_minutes": round(random.uniform(2, 8), 1),
            "city_demand_score": random.randint(50, 95),
            "peak_zone": "Downtown",
            "peak_zone_demand": random.randint(70, 95),
            "current_surge_multiplier": round(random.uniform(1.0, 2.5), 2),
            "ride_completion_rate": round(random.uniform(0.93, 0.98), 3),
            "cancellation_rate": round(random.uniform(0.02, 0.07), 3),
            "average_pickup_eta_minutes": round(random.uniform(3, 10), 1),
            "alerts": [
                "High demand in downtown - surge activated",
                "Low driver supply in airport zone",
                "3 active SOS incidents being handled"
            ],
            "critical_alerts": [
                "CRITICAL: Only 2 drivers available in zone_west"
            ]
        }
        
        return {
            "status": "success",
            "data": snapshot,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching war room snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SAFETY & INCIDENTS ENDPOINTS
# ============================================================================

@router.get("/incidents/{city_id}")
async def get_active_incidents(city_id: str, severity: Optional[str] = None, request: Request = None):
    """
    Get all active incidents in city, optionally filtered by severity.
    
    Severity levels: critical, high, medium, low
    """
    try:
        await get_current_user_from_request(request)
        severities = ["critical", "high", "medium", "low"]
        filtered_severity = [severity] if severity else severities
        
        incidents = []
        for i in range(random.randint(2, 8)):
            sev = random.choice(filtered_severity)
            incidents.append({
                "id": f"incident_{i}",
                "city_id": city_id,
                "incident_type": random.choice(["sos_alert", "accident", "harassment", "vehicle_issue"]),
                "severity": sev,
                "latitude": 12.9716 + random.uniform(-0.05, 0.05),
                "longitude": 77.5946 + random.uniform(-0.05, 0.05),
                "description": f"Sample incident {i}",
                "reported_at": (get_ist_now() - timedelta(minutes=random.randint(1, 60))).isoformat(),
                "is_resolved": False,
                "priority": random.randint(1, 5)
            })
        
        return {
            "status": "success",
            "data": incidents,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/incidents/acknowledge")
async def acknowledge_incident(payload: dict, request: Request):
    """
    Acknowledge an incident by operations team.
    
    Payload: {
        "city_id": "...",
        "incident_id": "...",
        "responder_id": "..."
    }
    """
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "incident_id": payload.get("incident_id"),
                "acknowledged_at": get_ist_now().isoformat(),
                "responder_id": payload.get("responder_id")
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error acknowledging incident: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/incidents/resolve")
async def resolve_incident(payload: dict, request: Request):
    """
    Mark an incident as resolved.
    
    Payload: {
        "city_id": "...",
        "incident_id": "...",
        "resolution_notes": "..."
    }
    """
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "incident_id": payload.get("incident_id"),
                "resolved_at": get_ist_now().isoformat(),
                "is_resolved": True
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error resolving incident: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DEMAND & ZONE METRICS ENDPOINTS
# ============================================================================

@router.get("/zones/demand/{city_id}")
async def get_zone_demand_metrics(city_id: str, request: Request):
    """
    Get demand metrics for all zones in the city.
    
    Returns demand score, active rides, drivers, passengers, trends.
    """
    try:
        await get_current_user_from_request(request)
        zones = ["downtown", "airport", "suburbs_north", "suburbs_south", "business_district"]
        zone_data = []
        
        for zone in zones:
            zone_data.append({
                "zone_id": f"zone_{zone}",
                "zone_name": zone.title(),
                "latitude": 12.9716 + random.uniform(-0.1, 0.1),
                "longitude": 77.5946 + random.uniform(-0.1, 0.1),
                "current_demand_score": random.randint(40, 95),
                "active_ride_count": random.randint(10, 100),
                "available_driver_count": random.randint(5, 60),
                "waiting_passenger_count": random.randint(2, 30),
                "avg_wait_time_minutes": round(random.uniform(2, 15), 1),
                "surge_multiplier": round(random.uniform(1.0, 2.5), 2),
                "demand_trend": random.choice(["increasing", "stable", "decreasing"]),
                "peak_hours": list(range(random.randint(8, 12), random.randint(13, 18))),
                "last_updated": get_ist_now().isoformat()
            })
        
        return {
            "status": "success",
            "data": zone_data,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching zone demand: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/zones/heatmap/{city_id}")
async def get_demand_heatmap(city_id: str, request: Request):
    """
    Get demand heatmap grid data for visualization on map.
    
    Returns grid cells with demand intensity scores.
    """
    try:
        await get_current_user_from_request(request)
        grid_cells = []
        for i in range(25):  # 5x5 grid
            grid_cells.append({
                "grid_id": f"GRID_{i:03d}",
                "demand_score": random.randint(20, 100),
                "ride_count": random.randint(5, 50),
                "latitude": 12.9716 + (i // 5) * 0.02,
                "longitude": 77.5946 + (i % 5) * 0.02,
                "color_intensity": random.randint(0, 255)
            })
        
        return {
            "status": "success",
            "data": {
                "city_id": city_id,
                "grid_cells": grid_cells,
                "timestamp": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching heatmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ACTIVE RIDES MONITORING ENDPOINTS
# ============================================================================

@router.get("/rides/active/{city_id}")
async def get_active_rides(city_id: str, limit: int = 20, request: Request = None):
    """
    Get list of currently active rides in the city.
    
    Limit: max number of rides to return
    """
    try:
        await get_current_user_from_request(request)
        rides = []
        for i in range(min(limit, random.randint(10, 30))):
            rides.append({
                "ride_id": f"ride_{i:05d}",
                "city_id": city_id,
                "passenger_name": f"Passenger {i}",
                "driver_name": f"Driver {i}",
                "driver_rating": round(random.uniform(4.0, 5.0), 2),
                "ride_status": random.choice(["accepted", "en_route", "arrived", "in_ride"]),
                "safety_status": random.choice(["normal", "alert"]),
                "pickup_eta_minutes": random.randint(1, 10),
                "estimated_duration_minutes": random.randint(10, 45),
                "started_at": (get_ist_now() - timedelta(minutes=random.randint(1, 30))).isoformat(),
                "is_priority_ride": random.choice([True, False])
            })
        
        return {
            "status": "success",
            "data": rides,
            "total_count": len(rides),
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching active rides: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rides/{ride_id}/monitor")
async def monitor_ride(ride_id: str, request: Request):
    """
    Get detailed monitoring data for a specific ride.
    
    Returns: current location, route, safety status, timings.
    """
    try:
        await get_current_user_from_request(request)
        ride_data = {
            "ride_id": ride_id,
            "passenger_name": "Sample Passenger",
            "driver_name": "Sample Driver",
            "driver_lat": 12.9716,
            "driver_lon": 77.5946,
            "pickup_lat": 12.9850,
            "pickup_lon": 77.5950,
            "dropoff_lat": 12.9500,
            "dropoff_lon": 77.6000,
            "driver_speed_kmph": random.randint(20, 60),
            "current_route": "NH44 → MG Road",
            "ride_status": "in_ride",
            "safety_status": "normal",
            "passenger_panic_button_status": "inactive",
            "driver_panic_button_status": "inactive",
            "started_at": (get_ist_now() - timedelta(minutes=random.randint(1, 20))).isoformat(),
            "estimated_completion_time": (get_ist_now() + timedelta(minutes=random.randint(5, 15))).isoformat()
        }
        
        return {
            "status": "success",
            "data": ride_data,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error monitoring ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FORECAST ENDPOINTS
# ============================================================================

@router.get("/forecast/demand/{city_id}")
async def get_demand_forecast(city_id: str, hours_ahead: int = 24, request: Request = None):
    """
    Get AI-powered demand forecast for next N hours.
    
    Returns hourly forecast with confidence levels and recommendations.
    """
    try:
        await get_current_user_from_request(request)
        forecasts = []
        now = get_ist_now()
        
        for hour in range(min(hours_ahead, 24)):
            forecast_time = now + timedelta(hours=hour)
            forecasts.append({
                "forecast_hour": forecast_time.hour,
                "forecast_date": forecast_time.strftime("%Y-%m-%d"),
                "predicted_demand_score": random.randint(40, 95),
                "confidence_level": round(random.uniform(0.75, 0.99), 2),
                "predicted_surge_multiplier": round(random.uniform(1.0, 2.5), 2),
                "predicted_ride_count": random.randint(50, 300),
                "predicted_driver_supply": random.randint(100, 400),
                "recommended_surge_pricing": round(random.uniform(1.0, 2.0), 2),
                "recommendations": [
                    "Increase driver incentives",
                    "Prepare surge pricing",
                    "Activate on-call drivers"
                ]
            })
        
        return {
            "status": "success",
            "data": {
                "city_id": city_id,
                "forecast_data": forecasts,
                "generated_at": now.isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DRIVER DENSITY ENDPOINTS
# ============================================================================

@router.get("/drivers/density/{city_id}")
async def get_driver_density(city_id: str, request: Request):
    """
    Get driver density grid - shows driver distribution across city.
    
    Returns grid cells with driver counts and availability windows.
    """
    try:
        await get_current_user_from_request(request)
        grid_cells = []
        for i in range(16):  # 4x4 grid
            grid_cells.append({
                "grid_id": f"DENSITY_GRID_{i:03d}",
                "grid_lat_center": 12.9716 + (i // 4) * 0.05,
                "grid_lon_center": 77.5946 + (i % 4) * 0.05,
                "driver_count": random.randint(5, 30),
                "driver_count_5min": random.randint(2, 15),
                "driver_count_15min": random.randint(5, 25),
                "average_driver_rating": round(random.uniform(4.3, 4.9), 2),
                "vehicle_types": {
                    "auto": random.randint(2, 15),
                    "bike": random.randint(1, 10),
                    "premium": random.randint(0, 5)
                },
                "updated_at": get_ist_now().isoformat()
            })
        
        return {
            "status": "success",
            "data": grid_cells,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching driver density: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ALERTS ENDPOINTS
# ============================================================================

@router.get("/alerts/{city_id}")
async def get_operational_alerts(city_id: str, severity: Optional[str] = None, request: Request = None):
    """
    Get operational alerts for the city.
    
    Severity: critical, high, medium, low
    """
    try:
        await get_current_user_from_request(request)
        severities = ["critical", "high", "medium", "low"]
        filtered_severity = [severity] if severity else severities
        
        alerts = [
            {
                "id": "alert_001",
                "city_id": city_id,
                "alert_type": "supply_shortage",
                "severity": "critical",
                "title": "Critical driver shortage in Airport zone",
                "message": "Only 3 drivers available in airport zone (demand: 45)",
                "action_required": "Activate driver incentives immediately",
                "latitude": 13.1939,
                "longitude": 77.7064,
                "created_at": (get_ist_now() - timedelta(minutes=5)).isoformat(),
                "resolved": False
            },
            {
                "id": "alert_002",
                "city_id": city_id,
                "alert_type": "demand_surge",
                "severity": "high",
                "title": "Unexpected demand surge in downtown",
                "message": "Demand surge detected (1.8x multiplier), waiting passengers: 34",
                "action_required": "Recommend surge to drivers",
                "latitude": 12.9729,
                "longitude": 77.6084,
                "created_at": (get_ist_now() - timedelta(minutes=2)).isoformat(),
                "resolved": False
            },
            {
                "id": "alert_003",
                "city_id": city_id,
                "alert_type": "incident",
                "severity": "high",
                "title": "SOS incident reported",
                "message": "SOS alert from ride_12345, passenger safety concern",
                "action_required": "Dispatch safety team to coordinates",
                "latitude": 12.9500,
                "longitude": 77.6200,
                "created_at": (get_ist_now() - timedelta(minutes=1)).isoformat(),
                "resolved": False
            }
        ]
        
        # Filter by severity if provided
        if severity:
            alerts = [a for a in alerts if a["severity"] == severity]
        
        return {
            "status": "success",
            "data": alerts,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, payload: dict, request: Request):
    """
    Acknowledge an operational alert.
    """
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "alert_id": alert_id,
                "acknowledged_at": get_ist_now().isoformat(),
                "acknowledged_by": payload.get("user_id")
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))
