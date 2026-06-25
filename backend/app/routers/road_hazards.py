import asyncio
import math
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.road_hazard import RoadHazard, HazardReport
from app.sockets.events import broadcast_event

try:
    from ml.pothole_detector.infer import predict_hazard
except ImportError:
    def predict_hazard(metadata: dict) -> dict:
        return {}

router = APIRouter(prefix="/api/road-hazards", tags=["road-hazards"])


class IngestHazardPayload(BaseModel):
    latitude: float
    longitude: float
    severity: Optional[int] = None
    type: Optional[str] = None
    source: Optional[str] = "driver_app"
    speed_kmph: Optional[float] = None
    metadata: Optional[dict] = None


@router.post("/ingest")
async def ingest_hazard(payload: IngestHazardPayload, db: Session = Depends(get_db)):
    # If metadata contains sensor window features, run ML inference to enrich event
    inferred = {}
    try:
        if payload.metadata:
            inferred = predict_hazard(payload.metadata)
    except Exception:
        inferred = {}

    hazard = RoadHazard(
        latitude=payload.latitude,
        longitude=payload.longitude,
        severity=payload.severity or inferred.get("severity"),
        type=payload.type or inferred.get("type"),
        source=payload.source,
        speed_kmph=payload.speed_kmph,
        metadata=payload.metadata,
    )
    db.add(hazard)
    db.commit()
    db.refresh(hazard)

    payload_data = {
        "id": str(hazard.id),
        "title": "Road hazard detected",
        "body": (
            f"New road hazard detected at {hazard.latitude:.5f}, {hazard.longitude:.5f}. "
            f"Type: {hazard.type or 'unknown'}, severity: {hazard.severity or 'unknown'}."
        ),
        "data": {
            "type": "hazard",
            "event": "hazard_ingested",
            "source": hazard.source,
            "hazard": {
                "id": str(hazard.id),
                "latitude": hazard.latitude,
                "longitude": hazard.longitude,
                "severity": hazard.severity,
                "type": hazard.type,
                "source": hazard.source,
                "speed_kmph": hazard.speed_kmph,
                "metadata": hazard.metadata,
                "created_at": hazard.created_at.isoformat() if hasattr(hazard.created_at, "isoformat") else hazard.created_at,
            },
        },
        "timestamp": hazard.created_at.isoformat() if hasattr(hazard.created_at, "isoformat") else None,
    }

    await broadcast_event("hazard_alert", payload_data, room="broadcast:driver")
    await broadcast_event("notification", payload_data, room="broadcast:driver")

    return {"ok": True, "id": hazard.id}


class ReportPayload(BaseModel):
    user_id: Optional[str]
    latitude: float
    longitude: float
    description: Optional[str]


class SafeRoutePayload(BaseModel):
    origin: dict
    destination: dict
    count: Optional[int] = 2
    distance_km: Optional[float] = None
    timestamp: Optional[str] = None


@router.post("/report")
async def report_hazard(payload: ReportPayload, db: Session = Depends(get_db)):
    report = HazardReport(
        user_id=payload.user_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        description=payload.description,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    payload_data = {
        "id": str(report.id),
        "title": "Road hazard reported",
        "body": (
            f"A new road hazard was reported at {report.latitude:.5f}, {report.longitude:.5f}."
            f" {report.description or ''}".strip()
        ),
        "data": {
            "type": "hazard",
            "event": "hazard_reported",
            "report": {
                "id": str(report.id),
                "user_id": report.user_id,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "description": report.description,
                "created_at": report.created_at.isoformat() if hasattr(report.created_at, "isoformat") else report.created_at,
            },
        },
        "timestamp": report.created_at.isoformat() if hasattr(report.created_at, "isoformat") else None,
    }

    await broadcast_event("hazard_alert", payload_data, room="broadcast:driver")
    await broadcast_event("notification", payload_data, room="broadcast:driver")

    return {"ok": True, "id": report.id}


def _bounding_box(latitude: float, longitude: float, radius_km: float) -> Tuple[float, float, float, float]:
    # Approximate geographic bounding box for small radius values
    lat_delta = radius_km / 110.574
    lng_delta = radius_km / (111.320 * max(0.1, math.cos(math.radians(latitude))))
    return latitude - lat_delta, latitude + lat_delta, longitude - lng_delta, longitude + lng_delta


def _hazard_type_weight(hazard_type: Optional[str]) -> int:
    weights = {
        "pothole": 5,
        "waterlogging": 4,
        "crack": 3,
        "missing-sign": 4,
        "missing_sign": 4,
        "bump": 2,
        "minor": 1,
    }
    return weights.get((hazard_type or "").lower(), 2)


def _hazard_risk_score(hazards: List[RoadHazard]) -> dict:
    if not hazards:
        return {"hazard_count": 0, "raw_score": 0.0, "risk_score": 0, "risk_level": "safe"}

    total = 0.0
    for hazard in hazards:
        severity = float(hazard.severity or 1)
        total += _hazard_type_weight(hazard.type) * severity

    average = total / len(hazards)
    score = min(100, int(round(average * 6)))
    if score < 30:
        level = "safe"
    elif score < 60:
        level = "moderate"
    else:
        level = "dangerous"

    return {
        "hazard_count": len(hazards),
        "raw_score": round(average, 2),
        "risk_score": score,
        "risk_level": level,
    }


def _compute_hazard_risk(latitude: float, longitude: float, radius_km: float, db: Session) -> dict:
    lat_min, lat_max, lng_min, lng_max = _bounding_box(latitude, longitude, radius_km)
    hazards = (
        db.query(RoadHazard)
        .filter(RoadHazard.latitude >= lat_min)
        .filter(RoadHazard.latitude <= lat_max)
        .filter(RoadHazard.longitude >= lng_min)
        .filter(RoadHazard.longitude <= lng_max)
        .all()
    )
    return _hazard_risk_score(hazards)


@router.get("/nearby")
def nearby_hazards(
    latitude: float = Query(..., description="Latitude for hazard search"),
    longitude: float = Query(..., description="Longitude for hazard search"),
    radius_km: float = Query(0.5, gt=0, le=10.0, description="Search radius in kilometers"),
    limit: int = Query(50, gt=0, le=200, description="Maximum hazards to return"),
    db: Session = Depends(get_db),
):
    lat_min, lat_max, lng_min, lng_max = _bounding_box(latitude, longitude, radius_km)
    items = (
        db.query(RoadHazard)
        .filter(RoadHazard.latitude >= lat_min)
        .filter(RoadHazard.latitude <= lat_max)
        .filter(RoadHazard.longitude >= lng_min)
        .filter(RoadHazard.longitude <= lng_max)
        .order_by(RoadHazard.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"count": len(items), "radius_km": radius_km, "hazards": items}


@router.get("/risk")
def hazard_risk(
    latitude: float = Query(..., description="Latitude for risk score"),
    longitude: float = Query(..., description="Longitude for risk score"),
    radius_km: float = Query(0.5, gt=0, le=10.0, description="Risk score radius in kilometers"),
    db: Session = Depends(get_db),
):
    lat_min, lat_max, lng_min, lng_max = _bounding_box(latitude, longitude, radius_km)
    hazards = (
        db.query(RoadHazard)
        .filter(RoadHazard.latitude >= lat_min)
        .filter(RoadHazard.latitude <= lat_max)
        .filter(RoadHazard.longitude >= lng_min)
        .filter(RoadHazard.longitude <= lng_max)
        .all()
    )
    score = _hazard_risk_score(hazards)
    return {
        "location": {"latitude": latitude, "longitude": longitude},
        "radius_km": radius_km,
        "hazard_count": score["hazard_count"],
        "risk_score": score["risk_score"],
        "risk_level": score["risk_level"],
        "hazard_types": [h.type for h in hazards if h.type],
        "hazard_summary": score,
    }


@router.post("/safe-route")
def safe_route(
    payload: SafeRoutePayload,
    db: Session = Depends(get_db),
):
    origin = payload.origin
    destination = payload.destination
    count = payload.count or 2

    if not origin or not destination:
        raise HTTPException(status_code=400, detail="origin and destination are required")

    distance = float(payload.distance_km or 0.0)
    if distance <= 0:
        lat1 = float(origin.get("latitude"))
        lng1 = float(origin.get("longitude"))
        lat2 = float(destination.get("latitude"))
        lng2 = float(destination.get("longitude"))
        distance = math.hypot(lat2 - lat1, lng2 - lng1) * 111.0

    origin_risk = _compute_hazard_risk(origin["latitude"], origin["longitude"], radius_km=0.5, db=db)
    destination_risk = _compute_hazard_risk(destination["latitude"], destination["longitude"], radius_km=0.5, db=db)
    direct_risk_score = max(origin_risk["risk_score"], destination_risk["risk_score"])
    direct_risk_level = "dangerous" if direct_risk_score >= 60 else "moderate" if direct_risk_score >= 30 else "safe"
    safer_score = max(0, direct_risk_score - 18)

    routes = [
        {
            "id": "direct",
            "name": "Direct route",
            "distance_km": round(distance, 2),
            "duration_minutes": round(distance / 35 * 60, 1),
            "risk_score": direct_risk_score,
            "risk_level": direct_risk_level,
            "is_recommended": direct_risk_score < 60,
        }
    ]

    if count > 1:
        safer_distance = round(distance * 1.08 + 0.2, 2)
        routes.append(
            {
                "id": "safer",
                "name": "Safer route",
                "distance_km": safer_distance,
                "duration_minutes": round(safer_distance / 30 * 60, 1),
                "risk_score": max(0, safer_score),
                "risk_level": "safe" if safer_score < 40 else "moderate",
                "is_recommended": True,
            }
        )

    return {
        "origin": origin,
        "destination": destination,
        "routes": routes,
        "route_count": len(routes),
        "updated_at": payload.timestamp or None,
    }


@router.get("/recent")
def recent_hazards(limit: int = 50, db: Session = Depends(get_db)):
    items = db.query(RoadHazard).order_by(RoadHazard.created_at.desc()).limit(limit).all()
    return items
