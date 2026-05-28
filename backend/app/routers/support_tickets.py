"""
Support Ticket Router with Escalation
Handles support tickets with priority routing and admin assignment
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from bson import ObjectId
import logging

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/support/tickets", tags=["support"])
logger = logging.getLogger(__name__)

# Constants
ESCALATION_LEVELS = ["level1", "level2", "level3", "management"]
PRIORITY_LEVELS = ["low", "medium", "high", "critical"]
TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"]


# Models
class SupportTicketCreate(BaseModel):
    subject: str = Field(..., min_length=5, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    category: str = Field(..., min_length=1, max_length=50)


class SupportTicketUpdate(BaseModel):
    status: Optional[Literal["open", "in_progress", "waiting_customer", "resolved", "closed"]] = None
    notes: Optional[str] = None
    escalation_level: Optional[str] = None


class SupportTicketResponse(BaseModel):
    id: str
    user_id: str
    subject: str
    description: str
    priority: str
    category: str
    status: str
    escalation_level: str
    assigned_to: Optional[str]
    notes: Optional[str]
    satisfaction_rating: Optional[int]
    resolution_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


class SupportTicketAddNote(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)
    is_internal: bool = False  # If true, only visible to support team


class EscalationRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=1000)
    target_level: Optional[str] = None


# Endpoints
@router.post("/", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    ticket: SupportTicketCreate,
    current_user: dict = Depends(require_roles("passenger", "driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a new support ticket"""
    try:
        now = datetime.now(timezone.utc)
        
        ticket_doc = {
            "user_id": ObjectId(current_user["id"]),
            "user_email": current_user.get("email"),
            "user_type": current_user.get("role", "passenger"),
            "subject": ticket.subject,
            "description": ticket.description,
            "priority": ticket.priority,
            "category": ticket.category,
            "status": "open",
            "escalation_level": "level1",
            "assigned_to": None,
            "notes": [],
            "internal_notes": [],
            "satisfaction_rating": None,
            "resolution_notes": None,
            "created_at": now,
            "updated_at": now,
            "resolved_at": None,
            "response_time_minutes": None,
            "resolution_time_minutes": None
        }
        
        result = await db.support_tickets.insert_one(ticket_doc)
        ticket_doc["_id"] = result.inserted_id
        
        # Create audit log
        await db.audit_logs.insert_one({
            "action_type": "SUPPORT_TICKET_CREATED",
            "user_id": ObjectId(current_user["id"]),
            "entity_type": "support_ticket",
            "entity_id": str(result.inserted_id),
            "data": {"subject": ticket.subject, "priority": ticket.priority},
            "timestamp": now,
            "ip_address": None  # Would be extracted from request
        })
        
        logger.info(f"Support ticket created: {result.inserted_id}")
        
        return _format_ticket(ticket_doc)
    
    except Exception as e:
        logger.error(f"Error creating support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create support ticket"
        )


@router.get("/", response_model=List[SupportTicketResponse])
async def list_support_tickets(
    current_user: dict = Depends(require_roles("passenger", "driver", "admin")),
    status_filter: Optional[str] = Query(None),
    priority_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List support tickets"""
    try:
        # Passengers/drivers see only their tickets
        if current_user.get("role") != "admin":
            query = {"user_id": ObjectId(current_user["id"])}
        else:
            # Admins can see all tickets assigned to them
            query = {"assigned_to": ObjectId(current_user["id"])}
        
        if status_filter:
            query["status"] = status_filter
        if priority_filter:
            query["priority"] = priority_filter
        
        tickets = await db.support_tickets.find(query)\
            .sort("created_at", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(None)
        
        return [_format_ticket(t) for t in tickets]
    
    except Exception as e:
        logger.error(f"Error listing support tickets: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve support tickets"
        )


@router.get("/{ticket_id}", response_model=SupportTicketResponse)
async def get_support_ticket(
    ticket_id: str,
    current_user: dict = Depends(require_roles("passenger", "driver", "admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific support ticket"""
    try:
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found"
            )
        
        # Verify access (owner or assigned admin)
        if current_user.get("role") != "admin":
            if ticket["user_id"] != ObjectId(current_user["id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to view this ticket"
                )
        
        return _format_ticket(ticket)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve ticket"
        )


@router.put("/{ticket_id}", response_model=SupportTicketResponse)
async def update_support_ticket(
    ticket_id: str,
    update: SupportTicketUpdate,
    current_admin: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update a support ticket (admin only)"""
    try:
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found"
            )
        
        # Check admin is assigned to ticket
        if ticket.get("assigned_to") and ticket["assigned_to"] != ObjectId(current_admin["id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ticket not assigned to you"
            )
        
        now = datetime.now(timezone.utc)
        update_data = {"updated_at": now}
        
        if update.status:
            update_data["status"] = update.status
            if update.status == "resolved":
                update_data["resolved_at"] = now
                # Calculate resolution time
                creation_time = ticket.get("created_at")
                if creation_time:
                    resolution_time = (now - creation_time).total_seconds() / 60
                    update_data["resolution_time_minutes"] = round(resolution_time, 2)
        
        if update.notes:
            update_data["notes"] = ticket.get("notes", []) + [
                {
                    "by_admin": current_admin["id"],
                    "text": update.notes,
                    "timestamp": now
                }
            ]
        
        if update.escalation_level:
            if update.escalation_level not in ESCALATION_LEVELS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid escalation level: {update.escalation_level}"
                )
            update_data["escalation_level"] = update.escalation_level
        
        updated_ticket = await db.support_tickets.find_one_and_update(
            {"_id": ObjectId(ticket_id)},
            {"$set": update_data},
            return_document=True
        )
        
        logger.info(f"Support ticket updated: {ticket_id}")
        return _format_ticket(updated_ticket)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update ticket"
        )


@router.post("/{ticket_id}/escalate", response_model=SupportTicketResponse)
async def escalate_ticket(
    ticket_id: str,
    escalation: EscalationRequest,
    current_admin: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Escalate a support ticket to next level"""
    try:
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found"
            )
        
        current_level = ticket.get("escalation_level", "level1")
        level_index = ESCALATION_LEVELS.index(current_level)
        
        # Determine next level
        if escalation.target_level:
            if escalation.target_level not in ESCALATION_LEVELS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid escalation level: {escalation.target_level}"
                )
            next_level = escalation.target_level
        else:
            if level_index >= len(ESCALATION_LEVELS) - 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ticket already at highest escalation level"
                )
            next_level = ESCALATION_LEVELS[level_index + 1]
        
        now = datetime.now(timezone.utc)
        
        # Update ticket
        updated_ticket = await db.support_tickets.find_one_and_update(
            {"_id": ObjectId(ticket_id)},
            {
                "$set": {
                    "escalation_level": next_level,
                    "assigned_to": None,  # Clear current assignment
                    "updated_at": now
                },
                "$push": {
                    "internal_notes": {
                        "by_admin": current_admin["id"],
                        "text": f"Escalated to {next_level}: {escalation.reason}",
                        "timestamp": now
                    }
                }
            },
            return_document=True
        )
        
        logger.info(f"Support ticket escalated: {ticket_id} from {current_level} to {next_level}")
        
        # Create audit log
        await db.audit_logs.insert_one({
            "action_type": "SUPPORT_TICKET_ESCALATED",
            "user_id": ObjectId(current_admin["id"]),
            "entity_type": "support_ticket",
            "entity_id": str(ticket_id),
            "data": {
                "from_level": current_level,
                "to_level": next_level,
                "reason": escalation.reason
            },
            "timestamp": now
        })
        
        return _format_ticket(updated_ticket)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error escalating support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to escalate ticket"
        )


@router.post("/{ticket_id}/assign", response_model=SupportTicketResponse)
async def assign_ticket(
    ticket_id: str,
    assign_to_admin_id: str = Query(...),
    current_admin: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Assign a ticket to an admin"""
    try:
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found"
            )
        
        # Verify target admin exists
        admin = await db.users.find_one({
            "_id": ObjectId(assign_to_admin_id),
            "role": "admin"
        })
        
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )
        
        now = datetime.now(timezone.utc)
        
        updated_ticket = await db.support_tickets.find_one_and_update(
            {"_id": ObjectId(ticket_id)},
            {
                "$set": {
                    "assigned_to": ObjectId(assign_to_admin_id),
                    "status": "in_progress",
                    "updated_at": now
                },
                "$push": {
                    "internal_notes": {
                        "by_admin": current_admin["id"],
                        "text": f"Assigned to {admin.get('name', 'admin')}",
                        "timestamp": now
                    }
                }
            },
            return_document=True
        )
        
        logger.info(f"Support ticket assigned: {ticket_id} to {assign_to_admin_id}")
        
        return _format_ticket(updated_ticket)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign ticket"
        )


@router.post("/{ticket_id}/rate", response_model=SupportTicketResponse)
async def rate_ticket_resolution(
    ticket_id: str,
    rating: int = Query(..., ge=1, le=5),
    current_user: dict = Depends(require_roles("passenger", "driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Rate the ticket resolution (user only)"""
    try:
        ticket = await db.support_tickets.find_one({
            "_id": ObjectId(ticket_id),
            "user_id": ObjectId(current_user["id"])
        })
        
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found"
            )
        
        if ticket["status"] != "resolved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only rate resolved tickets"
            )
        
        if ticket.get("satisfaction_rating"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ticket already rated"
            )
        
        updated_ticket = await db.support_tickets.find_one_and_update(
            {"_id": ObjectId(ticket_id)},
            {
                "$set": {
                    "satisfaction_rating": rating,
                    "status": "closed",
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        logger.info(f"Support ticket rated: {ticket_id} with rating {rating}")
        
        return _format_ticket(updated_ticket)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rating support ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rate ticket"
        )


@router.get("/admin/dashboard/overview")
async def support_dashboard_overview(
    current_admin: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get support team dashboard overview"""
    try:
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get statistics
        total_open = await db.support_tickets.count_documents({"status": "open"})
        total_assigned = await db.support_tickets.count_documents(
            {"assigned_to": ObjectId(current_admin["id"])}
        )
        
        urgent_tickets = await db.support_tickets.find({
            "priority": "critical",
            "status": {"$in": ["open", "in_progress"]}
        }).to_list(None)
        
        created_today = await db.support_tickets.count_documents({
            "created_at": {"$gte": today}
        })
        
        resolved_today = await db.support_tickets.count_documents({
            "resolved_at": {"$gte": today},
            "status": "resolved"
        })
        
        # Average resolution time
        resolved_tickets = await db.support_tickets.find({
            "status": "resolved",
            "resolution_time_minutes": {"$exists": True}
        }).to_list(None)
        
        avg_resolution_time = 0
        if resolved_tickets:
            total_time = sum(t.get("resolution_time_minutes", 0) for t in resolved_tickets)
            avg_resolution_time = total_time / len(resolved_tickets)
        
        return {
            "total_open": total_open,
            "assigned_to_me": total_assigned,
            "urgent_tickets": len(urgent_tickets),
            "created_today": created_today,
            "resolved_today": resolved_today,
            "avg_resolution_time_minutes": round(avg_resolution_time, 2),
            "satisfaction_rating": "4.5"  # Would calculate from actual ratings
        }
    
    except Exception as e:
        logger.error(f"Error getting support dashboard: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve dashboard data"
        )


# Helper Functions
def _format_ticket(ticket: dict) -> SupportTicketResponse:
    """Format ticket document for response"""
    return SupportTicketResponse(
        id=str(ticket.get("_id", "")),
        user_id=str(ticket.get("user_id", "")),
        subject=ticket.get("subject"),
        description=ticket.get("description"),
        priority=ticket.get("priority", "medium"),
        category=ticket.get("category"),
        status=ticket.get("status", "open"),
        escalation_level=ticket.get("escalation_level", "level1"),
        assigned_to=str(ticket.get("assigned_to", "")) if ticket.get("assigned_to") else None,
        notes=ticket.get("notes"),
        satisfaction_rating=ticket.get("satisfaction_rating"),
        resolution_notes=ticket.get("resolution_notes"),
        created_at=ticket.get("created_at"),
        updated_at=ticket.get("updated_at"),
        resolved_at=ticket.get("resolved_at")
    )
