"""
Production Support Ticket System - Complete ticket lifecycle with SLA tracking
Handles ticket creation, assignment, priority management, and resolution
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import json
import logging
import uuid
from enum import Enum
from pydantic import BaseModel, Field

from app.database import get_db
from app.utils.time_helpers import get_ist_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v3/support", tags=["Support Tickets"])

# ============================================================================
# DATABASE MODELS
# ============================================================================

from sqlalchemy import Column, String, Float, DateTime, Integer, Boolean, JSON, Enum as SQLEnum, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class TicketStatus(str, Enum):
    """Support ticket status lifecycle"""
    OPEN = "open"                      # Just created
    ASSIGNED = "assigned"              # Assigned to agent
    IN_PROGRESS = "in_progress"        # Agent working on it
    WAITING_USER = "waiting_user"      # Waiting for user response
    RESOLVED = "resolved"              # Agent provided solution
    CLOSED = "closed"                  # User confirmed resolution
    REOPENED = "reopened"              # User says not resolved

class TicketPriority(str, Enum):
    """SLA-driven priority levels"""
    LOW = "low"                        # Response: 48h, Resolution: 7 days
    MEDIUM = "medium"                  # Response: 24h, Resolution: 3 days
    HIGH = "high"                      # Response: 4h, Resolution: 1 day
    URGENT = "urgent"                  # Response: 1h, Resolution: 4h (SOS, payment issues)

class TicketCategory(str, Enum):
    """Issue categories for routing"""
    RIDE_ISSUE = "ride_issue"          # Driver/passenger behavior, route issues
    PAYMENT_ISSUE = "payment_issue"    # Payment failed, wrong charge, refund
    SAFETY_ISSUE = "safety_issue"      # Safety concern, harassment, accident
    ACCOUNT_ISSUE = "account_issue"    # Login, profile, verification
    TECHNICAL_ISSUE = "technical_issue"  # App crash, bug, feature request

class SupportTicket(Base):
    """Main support ticket tracking"""
    __tablename__ = "support_tickets"

    ticket_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_number = Column(Integer, unique=True, autoincrement=True)  # Display: #12345

    # Requester info
    user_id = Column(String, index=True, nullable=False)
    user_type = Column(String)  # "passenger" or "driver"
    ride_id = Column(String, nullable=True, index=True)  # Related ride

    # Ticket content
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # TicketCategory
    priority = Column(String, default="medium")  # TicketPriority
    status = Column(String, default="open", index=True)  # TicketStatus

    # Assignment
    assigned_agent_id = Column(String, nullable=True, index=True)
    assigned_at = Column(DateTime, nullable=True)

    # SLA tracking
    first_response_at = Column(DateTime, nullable=True)
    sla_response_due_at = Column(DateTime)  # Based on priority
    sla_resolution_due_at = Column(DateTime)  # Based on priority
    is_sla_response_breached = Column(Boolean, default=False)
    is_sla_resolution_breached = Column(Boolean, default=False)

    # Resolution
    resolution_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    reopen_reason = Column(Text, nullable=True)

    # Tracking
    message_count = Column(Integer, default=0)
    last_message_at = Column(DateTime, nullable=True)
    customer_last_message_at = Column(DateTime, nullable=True)
    agent_last_message_at = Column(DateTime, nullable=True)

    # Metadata
    tags = Column(JSON, default=list)  # For filtering/grouping
    rating = Column(Integer, nullable=True)  # 1-5 after resolution
    created_at = Column(DateTime, default=lambda: get_ist_now(), index=True)
    updated_at = Column(DateTime, default=lambda: get_ist_now())

class TicketMessage(Base):
    """Threaded messages within a ticket"""
    __tablename__ = "ticket_messages"

    message_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String, index=True, nullable=False)
    sender_id = Column(String, nullable=False)
    sender_type = Column(String)  # "customer" or "agent"

    message = Column(Text, nullable=False)
    attachments = Column(JSON, default=list)  # File URLs

    is_internal_note = Column(Boolean, default=False)  # Not visible to customer

    created_at = Column(DateTime, default=lambda: get_ist_now())

class TicketAssignment(Base):
    """Track ticket reassignments for audit"""
    __tablename__ = "ticket_assignments"

    assignment_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String, index=True, nullable=False)
    agent_id = Column(String, index=True, nullable=False)
    previous_agent_id = Column(String, nullable=True)

    reason = Column(String)  # "auto_assign", "escalation", "reassign", etc
    assigned_at = Column(DateTime, default=lambda: get_ist_now())
    unassigned_at = Column(DateTime, nullable=True)

class SupportAgent(Base):
    """Support team members"""
    __tablename__ = "support_agents"

    agent_id = Column(String, primary_key=True)
    agent_name = Column(String, nullable=False)
    email = Column(String, unique=True)

    # Workload
    is_active = Column(Boolean, default=True)
    current_tickets = Column(Integer, default=0)
    max_concurrent_tickets = Column(Integer, default=10)

    # Skills/specialization
    specializations = Column(JSON, default=list)  # ["payment_issue", "safety_issue"]

    # Performance metrics
    avg_resolution_time_hours = Column(Float, default=0)
    sla_compliance_rate = Column(Float, default=100.0)  # 0-100%
    customer_satisfaction_score = Column(Float, default=4.5)  # 1-5

    created_at = Column(DateTime, default=lambda: get_ist_now())

class SLAPolicy(Base):
    """SLA definitions by priority"""
    __tablename__ = "sla_policies"

    policy_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    priority = Column(String, unique=True)  # low, medium, high, urgent

    response_time_hours = Column(Integer)  # Time to first response
    resolution_time_hours = Column(Integer)  # Time to resolution
    escalation_after_response_hours = Column(Integer)  # Escalate if no resolution

# ============================================================================
# SCHEMAS
# ============================================================================

class CreateTicketRequest(BaseModel):
    user_id: str
    user_type: str = Field(regex="^(passenger|driver)$")
    ride_id: Optional[str] = None
    subject: str
    description: str
    category: str = Field(description="TicketCategory value")
    priority: Optional[str] = None  # Auto-set based on category if not provided
    tags: Optional[List[str]] = None

class AddMessageRequest(BaseModel):
    sender_id: str
    sender_type: str = Field(regex="^(customer|agent)$")
    message: str
    attachments: Optional[List[str]] = None
    is_internal_note: bool = False

class UpdateTicketRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    resolution_notes: Optional[str] = None

class RateTicketRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: Optional[str] = None

# ============================================================================
# SLA & AUTO-ASSIGNMENT LOGIC
# ============================================================================

def get_sla_times(priority: str) -> tuple[timedelta, timedelta]:
    """Get response and resolution SLA times based on priority"""
    sla_map = {
        "low": (timedelta(hours=48), timedelta(days=7)),
        "medium": (timedelta(hours=24), timedelta(days=3)),
        "high": (timedelta(hours=4), timedelta(days=1)),
        "urgent": (timedelta(hours=1), timedelta(hours=4))
    }
    return sla_map.get(priority, sla_map["medium"])

def get_priority_from_category(category: str) -> str:
    """Auto-set priority based on issue category"""
    priority_map = {
        "safety_issue": "urgent",
        "payment_issue": "high",
        "ride_issue": "medium",
        "technical_issue": "medium",
        "account_issue": "low"
    }
    return priority_map.get(category, "medium")

async def auto_assign_ticket(ticket_id: str, category: str, db: Session):
    """Auto-assign ticket to best available agent"""
    # Get agents with specialization in category
    agents = db.query(SupportAgent).filter(
        and_(
            SupportAgent.is_active == True,
            SupportAgent.current_tickets < SupportAgent.max_concurrent_tickets,
            SupportAgent.specializations.contains([category]) if category else True
        )
    ).order_by(
        SupportAgent.current_tickets,  # Least busy
        desc(SupportAgent.sla_compliance_rate)  # Highest compliance
    ).first()

    if not agents:
        # Fallback: any available agent
        agents = db.query(SupportAgent).filter(
            and_(
                SupportAgent.is_active == True,
                SupportAgent.current_tickets < SupportAgent.max_concurrent_tickets
            )
        ).order_by(SupportAgent.current_tickets).first()

    if agents:
        ticket = db.query(SupportTicket).filter_by(ticket_id=ticket_id).first()
        if ticket:
            ticket.assigned_agent_id = agents.agent_id
            ticket.assigned_at = get_ist_now()
            ticket.status = "assigned"

            # Track assignment
            assignment = TicketAssignment(
                assignment_id=str(uuid.uuid4()),
                ticket_id=ticket_id,
                agent_id=agents.agent_id,
                reason="auto_assign"
            )

            agents.current_tickets += 1
            db.add(assignment)
            db.commit()

            logger.info(f"Ticket {ticket_id} auto-assigned to {agents.agent_id}")

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/tickets/create")
async def create_ticket(
    request: CreateTicketRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Create a new support ticket
    Auto-assigns to best available agent
    """
    # Set priority from category if not provided
    priority = request.priority or get_priority_from_category(request.category)

    # Calculate SLA times
    response_sla, resolution_sla = get_sla_times(priority)
    now = get_ist_now()

    ticket = SupportTicket(
        ticket_id=str(uuid.uuid4()),
        user_id=request.user_id,
        user_type=request.user_type,
        ride_id=request.ride_id,
        subject=request.subject,
        description=request.description,
        category=request.category,
        priority=priority,
        status="open",
        sla_response_due_at=now + response_sla,
        sla_resolution_due_at=now + resolution_sla,
        tags=request.tags or []
    )

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    # Auto-assign in background
    background_tasks.add_task(auto_assign_ticket, ticket.ticket_id, request.category, db)

    logger.info(f"Ticket created: {ticket.ticket_id} (#{ticket.ticket_number})")

    return {
        "ticket_id": ticket.ticket_id,
        "ticket_number": ticket.ticket_number,
        "status": "open",
        "priority": priority,
        "sla_response_due": ticket.sla_response_due_at.isoformat(),
        "sla_resolution_due": ticket.sla_resolution_due_at.isoformat()
    }

@router.post("/tickets/{ticket_id}/messages")
async def add_message(
    ticket_id: str,
    request: AddMessageRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Add message to ticket thread"""
    ticket = db.query(SupportTicket).filter_by(ticket_id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    message = TicketMessage(
        message_id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        sender_id=request.sender_id,
        sender_type=request.sender_type,
        message=request.message,
        attachments=request.attachments or [],
        is_internal_note=request.is_internal_note
    )

    db.add(message)

    # Update ticket metadata
    ticket.message_count += 1
    ticket.last_message_at = get_ist_now()

    if request.sender_type == "customer":
        ticket.customer_last_message_at = get_ist_now()
        ticket.status = "open"  # Reopen if customer replies
    elif request.sender_type == "agent":
        ticket.agent_last_message_at = get_ist_now()
        if ticket.status == "waiting_user":
            ticket.status = "in_progress"
        # Set first response time
        if not ticket.first_response_at:
            ticket.first_response_at = get_ist_now()

    ticket.updated_at = get_ist_now()
    db.commit()

    # Send notification to other party
    if request.sender_type == "customer":
        background_tasks.add_task(
            notify_agent,
            ticket.assigned_agent_id,
            f"Customer replied on ticket #{ticket.ticket_number}"
        )
    else:
        background_tasks.add_task(
            notify_user,
            ticket.user_id,
            f"Support team replied to your ticket",
            ticket_id
        )

    return {
        "message_id": message.message_id,
        "status": "added",
        "ticket_status": ticket.status
    }

@router.post("/tickets/{ticket_id}/update")
async def update_ticket(
    ticket_id: str,
    request: UpdateTicketRequest,
    db: Session = Depends(get_db)
):
    """Update ticket status, priority, or assignment"""
    ticket = db.query(SupportTicket).filter_by(ticket_id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if request.status:
        ticket.status = request.status
        if request.status == "resolved":
            ticket.resolved_at = get_ist_now()
        elif request.status == "closed":
            ticket.closed_at = get_ist_now()
        elif request.status == "reopened":
            ticket.reopen_reason = request.reopen_reason

    if request.priority:
        ticket.priority = request.priority
        # Recalculate SLA
        response_sla, resolution_sla = get_sla_times(request.priority)
        ticket.sla_response_due_at = get_ist_now() + response_sla
        ticket.sla_resolution_due_at = get_ist_now() + resolution_sla

    if request.assigned_agent_id:
        # Track reassignment
        assignment = TicketAssignment(
            assignment_id=str(uuid.uuid4()),
            ticket_id=ticket_id,
            agent_id=request.assigned_agent_id,
            previous_agent_id=ticket.assigned_agent_id,
            reason="manual_reassign"
        )
        db.add(assignment)

        # Update agent workload
        if ticket.assigned_agent_id:
            old_agent = db.query(SupportAgent).filter_by(
                agent_id=ticket.assigned_agent_id
            ).first()
            if old_agent:
                old_agent.current_tickets -= 1

        ticket.assigned_agent_id = request.assigned_agent_id
        new_agent = db.query(SupportAgent).filter_by(
            agent_id=request.assigned_agent_id
        ).first()
        if new_agent:
            new_agent.current_tickets += 1

    if request.resolution_notes:
        ticket.resolution_notes = request.resolution_notes

    ticket.updated_at = get_ist_now()
    db.commit()

    return {
        "ticket_id": ticket_id,
        "status": ticket.status,
        "updated_at": ticket.updated_at.isoformat()
    }

@router.post("/tickets/{ticket_id}/rate")
async def rate_ticket(
    ticket_id: str,
    request: RateTicketRequest,
    db: Session = Depends(get_db)
):
    """Rate ticket resolution (1-5 stars)"""
    ticket = db.query(SupportTicket).filter_by(ticket_id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.rating = request.rating
    ticket.status = "closed"
    ticket.closed_at = get_ist_now()

    # Update agent satisfaction score
    if ticket.assigned_agent_id:
        agent = db.query(SupportAgent).filter_by(agent_id=ticket.assigned_agent_id).first()
        if agent:
            # Weighted average
            old_sum = agent.customer_satisfaction_score * 50
            new_sum = old_sum + request.rating
            agent.customer_satisfaction_score = new_sum / 51

    db.commit()

    return {
        "ticket_id": ticket_id,
        "rating": request.rating,
        "status": "closed"
    }

@router.get("/tickets/{user_id}")
async def get_user_tickets(
    user_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all tickets for a user"""
    query = db.query(SupportTicket).filter(SupportTicket.user_id == user_id)

    if status:
        query = query.filter(SupportTicket.status == status)

    tickets = query.order_by(desc(SupportTicket.created_at)).all()

    return {
        "tickets": [
            {
                "ticket_id": t.ticket_id,
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
                "message_count": t.message_count,
                "rating": t.rating
            }
            for t in tickets
        ]
    }

@router.get("/tickets/{ticket_id}/messages")
async def get_ticket_messages(ticket_id: str, db: Session = Depends(get_db)):
    """Get all messages in a ticket"""
    messages = db.query(TicketMessage).filter_by(ticket_id=ticket_id).all()

    return {
        "messages": [
            {
                "message_id": m.message_id,
                "sender_id": m.sender_id,
                "sender_type": m.sender_type,
                "message": m.message,
                "is_internal": m.is_internal_note,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    }

@router.get("/agent-dashboard/{agent_id}")
async def get_agent_dashboard(agent_id: str, db: Session = Depends(get_db)):
    """Agent dashboard with assigned tickets and SLA status"""
    # Get agent info
    agent = db.query(SupportAgent).filter_by(agent_id=agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get assigned tickets
    tickets = db.query(SupportTicket).filter(
        and_(
            SupportTicket.assigned_agent_id == agent_id,
            SupportTicket.status.in_(["assigned", "in_progress", "waiting_user"])
        )
    ).order_by(desc(SupportTicket.priority)).all()

    # Calculate SLA status
    now = get_ist_now()
    sla_at_risk = []
    sla_breached = []

    for ticket in tickets:
        if ticket.sla_response_due_at and not ticket.first_response_at:
            if now > ticket.sla_response_due_at:
                sla_breached.append(ticket.ticket_id)
            elif (ticket.sla_response_due_at - now).total_seconds() < 3600:  # < 1 hour
                sla_at_risk.append(ticket.ticket_id)

    return {
        "agent_id": agent_id,
        "agent_name": agent.agent_name,
        "current_load": agent.current_tickets,
        "max_capacity": agent.max_concurrent_tickets,
        "sla_compliance": agent.sla_compliance_rate,
        "satisfaction_score": agent.customer_satisfaction_score,
        "tickets": [
            {
                "ticket_id": t.ticket_id,
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "priority": t.priority,
                "status": t.status,
                "messages": t.message_count,
                "sla_response_due": t.sla_response_due_at.isoformat(),
                "sla_resolution_due": t.sla_resolution_due_at.isoformat()
            }
            for t in tickets
        ],
        "sla_status": {
            "at_risk": len(sla_at_risk),
            "breached": len(sla_breached),
            "at_risk_tickets": sla_at_risk,
            "breached_tickets": sla_breached
        }
    }

@router.get("/queue")
async def get_support_queue(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get unassigned tickets queue"""
    query = db.query(SupportTicket).filter(SupportTicket.assigned_agent_id == None)

    if status:
        query = query.filter(SupportTicket.status == status)
    if priority:
        query = query.filter(SupportTicket.priority == priority)

    tickets = query.order_by(
        desc(SupportTicket.priority),
        SupportTicket.created_at
    ).all()

    return {
        "unassigned_count": len(tickets),
        "tickets": [
            {
                "ticket_id": t.ticket_id,
                "ticket_number": t.ticket_number,
                "subject": t.subject,
                "priority": t.priority,
                "category": t.category,
                "created_at": t.created_at.isoformat(),
                "sla_response_due": t.sla_response_due_at.isoformat()
            }
            for t in tickets[:20]  # Show first 20
        ]
    }

@router.get("/analytics")
async def get_support_analytics(days: int = Query(30, ge=1, le=90), db: Session = Depends(get_db)):
    """Get support team analytics"""
    since = get_ist_now() - timedelta(days=days)

    total_tickets = db.query(func.count(SupportTicket.ticket_id)).filter(
        SupportTicket.created_at >= since
    ).scalar() or 0

    resolved = db.query(func.count(SupportTicket.ticket_id)).filter(
        and_(
            SupportTicket.status == "closed",
            SupportTicket.created_at >= since
        )
    ).scalar() or 0

    avg_resolution_hours = 24  # TODO: Calculate actual

    sla_breached = db.query(func.count(SupportTicket.ticket_id)).filter(
        and_(
            SupportTicket.is_sla_resolution_breached == True,
            SupportTicket.created_at >= since
        )
    ).scalar() or 0

    return {
        "period_days": days,
        "total_tickets": total_tickets,
        "resolved": resolved,
        "resolution_rate": round((resolved / total_tickets * 100) if total_tickets > 0 else 0, 1),
        "avg_resolution_hours": avg_resolution_hours,
        "sla_breached": sla_breached,
        "sla_compliance": round(((total_tickets - sla_breached) / total_tickets * 100) if total_tickets > 0 else 100, 1)
    }

# ============================================================================
# BACKGROUND TASKS
# ============================================================================

async def notify_user(user_id: str, message: str, ticket_id: str):
    """Send notification to user about ticket update"""
    logger.info(f"Notifying user {user_id}: {message}")
    # TODO: Integrate with push notification system

async def notify_agent(agent_id: str, message: str):
    """Send notification to agent about ticket update"""
    logger.info(f"Notifying agent {agent_id}: {message}")
    # TODO: Send to agent dashboard or email
