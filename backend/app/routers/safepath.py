import math
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.road_hazard import RoadHazard, HazardReport
from app.sockets.events import broadcast_event

router = APIRouter(prefix="/api/safepath", tags=["safepath"])


class SafeRouteRequest(BaseModel):
    origin: Dict
    destination: Dict
    mode: Optional[str] = "walking"  # walking | cycling | driving
    alternatives: Optional[int] = 2


class SafeReportRequest(BaseModel):
    user_id: Optional[str]
    latitude: float
    longitude: float
    category: Optional[str]
    description: Optional[str]
    image_url: Optional[str]


@router.post("/report")
async def report_safepath_issue(payload: SafeReportRequest, db: Session = Depends(get_db)):
    report = HazardReport(
        user_id=payload.user_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        description=payload.description,
        image_url=payload.image_url,
        category=payload.category,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    payload_data = {
        "id": str(report.id),
        "title": "SafePath report",
        "body": f"{report.category or 'Issue'} reported at {report.latitude:.5f}, {report.longitude:.5f}",
        "data": {"type": "safepath", "event": "safepath_reported", "report": {"id": str(report.id), "latitude": report.latitude, "longitude": report.longitude, "category": report.category}},
        "timestamp": report.created_at.isoformat() if hasattr(report.created_at, "isoformat") else None,
    }

    # notify passengers and drivers (web + native clients)
    await broadcast_event("hazard_alert", payload_data, room="broadcast:passenger")
    await broadcast_event("hazard_alert", payload_data, room="broadcast:driver")
    await broadcast_event("notification", payload_data, room="broadcast:passenger")
    await broadcast_event("notification", payload_data, room="broadcast:driver")

    return {"ok": True, "id": report.id}


def _bounding_box(latitude: float, longitude: float, radius_km: float):
    lat_delta = radius_km / 110.574
    lng_delta = radius_km / (111.320 * max(0.1, math.cos(math.radians(latitude))))
    return latitude - lat_delta, latitude + lat_delta, longitude - lng_delta, longitude + lng_delta


def _compute_risk_score_for_point(latitude: float, longitude: float, radius_km: float, db: Session):
    lat_min, lat_max, lng_min, lng_max = _bounding_box(latitude, longitude, radius_km)
    hazards = (
        db.query(RoadHazard)
        .filter(RoadHazard.latitude >= lat_min)
        .filter(RoadHazard.latitude <= lat_max)
        .filter(RoadHazard.longitude >= lng_min)
        .filter(RoadHazard.longitude <= lng_max)
        .all()
    )
    # reuse simple scoring from road_hazards if available
    total = 0.0
    for hazard in hazards:
        severity = float(hazard.severity or 1)
        weight = 3
        if hazard.type:
            t = (hazard.type or '').lower()
            if 'pothole' in t:
                weight = 5
            elif 'water' in t:
                weight = 4
        total += weight * severity
    average = (total / len(hazards)) if hazards else 0.0
    score = min(100, int(round(average * 6)))
    return {"hazard_count": len(hazards), "risk_score": score}


@router.post("/route")
def safe_route(payload: SafeRouteRequest, db: Session = Depends(get_db)):
    origin = payload.origin
    destination = payload.destination
    mode = (payload.mode or 'walking').lower()
    alternatives = max(1, min(4, int(payload.alternatives or 2)))

    if not origin or not destination:
        raise HTTPException(status_code=400, detail="origin and destination are required")

    lat1 = float(origin.get('latitude'))
    lng1 = float(origin.get('longitude'))
    lat2 = float(destination.get('latitude'))
    lng2 = float(destination.get('longitude'))

    # Euclidean km approximation for demo engine
    distance_km = math.hypot(lat2 - lat1, lng2 - lng1) * 111.0

    # compute risk at endpoints
    origin_risk = _compute_risk_score_for_point(lat1, lng1, 0.3, db)
    destination_risk = _compute_risk_score_for_point(lat2, lng2, 0.3, db)

    base_score = max(origin_risk['risk_score'], destination_risk['risk_score'])

    # mode adjustments (walking/cycling prefer low-traffic paths)
    mode_penalty = 0
    if mode == 'walking':
        mode_penalty = -5
    elif mode == 'cycling':
        mode_penalty = -2
    else:
        mode_penalty = 0

    routes = []
    # direct
    direct_score = max(0, base_score + mode_penalty)
    routes.append({
        'id': 'direct',
        'name': 'Direct',
        'distance_km': round(distance_km, 2),
        'duration_minutes': round(distance_km / (5 if mode=='walking' else 15 if mode=='cycling' else 35) * 60, 1),
        'risk_score': int(direct_score),
        'risk_level': 'dangerous' if direct_score >= 60 else 'moderate' if direct_score >= 30 else 'safe',
        'is_recommended': direct_score < 60,
        'geometry': [origin, destination],
    })

    # safer alternative(s)
    for i in range(1, alternatives):
        # simplistic longer route with reduced risk
        longer = round(distance_km * (1.05 + 0.03 * i), 2)
        safer_score = max(0, direct_score - 12 - i * 4)
        routes.append({
            'id': f'safer_{i}',
            'name': f'Safer route {i}',
            'distance_km': longer,
            'duration_minutes': round(longer / (12 if mode=='cycling' else 30), 1),
            'risk_score': int(safer_score),
            'risk_level': 'safe' if safer_score < 40 else 'moderate',
            'is_recommended': True,
            'geometry': [origin, destination],
        })

    return {
        'origin': origin,
        'destination': destination,
        'mode': mode,
        'routes': routes,
        'route_count': len(routes),
    }


@router.get('/hotspots')
def hotspots(limit: int = Query(20, gt=0, le=200), db: Session = Depends(get_db)):
    # simple clustering by rounded coords (approx grid clustering)
    reports = db.query(HazardReport).all()
    hazards = db.query(RoadHazard).all()

    clusters = {}
    def bucket(lat, lng):
        return (round(lat, 3), round(lng, 3))

    for r in reports:
        key = bucket(r.latitude, r.longitude)
        clusters.setdefault(key, {'count': 0, 'lat': 0.0, 'lng': 0.0, 'types': {}})
        c = clusters[key]
        c['count'] += 1
        c['lat'] += r.latitude
        c['lng'] += r.longitude
        t = (r.category or 'report').lower()
        c['types'][t] = c['types'].get(t, 0) + 1

    for h in hazards:
        key = bucket(h.latitude, h.longitude)
        clusters.setdefault(key, {'count': 0, 'lat': 0.0, 'lng': 0.0, 'types': {}})
        c = clusters[key]
        c['count'] += 1
        c['lat'] += h.latitude
        c['lng'] += h.longitude
        t = (h.type or 'hazard').lower()
        c['types'][t] = c['types'].get(t, 0) + 1

    items = []
    for k, v in clusters.items():
        cnt = v['count']
        items.append({
            'center': {'latitude': v['lat'] / cnt, 'longitude': v['lng'] / cnt},
            'count': cnt,
            'types': v['types'],
        })

    items.sort(key=lambda x: x['count'], reverse=True)
    return {'count': len(items), 'hotspots': items[:limit]}
