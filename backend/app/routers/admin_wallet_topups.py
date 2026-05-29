"""
Admin Wallet Top-ups - Complete implementation with approval/rejection workflow
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/wallet", tags=["admin_wallet"])


class TopupApproval(BaseModel):
    """Wallet top-up approval/rejection"""
    topup_id: str
    action: str  # "approve" or "reject"
    admin_notes: Optional[str] = None


class BulkTopupApproval(BaseModel):
    """Bulk wallet top-up approval"""
    topup_ids: List[str]
    action: str  # "approve" or "reject"
    reason: Optional[str] = None


class ManualAdjustment(BaseModel):
    """Manual wallet balance adjustment"""
    user_id: str
    amount: float
    adjustment_type: str  # "credit", "debit"
    reason: str
    reference_id: Optional[str] = None


async def process_topup_payment(
    db: AsyncIOMotorDatabase,
    topup_id: str,
):
    """Process payment for approved top-up"""
    topups_collection = db["wallet_topups"]
    wallets_collection = db["wallets"]
    users_collection = db["users"]
    
    topup = await topups_collection.find_one({"_id": topup_id})
    if not topup:
        raise HTTPException(status_code=404, detail="Top-up not found")
    
    user_id = topup.get("user_id")
    amount = topup.get("amount")
    payment_method = topup.get("payment_method")
    
    # Update wallet balance
    wallet = await wallets_collection.find_one({"user_id": user_id})
    current_balance = wallet.get("balance", 0) if wallet else 0
    new_balance = current_balance + amount
    
    if wallet:
        await wallets_collection.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "balance": new_balance,
                    "last_updated": datetime.utcnow()
                },
                "$push": {
                    "transactions": {
                        "type": "topup",
                        "amount": amount,
                        "timestamp": datetime.utcnow(),
                        "reference_id": topup_id,
                        "payment_method": payment_method
                    }
                }
            }
        )
    else:
        # Create new wallet
        await wallets_collection.insert_one({
            "user_id": user_id,
            "balance": amount,
            "created_at": datetime.utcnow(),
            "last_updated": datetime.utcnow(),
            "transactions": [{
                "type": "topup",
                "amount": amount,
                "timestamp": datetime.utcnow(),
                "reference_id": topup_id,
                "payment_method": payment_method
            }]
        })
    
    # Update top-up status
    await topups_collection.update_one(
        {"_id": topup_id},
        {
            "$set": {
                "status": "completed",
                "processed_at": datetime.utcnow(),
                "new_wallet_balance": new_balance
            }
        }
    )


@router.get("/top-ups")
async def list_wallet_topups(
    status: Optional[str] = Query(None),  # pending, approved, rejected, completed
    user_id: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List wallet top-ups with filtering"""
    _ = admin_user
    
    topups_collection = db["wallet_topups"]
    
    query = {}
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    if payment_method:
        query["payment_method"] = payment_method
    
    total = await topups_collection.count_documents(query)
    
    topups_list = []
    async for doc in topups_collection.find(query).skip(skip).limit(limit).sort("created_at", -1):
        topups_list.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "user_name": doc.get("user_name"),
            "amount": doc.get("amount"),
            "currency": doc.get("currency", "INR"),
            "payment_method": doc.get("payment_method"),
            "payment_ref": doc.get("payment_reference"),
            "status": doc.get("status", "pending"),
            "created_at": doc.get("created_at", datetime.utcnow()).isoformat(),
            "receipt_provided": doc.get("receipt_url") is not None
        })
    
    return {
        "topups": topups_list,
        "total": total,
        "skip": skip,
        "limit": limit,
        "count": len(topups_list)
    }


@router.put("/top-ups/{topup_id}")
async def process_topup(
    topup_id: str,
    approval: TopupApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Approve or reject a wallet top-up"""
    admin_id = admin_user.get("user_id", "unknown")
    topups_collection = db["wallet_topups"]
    
    topup = await topups_collection.find_one({"_id": topup_id})
    if not topup:
        raise HTTPException(status_code=404, detail="Top-up not found")
    
    if approval.action == "approve":
        await process_topup_payment(db, topup_id)
        status = "completed"
    elif approval.action == "reject":
        await topups_collection.update_one(
            {"_id": topup_id},
            {
                "$set": {
                    "status": "rejected",
                    "rejection_reason": approval.admin_notes,
                    "rejected_by": admin_id,
                    "rejected_at": datetime.utcnow()
                }
            }
        )
        status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    return {
        "topup_id": topup_id,
        "action": approval.action,
        "status": status,
        "processed_at": datetime.utcnow().isoformat()
    }


@router.post("/top-ups/bulk")
async def bulk_process_topups(
    bulk_approval: BulkTopupApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Bulk approve or reject top-ups"""
    admin_id = admin_user.get("user_id", "unknown")
    topups_collection = db["wallet_topups"]
    
    processed = 0
    failed = 0
    
    for topup_id in bulk_approval.topup_ids:
        try:
            topup = await topups_collection.find_one({"_id": topup_id})
            if not topup:
                failed += 1
                continue
            
            if bulk_approval.action == "approve":
                await process_topup_payment(db, topup_id)
            elif bulk_approval.action == "reject":
                await topups_collection.update_one(
                    {"_id": topup_id},
                    {
                        "$set": {
                            "status": "rejected",
                            "rejection_reason": bulk_approval.reason,
                            "rejected_by": admin_id,
                            "rejected_at": datetime.utcnow()
                        }
                    }
                )
            
            processed += 1
        except Exception:
            failed += 1
    
    return {
        "processed": processed,
        "failed": failed,
        "total": len(bulk_approval.topup_ids),
        "action": bulk_approval.action
    }


@router.get("/top-ups/{topup_id}")
async def get_topup_details(
    topup_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed information about a top-up"""
    _ = admin_user
    
    topups_collection = db["wallet_topups"]
    topup = await topups_collection.find_one({"_id": topup_id})
    
    if not topup:
        raise HTTPException(status_code=404, detail="Top-up not found")
    
    return {
        "_id": str(topup.get("_id")),
        "user_id": topup.get("user_id"),
        "user_name": topup.get("user_name"),
        "amount": topup.get("amount"),
        "currency": topup.get("currency"),
        "payment_method": topup.get("payment_method"),
        "payment_reference": topup.get("payment_reference"),
        "receipt_url": topup.get("receipt_url"),
        "status": topup.get("status"),
        "created_at": topup.get("created_at", datetime.utcnow()).isoformat(),
        "processed_at": topup.get("processed_at"),
        "new_wallet_balance": topup.get("new_wallet_balance"),
        "admin_notes": topup.get("admin_notes")
    }


@router.post("/manual-adjustment")
async def manual_wallet_adjustment(
    adjustment: ManualAdjustment,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Manually adjust wallet balance"""
    admin_id = admin_user.get("user_id", "unknown")
    wallets_collection = db["wallets"]
    adjustments_collection = db["wallet_adjustments"]
    
    # Get current balance
    wallet = await wallets_collection.find_one({"user_id": adjustment.user_id})
    current_balance = wallet.get("balance", 0) if wallet else 0
    
    if adjustment.adjustment_type == "debit" and current_balance < adjustment.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Calculate new balance
    if adjustment.adjustment_type == "credit":
        new_balance = current_balance + adjustment.amount
    else:
        new_balance = current_balance - adjustment.amount
    
    # Update wallet
    if wallet:
        await wallets_collection.update_one(
            {"user_id": adjustment.user_id},
            {
                "$set": {
                    "balance": new_balance,
                    "last_updated": datetime.utcnow()
                },
                "$push": {
                    "transactions": {
                        "type": "manual_adjustment",
                        "amount": adjustment.amount,
                        "adjustment_type": adjustment.adjustment_type,
                        "timestamp": datetime.utcnow(),
                        "reason": adjustment.reason,
                        "adjusted_by": admin_id
                    }
                }
            }
        )
    else:
        await wallets_collection.insert_one({
            "user_id": adjustment.user_id,
            "balance": new_balance,
            "created_at": datetime.utcnow(),
            "last_updated": datetime.utcnow(),
            "transactions": [{
                "type": "manual_adjustment",
                "amount": adjustment.amount,
                "adjustment_type": adjustment.adjustment_type,
                "timestamp": datetime.utcnow(),
                "reason": adjustment.reason,
                "adjusted_by": admin_id
            }]
        })
    
    # Log adjustment
    await adjustments_collection.insert_one({
        "user_id": adjustment.user_id,
        "amount": adjustment.amount,
        "adjustment_type": adjustment.adjustment_type,
        "reason": adjustment.reason,
        "reference_id": adjustment.reference_id,
        "adjusted_by": admin_id,
        "previous_balance": current_balance,
        "new_balance": new_balance,
        "adjusted_at": datetime.utcnow()
    })
    
    return {
        "user_id": adjustment.user_id,
        "amount": adjustment.amount,
        "adjustment_type": adjustment.adjustment_type,
        "previous_balance": current_balance,
        "new_balance": new_balance,
        "adjusted_at": datetime.utcnow().isoformat()
    }


@router.get("/balance/{user_id}")
async def get_user_wallet_balance(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get user's current wallet balance"""
    _ = admin_user
    
    wallets_collection = db["wallets"]
    wallet = await wallets_collection.find_one({"user_id": user_id})
    
    return {
        "user_id": user_id,
        "balance": wallet.get("balance", 0) if wallet else 0,
        "currency": wallet.get("currency", "INR") if wallet else "INR",
        "last_updated": wallet.get("last_updated", datetime.utcnow()).isoformat() if wallet else datetime.utcnow().isoformat()
    }


@router.get("/transaction-history/{user_id}")
async def get_wallet_transaction_history(
    user_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get user's wallet transaction history"""
    _ = admin_user
    
    wallets_collection = db["wallets"]
    wallet = await wallets_collection.find_one(
        {"user_id": user_id},
        {"transactions": {"$slice": [-limit - skip, limit]}}
    )
    
    transactions = wallet.get("transactions", []) if wallet else []
    
    return {
        "user_id": user_id,
        "transactions": [
            {
                "type": t.get("type"),
                "amount": t.get("amount"),
                "timestamp": t.get("timestamp", datetime.utcnow()).isoformat(),
                "reference_id": t.get("reference_id"),
                "reason": t.get("reason")
            }
            for t in transactions
        ],
        "count": len(transactions)
    }


@router.get("/reconciliation")
async def wallet_reconciliation_report(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Generate wallet reconciliation report"""
    _ = admin_user
    
    topups_collection = db["wallet_topups"]
    start_date = datetime.utcnow() - timedelta(days=days)
    
    pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"}
            }
        }
    ]
    
    summary = {}
    async for doc in topups_collection.aggregate(pipeline):
        status = doc.get("_id")
        summary[status] = {
            "count": doc.get("count", 0),
            "total_amount": doc.get("total_amount", 0)
        }
    
    total_topups = sum(s.get("count", 0) for s in summary.values())
    total_amount = sum(s.get("total_amount", 0) for s in summary.values())
    
    return {
        "summary": summary,
        "total_topups": total_topups,
        "total_amount": total_amount,
        "period_days": days,
        "report_generated_at": datetime.utcnow().isoformat()
    }
