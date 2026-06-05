from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def heat_cell(location: Dict[str, Any], precision: int = 3) -> str:
    if not isinstance(location, dict):
        return ""
    lat = location.get("latitude")
    lng = location.get("longitude")
    if lat is None or lng is None:
        return ""
    try:
        return f"{round(float(lat), precision)}:{round(float(lng), precision)}"
    except Exception:
        return ""


async def build_demand_heatmap(db, minutes: int = 60, limit: int = 3000) -> List[Dict[str, Any]]:
    lookback_minutes = max(5, int(minutes or 60))
    max_docs = max(100, min(int(limit or 3000), 20000))
    cutoff = get_ist_now() - timedelta(minutes=lookback_minutes)

    rows = (
        await db.bookings.find(
            {
                "created_at": {"$gte": cutoff},
                "pickup_location": {"$ne": None},
            },
            {"_id": 0, "pickup_location": 1, "status": 1},
        )
        .sort("created_at", -1)
        .limit(max_docs)
        .to_list(max_docs)
    )

    cells: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        pickup = row.get("pickup_location") or {}
        cell_key = heat_cell(pickup)
        if not cell_key:
            continue

        bucket = cells.get(cell_key)
        if not bucket:
            bucket = {
                "cell": cell_key,
                "latitude": round(safe_float(pickup.get("latitude")), 3),
                "longitude": round(safe_float(pickup.get("longitude")), 3),
                "demand": 0,
                "completed": 0,
                "cancelled": 0,
            }
            cells[cell_key] = bucket

        bucket["demand"] += 1
        status = str(row.get("status") or "").strip().lower()
        if status == "completed":
            bucket["completed"] += 1
        elif status == "cancelled":
            bucket["cancelled"] += 1

    result = list(cells.values())
    result.sort(key=lambda item: item.get("demand", 0), reverse=True)
    return result
