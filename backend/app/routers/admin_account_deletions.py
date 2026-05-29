"""
Admin Account Deletions - Enhanced with rejection, grace period, and archival
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/account-deletions", tags=["admin_account_deletions"])


class DeletionApproval(BaseModel):
    """Account deletion approval"""
    request_id: str
    action: str  # "approve", "reject", "cancel"
    admin_notes: Optional[str] = None
    archive_user_data: bool = True


async def archive_user_data(
    db: AsyncIOMotorDatabase,
    user_id: str,
):
    """Archive user data before deletion"""
    users_collection = db["users"]
    archive_collection = db["user_data_archive"]
    
    user = await users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create archive record
    archive_doc = {
        "_id": f"archive_{user_id}_{datetime.utcnow().timestamp()}",
        "user_id": user_id,
        "archived_user_data": user,
        "archived_at": datetime.utcnow(),
        "retention_until": datetime.utcnow() + timedelta(days=365),  # 1 year retention
        "archived_by": "system"
    }
    
    await archive_collection.insert_one(archive_doc)
    return archive_doc["_id"]


async def soft_delete_user(
    db: AsyncIOMotorDatabase,
    user_id: str,
    deletion_request_id: str,
):
    """Soft delete user (30-day grace period)"""
    users_collection = db["users"]
    grace_period_end = datetime.utcnow() + timedelta(days=30)
    
    await users_collection.update_one(
        {"_id": user_id},
        {
            "$set": {
                "is_deleted": True,
                "deletion_status": "soft_deleted",
                "deletion_request_id": deletion_request_id,
                "deleted_at": datetime.utcnow(),
                "grace_period_until": grace_period_end,
                "can_recover_until": grace_period_end
            }
        }
    )


async def permanent_delete_user(
    db: AsyncIOMotorDatabase,
    user_id: str,
):
    """Permanently delete all user data"""
    collections_to_clear = [
        "bookings",
        "payments",
        "ratings",
        "support_tickets",
        "saved_places",
        "payment_methods",
        "preferences"
    ]
    
    users_collection = db["users"]
    
    # Clear from all related collections
    for collection_name in collections_to_clear:
        collection = db[collection_name]
        await collection.delete_many({"user_id": user_id})
    
    # Permanently delete user record
    await users_collection.delete_one({"_id": user_id})


@router.get("/")
async def list_deletion_requests(
    status: Optional[str] = Query(None),  # pending, approved, rejected, completed
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List account deletion requests"""
    _ = admin_user
    
    deletions_collection = db["account_deletion_requests"]
    
    query = {}
    if status:
        query["status"] = status
    
    total = await deletions_collection.count_documents(query)
    
    requests_list = []
    async for doc in deletions_collection.find(query).skip(skip).limit(limit).sort("created_at", -1):
        requests_list.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "user_name": doc.get("user_name"),
            "user_email": doc.get("user_email"),
            "user_phone": doc.get("user_phone"),
            "role": doc.get("role"),
            "status": doc.get("status", "pending"),
            "reason": doc.get("deletion_reason"),
            "created_at": doc.get("created_at", datetime.utcnow()).isoformat(),
            "grace_period_until": doc.get("grace_period_until"),
            "billing_status": doc.get("billing_status")
        })
    
    return {
        "deletion_requests": requests_list,
        "total": total,
        "skip": skip,
        "limit": limit,
        "count": len(requests_list)
    }


@router.put("/{request_id}")
async def process_deletion_request(
    request_id: str,
    approval: DeletionApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Approve, reject, or cancel account deletion request"""
    admin_id = admin_user.get("user_id", "unknown")
    deletions_collection = db["account_deletion_requests"]
    
    request_doc = await deletions_collection.find_one({"_id": request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    
    user_id = request_doc.get("user_id")
    
    if approval.action == "approve":
        # Check if user has pending payments
        bookings_collection = db["bookings"]
        pending_payment = await bookings_collection.find_one({
            "user_id": user_id,
            "payment_status": {"$in": ["pending", "failed"]}
        })
        
        if pending_payment:
            raise HTTPException(
                status_code=400,
                detail="User has pending payments. Settle before deletion."
            )
        
        # Archive data if requested
        if approval.archive_user_data:
            archive_id = await archive_user_data(db, user_id)
        
        # Soft delete with grace period
        await soft_delete_user(db, user_id, request_id)
        
        status = "approved"
        grace_period_until = datetime.utcnow() + timedelta(days=30)
        
    elif approval.action == "reject":
        status = "rejected"
        grace_period_until = None
        
    elif approval.action == "cancel":
        # Restore deleted user if in grace period
        users_collection = db["users"]
        user = await users_collection.find_one({"_id": user_id})
        
        if user and user.get("deletion_status") == "soft_deleted":
            grace_period = user.get("grace_period_until")
            if grace_period and datetime.utcnow() < grace_period:
                await users_collection.update_one(
                    {"_id": user_id},
                    {
                        "$set": {
                            "is_deleted": False,
                            "deletion_status": "restored"
                        },
                        "$unset": {
                            "grace_period_until": "",
                            "can_recover_until": ""
                        }
                    }
                )
        
        status = "cancelled"
        grace_period_until = None
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Update deletion request
    update_doc = {
        "status": status,
        "admin_notes": approval.admin_notes,
        "processed_by": admin_id,
        "processed_at": datetime.utcnow()
    }
    
    if grace_period_until:
        update_doc["grace_period_until"] = grace_period_until
    
    await deletions_collection.update_one(
        {"_id": request_id},
        {"$set": update_doc}
    )
    
    return {
        "request_id": request_id,
        "action": approval.action,
        "status": status,
        "processed_at": datetime.utcnow().isoformat(),
        "grace_period_until": grace_period_until.isoformat() if grace_period_until else None
    }


@router.get("/grace-period-expiring")
async def get_grace_period_expiring(
    days: int = Query(7, ge=1, le=30),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get soft-deleted accounts with grace period expiring soon"""
    _ = admin_user
    
    users_collection = db["users"]
    cutoff_date = datetime.utcnow() + timedelta(days=days)
    
    pipeline = [
        {
            "$match": {
                "deletion_status": "soft_deleted",
                "grace_period_until": {
                    "$gte": datetime.utcnow(),
                    "$lte": cutoff_date
                }
            }
        },
        {
            "$sort": {"grace_period_until": 1}
        }
    ]
    
    expiring = []
    async for doc in users_collection.aggregate(pipeline):
        grace_end = doc.get("grace_period_until", datetime.utcnow())
        days_remaining = (grace_end - datetime.utcnow()).days
        
        expiring.append({
            "user_id": doc.get("_id"),
            "user_name": doc.get("name"),
            "grace_period_until": grace_end.isoformat(),
            "days_remaining": days_remaining,
            "deleted_at": doc.get("deleted_at", datetime.utcnow()).isoformat()
        })
    
    return {
        "grace_period_expiring": expiring,
        "count": len(expiring),
        "within_days": days
    }


@router.post("/permanent-delete-expired")
async def permanent_delete_expired_accounts(
    dry_run: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Permanently delete accounts with expired grace periods"""
    _ = admin_user
    
    users_collection = db["users"]
    
    # Find expired soft-deleted accounts
    pipeline = [
        {
            "$match": {
                "deletion_status": "soft_deleted",
                "grace_period_until": {"$lt": datetime.utcnow()}
            }
        }
    ]
    
    deleted_count = 0
    
    async for doc in users_collection.aggregate(pipeline):
        user_id = doc.get("_id")
        
        if not dry_run:
            await permanent_delete_user(db, user_id)
        
        deleted_count += 1
    
    return {
        "permanently_deleted": deleted_count,
        "dry_run": dry_run,
        "executed_at": datetime.utcnow().isoformat()
    }


@router.get("/{request_id}/archive-status")
async def get_archive_status(
    request_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get archive status for a deletion request"""
    _ = admin_user
    
    deletions_collection = db["account_deletion_requests"]
    archive_collection = db["user_data_archive"]
    
    request_doc = await deletions_collection.find_one({"_id": request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    user_id = request_doc.get("user_id")
    
    # Find archives for this user
    archives = []
    async for archive in archive_collection.find({"user_id": user_id}):
        archives.append({
            "archive_id": archive.get("_id"),
            "archived_at": archive.get("archived_at", datetime.utcnow()).isoformat(),
            "retention_until": archive.get("retention_until", datetime.utcnow()).isoformat(),
            "size_estimate_kb": len(str(archive.get("archived_user_data", {}))) / 1024
        })
    
    return {
        "request_id": request_id,
        "user_id": user_id,
        "archives": archives,
        "archive_count": len(archives)
    }


@router.post("/{request_id}/recover")
async def recover_deleted_account(
    request_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Recover a soft-deleted account before grace period expires"""
    admin_id = admin_user.get("user_id", "unknown")
    
    deletions_collection = db["account_deletion_requests"]
    users_collection = db["users"]
    
    request_doc = await deletions_collection.find_one({"_id": request_id})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    user_id = request_doc.get("user_id")
    user = await users_collection.find_one({"_id": user_id})
    
    if not user or user.get("deletion_status") != "soft_deleted":
        raise HTTPException(status_code=400, detail="User not in soft-deleted state")
    
    # Check if grace period expired
    grace_period = user.get("grace_period_until")
    if grace_period and datetime.utcnow() >= grace_period:
        raise HTTPException(status_code=400, detail="Grace period has expired")
    
    # Restore user
    await users_collection.update_one(
        {"_id": user_id},
        {
            "$set": {
                "is_deleted": False,
                "deletion_status": "recovered"
            },
            "$unset": {
                "grace_period_until": "",
                "can_recover_until": ""
            }
        }
    )
    
    await deletions_collection.update_one(
        {"_id": request_id},
        {
            "$set": {
                "status": "cancelled",
                "recovery_initiated_by": admin_id,
                "recovery_initiated_at": datetime.utcnow()
            }
        }
    )
    
    return {
        "user_id": user_id,
        "status": "recovered",
        "recovered_at": datetime.utcnow().isoformat()
    }
