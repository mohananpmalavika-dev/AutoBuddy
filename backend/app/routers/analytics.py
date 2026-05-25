from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/analytics", tags=["analytics"])


def _utc_now() -> datetime:
    return datetime.utcnow()


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value if value is not None else default)
    except Exception:
        return default


def _status_value(value: Any) -> str:
    status = str(value or "").strip().lower()
    if "." in status:
        status = status.split(".")[-1]
    return status


def _start_date(days: int) -> datetime:
    safe_days = max(1, min(int(days or 30), 365))
    return _utc_now() - timedelta(days=safe_days)


@router.get("/overview")
async def analytics_overview(
    days: int = 30,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)

    total_bookings = await db.bookings.count_documents({"created_at": {"$gte": since}})
    completed = await db.bookings.count_documents({"status": "completed", "created_at": {"$gte": since}})
    cancelled = await db.bookings.count_documents({"status": "cancelled", "created_at": {"$gte": since}})
    active_drivers = await db.drivers.count_documents({"is_available": True})

    revenue_rows = await db.bookings.aggregate(
        [
            {"$match": {"status": "completed", "created_at": {"$gte": since}}},
            {"$group": {"_id": None, "revenue": {"$sum": {"$ifNull": ["$final_fare", "$estimated_fare"]}}}},
        ]
    ).to_list(1)
    revenue = round(_to_float(revenue_rows[0].get("revenue")) if revenue_rows else 0.0, 2)

    return {
        "period_days": max(1, min(int(days or 30), 365)),
        "total_bookings": total_bookings,
        "completed": completed,
        "cancelled": cancelled,
        "active_drivers": active_drivers,
        "conversion_rate": round((completed / max(total_bookings, 1)) * 100, 2),
        "revenue": revenue,
    }


@router.get("/demand")
async def demand_analytics(
    days: int = 30,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)
    rows = await db.bookings.find(
        {"created_at": {"$gte": since}},
        {"_id": 0, "created_at": 1, "status": 1},
    ).to_list(20000)

    buckets: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        created_at = row.get("created_at")
        if not isinstance(created_at, datetime):
            continue
        day_text = created_at.strftime("%Y-%m-%d")
        hour = created_at.hour
        key = f"{day_text}:{hour}"
        status = _status_value(row.get("status"))
        bucket = buckets.get(key)
        if not bucket:
            bucket = {
                "date": day_text,
                "hour": hour,
                "rides": 0,
                "completed": 0,
                "cancelled": 0,
            }
            buckets[key] = bucket
        bucket["rides"] += 1
        if status == "completed":
            bucket["completed"] += 1
        elif status == "cancelled":
            bucket["cancelled"] += 1

    result = list(buckets.values())
    result.sort(key=lambda item: (item["date"], item["hour"]))
    return result


@router.get("/heatmap")
async def demand_heatmap(
    days: int = 30,
    precision: int = 3,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)
    safe_precision = max(2, min(int(precision or 3), 5))

    rows = await db.bookings.find(
        {
            "created_at": {"$gte": since},
            "pickup_location": {"$ne": None},
        },
        {
            "_id": 0,
            "pickup_location.latitude": 1,
            "pickup_location.longitude": 1,
            "final_fare": 1,
            "estimated_fare": 1,
        },
    ).limit(30000).to_list(30000)

    cells: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        pickup = row.get("pickup_location") or {}
        lat = pickup.get("latitude")
        lng = pickup.get("longitude")
        if lat is None or lng is None:
            continue
        try:
            rounded_lat = round(float(lat), safe_precision)
            rounded_lng = round(float(lng), safe_precision)
        except Exception:
            continue
        key = f"{rounded_lat}:{rounded_lng}"
        fare = _to_float(row.get("final_fare"), _to_float(row.get("estimated_fare"), 0.0))
        cell = cells.get(key)
        if not cell:
            cell = {
                "lat": rounded_lat,
                "lng": rounded_lng,
                "weight": 0,
                "revenue": 0.0,
            }
            cells[key] = cell
        cell["weight"] += 1
        cell["revenue"] = round(_to_float(cell["revenue"]) + fare, 2)

    result = list(cells.values())
    result.sort(key=lambda item: item["weight"], reverse=True)
    return result[:400]


@router.get("/city-traffic")
async def city_traffic_analytics(
    days: int = 30,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)
    rows = await db.bookings.aggregate(
        [
            {"$match": {"created_at": {"$gte": since}}},
            {
                "$group": {
                    "_id": {"$ifNull": ["$pickup_city", {"$ifNull": ["$city", "Unknown"]}]},
                    "rides": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$final_fare", "$estimated_fare"]}},
                    "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}},
                }
            },
            {"$sort": {"rides": -1}},
            {"$limit": 20},
        ]
    ).to_list(20)

    return [
        {
            "city": str(row.get("_id") or "Unknown"),
            "rides": _to_int(row.get("rides")),
            "revenue": round(_to_float(row.get("revenue")), 2),
            "cancelled": _to_int(row.get("cancelled")),
        }
        for row in rows
    ]


@router.get("/driver-performance")
async def driver_performance_analytics(
    days: int = 30,
    limit: int = 50,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)
    safe_limit = max(5, min(int(limit or 50), 100))

    rows = await db.bookings.aggregate(
        [
            {"$match": {"created_at": {"$gte": since}, "driver_id": {"$ne": None}}},
            {
                "$group": {
                    "_id": "$driver_id",
                    "rides": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                    "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}},
                    "revenue": {"$sum": {"$ifNull": ["$final_fare", "$estimated_fare"]}},
                }
            },
            {"$sort": {"completed": -1}},
            {"$limit": safe_limit},
        ]
    ).to_list(safe_limit)

    driver_ids = [str(row.get("_id")) for row in rows if row.get("_id")]
    ratings_rows = []
    if driver_ids:
        ratings_rows = await db.drivers.find(
            {"user_id": {"$in": driver_ids}},
            {"_id": 0, "user_id": 1, "rating": 1},
        ).to_list(len(driver_ids))
    ratings_map = {str(row.get("user_id")): _to_float(row.get("rating")) for row in ratings_rows}

    return [
        {
            "driver_id": str(row.get("_id")),
            "rides": _to_int(row.get("rides")),
            "completed": _to_int(row.get("completed")),
            "cancelled": _to_int(row.get("cancelled")),
            "revenue": round(_to_float(row.get("revenue")), 2),
            "avg_rating": round(_to_float(ratings_map.get(str(row.get("_id")))), 2),
            "completion_rate": round((_to_int(row.get("completed")) / max(_to_int(row.get("rides")), 1)) * 100, 2),
        }
        for row in rows
    ]


@router.get("/revenue-forecast")
async def revenue_forecasting(
    days: int = 30,
    forecast_days: int = 7,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    since = _start_date(days)
    safe_forecast_days = max(1, min(int(forecast_days or 7), 30))

    rows = await db.bookings.aggregate(
        [
            {"$match": {"status": "completed", "created_at": {"$gte": since}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "revenue": {"$sum": {"$ifNull": ["$final_fare", "$estimated_fare"]}},
                    "rides": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(max(1, int(days or 30)) + 10)

    history = [
        {
            "date": str(row.get("_id")),
            "revenue": round(_to_float(row.get("revenue")), 2),
            "rides": _to_int(row.get("rides")),
        }
        for row in rows
    ]

    if not history:
        return {
            "history": [],
            "forecast": [],
            "avg_daily_revenue": 0.0,
        }

    avg_daily = sum(item["revenue"] for item in history) / max(len(history), 1)
    recent_window = history[-7:] if len(history) >= 7 else history
    recent_avg = sum(item["revenue"] for item in recent_window) / max(len(recent_window), 1)
    baseline = max(avg_daily, recent_avg)
    growth_ratio = 1.0 if avg_daily <= 0 else max(0.97, min(1.10, recent_avg / avg_daily))

    today = _utc_now().date()
    forecast: List[Dict[str, Any]] = []
    for day_idx in range(1, safe_forecast_days + 1):
        uplift = growth_ratio + (day_idx * 0.005)
        predicted = round(max(0.0, baseline * uplift), 2)
        confidence = max(55, 92 - (day_idx * 4))
        forecast.append(
            {
                "date": str(today + timedelta(days=day_idx)),
                "forecast_revenue": predicted,
                "confidence": confidence,
            }
        )

    return {
        "history": history,
        "forecast": forecast,
        "avg_daily_revenue": round(avg_daily, 2),
    }


@router.get("/live")
async def live_admin_analytics(
    days: int = 30,
    forecast_days: int = 7,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    _ = admin_user
    overview = await analytics_overview(days=days, db=db, admin_user=admin_user)
    demand = await demand_analytics(days=days, db=db, admin_user=admin_user)
    heatmap = await demand_heatmap(days=days, db=db, admin_user=admin_user)
    city_traffic = await city_traffic_analytics(days=days, db=db, admin_user=admin_user)
    driver_performance = await driver_performance_analytics(days=days, db=db, admin_user=admin_user)
    revenue_forecast = await revenue_forecasting(
        days=days,
        forecast_days=forecast_days,
        db=db,
        admin_user=admin_user,
    )
    return {
        "overview": overview,
        "demand": demand,
        "heatmap": heatmap,
        "city_traffic": city_traffic,
        "driver_performance": driver_performance,
        "revenue_forecast": revenue_forecast,
        "generated_at": _utc_now().isoformat() + "Z",
    }
