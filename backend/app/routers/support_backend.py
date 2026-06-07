"""
Support Tickets Backend Router
Complete system for creating, managing, and resolving support tickets
"""
from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from datetime import datetime, timezone
from bson import ObjectId
import logging
from typing import Optional, List, Literal
import os

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support/tickets", tags=["support_tickets"])

# Global dependencies
db = None
io = None


def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


async def verify_user_token(request: Request):
    """Extract and verify user token from Authorization header"""
    try:
        user = await get_current_user_from_request(request, db_override=db)
        return {
            'user_id': str(user.get('id') or user.get('user_id') or ''),
            'mongo_id': str(user.get('_id') or ''),
            'user_type': str(user.get('role') or user.get('user_type') or 'passenger').lower(),  # passenger, driver, admin
            'name': user.get('name', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("")
async def create_support_ticket(request: Request):
    """Create a new support ticket"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        
        data = await request.json()
        
        # Validate required fields
        if not data.get("subject") or not data.get("description"):
            raise HTTPException(
                status_code=400,
                detail="Subject and description are required"
            )
        
        ticket = {
            "user_id": user_id,
            "user_type": user['user_type'],
            "subject": data.get("subject"),
            "description": data.get("description"),
            "category": data.get("category", "general"),  # payment, ride, safety, account, driver_access, other
            "priority": data.get("priority", "normal"),  # low, normal, high, critical
            "status": "open",  # open, in_progress, waiting_customer, escalated, resolved, closed
            "booking_id": data.get("booking_id"),
            "ride_id": data.get("ride_id"),
            "driver_id": data.get("driver_id"),
            "passenger_id": data.get("passenger_id"),
            "attachments": [],
            "messages": [
                {
                    "author_id": user_id,
                    "author_name": user['name'],
                    "author_type": user['user_type'],
                    "message": data.get("description"),
                    "timestamp": datetime.now(timezone.utc),
                    "attachment": None
                }
            ],
            "assigned_to_admin": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "resolved_at": None,
            "resolution_notes": None,
            "customer_satisfaction_rating": None
        }
        
        result = await db.support_tickets.insert_one(ticket)
        ticket["_id"] = str(result.inserted_id)
        
        # Notify admins via Socket.IO
        if io:
            io.emit('support_ticket_created', {
                'ticket_id': str(result.inserted_id),
                'subject': ticket['subject'],
                'priority': ticket['priority'],
                'user_type': ticket['user_type'],
                'timestamp': ticket['created_at'].isoformat()
            }, room='admin')
        
        logger.info(f"Support ticket created: {result.inserted_id} by {user_id}")
        
        return {
            "id": str(result.inserted_id),
            "message": "Support ticket created successfully",
            "ticket_number": f"TKT-{str(result.inserted_id)[:8].upper()}",
            "status": "open",
            "created_at": ticket["created_at"].isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating support ticket: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create support ticket")


@router.get("")
async def list_support_tickets(
    request: Request,
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500)
):
    """List support tickets for the user"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        
        # Admins can see all tickets
        if user['user_type'] == 'admin':
            query = {}
        else:
            query = {"user_id": user_id}
        
        # Apply filters
        if status:
            query["status"] = status
        
        if category:
            query["category"] = category
        
        if priority:
            query["priority"] = priority
        
        # Get total count
        total = await db.support_tickets.count_documents(query)
        
        # Fetch tickets sorted by created_at (newest first)
        tickets = await db.support_tickets.find(query)\
            .sort("created_at", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(None)
        
        formatted = []
        for ticket in tickets:
            formatted.append({
                "id": str(ticket["_id"]),
                "subject": ticket.get("subject"),
                "category": ticket.get("category"),
                "priority": ticket.get("priority"),
                "status": ticket.get("status"),
                "message_count": len(ticket.get("messages", [])),
                "created_at": ticket.get("created_at").isoformat() if ticket.get("created_at") else None,
                "updated_at": ticket.get("updated_at").isoformat() if ticket.get("updated_at") else None,
                "assigned_to": ticket.get("assigned_to_admin")
            })
        
        return {
            "total": total,
            "count": len(formatted),
            "skip": skip,
            "limit": limit,
            "tickets": formatted
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing support tickets: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve tickets")


@router.get("/{ticket_id}")
async def get_support_ticket(ticket_id: str, request: Request):
    """Get a specific support ticket"""
    try:
        user = await verify_user_token(request)
        
        try:
            tid = ObjectId(ticket_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid ticket ID")
        
        # Build query - user can only see their own tickets unless admin
        query = {"_id": tid}
        if user['user_type'] != 'admin':
            query["user_id"] = user['user_id']
        
        ticket = await db.support_tickets.find_one(query)
        
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        return {
            "id": str(ticket["_id"]),
            "subject": ticket.get("subject"),
            "description": ticket.get("description"),
            "category": ticket.get("category"),
            "priority": ticket.get("priority"),
            "status": ticket.get("status"),
            "user_type": ticket.get("user_type"),
            "booking_id": ticket.get("booking_id"),
            "ride_id": ticket.get("ride_id"),
            "assigned_to": ticket.get("assigned_to_admin"),
            "messages": [
                {
                    "author_name": msg.get("author_name"),
                    "author_type": msg.get("author_type"),
                    "message": msg.get("message"),
                    "timestamp": msg.get("timestamp").isoformat() if msg.get("timestamp") else None,
                    "attachment": msg.get("attachment")
                }
                for msg in ticket.get("messages", [])
            ],
            "attachments": ticket.get("attachments", []),
            "resolution_notes": ticket.get("resolution_notes"),
            "customer_satisfaction_rating": ticket.get("customer_satisfaction_rating"),
            "created_at": ticket.get("created_at").isoformat() if ticket.get("created_at") else None,
            "updated_at": ticket.get("updated_at").isoformat() if ticket.get("updated_at") else None,
            "resolved_at": ticket.get("resolved_at").isoformat() if ticket.get("resolved_at") else None
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving support ticket: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve ticket")


@router.post("/{ticket_id}/messages")
async def add_message_to_ticket(ticket_id: str, request: Request):
    """Add a message to a support ticket"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        
        try:
            tid = ObjectId(ticket_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid ticket ID")
        
        data = await request.json()
        
        if not data.get("message"):
            raise HTTPException(status_code=400, detail="Message is required")
        
        # Verify ownership or admin access
        query = {"_id": tid}
        if user['user_type'] != 'admin':
            query["user_id"] = user_id
        
        ticket = await db.support_tickets.find_one(query)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found or access denied")
        
        # Create message
        new_message = {
            "author_id": user_id,
            "author_name": user['name'],
            "author_type": user['user_type'],
            "message": data.get("message"),
            "timestamp": datetime.now(timezone.utc),
            "attachment": data.get("attachment")
        }
        
        # Add message to ticket
        result = await db.support_tickets.find_one_and_update(
            {"_id": tid},
            {
                "$push": {"messages": new_message},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            },
            return_document=True
        )
        
        # Notify via Socket.IO
        if io:
            io.emit('support_ticket_message', {
                'ticket_id': ticket_id,
                'author_name': user['name'],
                'author_type': user['user_type'],
                'message': data.get("message"),
                'timestamp': new_message['timestamp'].isoformat()
            }, room=f'ticket_{ticket_id}')
        
        logger.info(f"Message added to ticket {ticket_id} by {user_id}")
        
        return {
            "message": "Message added successfully",
            "timestamp": new_message["timestamp"].isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding message to ticket: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add message")


@router.put("/{ticket_id}/status")
async def update_ticket_status(ticket_id: str, request: Request):
    """Update ticket status (admin only)"""
    try:
        user = await verify_user_token(request)
        
        # Only admins can update status
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            tid = ObjectId(ticket_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid ticket ID")
        
        data = await request.json()
        status_value = data.get("status")
        
        valid_statuses = ["open", "in_progress", "waiting_customer", "escalated", "resolved", "closed"]
        if status_value not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        update_data = {
            "status": status_value,
            "updated_at": datetime.now(timezone.utc)
        }
        
        # If resolving, set resolved_at and resolution_notes
        if status_value == "resolved":
            update_data["resolved_at"] = datetime.now(timezone.utc)
            if data.get("resolution_notes"):
                update_data["resolution_notes"] = data.get("resolution_notes")
        
        # If assigned, record admin assignment
        if data.get("assigned_to"):
            update_data["assigned_to_admin"] = data.get("assigned_to")
        
        result = await db.support_tickets.find_one_and_update(
            {"_id": tid},
            {"$set": update_data},
            return_document=True
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        logger.info(f"Ticket {ticket_id} status updated to {status_value} by {user['user_id']}")
        
        return {
            "message": f"Ticket status updated to {status_value}",
            "status": status_value,
            "updated_at": update_data["updated_at"].isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ticket status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update ticket status")


@router.post("/{ticket_id}/satisfaction")
async def submit_satisfaction_rating(ticket_id: str, request: Request):
    """Submit customer satisfaction rating"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        
        try:
            tid = ObjectId(ticket_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid ticket ID")
        
        data = await request.json()
        rating = data.get("rating")
        
        if not isinstance(rating, (int, float)) or rating < 1 or rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
        
        # Verify ownership
        ticket = await db.support_tickets.find_one({
            "_id": tid,
            "user_id": user_id
        })
        
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        result = await db.support_tickets.find_one_and_update(
            {"_id": tid},
            {
                "$set": {
                    "customer_satisfaction_rating": rating,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        logger.info(f"Satisfaction rating {rating} submitted for ticket {ticket_id}")
        
        return {
            "message": "Thank you for your feedback!",
            "rating": rating
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting satisfaction rating: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to submit rating")


@router.delete("/{ticket_id}")
async def delete_support_ticket(ticket_id: str, request: Request):
    """Delete a support ticket (admin only)"""
    try:
        user = await verify_user_token(request)
        
        # Only admins can delete tickets
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            tid = ObjectId(ticket_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid ticket ID")
        
        result = await db.support_tickets.delete_one({"_id": tid})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        logger.info(f"Support ticket {ticket_id} deleted by {user['user_id']}")
        
        return {"message": "Ticket deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ticket: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete ticket")


@router.get("/admin/stats/dashboard")
async def get_support_dashboard_stats(request: Request):
    """Get support dashboard statistics (admin only)"""
    try:
        user = await verify_user_token(request)
        
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get ticket counts by status
        open_count = await db.support_tickets.count_documents({"status": "open"})
        in_progress = await db.support_tickets.count_documents({"status": "in_progress"})
        waiting = await db.support_tickets.count_documents({"status": "waiting_customer"})
        escalated = await db.support_tickets.count_documents({"status": "escalated"})
        resolved = await db.support_tickets.count_documents({"status": "resolved"})
        closed = await db.support_tickets.count_documents({"status": "closed"})
        
        # Get high priority tickets
        critical_tickets = await db.support_tickets.count_documents({
            "priority": "critical",
            "status": {"$in": ["open", "in_progress"]}
        })
        
        # Average satisfaction rating
        ratings_pipeline = [
            {"$match": {"customer_satisfaction_rating": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": None, "avg_rating": {"$avg": "$customer_satisfaction_rating"}}}
        ]
        ratings = await db.support_tickets.aggregate(ratings_pipeline).to_list(None)
        avg_rating = ratings[0]["avg_rating"] if ratings else 0
        
        return {
            "status_breakdown": {
                "open": open_count,
                "in_progress": in_progress,
                "waiting_customer": waiting,
                "escalated": escalated,
                "resolved": resolved,
                "closed": closed
            },
            "critical_open": critical_tickets,
            "average_satisfaction_rating": round(avg_rating, 2)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")
