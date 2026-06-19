"""
Core Flow API Endpoints for Mobile App Integration
Covers Passenger, Driver, Operator, and Admin flows
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from app.db.deps import get_db
from app.utils.rbac import get_current_user_secure
import logging

logger = logging.getLogger("autobuddy.core_flows")

router = APIRouter(prefix="/api", tags=["core-flows"])


# ==================== Response Models ====================

class UserResponse(BaseModel):
    id: str
    name: str
    phone: str
    role: str
    email: Optional[str] = None
    photo: Optional[str] = None
    rating: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RideResponse(BaseModel):
    id: str
    passenger_id: str
    driver_id: Optional[str] = None
    pickup_location: str
    dropoff_location: str
    fare: float
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class DriverStatusResponse(BaseModel):
    id: str
    name: str
    phone: str
    online: bool
    rating: float
    total_rides: int
    vehicle_info: Optional[Dict[str, Any]] = None
    earnings_today: float

    class Config:
        from_attributes = True


class EarningsResponse(BaseModel):
    today: float
    week: float
    month: float
    average_rating: float
    total_rides: int
    acceptance_rate: float

    class Config:
        from_attributes = True


class AlertResponse(BaseModel):
    id: str
    title: str
    description: str
    severity: str  # critical, high, medium, low
    created_at: datetime

    class Config:
        from_attributes = True


class SystemHealthResponse(BaseModel):
    api_status: str
    database_status: str
    cache_status: str
    payment_gateway_status: str
    timestamp: datetime

    class Config:
        from_attributes = True


# ==================== Passenger Endpoints ====================

@router.get("/passengers/me/profile", response_model=UserResponse)
async def get_passenger_profile(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get current passenger profile"""
    if current_user.get("role") != "passenger":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only passengers can access this endpoint"
        )

    passengers = db.get_collection("passengers")
    passenger = await passengers.find_one({"user_id": current_user["id"]})

    return UserResponse(
        id=current_user["id"],
        name=current_user.get("name", ""),
        phone=current_user.get("phone", ""),
        role="passenger",
        email=current_user.get("email"),
        photo=current_user.get("photo"),
        rating=passenger.get("rating", 0) if passenger else 0,
        created_at=current_user.get("created_at", datetime.utcnow()),
    )


@router.post("/passengers/rides/book")
async def book_ride(
    booking_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Book a ride"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Only passengers can book rides")

    rides = db.get_collection("rides")
    ride = {
        "_id": str(__import__("uuid").uuid4()),
        "passenger_id": current_user["id"],
        "pickup": booking_data.get("pickup"),
        "dropoff": booking_data.get("dropoff"),
        "ride_type": booking_data.get("ride_type", "economy"),
        "status": "searching",
        "created_at": datetime.utcnow(),
        "fare": booking_data.get("estimated_fare", 0),
    }

    result = await rides.insert_one(ride)
    return {"ride_id": str(result.inserted_id), "status": "searching"}


@router.get("/passengers/rides/{booking_id}/tracking")
async def get_ride_tracking(
    booking_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get live tracking for current ride"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Unauthorized")

    rides = db.get_collection("rides")
    ride = await rides.find_one({"_id": booking_id})

    if not ride or ride.get("passenger_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Ride not found")

    drivers = db.get_collection("drivers")
    driver = await drivers.find_one({"_id": ride.get("driver_id")}) if ride.get("driver_id") else None

    return {
        "ride_id": booking_id,
        "status": ride.get("status"),
        "driver": {
            "name": driver.get("name") if driver else None,
            "phone": driver.get("phone") if driver else None,
            "rating": driver.get("rating", 0) if driver else 0,
            "vehicle": driver.get("vehicle_info") if driver else None,
            "location": driver.get("current_location") if driver else None,
            "eta": ride.get("eta"),
        } if driver else None,
    }


@router.post("/passengers/rides/{booking_id}/cancel")
async def cancel_ride(
    booking_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Cancel a ride"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Unauthorized")

    rides = db.get_collection("rides")
    ride = await rides.find_one({"_id": booking_id})

    if not ride or ride.get("passenger_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Ride not found")

    if ride.get("status") in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot cancel completed or already cancelled ride")

    await rides.update_one({"_id": booking_id}, {"$set": {"status": "cancelled"}})
    return {"message": "Ride cancelled successfully"}


@router.get("/passengers/me/ride-history")
async def get_ride_history(
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get passenger ride history"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Unauthorized")

    rides = db.get_collection("rides")
    history = await rides.find(
        {"passenger_id": current_user["id"]},
        skip=offset,
        limit=limit,
        sort=[("created_at", -1)]
    ).to_list(None)

    return {
        "rides": [
            {
                "id": str(ride["_id"]),
                "driver_name": ride.get("driver_name", ""),
                "pickup": ride.get("pickup"),
                "dropoff": ride.get("dropoff"),
                "fare": ride.get("fare", 0),
                "rating": ride.get("rating"),
                "date": ride.get("created_at"),
            } for ride in history
        ],
        "total": len(history),
    }


@router.post("/passengers/rides/schedule")
async def schedule_ride(
    schedule_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Schedule a ride for later"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Unauthorized")

    scheduled_rides = db.get_collection("scheduled_rides")
    scheduled = {
        "_id": str(__import__("uuid").uuid4()),
        "passenger_id": current_user["id"],
        "pickup": schedule_data.get("pickup"),
        "dropoff": schedule_data.get("dropoff"),
        "scheduled_time": schedule_data.get("scheduled_time"),
        "ride_type": schedule_data.get("ride_type", "economy"),
        "status": "scheduled",
        "created_at": datetime.utcnow(),
    }

    result = await scheduled_rides.insert_one(scheduled)
    return {"schedule_id": str(result.inserted_id), "status": "scheduled"}


@router.post("/passengers/rides/estimate-fare")
async def estimate_fare(
    fare_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
):
    """Estimate fare for a route"""
    origin = fare_data.get("origin")
    destination = fare_data.get("destination")
    ride_type = fare_data.get("ride_type", "economy")

    # Base fare calculation (simplified)
    base_fare = 50
    per_km = 15
    distance_km = 5  # placeholder

    multipliers = {"bike": 1, "economy": 1.5, "premium": 2.5, "xl": 3}
    multiplier = multipliers.get(ride_type, 1)

    estimated_fare = (base_fare + (per_km * distance_km)) * multiplier

    return {
        "estimated_fare": round(estimated_fare, 2),
        "currency": "INR",
        "ride_type": ride_type,
        "distance": distance_km,
    }


@router.get("/passengers/me/payment-methods")
async def get_payment_methods(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get saved payment methods"""
    if current_user.get("role") != "passenger":
        raise HTTPException(status_code=403, detail="Unauthorized")

    payments = db.get_collection("payment_methods")
    methods = await payments.find({"user_id": current_user["id"]}).to_list(None)

    return {
        "payment_methods": [
            {
                "id": str(m["_id"]),
                "type": m.get("type"),  # wallet, upi, card, cash
                "name": m.get("name"),
                "is_default": m.get("is_default", False),
            } for m in methods
        ]
    }


# ==================== Driver Endpoints ====================

@router.get("/drivers/me/profile", response_model=UserResponse)
async def get_driver_profile(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get driver profile"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    drivers = db.get_collection("drivers")
    driver = await drivers.find_one({"user_id": current_user["id"]})

    return UserResponse(
        id=current_user["id"],
        name=current_user.get("name", ""),
        phone=current_user.get("phone", ""),
        role="driver",
        email=current_user.get("email"),
        photo=current_user.get("photo"),
        rating=driver.get("rating", 0) if driver else 0,
        created_at=current_user.get("created_at", datetime.utcnow()),
    )


@router.get("/drivers/me/earnings", response_model=EarningsResponse)
async def get_driver_earnings(
    period: str = "day",
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get driver earnings"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Calculate earnings based on completed rides
    now = datetime.utcnow()
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0)
    elif period == "week":
        start_date = now - timedelta(days=now.weekday())
    else:  # month
        start_date = now.replace(day=1)

    rides = db.get_collection("rides")
    completed_rides = await rides.find({
        "driver_id": current_user["id"],
        "status": "completed",
        "created_at": {"$gte": start_date}
    }).to_list(None)

    total_earnings = sum(ride.get("driver_earning", 0) for ride in completed_rides)

    return EarningsResponse(
        today=total_earnings if period == "day" else 0,
        week=total_earnings if period == "week" else 0,
        month=total_earnings if period == "month" else 0,
        average_rating=4.8,  # placeholder
        total_rides=len(completed_rides),
        acceptance_rate=0.92,  # placeholder
    )


@router.get("/drivers/me/documents")
async def get_driver_documents(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get driver document status"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    documents = db.get_collection("driver_documents")
    driver_docs = await documents.find({"driver_id": current_user["id"]}).to_list(None)

    return {
        "documents": [
            {
                "id": str(doc["_id"]),
                "type": doc.get("type"),
                "status": doc.get("status"),  # pending, verified, rejected
                "uploaded_at": doc.get("uploaded_at"),
                "expires_at": doc.get("expires_at"),
            } for doc in driver_docs
        ]
    }


@router.put("/rides/{ride_id}/accept")
async def accept_ride(
    ride_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Accept a ride request"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    rides = db.get_collection("rides")
    ride = await rides.find_one({"_id": ride_id})

    if not ride or ride.get("status") != "searching":
        raise HTTPException(status_code=400, detail="Ride cannot be accepted")

    await rides.update_one(
        {"_id": ride_id},
        {"$set": {"driver_id": current_user["id"], "status": "accepted"}}
    )

    return {"message": "Ride accepted"}


@router.put("/rides/{ride_id}/decline")
async def decline_ride(
    ride_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Decline a ride request"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {"message": "Ride declined"}


@router.put("/drivers/me/online-status")
async def toggle_online_status(
    status_data: Dict[str, bool],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Toggle driver online/offline status"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    online = status_data.get("online", False)
    drivers = db.get_collection("drivers")

    await drivers.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"online": online, "last_status_change": datetime.utcnow()}}
    )

    return {"online": online, "message": f"Status changed to {'online' if online else 'offline'}"}


@router.get("/drivers/me/alerts/unread")
async def get_driver_alerts(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get unread alerts for driver"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    alerts = db.get_collection("alerts")
    driver_alerts = await alerts.find({
        "driver_id": current_user["id"],
        "read": False
    }).to_list(None)

    return {
        "alerts": [
            {
                "id": str(a["_id"]),
                "title": a.get("title"),
                "message": a.get("message"),
                "type": a.get("type"),
                "created_at": a.get("created_at"),
            } for a in driver_alerts
        ],
        "count": len(driver_alerts),
    }


@router.get("/drivers/me/rides")
async def get_driver_rides(
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get driver's rides for today"""
    if current_user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Unauthorized")

    rides = db.get_collection("rides")
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)

    driver_rides = await rides.find({
        "driver_id": current_user["id"],
        "created_at": {"$gte": today_start}
    }, skip=offset, limit=limit).to_list(None)

    return {
        "rides": [
            {
                "id": str(r["_id"]),
                "passenger_name": r.get("passenger_name"),
                "pickup": r.get("pickup"),
                "dropoff": r.get("dropoff"),
                "status": r.get("status"),
                "fare": r.get("fare"),
            } for r in driver_rides
        ],
        "total": len(driver_rides),
    }


# ==================== Operator Endpoints ====================

@router.get("/operators/me/fleet-stats")
async def get_fleet_stats(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get fleet statistics"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    drivers = db.get_collection("drivers")
    online_drivers = await drivers.count_documents({
        "operator_id": current_user["id"],
        "online": True
    })

    rides = db.get_collection("rides")
    active_rides = await rides.count_documents({
        "operator_id": current_user["id"],
        "status": {"$in": ["accepted", "in_progress"]}
    })

    return {
        "online_drivers": online_drivers,
        "active_rides": active_rides,
        "total_drivers": 45,  # placeholder
        "rating": 4.7,  # placeholder
        "utilization": 68.5,  # placeholder
    }


@router.get("/operators/me/drivers/metrics")
async def get_driver_metrics(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get metrics for all drivers under operator"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    drivers = db.get_collection("drivers")
    operator_drivers = await drivers.find({
        "operator_id": current_user["id"]
    }).to_list(None)

    return {
        "drivers": [
            {
                "id": str(d["_id"]),
                "name": d.get("name"),
                "today_rides": 8,  # placeholder
                "today_earnings": 1200,  # placeholder
                "week_earnings": 8500,  # placeholder
                "acceptance_rate": 0.95,
                "rating": d.get("rating", 4.5),
                "status": "online" if d.get("online") else "offline",
            } for d in operator_drivers
        ]
    }


@router.get("/operators/me/drivers/locations")
async def get_driver_locations(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get real-time driver locations"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    drivers = db.get_collection("drivers")
    operator_drivers = await drivers.find({
        "operator_id": current_user["id"],
        "online": True
    }).to_list(None)

    return {
        "locations": [
            {
                "driver_id": str(d["_id"]),
                "name": d.get("name"),
                "latitude": d.get("current_location", {}).get("lat"),
                "longitude": d.get("current_location", {}).get("lng"),
                "online": d.get("online"),
            } for d in operator_drivers
        ]
    }


@router.get("/operators/me/alerts")
async def get_operator_alerts(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get alerts for operator"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    alerts = db.get_collection("operator_alerts")
    operator_alerts = await alerts.find({
        "operator_id": current_user["id"]
    }).to_list(None)

    return {
        "alerts": [
            {
                "id": str(a["_id"]),
                "title": a.get("title"),
                "severity": a.get("severity"),  # critical, high, medium, low
                "message": a.get("message"),
                "created_at": a.get("created_at"),
            } for a in operator_alerts
        ]
    }


@router.post("/operators/me/alerts/{alert_id}/dismiss")
async def dismiss_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Dismiss an alert"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    alerts = db.get_collection("operator_alerts")
    await alerts.update_one(
        {"_id": alert_id},
        {"$set": {"dismissed": True, "dismissed_at": datetime.utcnow()}}
    )

    return {"message": "Alert dismissed"}


@router.put("/operators/me/drivers/{driver_id}/incentive")
async def update_driver_incentive(
    driver_id: str,
    incentive_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Set incentive for a driver"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    amount = incentive_data.get("incentiveAmount", 0)

    drivers = db.get_collection("drivers")
    await drivers.update_one(
        {"_id": driver_id},
        {"$set": {"current_incentive": amount}}
    )

    return {"message": "Incentive updated", "amount": amount}


@router.get("/operators/me/reports")
async def get_operator_reports(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get generated reports"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {
        "reports": [
            {
                "id": "report_1",
                "title": "Weekly Revenue Report",
                "type": "revenue",
                "generated_at": datetime.utcnow(),
                "period": "week",
            }
        ]
    }


@router.post("/operators/me/reports/generate")
async def generate_operator_report(
    report_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
):
    """Generate a new report"""
    if current_user.get("role") != "operator":
        raise HTTPException(status_code=403, detail="Unauthorized")

    report_type = report_data.get("reportType")
    period = report_data.get("period")

    return {
        "report_id": f"report_{__import__('uuid').uuid4()}",
        "type": report_type,
        "period": period,
        "status": "generating",
    }


# ==================== Admin Endpoints ====================

@router.get("/admin/metrics")
async def get_admin_metrics(
    time_range: str = "24h",
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get system metrics"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {
        "active_users": 1234,
        "daily_revenue": 45000,
        "total_rides": 8934,
        "average_rating": 4.7,
        "time_range": time_range,
    }


@router.get("/admin/system/health", response_model=SystemHealthResponse)
async def get_system_health(
    current_user: dict = Depends(get_current_user_secure),
):
    """Get system health status"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return SystemHealthResponse(
        api_status="healthy",
        database_status="healthy",
        cache_status="healthy",
        payment_gateway_status="healthy",
        timestamp=datetime.utcnow(),
    )


@router.get("/admin/alerts")
async def get_admin_alerts(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get system alerts"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    alerts = db.get_collection("system_alerts")
    system_alerts = await alerts.find({}).limit(50).to_list(None)

    return {
        "alerts": [
            {
                "id": str(a["_id"]),
                "title": a.get("title"),
                "severity": a.get("severity"),  # critical, high, medium, low
                "message": a.get("message"),
                "created_at": a.get("created_at"),
            } for a in system_alerts
        ]
    }


@router.post("/admin/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    resolution_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Resolve a system alert"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    resolution = resolution_data.get("resolution")
    alerts = db.get_collection("system_alerts")

    await alerts.update_one(
        {"_id": alert_id},
        {"$set": {"status": "resolved", "resolution": resolution, "resolved_at": datetime.utcnow()}}
    )

    return {"message": "Alert resolved"}


@router.get("/admin/compliance/status")
async def get_compliance_status(
    current_user: dict = Depends(get_current_user_secure),
):
    """Get compliance status"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {
        "compliance_score": 95,
        "new_drivers": 23,
        "support_tickets": 12,
        "policy_updates": 3,
    }


@router.get("/admin/system/config")
async def get_system_config(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get system configuration"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    config = db.get_collection("system_config")
    settings = await config.find_one({}) or {}

    return settings


@router.put("/admin/system/config")
async def update_system_config(
    config_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update system configuration"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    config = db.get_collection("system_config")
    await config.update_one(
        {},
        {"$set": config_data},
        upsert=True
    )

    return {"message": "Configuration updated"}


@router.post("/admin/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    suspend_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Suspend a user"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    reason = suspend_data.get("reason")
    duration_days = suspend_data.get("durationDays", 7)

    users = db.get_collection("users")
    suspended_until = datetime.utcnow() + timedelta(days=duration_days)

    await users.update_one(
        {"_id": user_id},
        {"$set": {"suspended": True, "suspend_reason": reason, "suspended_until": suspended_until}}
    )

    return {"message": "User suspended", "duration_days": duration_days}


@router.post("/admin/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    ban_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Ban a user permanently"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    reason = ban_data.get("reason")
    users = db.get_collection("users")

    await users.update_one(
        {"_id": user_id},
        {"$set": {"banned": True, "ban_reason": reason, "banned_at": datetime.utcnow()}}
    )

    return {"message": "User banned"}


@router.post("/admin/rides/{ride_id}/refund")
async def issue_refund(
    ride_id: str,
    refund_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Issue refund for a ride"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    amount = refund_data.get("amount", 0)
    reason = refund_data.get("reason")

    rides = db.get_collection("rides")
    await rides.update_one(
        {"_id": ride_id},
        {"$set": {"refunded": True, "refund_amount": amount, "refund_reason": reason}}
    )

    return {"message": "Refund issued", "amount": amount}


@router.post("/admin/reports/generate")
async def generate_admin_report(
    report_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user_secure),
):
    """Generate admin report"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    report_type = report_data.get("reportType")
    time_range = report_data.get("timeRange")

    return {
        "report_id": f"admin_report_{__import__('uuid').uuid4()}",
        "type": report_type,
        "time_range": time_range,
        "status": "generating",
    }


@router.get("/admin/reports/{report_id}/download")
async def download_report(
    report_id: str,
    current_user: dict = Depends(get_current_user_secure),
):
    """Download a report"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {"message": "Report download link", "url": f"/reports/{report_id}.pdf"}
