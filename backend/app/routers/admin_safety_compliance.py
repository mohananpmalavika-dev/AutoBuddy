"""
Admin Safety & Compliance Router
Features: Incident tracking, SOS events, trend analysis, safety metrics
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/safety", tags=["admin-safety"])


class IncidentReport(BaseModel):
    incident_type: str = Field(..., description="accident, theft, assault, vehicle_damage, harassment")
    description: str
    driver_id: Optional[str] = None
    passenger_id: Optional[str] = None
    booking_id: Optional[str] = None
    severity: str = Field(..., description="low, medium, high, critical")


# ==================== GET Endpoints ====================

@router.get("/dashboard")
async def get_safety_dashboard(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get safety metrics dashboard"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Incident statistics
        incident_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": "$incident_type",
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}}
        ]
        
        incidents = await db.safety_incidents.aggregate(incident_pipeline).to_list(None)
        
        # SOS events
        sos_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "total_sos": {"$sum": 1},
                "resolved": {"$sum": {"$cond": [{"$eq": ["$status", "resolved"]}, 1, 0]}}
            }}
        ]
        
        sos_data = await db.sos_events.aggregate(sos_pipeline).to_list(1)
        sos = sos_data[0] if sos_data else {"total_sos": 0, "resolved": 0}
        
        return {
            "period_days": days,
            "incident_summary": {
                "total_incidents": sum(i.get("count", 0) for i in incidents),
                "by_type": [{"type": i.get("_id"), "count": i.get("count")} for i in incidents]
            },
            "sos_events": {
                "total": sos.get("total_sos", 0),
                "resolved": sos.get("resolved", 0),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching safety dashboard: {str(e)}")


@router.get("/incidents")
async def get_incidents(
    incident_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all safety incidents"""
    try:
        filters = {}
        if incident_type:
            filters["incident_type"] = incident_type
        if severity:
            filters["severity"] = severity
        
        total = await db.safety_incidents.count_documents(filters)
        
        incidents = await db.safety_incidents.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "incidents": [
                {
                    "incident_id": str(i.get("_id")),
                    "type": i.get("incident_type"),
                    "severity": i.get("severity"),
                    "description": i.get("description"),
                    "driver_id": i.get("driver_id"),
                    "passenger_id": i.get("passenger_id"),
                    "created_at": i.get("created_at"),
                }
                for i in incidents
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching incidents: {str(e)}")


@router.get("/sos-events")
async def get_sos_events(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get SOS alert events"""
    try:
        filters = {}
        if status:
            filters["status"] = status
        
        total = await db.sos_events.count_documents(filters)
        
        sos_events = await db.sos_events.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "sos_events": [
                {
                    "sos_id": str(e.get("_id")),
                    "user_id": e.get("user_id"),
                    "user_type": e.get("user_type"),
                    "status": e.get("status"),
                    "triggered_at": e.get("created_at"),
                    "resolved_at": e.get("resolved_at"),
                }
                for e in sos_events
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching SOS events: {str(e)}")


@router.get("/trends")
async def get_safety_trends(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get safety trend analysis"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Incidents over time
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        trends = await db.safety_incidents.aggregate(pipeline).to_list(None)
        
        return {
            "period_days": days,
            "trend_data": [
                {"date": t.get("_id"), "incidents": t.get("count")} for t in trends
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trends: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/incidents/report")
async def report_incident(
    incident: IncidentReport,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Report a new safety incident"""
    try:
        await db.safety_incidents.insert_one({
            "incident_type": incident.incident_type,
            "description": incident.description,
            "driver_id": incident.driver_id,
            "passenger_id": incident.passenger_id,
            "booking_id": incident.booking_id,
            "severity": incident.severity,
            "reported_by": admin_user.get("user_id"),
            "status": "open",
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "incident_type": incident.incident_type,
            "severity": incident.severity,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reporting incident: {str(e)}")
