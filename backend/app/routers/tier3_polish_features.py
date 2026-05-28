"""
TIER 3: Polish & Optimization Features
- Ride pooling detection
- Tax report generation
- Favorite passengers management
- Shift scheduling calendar
- Gamification badges/achievements
"""

from datetime import datetime
from math import atan2, cos, radians, sin, sqrt
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.routers.auth import verify_token

router = APIRouter(prefix="/api/drivers-tier3", tags=["tier3"])


class RidePoolOpportunityRequest(BaseModel):
    pickup_location: dict = Field(..., example={"lat": 12.9352, "lng": 77.6245})
    dropoff_location: dict = Field(..., example={"lat": 13.0289, "lng": 77.5891})
    requested_time: datetime
    max_wait_time_minutes: int = 5


class RidePoolOpportunityResponse(BaseModel):
    pool_id: str
    potential_matches: int
    pooling_available: bool
    estimated_savings: float
    passengers_count: int


class PoolingAcceptRequest(BaseModel):
    pool_id: str


class TaxReportRequest(BaseModel):
    start_date: datetime
    end_date: datetime
    report_type: str = Field(..., pattern="^(monthly|quarterly|annual)$")
    include_expenses: bool = True


class TaxReportResponse(BaseModel):
    report_id: str
    report_period: str
    gross_earnings: float
    deductible_expenses: float
    taxable_income: float
    tax_liability: float
    report_url: str
    generated_at: datetime


class FavoritePassengerRequest(BaseModel):
    passenger_id: str
    notes: Optional[str] = None
    rating: int = Field(5, ge=1, le=5)


class FavoritePassengerUpdateRequest(BaseModel):
    notes: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)


class FavoritePassengerResponse(BaseModel):
    id: str
    driver_id: str
    passenger_id: str
    passenger_name: str
    notes: Optional[str]
    rating: int
    rides_completed: int
    favorite_since: datetime
    added_at: datetime


class ShiftScheduleRequest(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: str = Field(..., pattern="^\\d{2}:\\d{2}$")
    end_time: str = Field(..., pattern="^\\d{2}:\\d{2}$")
    is_active: bool = True
    is_recurring: bool = True


class ShiftScheduleUpdateRequest(BaseModel):
    start_time: Optional[str] = Field(None, pattern="^\\d{2}:\\d{2}$")
    end_time: Optional[str] = Field(None, pattern="^\\d{2}:\\d{2}$")
    is_active: Optional[bool] = None
    is_recurring: Optional[bool] = None


class ShiftScheduleResponse(BaseModel):
    id: str
    driver_id: str
    day_of_week: int
    start_time: str
    end_time: str
    is_active: bool
    is_recurring: bool
    created_at: datetime


class BadgeAchievementResponse(BaseModel):
    id: str
    driver_id: str
    badge_type: str
    badge_name: str
    badge_icon: str
    earned_at: Optional[datetime] = None
    progress: Optional[float] = None


class PoolingAnalyticsResponse(BaseModel):
    total_pools_detected: int
    pools_accepted: int
    acceptance_rate: float
    potential_savings: float
    earnings_with_pooling: float
    earnings_without_pooling: float


class TaxReportListResponse(BaseModel):
    reports: List[TaxReportResponse]
    total: int


def _driver_id(user_data: dict) -> str:
    driver_id = user_data.get("driver_id") or user_data.get("id") or user_data.get("user_id")
    if not driver_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver identity not found")
    return str(driver_id)


def _mongo(request: Request):
    return getattr(getattr(request, "app", None), "state", None) and getattr(request.app.state, "db", None)


def _now() -> datetime:
    return datetime.now()


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    cleaned = dict(doc)
    cleaned.pop("_id", None)
    return cleaned


def _status_value(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return normalized.split(".")[-1] if "." in normalized else normalized


def _as_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _timestamp(value: Any) -> Optional[float]:
    parsed = _as_datetime(value)
    if not parsed:
        return None
    return parsed.timestamp()


def _in_period(value: Any, start: datetime, end: datetime) -> bool:
    value_ts = _timestamp(value)
    return value_ts is not None and start.timestamp() <= value_ts <= end.timestamp()


def _lat_lng(location: Optional[Dict[str, Any]]) -> Optional[tuple[float, float]]:
    if not isinstance(location, dict):
        return None
    lat = location.get("latitude", location.get("lat"))
    lng = location.get("longitude", location.get("lng"))
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


def _distance_km(first: Optional[Dict[str, Any]], second: Optional[Dict[str, Any]]) -> Optional[float]:
    first_point = _lat_lng(first)
    second_point = _lat_lng(second)
    if not first_point or not second_point:
        return None
    lat1, lon1 = first_point
    lat2, lon2 = second_point
    radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    arc = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return radius_km * 2 * atan2(sqrt(arc), sqrt(1 - arc))


def _fare_amount(booking: Dict[str, Any]) -> float:
    for key in ("driver_net_earnings", "driver_earnings", "driver_payout", "final_fare", "estimated_fare", "fare"):
        try:
            amount = float(booking.get(key) or 0)
        except (TypeError, ValueError):
            amount = 0.0
        if amount > 0:
            return amount
    return 0.0


def _expense_amount(booking: Dict[str, Any]) -> float:
    for key in ("driver_expenses_total", "total_expenses", "deductible_expenses"):
        try:
            amount = float(booking.get(key) or 0)
        except (TypeError, ValueError):
            amount = 0.0
        if amount > 0:
            return amount
    return 0.0


async def _completed_bookings(db, driver_id: str) -> List[Dict[str, Any]]:
    rows = await db.bookings.find({"driver_id": driver_id}, {"_id": 0}).to_list(None)
    return [row for row in rows if _status_value(row.get("status")) == "completed"]


async def _driver_metrics(db, driver_id: str) -> Dict[str, Any]:
    bookings = await _completed_bookings(db, driver_id)
    ratings = await db.ratings.find({"to_user_id": driver_id}, {"_id": 0, "rating": 1, "created_at": 1}).to_list(None)
    rating_values = []
    for item in ratings:
        try:
            rating_values.append(float(item.get("rating") or 0))
        except (TypeError, ValueError):
            pass
    avg_rating = round(sum(rating_values) / len(rating_values), 2) if rating_values else 0.0
    gross_earnings = sum(_fare_amount(booking) for booking in bookings)
    recent_cutoff = _now().timestamp() - (30 * 24 * 60 * 60)
    recent_rides = sum(
        1
        for booking in bookings
        if (_timestamp(booking.get("completed_at") or booking.get("updated_at") or booking.get("created_at")) or 0) >= recent_cutoff
    )
    return {
        "completed_rides": len(bookings),
        "gross_earnings": gross_earnings,
        "avg_rating": avg_rating,
        "rating_count": len(rating_values),
        "low_rating_count": sum(1 for rating in rating_values if rating <= 3),
        "recent_rides": recent_rides,
    }


def _badge_catalog(driver_id: str, metrics: Dict[str, Any]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    now = _now()
    earned = []
    progress = []
    definitions = [
        ("milestone", "100 Rides Club", "100", metrics["completed_rides"], 100),
        ("performance", "High Earner", "TOP", metrics["gross_earnings"], 50000),
        ("customer_service", "Customer Favorite", "5STAR", metrics["avg_rating"] if metrics["rating_count"] >= 10 else 0, 4.8),
        ("consistency", "Consistent Driver", "STREAK", metrics["recent_rides"], 20),
        ("safety", "Safe Ride Streak", "SAFE", 1 if metrics["completed_rides"] >= 25 and metrics["low_rating_count"] == 0 else 0, 1),
    ]
    for index, (badge_type, badge_name, badge_icon, value, target) in enumerate(definitions, start=1):
        percent = min(100.0, round((float(value or 0) / float(target)) * 100, 2)) if target else 0.0
        badge = {
            "id": f"{driver_id}:{badge_type}",
            "driver_id": driver_id,
            "badge_type": badge_type,
            "badge_name": badge_name,
            "badge_icon": badge_icon,
            "earned_at": now if percent >= 100 else None,
            "progress": None if percent >= 100 else percent,
            "sort_order": index,
        }
        if percent >= 100:
            earned.append(badge)
        else:
            progress.append(badge)
    return earned, progress


def _favorite_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    response = _clean_doc(doc) or {}
    response.setdefault("favorite_since", response.get("added_at") or _now())
    response.setdefault("added_at", _now())
    response.setdefault("rides_completed", 0)
    response.setdefault("passenger_name", "Passenger")
    return response


async def _passenger_summary(db, driver_id: str, passenger_id: str) -> Dict[str, Any]:
    passenger = await db.users.find_one({"id": passenger_id}, {"_id": 0, "name": 1})
    bookings = await db.bookings.find(
        {
            "driver_id": driver_id,
            "passenger_id": passenger_id,
            "status": {"$in": ["completed", "BookingStatus.COMPLETED"]},
        },
        {"_id": 0, "created_at": 1, "completed_at": 1, "passenger_name": 1},
    ).to_list(None)
    dates = [
        _as_datetime(item.get("completed_at") or item.get("created_at"))
        for item in bookings
        if _as_datetime(item.get("completed_at") or item.get("created_at"))
    ]
    return {
        "passenger_name": (passenger or {}).get("name") or (bookings[0].get("passenger_name") if bookings else None) or "Passenger",
        "rides_completed": len(bookings),
        "favorite_since": min(dates) if dates else _now(),
    }


@router.post("/pooling/detect", response_model=RidePoolOpportunityResponse)
async def detect_pooling_opportunity(
    request_payload: RidePoolOpportunityRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)

    candidate_statuses = ["pending", "scheduled", "accepted", "BookingStatus.PENDING", "BookingStatus.SCHEDULED", "BookingStatus.ACCEPTED"]
    candidates = await db.bookings.find(
        {"driver_id": {"$ne": driver_id}, "status": {"$in": candidate_statuses}},
        {"_id": 0},
    ).to_list(100)
    matches = []
    for booking in candidates:
        pickup_distance = _distance_km(request_payload.pickup_location, booking.get("pickup_location"))
        drop_distance = _distance_km(request_payload.dropoff_location, booking.get("drop_location") or booking.get("dropoff_location"))
        if pickup_distance is not None and drop_distance is not None and pickup_distance <= 2.0 and drop_distance <= 3.0:
            matches.append({
                "booking_id": booking.get("id"),
                "pickup_distance_km": round(pickup_distance, 2),
                "drop_distance_km": round(drop_distance, 2),
                "estimated_fare": _fare_amount(booking),
            })

    pool_id = str(uuid.uuid4())
    estimated_savings = round(sum(item["estimated_fare"] for item in matches) * 0.1, 2)
    doc = {
        "id": pool_id,
        "pool_id": pool_id,
        "driver_id": driver_id,
        "pickup_location": request_payload.pickup_location,
        "dropoff_location": request_payload.dropoff_location,
        "requested_time": request_payload.requested_time,
        "matches": matches,
        "potential_matches": len(matches),
        "pooling_available": bool(matches),
        "estimated_savings": estimated_savings,
        "passengers_count": len(matches) + 1,
        "status": "detected",
        "created_at": _now(),
    }
    await db.driver_ride_pools.insert_one(doc)
    return {
        "pool_id": pool_id,
        "potential_matches": len(matches),
        "pooling_available": bool(matches),
        "estimated_savings": estimated_savings,
        "passengers_count": len(matches) + 1,
    }


@router.get("/pooling/analytics", response_model=PoolingAnalyticsResponse)
async def get_pooling_analytics(request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    pools = await db.driver_ride_pools.find({"driver_id": driver_id}, {"_id": 0}).to_list(None)
    accepted = [pool for pool in pools if pool.get("status") == "accepted"]
    potential_savings = sum(float(pool.get("estimated_savings") or 0) for pool in pools)
    accepted_earnings = sum(float(pool.get("estimated_savings") or 0) for pool in accepted)
    return {
        "total_pools_detected": len(pools),
        "pools_accepted": len(accepted),
        "acceptance_rate": round((len(accepted) / len(pools)) * 100, 2) if pools else 0.0,
        "potential_savings": round(potential_savings, 2),
        "earnings_with_pooling": round(accepted_earnings, 2),
        "earnings_without_pooling": 0.0,
    }


@router.post("/pooling/accept")
async def accept_pooling_offer(
    payload: PoolingAcceptRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    result = await db.driver_ride_pools.update_one(
        {"pool_id": payload.pool_id, "driver_id": driver_id},
        {"$set": {"status": "accepted", "accepted_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pooling offer not found")
    return {"status": "accepted", "pool_id": payload.pool_id, "confirmed_at": _now().isoformat()}


@router.post("/tax-reports/generate", response_model=TaxReportResponse)
async def generate_tax_report(
    payload: TaxReportRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="end_date must be after start_date")

    completed = await _completed_bookings(db, driver_id)
    period_bookings = [
        booking
        for booking in completed
        if _in_period(booking.get("completed_at") or booking.get("updated_at") or booking.get("created_at"), payload.start_date, payload.end_date)
    ]
    gross_earnings = round(sum(_fare_amount(booking) for booking in period_bookings), 2)
    deductible_expenses = round(sum(_expense_amount(booking) for booking in period_bookings), 2) if payload.include_expenses else 0.0
    taxable_income = max(0.0, round(gross_earnings - deductible_expenses, 2))
    tax_liability = round(taxable_income * 0.15, 2)
    report_id = str(uuid.uuid4())
    report = {
        "id": report_id,
        "report_id": report_id,
        "driver_id": driver_id,
        "report_period": f"{payload.start_date.date()}_to_{payload.end_date.date()}",
        "report_type": payload.report_type,
        "gross_earnings": gross_earnings,
        "deductible_expenses": deductible_expenses,
        "taxable_income": taxable_income,
        "tax_liability": tax_liability,
        "booking_count": len(period_bookings),
        "report_url": f"/api/drivers-tier3/tax-reports/download/{report_id}",
        "generated_at": _now(),
    }
    await db.driver_tax_reports.insert_one(report)
    return _clean_doc(report)


@router.get("/tax-reports/history", response_model=TaxReportListResponse)
async def get_tax_reports(request: Request, limit: int = 12, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    reports = await db.driver_tax_reports.find({"driver_id": driver_id}, {"_id": 0}).sort("generated_at", -1).limit(limit).to_list(limit)
    return {"reports": reports, "total": len(reports)}


@router.post("/tax-reports/download/{report_id}")
async def download_tax_report(report_id: str, request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    report = await db.driver_tax_reports.find_one({"report_id": report_id, "driver_id": driver_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Tax report not found")
    return {
        "download_url": f"/api/drivers-tier3/tax-reports/download/{report_id}",
        "filename": f"tax-report-{report_id}.json",
        "expires_in_hours": 24,
    }


@router.post("/favorite-passengers", response_model=FavoritePassengerResponse)
async def add_favorite_passenger(
    payload: FavoritePassengerRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    summary = await _passenger_summary(db, driver_id, payload.passenger_id)
    existing = await db.driver_favorite_passengers.find_one({"driver_id": driver_id, "passenger_id": payload.passenger_id}, {"_id": 0})
    favorite_id = (existing or {}).get("id") or str(uuid.uuid4())
    doc = {
        "id": favorite_id,
        "driver_id": driver_id,
        "passenger_id": payload.passenger_id,
        "passenger_name": summary["passenger_name"],
        "notes": payload.notes,
        "rating": payload.rating,
        "rides_completed": summary["rides_completed"],
        "favorite_since": summary["favorite_since"],
        "added_at": (existing or {}).get("added_at") or _now(),
        "updated_at": _now(),
    }
    await db.driver_favorite_passengers.update_one(
        {"driver_id": driver_id, "passenger_id": payload.passenger_id},
        {"$set": doc},
        upsert=True,
    )
    return _favorite_response(doc)


@router.get("/favorite-passengers", response_model=dict)
async def get_favorite_passengers(request: Request, limit: int = 50, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    favorites = await db.driver_favorite_passengers.find({"driver_id": driver_id}, {"_id": 0}).sort("added_at", -1).limit(limit).to_list(limit)
    return {"favorites": [_favorite_response(item) for item in favorites], "total": len(favorites)}


@router.patch("/favorite-passengers/{passenger_id}", response_model=FavoritePassengerResponse)
async def update_favorite_passenger(
    passenger_id: str,
    payload: FavoritePassengerUpdateRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = _now()
    result = await db.driver_favorite_passengers.update_one({"driver_id": driver_id, "passenger_id": passenger_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Favorite passenger not found")
    doc = await db.driver_favorite_passengers.find_one({"driver_id": driver_id, "passenger_id": passenger_id}, {"_id": 0})
    return _favorite_response(doc)


@router.delete("/favorite-passengers/{passenger_id}")
async def remove_favorite_passenger(passenger_id: str, request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    result = await db.driver_favorite_passengers.delete_one({"driver_id": driver_id, "passenger_id": passenger_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite passenger not found")
    return {"status": "removed", "passenger_id": passenger_id}


@router.post("/shift-schedule", response_model=ShiftScheduleResponse)
async def create_shift_schedule(payload: ShiftScheduleRequest, request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    schedule_id = str(uuid.uuid4())
    doc = {
        "id": schedule_id,
        "driver_id": driver_id,
        **payload.model_dump(),
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.driver_shift_schedules.insert_one(doc)
    return _clean_doc(doc)


@router.get("/shift-schedule", response_model=dict)
async def get_shift_schedules(request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedules = await db.driver_shift_schedules.find({"driver_id": driver_id}, {"_id": 0}).sort("day_of_week", 1).to_list(20)
    for schedule in schedules:
        schedule["day_name"] = days[schedule.get("day_of_week", 0)]
    return {"schedules": schedules, "total": len(schedules)}


@router.patch("/shift-schedule/{schedule_id}", response_model=ShiftScheduleResponse)
async def update_shift_schedule(
    schedule_id: str,
    payload: ShiftScheduleUpdateRequest,
    request: Request,
    user_data: dict = Depends(verify_token),
):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = _now()
    result = await db.driver_shift_schedules.update_one({"id": schedule_id, "driver_id": driver_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Shift schedule not found")
    doc = await db.driver_shift_schedules.find_one({"id": schedule_id, "driver_id": driver_id}, {"_id": 0})
    return doc


@router.delete("/shift-schedule/{schedule_id}")
async def delete_shift_schedule(schedule_id: str, request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    result = await db.driver_shift_schedules.delete_one({"id": schedule_id, "driver_id": driver_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shift schedule not found")
    return {"status": "deleted", "schedule_id": schedule_id}


@router.get("/badges/earned", response_model=dict)
async def get_earned_badges(request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    earned, _ = _badge_catalog(driver_id, await _driver_metrics(db, driver_id))
    return {"badges": earned, "total": len(earned)}


@router.get("/badges/progress", response_model=dict)
async def get_badge_progress(request: Request, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    driver_id = _driver_id(user_data)
    _, progress = _badge_catalog(driver_id, await _driver_metrics(db, driver_id))
    return {"in_progress_badges": progress, "total": len(progress)}


@router.get("/badges/leaderboard", response_model=dict)
async def get_badges_leaderboard(request: Request, limit: int = 50, user_data: dict = Depends(verify_token)):
    db = _mongo(request)
    if db is None:
        raise HTTPException(status_code=503, detail="Feature database unavailable")
    current_driver_id = _driver_id(user_data)
    completed = await db.bookings.find(
        {"status": {"$in": ["completed", "BookingStatus.COMPLETED"]}},
        {"_id": 0, "driver_id": 1, "final_fare": 1, "estimated_fare": 1, "driver_net_earnings": 1, "driver_earnings": 1},
    ).to_list(5000)
    grouped: Dict[str, Dict[str, Any]] = {}
    for booking in completed:
        driver_id = str(booking.get("driver_id") or "").strip()
        if not driver_id:
            continue
        grouped.setdefault(driver_id, {"driver_id": driver_id, "completed_rides": 0, "gross_earnings": 0.0})
        grouped[driver_id]["completed_rides"] += 1
        grouped[driver_id]["gross_earnings"] += _fare_amount(booking)
    rows = sorted(
        grouped.values(),
        key=lambda row: (int(row.get("completed_rides") or 0), float(row.get("gross_earnings") or 0)),
        reverse=True,
    )[:max(1, min(limit, 100))]
    driver_ids = [str(row.get("driver_id") or "") for row in rows if row.get("driver_id")]
    users = await db.users.find({"id": {"$in": driver_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    names = {user["id"]: user.get("name") or "Driver" for user in users}
    leaderboard = []
    your_rank = None
    for index, row in enumerate(rows, start=1):
        driver_id = str(row.get("driver_id") or "")
        total_badges = 0
        if int(row.get("completed_rides") or 0) >= 100:
            total_badges += 1
        if float(row.get("gross_earnings") or 0) >= 50000:
            total_badges += 1
        entry = {
            "rank": index,
            "driver_name": names.get(driver_id, "Driver"),
            "driver_id": driver_id,
            "total_badges": total_badges,
            "recent_badge": "100 Rides Club" if total_badges else None,
        }
        if driver_id == current_driver_id:
            your_rank = index
        leaderboard.append(entry)
    return {"leaderboard": leaderboard, "your_rank": your_rank, "total_drivers": len(rows)}


@router.get("/health/tier3")
async def health_check_tier3():
    return {
        "status": "ok",
        "tier3_endpoints": "operational",
        "features": [
            "ride-pooling-detection",
            "tax-report-generation",
            "favorite-passengers",
            "shift-scheduling",
            "gamification-badges",
        ],
    }
