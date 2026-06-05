"""
Admin Phone Change Requests - Enhanced with OTP resend and bulk operations
"""
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/phone-requests", tags=["admin_phone_requests"])


class PhoneChangeApproval(BaseModel):
    """Phone change approval request"""
    request_id: str
    status: str  # "approved" or "rejected"
    admin_notes: Optional[str] = None


class BulkPhoneApproval(BaseModel):
    """Bulk phone change approval"""
    request_ids: List[str]
    status: str  # "approved" or "rejected"
    reason: Optional[str] = None


async def send_otp_for_phone_change(
    phone_request_id: str,
    db: AsyncIOMotorDatabase,
):
    """Generate and send OTP for phone change verification"""
    requests_collection = db["phone_change_requests"]
    
    request_doc = await requests_collection.find_one({"_id": phone_request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Generate 6-digit OTP
    import random
    otp = f"{random.randint(100000, 999999)}"
    
    # Store OTP with expiry (10 minutes)
    otp_expiry = get_ist_now() + timedelta(minutes=10)
    
    await requests_collection.update_one(
        {"_id": phone_request_id},
        {
            "$set": {
                "verification_otp": otp,
                "otp_expiry": otp_expiry,
                "otp_attempts": 0,
                "last_otp_sent": get_ist_now()
            }
        }
    )
    
    # In production, send SMS/email with OTP
    # await send_sms(request_doc.get("new_phone"), f"Your OTP is {otp}")
    
    return {
        "phone_request_id": phone_request_id,
        "otp_sent_at": get_ist_now().isoformat(),
        "message": "OTP sent to user's phone"
    }


async def verify_phone_otp(
    phone_request_id: str,
    otp: str,
    db: AsyncIOMotorDatabase,
) -> bool:
    """Verify OTP for phone change"""
    requests_collection = db["phone_change_requests"]
    
    request_doc = await requests_collection.find_one({"_id": phone_request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    stored_otp = request_doc.get("verification_otp")
    otp_expiry = request_doc.get("otp_expiry", get_ist_now())
    otp_attempts = request_doc.get("otp_attempts", 0)
    
    # Check OTP expiry
    if get_ist_now() > otp_expiry:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Check attempt limit
    if otp_attempts >= 3:
        raise HTTPException(status_code=400, detail="Too many OTP attempts")
    
    # Verify OTP
    if stored_otp != otp:
        await requests_collection.update_one(
            {"_id": phone_request_id},
            {"$inc": {"otp_attempts": 1}}
        )
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Mark as verified
    await requests_collection.update_one(
        {"_id": phone_request_id},
        {
            "$set": {
                "otp_verified": True,
                "otp_verified_at": get_ist_now()
            }
        }
    )
    
    return True


@router.post("/resend-otp")
async def resend_otp(
    request_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Admin resend OTP for phone change request"""
    _ = admin_user
    return await send_otp_for_phone_change(request_id, db)


@router.get("/")
async def list_phone_requests(
    status: Optional[str] = Query(None),  # pending, approved, rejected
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List phone change requests with filtering"""
    _ = admin_user
    
    requests_collection = db["phone_change_requests"]
    
    query = {}
    if status:
        query["status"] = status
    
    total = await requests_collection.count_documents(query)
    
    requests_list = []
    async for doc in requests_collection.find(query).skip(skip).limit(limit):
        requests_list.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "user_name": doc.get("user_name"),
            "user_phone": doc.get("old_phone"),
            "new_phone": doc.get("new_phone"),
            "old_phone": doc.get("old_phone"),
            "status": doc.get("status", "pending"),
            "created_at": doc.get("created_at", get_ist_now()).isoformat(),
            "requested_at": doc.get("requested_at", get_ist_now()).isoformat(),
            "otp_verified": doc.get("otp_verified", False),
            "expires_at": (doc.get("created_at", get_ist_now()) + timedelta(days=7)).isoformat(),
        })
    
    return {
        "phone_requests": requests_list,
        "total": total,
        "skip": skip,
        "limit": limit,
        "count": len(requests_list)
    }


@router.put("/{request_id}")
async def approve_or_reject_phone_request(
    request_id: str,
    approval: PhoneChangeApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Approve or reject a phone change request"""
    admin_id = admin_user.get("user_id", "unknown")
    
    requests_collection = db["phone_change_requests"]
    users_collection = db["users"]
    
    request_doc = await requests_collection.find_one({"_id": request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if approval.status == "approved":
        # Update user's phone number
        await users_collection.update_one(
            {"_id": request_doc.get("user_id")},
            {
                "$set": {"phone": request_doc.get("new_phone")},
                "$push": {
                    "phone_history": {
                        "old_phone": request_doc.get("old_phone"),
                        "new_phone": request_doc.get("new_phone"),
                        "changed_at": get_ist_now(),
                        "approved_by": admin_id
                    }
                }
            }
        )
    
    # Update request status
    await requests_collection.update_one(
        {"_id": request_id},
        {
            "$set": {
                "status": approval.status,
                "admin_notes": approval.admin_notes,
                "approved_by": admin_id,
                "approved_at": get_ist_now()
            }
        }
    )
    
    return {
        "request_id": request_id,
        "status": approval.status,
        "approved_at": get_ist_now().isoformat()
    }


@router.post("/bulk-approve")
async def bulk_approve_phone_requests(
    bulk_approval: BulkPhoneApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Bulk approve or reject phone change requests"""
    admin_id = admin_user.get("user_id", "unknown")
    
    requests_collection = db["phone_change_requests"]
    users_collection = db["users"]
    
    processed = 0
    failed = 0
    
    for request_id in bulk_approval.request_ids:
        try:
            request_doc = await requests_collection.find_one({"_id": request_id})
            if not request_doc:
                failed += 1
                continue
            
            if bulk_approval.status == "approved":
                # Update user's phone
                await users_collection.update_one(
                    {"_id": request_doc.get("user_id")},
                    {
                        "$set": {"phone": request_doc.get("new_phone")},
                        "$push": {
                            "phone_history": {
                                "old_phone": request_doc.get("old_phone"),
                                "new_phone": request_doc.get("new_phone"),
                                "changed_at": get_ist_now(),
                                "approved_by": admin_id
                            }
                        }
                    }
                )
            
            # Update request
            await requests_collection.update_one(
                {"_id": request_id},
                {
                    "$set": {
                        "status": bulk_approval.status,
                        "admin_notes": bulk_approval.reason,
                        "approved_by": admin_id,
                        "approved_at": get_ist_now()
                    }
                }
            )
            processed += 1
        except Exception:
            failed += 1
    
    return {
        "processed": processed,
        "failed": failed,
        "total": len(bulk_approval.request_ids),
        "status": bulk_approval.status
    }


@router.get("/expiring-requests")
async def get_expiring_requests(
    days: int = Query(7, ge=1, le=30),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get phone requests about to expire (not responded to in X days)"""
    _ = admin_user
    
    requests_collection = db["phone_change_requests"]
    cutoff_date = get_ist_now() - timedelta(days=days)
    
    pipeline = [
        {
            "$match": {
                "status": "pending",
                "created_at": {"$lte": cutoff_date}
            }
        },
        {
            "$sort": {"created_at": 1}
        }
    ]
    
    expiring = []
    async for doc in requests_collection.aggregate(pipeline):
        age_days = (get_ist_now() - doc.get("created_at", get_ist_now())).days
        expiring.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "request_age_days": age_days,
            "created_at": doc.get("created_at", get_ist_now()).isoformat()
        })
    
    return {
        "expiring_requests": expiring,
        "count": len(expiring),
        "older_than_days": days
    }


@router.post("/{request_id}/auto-reject-if-expired")
async def auto_reject_expired_request(
    request_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Auto-reject phone requests older than 30 days"""
    _ = admin_user
    
    requests_collection = db["phone_change_requests"]
    expiry_date = get_ist_now() - timedelta(days=30)
    
    request_doc = await requests_collection.find_one(
        {
            "_id": request_id,
            "status": "pending",
            "created_at": {"$lte": expiry_date}
        }
    )
    
    if not request_doc:
        raise HTTPException(
            status_code=400,
            detail="Request not found or not eligible for auto-rejection"
        )
    
    await requests_collection.update_one(
        {"_id": request_id},
        {
            "$set": {
                "status": "rejected",
                "auto_rejected": True,
                "rejection_reason": "Request expired after 30 days",
                "rejected_at": get_ist_now()
            }
        }
    )
    
    return {
        "request_id": request_id,
        "status": "rejected",
        "reason": "Expired"
    }
