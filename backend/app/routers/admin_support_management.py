"""
Admin Support Management Router
Features: Ticket management, assignment, SLA tracking, resolution
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/support", tags=["admin-support"])


class SupportTicket(BaseModel):
    title: str
    description: str
    priority: str = Field(..., description="low, medium, high, critical")
    category: str = Field(..., description="technical, billing, account, complaint")
    user_id: str


class TicketAssignment(BaseModel):
    ticket_id: str
    assigned_to: str


class TicketResolution(BaseModel):
    ticket_id: str
    resolution_notes: str
    satisfaction_rating: Optional[int] = None


class SLAConfig(BaseModel):
    priority: str = Field(..., description="low, medium, high, critical")
    response_time_hours: int
    resolution_time_hours: int


# ==================== GET Endpoints ====================

@router.get("/tickets")
async def get_support_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get support tickets"""
    try:
        filters = {}
        if status:
            filters["status"] = status
        if priority:
            filters["priority"] = priority
        if assigned_to:
            filters["assigned_to"] = assigned_to
        
        total = await db.support_tickets.count_documents(filters)
        
        tickets = await db.support_tickets.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "tickets": [
                {
                    "ticket_id": str(t.get("_id")),
                    "title": t.get("title"),
                    "status": t.get("status"),
                    "priority": t.get("priority"),
                    "category": t.get("category"),
                    "assigned_to": t.get("assigned_to"),
                    "created_at": t.get("created_at"),
                    "updated_at": t.get("updated_at"),
                }
                for t in tickets
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching tickets: {str(e)}")


@router.get("/tickets/{ticket_id}")
async def get_ticket_details(
    ticket_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get ticket details"""
    try:
        from bson import ObjectId
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        # Get conversation
        messages = await db.ticket_messages.find(
            {"ticket_id": ticket_id}
        ).sort("created_at", ASCENDING).to_list(None)
        
        return {
            "ticket_id": ticket_id,
            "title": ticket.get("title"),
            "description": ticket.get("description"),
            "status": ticket.get("status"),
            "priority": ticket.get("priority"),
            "category": ticket.get("category"),
            "user_id": ticket.get("user_id"),
            "assigned_to": ticket.get("assigned_to"),
            "created_at": ticket.get("created_at"),
            "conversation": [
                {
                    "message_id": str(m.get("_id")),
                    "sender": m.get("sender"),
                    "message": m.get("message"),
                    "created_at": m.get("created_at"),
                }
                for m in messages
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ticket: {str(e)}")


@router.get("/sla-status")
async def get_sla_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get SLA compliance status"""
    try:
        # Count tickets by SLA status
        pipeline = [
            {"$group": {
                "_id": "$priority",
                "total": {"$sum": 1},
                "sla_breached": {"$sum": {"$cond": [{"$eq": ["$sla_breached", True]}, 1, 0]}}
            }}
        ]
        
        sla_data = await db.support_tickets.aggregate(pipeline).to_list(None)
        
        return {
            "sla_summary": [
                {
                    "priority": s.get("_id"),
                    "total_tickets": s.get("total"),
                    "breached": s.get("sla_breached", 0),
                    "compliance_rate": (100 * (s.get("total", 1) - s.get("sla_breached", 0))) / s.get("total", 1),
                }
                for s in sla_data
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching SLA status: {str(e)}")


@router.get("/agent-performance")
async def get_agent_performance(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get support agent performance metrics"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": "$assigned_to",
                "total_tickets": {"$sum": 1},
                "resolved": {"$sum": {"$cond": [{"$eq": ["$status", "resolved"]}, 1, 0]}},
                "avg_resolution_time": {"$avg": "$resolution_time_hours"}
            }}
        ]
        
        performance = await db.support_tickets.aggregate(pipeline).to_list(None)
        
        return {
            "period_days": days,
            "agents": [
                {
                    "agent_id": p.get("_id"),
                    "total_tickets": p.get("total_tickets"),
                    "resolved_tickets": p.get("resolved", 0),
                    "avg_resolution_time": round(p.get("avg_resolution_time", 0), 2),
                }
                for p in performance
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching performance: {str(e)}")


# ==================== PUT Endpoints ====================

@router.put("/tickets/{ticket_id}/assign")
async def assign_ticket(
    ticket_id: str,
    assignment: TicketAssignment,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Assign ticket to agent"""
    try:
        from bson import ObjectId
        
        await db.support_tickets.update_one(
            {"_id": ObjectId(ticket_id)},
            {
                "$set": {
                    "assigned_to": assignment.assigned_to,
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        
        return {"status": "success", "ticket_id": ticket_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error assigning ticket: {str(e)}")


@router.put("/tickets/{ticket_id}/resolve")
async def resolve_ticket(
    ticket_id: str,
    resolution: TicketResolution,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Resolve support ticket"""
    try:
        from bson import ObjectId
        
        await db.support_tickets.update_one(
            {"_id": ObjectId(ticket_id)},
            {
                "$set": {
                    "status": "resolved",
                    "resolution_notes": resolution.resolution_notes,
                    "satisfaction_rating": resolution.satisfaction_rating,
                    "resolved_at": datetime.utcnow(),
                    "resolved_by": admin_user.get("user_id"),
                }
            }
        )
        
        return {"status": "success", "ticket_id": ticket_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving ticket: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/tickets/create")
async def create_ticket(
    ticket: SupportTicket,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create support ticket"""
    try:
        await db.support_tickets.insert_one({
            "title": ticket.title,
            "description": ticket.description,
            "priority": ticket.priority,
            "category": ticket.category,
            "user_id": ticket.user_id,
            "status": "open",
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "title": ticket.title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating ticket: {str(e)}")


@router.post("/sla/configure")
async def configure_sla(
    sla_config: SLAConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Configure SLA for priority level"""
    try:
        await db.sla_configs.update_one(
            {"priority": sla_config.priority},
            {
                "$set": {
                    "response_time_hours": sla_config.response_time_hours,
                    "resolution_time_hours": sla_config.resolution_time_hours,
                    "updated_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        return {"status": "success", "priority": sla_config.priority}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error configuring SLA: {str(e)}")
