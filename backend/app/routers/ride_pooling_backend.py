"""
Ride Pooling Backend Router
System for grouping rides with shared routes and cost splitting
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import logging
from typing import Any, Dict, List, Optional
import math

from pymongo import ReturnDocument

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ride-pooling", tags=["ride_pooling"])

db = None
io = None

POOL_MODEL_PASSENGER_CREATED = "PASSENGER_CREATED"
POOL_MODEL_SYSTEM_CREATED = "SYSTEM_CREATED"
POOL_MODEL_DRIVER_CREATED = "DRIVER_CREATED"
POOL_MODELS = {
    POOL_MODEL_PASSENGER_CREATED,
    POOL_MODEL_SYSTEM_CREATED,
    POOL_MODEL_DRIVER_CREATED,
}
ACTIVE_POOL_STATUSES = ["waiting", "searching", "matched"]
DEFAULT_MAX_WAIT_MINUTES = 10
DEFAULT_MAX_PASSENGERS = 4
DEFAULT_PICKUP_RADIUS_KM = 2.0
DEFAULT_DROPOFF_RADIUS_KM = 4.0


def set_dependencies(database, socket_io):
    global db, io
    db = database
    io = socket_io


async def verify_user_token(request: Request):
    try:
        user = await get_current_user_from_request(request, db_override=db)
        return {
            'user_id': str(user.get('id') or user.get('user_id') or ''),
            'mongo_id': str(user.get('_id') or ''),
            'user_type': str(user.get('role') or user.get('user_type') or '').lower(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_role(user: Dict[str, str], allowed_roles: List[str], detail: str):
    if user.get("user_type") not in allowed_roles:
        raise HTTPException(status_code=403, detail=detail)


async def request_json(request: Request) -> Dict[str, Any]:
    try:
        data = await request.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON object payload required")
    return data


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    number = safe_float(value, default)
    if number is None:
        number = default
    return min(max(number, minimum), maximum)


def bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    number = safe_float(value, default)
    if number is None:
        number = default
    return int(min(max(number, minimum), maximum))


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def location_text(location: Any) -> str:
    if isinstance(location, str):
        return location.strip()
    if isinstance(location, dict):
        for key in ("address", "description", "name", "label", "zone"):
            value = location.get(key)
            if value:
                return str(value).strip()
        lat = location.get("latitude") or location.get("lat")
        lon = location.get("longitude") or location.get("lon") or location.get("lng")
        if lat is not None and lon is not None:
            return f"{lat}, {lon}"
    return ""


def normalize_location(value: Any, fallback_label: str) -> Dict[str, Any]:
    if isinstance(value, dict):
        location = dict(value)
        location["address"] = location_text(location) or fallback_label
        latitude = safe_float(location.get("latitude", location.get("lat")))
        longitude = safe_float(location.get("longitude", location.get("lon", location.get("lng"))))
        if latitude is not None:
            location["latitude"] = latitude
        if longitude is not None:
            location["longitude"] = longitude
        return location

    text = str(value or "").strip()
    return {
        "address": text or fallback_label,
    }


def normalize_zone(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    if not text:
        return None
    normalized = "_".join(text.replace(",", " ").split())
    return normalized[:80] or None


def derive_zone(data: Dict[str, Any], prefix: str, location: Dict[str, Any]) -> Optional[str]:
    explicit_zone = data.get(f"{prefix}_zone") or location.get("zone") or location.get("area")
    if explicit_zone:
        return normalize_zone(explicit_zone)

    address = location_text(location)
    if not address:
        return None

    first_segment = address.split(",")[0].strip()
    return normalize_zone(first_segment)


def location_lat(location: Dict[str, Any]) -> Optional[float]:
    return safe_float(location.get("latitude", location.get("lat")))


def location_lon(location: Dict[str, Any]) -> Optional[float]:
    return safe_float(location.get("longitude", location.get("lon", location.get("lng"))))


def haversine_distance(lat1, lon1, lat2, lon2):
    lat1 = safe_float(lat1)
    lon1 = safe_float(lon1)
    lat2 = safe_float(lat2)
    lon2 = safe_float(lon2)
    if None in (lat1, lon1, lat2, lon2):
        return math.inf

    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def normalize_pool_model(value: Any, default: str = POOL_MODEL_SYSTEM_CREATED) -> str:
    model = str(value or default).strip().upper()
    if model in {"PASSENGER", "PASSENGER_CREATE", "PASSENGER_CREATED"}:
        return POOL_MODEL_PASSENGER_CREATED
    if model in {"SYSTEM", "SYSTEM_CREATE", "SYSTEM_CREATED", "AUTO", "AUTO_MATCH"}:
        return POOL_MODEL_SYSTEM_CREATED
    if model in {"DRIVER", "DRIVER_CREATE", "DRIVER_CREATED"}:
        return POOL_MODEL_DRIVER_CREATED
    if model not in POOL_MODELS:
        raise HTTPException(status_code=400, detail="Invalid pool_model")
    return model


def new_pool_id() -> ObjectId:
    return ObjectId()


def pool_code(pool_object_id: ObjectId) -> str:
    return f"POOL_{str(pool_object_id)[-8:].upper()}"


def pool_identifier_query(pool_id: str) -> Dict[str, Any]:
    filters: List[Dict[str, Any]] = [{"pool_id": pool_id}]
    try:
        filters.append({"_id": ObjectId(pool_id)})
    except Exception:
        pass
    return {"$or": filters}


def pool_identity_filter(pool: Dict[str, Any]) -> Dict[str, Any]:
    if pool.get("_id"):
        return {"_id": pool["_id"]}
    if pool.get("pool_id"):
        return {"pool_id": pool["pool_id"]}
    raise HTTPException(status_code=500, detail="Pool identity missing")


def passenger_detail(
    user_id: str,
    data: Dict[str, Any],
    pickup: Dict[str, Any],
    dropoff: Dict[str, Any],
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "passenger_id": user_id,
        "pickup": pickup,
        "dropoff": dropoff,
        "pickup_zone": derive_zone(data, "pickup", pickup),
        "dropoff_zone": derive_zone(data, "dropoff", dropoff),
        "estimated_fare": bounded_float(
            data.get("estimated_fare", data.get("estimated_fare_per_passenger", 100)),
            100,
            0,
            100000,
        ),
        "max_wait_minutes": bounded_int(
            data.get("max_wait_minutes", data.get("max_wait_time", DEFAULT_MAX_WAIT_MINUTES)),
            DEFAULT_MAX_WAIT_MINUTES,
            1,
            60,
        ),
        "max_detour_percent": bounded_float(data.get("max_detour_percent", 20), 20, 0, 100),
        "status": "queued",
        "request_id": request_id,
        "requested_at": utcnow(),
    }


def build_pool_document(
    pool_model: str,
    data: Dict[str, Any],
    user: Dict[str, str],
    initial_passenger: bool,
) -> Dict[str, Any]:
    now = utcnow()
    pool_object_id = new_pool_id()
    pickup = normalize_location(data.get("pickup", data.get("pickup_location")), "Pickup")
    dropoff = normalize_location(data.get("dropoff", data.get("dropoff_location")), "Dropoff")
    max_passengers = bounded_int(data.get("max_passengers"), DEFAULT_MAX_PASSENGERS, 1, 8)
    min_passengers = bounded_int(data.get("min_passengers"), 2, 1, max_passengers)
    max_wait_minutes = bounded_int(
        data.get("max_wait_minutes", data.get("max_wait_time", DEFAULT_MAX_WAIT_MINUTES)),
        DEFAULT_MAX_WAIT_MINUTES,
        1,
        60,
    )
    user_id = user["user_id"]
    passengers = [user_id] if initial_passenger else []
    details = [passenger_detail(user_id, data, pickup, dropoff)] if initial_passenger else []

    return {
        "_id": pool_object_id,
        "pool_id": pool_code(pool_object_id),
        "pool_model": pool_model,
        "created_by_user_id": user_id if pool_model == POOL_MODEL_PASSENGER_CREATED else None,
        "created_by_driver_id": user_id if pool_model == POOL_MODEL_DRIVER_CREATED else None,
        "initiator_id": user_id if initial_passenger else None,
        "driver_id": user_id if pool_model == POOL_MODEL_DRIVER_CREATED else None,
        "status": "waiting",
        "pickup": pickup,
        "dropoff": dropoff,
        "pickup_zone": derive_zone(data, "pickup", pickup),
        "dropoff_zone": derive_zone(data, "dropoff", dropoff),
        "max_passengers": max_passengers,
        "min_passengers": min_passengers,
        "passengers": passengers,
        "passenger_details": details,
        "request_ids": [],
        "route_polyline": data.get("route_polyline"),
        "route_name": data.get("route_name"),
        "vehicle_type": data.get("vehicle_type") or data.get("vehicle_type_id") or "auto",
        "ride_type": "pool",
        "requested_time": now,
        "created_at": now,
        "updated_at": now,
        "expires_at": now + timedelta(minutes=max_wait_minutes),
        "estimated_fare_per_passenger": bounded_float(
            data.get("estimated_fare_per_passenger", data.get("estimated_fare", 100)),
            100,
            0,
            100000,
        ),
        "discount_percentage": bounded_float(data.get("discount_percentage", 20), 20, 0, 60),
        "max_wait_minutes": max_wait_minutes,
        "max_pickup_distance_km": bounded_float(
            data.get("max_pickup_distance_km"),
            DEFAULT_PICKUP_RADIUS_KM,
            0.1,
            25,
        ),
        "max_dropoff_distance_km": bounded_float(
            data.get("max_dropoff_distance_km"),
            DEFAULT_DROPOFF_RADIUS_KM,
            0.1,
            50,
        ),
        "max_detour_percent": bounded_float(data.get("max_detour_percent", 20), 20, 0, 100),
    }


def serialize_pool(pool: Dict[str, Any]) -> Dict[str, Any]:
    passengers = list(pool.get("passengers") or [])
    estimated = bounded_float(
        pool.get("estimated_fare_per_passenger", pool.get("estimated_fare")),
        0,
        0,
        100000,
    )
    discount = bounded_float(pool.get("discount_percentage"), 0, 0, 100)
    fare_per_passenger = round(estimated * (1 - discount / 100), 2)
    pickup = as_dict(pool.get("pickup"))
    dropoff = as_dict(pool.get("dropoff"))
    pool_id = str(pool.get("pool_id") or pool.get("_id") or "")

    return {
        "id": str(pool.get("_id") or pool_id),
        "_id": str(pool.get("_id") or pool_id),
        "pool_id": pool_id,
        "pool_model": pool.get("pool_model", POOL_MODEL_PASSENGER_CREATED),
        "created_by_user_id": pool.get("created_by_user_id"),
        "created_by_driver_id": pool.get("created_by_driver_id"),
        "initiator_id": pool.get("initiator_id"),
        "driver_id": pool.get("driver_id"),
        "pickup": pickup,
        "dropoff": dropoff,
        "pickup_location": location_text(pickup),
        "dropoff_location": location_text(dropoff),
        "pickup_zone": pool.get("pickup_zone"),
        "dropoff_zone": pool.get("dropoff_zone"),
        "passengers": passengers,
        "passenger_details": pool.get("passenger_details", []),
        "passengers_count": len(passengers),
        "current_passengers": len(passengers),
        "max_passengers": pool.get("max_passengers", DEFAULT_MAX_PASSENGERS),
        "min_passengers": pool.get("min_passengers", 2),
        "estimated_fare": estimated,
        "estimated_fare_per_passenger": estimated,
        "discount_percentage": discount,
        "fare_per_passenger": fare_per_passenger,
        "savings": round(estimated - fare_per_passenger, 2),
        "status": pool.get("status", "waiting"),
        "route_polyline": pool.get("route_polyline"),
        "route_name": pool.get("route_name"),
        "vehicle_type": pool.get("vehicle_type"),
        "max_wait_minutes": pool.get("max_wait_minutes", DEFAULT_MAX_WAIT_MINUTES),
        "max_detour_percent": pool.get("max_detour_percent", 20),
        "expires_at": pool.get("expires_at"),
        "created_at": pool.get("created_at"),
        "updated_at": pool.get("updated_at"),
    }


def emit_pool_event(event: str, payload: Dict[str, Any], room: Optional[str] = None):
    if not io:
        return
    try:
        if room:
            io.emit(event, payload, room=room)
        else:
            io.emit(event, payload)
    except Exception:
        logger.warning("Failed to emit %s event", event, exc_info=True)


def pool_response(message: str, pool: Dict[str, Any], matched: bool = False) -> Dict[str, Any]:
    serialized = serialize_pool(pool)
    return {
        "message": message,
        "matched": matched,
        "pool": serialized,
        "id": serialized["id"],
        "_id": serialized["_id"],
        "pool_id": serialized["pool_id"],
        "pool_model": serialized["pool_model"],
        "status": serialized["status"],
        "current_passengers": serialized["current_passengers"],
        "max_passengers": serialized["max_passengers"],
        "fare_per_passenger": serialized["fare_per_passenger"],
    }


def is_pool_expired(pool: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    expires_at = pool.get("expires_at")
    if not expires_at:
        return False
    now = now or utcnow()
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at < now


def zone_or_distance_matches(
    pool_zone: Optional[str],
    request_zone: Optional[str],
    pool_location: Dict[str, Any],
    request_location: Dict[str, Any],
    max_distance_km: float,
) -> bool:
    if pool_zone and request_zone:
        return pool_zone == request_zone

    distance = haversine_distance(
        location_lat(pool_location),
        location_lon(pool_location),
        location_lat(request_location),
        location_lon(request_location),
    )
    if math.isfinite(distance):
        return distance <= max_distance_km

    pool_text = normalize_zone(location_text(pool_location))
    request_text = normalize_zone(location_text(request_location))
    if pool_text and request_text:
        return pool_text == request_text

    return False


def is_compatible_pool(pool: Dict[str, Any], detail: Dict[str, Any], passenger_id: str) -> bool:
    passengers = list(pool.get("passengers") or [])
    if passenger_id in passengers:
        return False
    if len(passengers) >= int(pool.get("max_passengers") or DEFAULT_MAX_PASSENGERS):
        return False
    if pool.get("status") not in ACTIVE_POOL_STATUSES:
        return False
    if is_pool_expired(pool):
        return False

    pickup_matches = zone_or_distance_matches(
        pool.get("pickup_zone"),
        detail.get("pickup_zone"),
        as_dict(pool.get("pickup")),
        as_dict(detail.get("pickup")),
        bounded_float(pool.get("max_pickup_distance_km"), DEFAULT_PICKUP_RADIUS_KM, 0.1, 25),
    )
    dropoff_matches = zone_or_distance_matches(
        pool.get("dropoff_zone"),
        detail.get("dropoff_zone"),
        as_dict(pool.get("dropoff")),
        as_dict(detail.get("dropoff")),
        bounded_float(pool.get("max_dropoff_distance_km"), DEFAULT_DROPOFF_RADIUS_KM, 0.1, 50),
    )
    return pickup_matches and dropoff_matches


async def find_pool(pool_id: str) -> Dict[str, Any]:
    pool = await db.pooled_rides.find_one(pool_identifier_query(pool_id))
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    return pool


async def find_compatible_system_pool(detail: Dict[str, Any], passenger_id: str) -> Optional[Dict[str, Any]]:
    cursor = db.pooled_rides.find({
        "pool_model": POOL_MODEL_SYSTEM_CREATED,
        "status": {"$in": ACTIVE_POOL_STATUSES},
    })
    candidates = await cursor.to_list(100)
    candidates.sort(key=lambda pool: pool.get("created_at") or datetime.min.replace(tzinfo=timezone.utc))
    for pool in candidates:
        if is_compatible_pool(pool, detail, passenger_id):
            return pool
    return None


async def add_passenger_to_pool(pool: Dict[str, Any], user_id: str, detail: Dict[str, Any]) -> Dict[str, Any]:
    before_count = len(pool.get("passengers") or [])
    after_count = before_count + 1
    min_passengers = int(pool.get("min_passengers") or 2)
    status = "matched" if after_count >= min_passengers else "waiting"
    add_to_set: Dict[str, Any] = {"passengers": user_id}
    if detail.get("request_id"):
        add_to_set["request_ids"] = detail["request_id"]

    updated = await db.pooled_rides.find_one_and_update(
        pool_identity_filter(pool),
        {
            "$addToSet": add_to_set,
            "$push": {"passenger_details": detail},
            "$set": {"status": status, "updated_at": utcnow()},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Pool not found")
    emit_pool_event(
        "pool_joined",
        {
            "pool_id": str(updated.get("pool_id") or updated.get("_id")),
            "passenger_id": user_id,
            "current_passengers": len(updated.get("passengers") or []),
            "pool_model": updated.get("pool_model"),
        },
    )
    return updated


async def create_passenger_pool(user: Dict[str, str], data: Dict[str, Any]) -> Dict[str, Any]:
    pool = build_pool_document(POOL_MODEL_PASSENGER_CREATED, data, user, initial_passenger=True)
    await db.pooled_rides.insert_one(pool)
    emit_pool_event("pool_created", serialize_pool(pool), room="admin")
    logger.info("Passenger-created pool created: %s", pool["pool_id"])
    return pool


async def create_driver_pool(user: Dict[str, str], data: Dict[str, Any]) -> Dict[str, Any]:
    pool = build_pool_document(POOL_MODEL_DRIVER_CREATED, data, user, initial_passenger=False)
    await db.pooled_rides.insert_one(pool)
    emit_pool_event("pool_created", serialize_pool(pool), room="admin")
    logger.info("Driver-created pool route created: %s", pool["pool_id"])
    return pool


async def create_or_match_system_pool(user: Dict[str, str], data: Dict[str, Any]) -> Dict[str, Any]:
    pickup = normalize_location(data.get("pickup", data.get("pickup_location")), "Pickup")
    dropoff = normalize_location(data.get("dropoff", data.get("dropoff_location")), "Dropoff")
    request_detail = passenger_detail(user["user_id"], data, pickup, dropoff)
    request_doc = {
        "pool_model": POOL_MODEL_SYSTEM_CREATED,
        "passenger_id": user["user_id"],
        "pickup": pickup,
        "dropoff": dropoff,
        "pickup_zone": request_detail["pickup_zone"],
        "dropoff_zone": request_detail["dropoff_zone"],
        "status": "queued",
        "max_wait_minutes": request_detail["max_wait_minutes"],
        "max_detour_percent": request_detail["max_detour_percent"],
        "created_at": utcnow(),
        "expires_at": utcnow() + timedelta(minutes=request_detail["max_wait_minutes"]),
    }
    request_result = await db.pool_ride_requests.insert_one(request_doc)
    request_detail["request_id"] = str(request_result.inserted_id)

    compatible_pool = await find_compatible_system_pool(request_detail, user["user_id"])
    if compatible_pool:
        updated_pool = await add_passenger_to_pool(compatible_pool, user["user_id"], request_detail)
        await db.pool_ride_requests.update_one(
            {"_id": request_result.inserted_id},
            {
                "$set": {
                    "status": "matched",
                    "pool_id": str(updated_pool.get("pool_id") or updated_pool.get("_id")),
                    "matched_at": utcnow(),
                }
            },
        )
        emit_pool_event("pool_updated", serialize_pool(updated_pool))
        logger.info("System pool request matched into pool: %s", updated_pool.get("pool_id"))
        return {
            "pool": updated_pool,
            "matched": True,
            "request_id": str(request_result.inserted_id),
        }

    pool = build_pool_document(POOL_MODEL_SYSTEM_CREATED, data, user, initial_passenger=True)
    pool["request_ids"] = [str(request_result.inserted_id)]
    pool["passenger_details"] = [request_detail]
    await db.pooled_rides.insert_one(pool)
    await db.pool_ride_requests.update_one(
        {"_id": request_result.inserted_id},
        {
            "$set": {
                "status": "waiting",
                "pool_id": str(pool["pool_id"]),
                "matched_at": None,
            }
        },
    )
    emit_pool_event("pool_created", serialize_pool(pool), room="admin")
    logger.info("System pool request queued in new pool: %s", pool["pool_id"])
    return {
        "pool": pool,
        "matched": False,
        "request_id": str(request_result.inserted_id),
    }


@router.post("")
async def create_pooled_ride(request: Request):
    """Default pool flow: system-created auto matching unless pool_model says otherwise."""
    try:
        user = await verify_user_token(request)
        data = await request_json(request)
        pool_model = normalize_pool_model(data.get("pool_model"), default=POOL_MODEL_SYSTEM_CREATED)

        if pool_model == POOL_MODEL_DRIVER_CREATED:
            require_role(user, ["driver"], "Driver access required")
            pool = await create_driver_pool(user, data)
            return pool_response("Driver-created shared route opened", pool)

        require_role(user, ["passenger"], "Passenger access required")
        if pool_model == POOL_MODEL_PASSENGER_CREATED:
            pool = await create_passenger_pool(user, data)
            return pool_response("Passenger-created pool created", pool)

        result = await create_or_match_system_pool(user, data)
        message = "Matched into an auto pool" if result["matched"] else "Pool request queued for auto matching"
        response = pool_response(message, result["pool"], matched=result["matched"])
        response["request_id"] = result["request_id"]
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating pooled ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create pooled ride")


@router.post("/passenger-create")
async def passenger_create_pool(request: Request):
    """Passenger creates a pool manually and other passengers can join."""
    try:
        user = await verify_user_token(request)
        require_role(user, ["passenger"], "Passenger access required")
        pool = await create_passenger_pool(user, await request_json(request))
        return pool_response("Passenger-created pool created", pool)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating passenger pool: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to create passenger pool")


@router.post("/system-request")
async def system_pool_request(request: Request):
    """Passenger enters the auto-match queue; backend creates/groups pools."""
    try:
        user = await verify_user_token(request)
        require_role(user, ["passenger"], "Passenger access required")
        result = await create_or_match_system_pool(user, await request_json(request))
        message = "Matched into an auto pool" if result["matched"] else "Pool request queued for auto matching"
        response = pool_response(message, result["pool"], matched=result["matched"])
        response["request_id"] = result["request_id"]
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error handling system pool request: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to handle system pool request")


@router.post("/driver-create")
async def driver_create_pool(request: Request):
    """Driver opens a shared route that passengers can join."""
    try:
        user = await verify_user_token(request)
        require_role(user, ["driver"], "Driver access required")
        pool = await create_driver_pool(user, await request_json(request))
        return pool_response("Driver-created shared route opened", pool)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating driver pool: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to create driver pool")


@router.get("/available")
async def find_available_pools(request: Request, lat: float = Query(...), lon: float = Query(...), radius_km: float = Query(2, ge=0.5, le=10)):
    """Find available pooled rides near user location"""
    try:
        user = await verify_user_token(request)
        require_role(user, ["passenger"], "Passenger access required")

        pools = await db.pooled_rides.find({"status": {"$in": ACTIVE_POOL_STATUSES}}).to_list(None)

        nearby = []
        for pool in pools:
            passengers = list(pool.get("passengers") or [])
            if user["user_id"] in passengers:
                continue
            if len(passengers) >= int(pool.get("max_passengers") or DEFAULT_MAX_PASSENGERS):
                continue
            if is_pool_expired(pool):
                continue

            pickup = as_dict(pool.get("pickup"))
            dist = haversine_distance(lat, lon, location_lat(pickup), location_lon(pickup))
            if dist <= radius_km:
                serialized = serialize_pool(pool)
                serialized["distance_km"] = round(dist, 2)
                nearby.append(serialized)

        return {"pools": nearby}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding pools: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to find pools")


@router.get("/my-pools")
async def list_my_pools(request: Request):
    """List pools created or joined by the current passenger/driver."""
    try:
        user = await verify_user_token(request)
        user_id = user["user_id"]
        if user["user_type"] == "passenger":
            query = {"passengers": user_id}
        elif user["user_type"] == "driver":
            query = {"$or": [{"driver_id": user_id}, {"created_by_driver_id": user_id}]}
        else:
            query = {"status": {"$in": ACTIVE_POOL_STATUSES}}

        pools = await db.pooled_rides.find(query).to_list(100)
        pools.sort(key=lambda pool: pool.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return {"pools": [serialize_pool(pool) for pool in pools]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error listing user pools: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to list user pools")


@router.post("/{pool_id}/join")
async def join_pooled_ride(pool_id: str, request: Request):
    """Join an existing pooled ride"""
    try:
        user = await verify_user_token(request)
        require_role(user, ["passenger"], "Passenger access required")

        pool = await find_pool(pool_id)
        data = await request_json(request)
        passengers = list(pool.get("passengers") or [])

        if len(passengers) >= int(pool.get("max_passengers") or DEFAULT_MAX_PASSENGERS):
            raise HTTPException(status_code=400, detail="Pool is full")

        if user['user_id'] in passengers:
            raise HTTPException(status_code=400, detail="Already joined this pool")

        pickup = normalize_location(data.get("pickup", data.get("pickup_location", pool.get("pickup"))), "Pickup")
        dropoff = normalize_location(data.get("dropoff", data.get("dropoff_location", pool.get("dropoff"))), "Dropoff")
        detail = passenger_detail(user["user_id"], data, pickup, dropoff)
        if data and not is_compatible_pool(pool, detail, user["user_id"]):
            raise HTTPException(status_code=400, detail="Pool route is not compatible with this pickup/dropoff")

        result = await add_passenger_to_pool(pool, user["user_id"], detail)

        logger.info(f"User {user['user_id']} joined pool {pool_id}")
        response = pool_response("Joined pool successfully", result, matched=len(result.get("passengers") or []) >= int(result.get("min_passengers") or 2))
        response["total_passengers"] = len(result.get("passengers") or [])
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining pool: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to join pool")

@router.post("/{pool_id}/leave")
async def leave_pooled_ride(pool_id: str, request: Request):
    """Leave a pooled ride"""
    try:
        user = await verify_user_token(request)
        require_role(user, ["passenger"], "Passenger access required")

        pool = await find_pool(pool_id)
        if user['user_id'] not in list(pool.get("passengers") or []):
            raise HTTPException(status_code=404, detail="Not in this pool")

        remaining_count = max(0, len(pool.get("passengers") or []) - 1)
        next_status = "waiting" if remaining_count < int(pool.get("min_passengers") or 2) else pool.get("status", "matched")
        result = await db.pooled_rides.find_one_and_update(
            pool_identity_filter(pool),
            {
                "$pull": {
                    "passengers": user['user_id'],
                    "passenger_details": {"passenger_id": user['user_id']},
                },
                "$set": {"status": next_status, "updated_at": utcnow()},
            },
            return_document=ReturnDocument.AFTER,
        )

        if result and len(result.get("passengers") or []) == 0 and result.get("pool_model") != POOL_MODEL_DRIVER_CREATED:
            await db.pooled_rides.delete_one(pool_identity_filter(result))
            emit_pool_event("pool_updated", {"pool_id": pool_id, "status": "cancelled"})
            logger.info(f"User {user['user_id']} left and emptied pool {pool_id}")
            return {"message": "Left pool successfully", "pool_deleted": True}

        if result:
            emit_pool_event("pool_updated", serialize_pool(result))

        logger.info(f"User {user['user_id']} left pool {pool_id}")
        return {"message": "Left pool successfully", "pool": serialize_pool(result) if result else None}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leaving pool: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to leave pool")


@router.post("/{pool_id}/assign-driver")
async def assign_pool_driver(pool_id: str, request: Request):
    """Assign a driver to any pool model."""
    try:
        user = await verify_user_token(request)
        if user["user_type"] not in ["driver", "admin", "operator"]:
            raise HTTPException(status_code=403, detail="Driver or admin access required")

        data = await request_json(request)
        driver_id = user["user_id"] if user["user_type"] == "driver" else str(data.get("driver_id") or "").strip()
        if not driver_id:
            raise HTTPException(status_code=400, detail="driver_id is required")

        pool = await find_pool(pool_id)
        if is_pool_expired(pool):
            raise HTTPException(status_code=400, detail="Pool has expired")

        updated = await db.pooled_rides.find_one_and_update(
            pool_identity_filter(pool),
            {
                "$set": {
                    "driver_id": driver_id,
                    "status": "assigned",
                    "assigned_at": utcnow(),
                    "updated_at": utcnow(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        emit_pool_event(
            "pool_driver_assigned",
            {
                "pool_id": str(updated.get("pool_id") or updated.get("_id")),
                "driver_id": driver_id,
                "pool_model": updated.get("pool_model"),
            },
        )
        return pool_response("Driver assigned to pool", updated, matched=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error assigning pool driver: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to assign pool driver")


@router.get("/{pool_id}")
async def get_pool_details(pool_id: str, request: Request):
    """Get pool details and participants"""
    try:
        await verify_user_token(request)
        return serialize_pool(await find_pool(pool_id))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pool details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get pool details")
