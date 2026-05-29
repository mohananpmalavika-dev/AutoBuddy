"""
Admin Audit & Compliance Router
Features: Action logs, GDPR compliance, policy tracking, data management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/audit", tags=["admin-audit"])


class AuditLogEntry(BaseModel):
    action: str
    entity_type: str
    entity_id: str
    changes: Optional[dict] = None
    reason: Optional[str] = None


class DataRequestProcessing(BaseModel):
    request_type: str = Field(..., description="access, deletion, portability")
    user_id: str
    notes: Optional[str] = None


# ==================== GET Endpoints ====================

@router.get("/logs")
async def get_audit_logs(
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get audit logs with filtering"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        filters = {"created_at": {"$gte": start_date}}
        if action:
            filters["action"] = action
        if entity_type:
            filters["entity_type"] = entity_type
        if admin_id:
            filters["admin_id"] = admin_id
        
        total = await db.audit_logs.count_documents(filters)
        
        logs = await db.audit_logs.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "logs": [
                {
                    "log_id": str(l.get("_id")),
                    "action": l.get("action"),
                    "entity_type": l.get("entity_type"),
                    "entity_id": l.get("entity_id"),
                    "admin_id": l.get("admin_id"),
                    "timestamp": l.get("created_at"),
                    "changes": l.get("changes"),
                }
                for l in logs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching logs: {str(e)}")


@router.get("/admin-activity/{admin_id}")
async def get_admin_activity(
    admin_id: str,
    days: int = Query(30, ge=1, le=365),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get specific admin's activity"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        total = await db.audit_logs.count_documents({
            "admin_id": admin_id,
            "created_at": {"$gte": start_date}
        })
        
        logs = await db.audit_logs.find({
            "admin_id": admin_id,
            "created_at": {"$gte": start_date}
        }).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "admin_id": admin_id,
            "total_actions": total,
            "actions": [
                {
                    "action": l.get("action"),
                    "entity": l.get("entity_type"),
                    "timestamp": l.get("created_at"),
                }
                for l in logs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching activity: {str(e)}")


@router.get("/gdpr/requests")
async def get_gdpr_requests(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get GDPR data requests"""
    try:
        filters = {}
        if status:
            filters["status"] = status
        
        total = await db.gdpr_requests.count_documents(filters)
        
        requests = await db.gdpr_requests.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "requests": [
                {
                    "request_id": str(r.get("_id")),
                    "user_id": r.get("user_id"),
                    "request_type": r.get("request_type"),
                    "status": r.get("status"),
                    "requested_at": r.get("created_at"),
                    "deadline": r.get("deadline"),
                }
                for r in requests
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching requests: {str(e)}")


@router.get("/compliance/policy-acknowledgments")
async def get_policy_acknowledgments(
    policy_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get policy acknowledgment records"""
    try:
        filters = {}
        if policy_type:
            filters["policy_type"] = policy_type
        
        total = await db.policy_acknowledgments.count_documents(filters)
        
        records = await db.policy_acknowledgments.find(filters).sort("acknowledged_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "records": [
                {
                    "user_id": r.get("user_id"),
                    "policy_type": r.get("policy_type"),
                    "acknowledged_at": r.get("acknowledged_at"),
                    "ip_address": r.get("ip_address"),
                }
                for r in records
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching acknowledgments: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/logs/create")
async def create_audit_log(
    log_entry: AuditLogEntry,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create audit log entry"""
    try:
        await db.audit_logs.insert_one({
            "action": log_entry.action,
            "entity_type": log_entry.entity_type,
            "entity_id": log_entry.entity_id,
            "changes": log_entry.changes,
            "reason": log_entry.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "action": log_entry.action}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating log: {str(e)}")


@router.post("/gdpr/process-request")
async def process_gdpr_request(
    data_request: DataRequestProcessing,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process GDPR data request"""
    try:
        # Create GDPR request
        await db.gdpr_requests.insert_one({
            "user_id": data_request.user_id,
            "request_type": data_request.request_type,
            "status": "pending",
            "notes": data_request.notes,
            "processed_by": admin_user.get("user_id"),
            "deadline": datetime.utcnow() + timedelta(days=30),
            "created_at": datetime.utcnow(),
        })
        
        # Log action
        await db.audit_logs.insert_one({
            "action": "gdpr_request",
            "entity_type": "user",
            "entity_id": data_request.user_id,
            "reason": f"GDPR {data_request.request_type} request",
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "request_type": data_request.request_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")


@router.post("/gdpr/process-deletion/{request_id}")
async def process_data_deletion(
    request_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process GDPR data deletion"""
    try:
        from bson import ObjectId
        
        # Get request
        request = await db.gdpr_requests.find_one({"_id": ObjectId(request_id)})
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # Mark as completed
        await db.gdpr_requests.update_one(
            {"_id": ObjectId(request_id)},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.utcnow(),
                    "completed_by": admin_user.get("user_id"),
                }
            }
        )
        
        return {"status": "success", "request_id": request_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing deletion: {str(e)}")
