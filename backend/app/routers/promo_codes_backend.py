"""
Promo Code Validation and Management Backend Router
System for managing promotional codes, discounts, and offers
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import logging
from typing import Optional, List

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/promo-codes", tags=["promo_codes"])

db = None
io = None

def set_dependencies(database, socket_io):
    global db, io
    db = database
    io = socket_io

async def verify_user_token(request: Request):
    try:
        user = await get_current_user_from_request(request, db_override=db)
        return {
            'user_id': str(user.get('id') or user.get('user_id') or ''),
            'mongo_id': str(user.get('_id') or ''),
            'user_type': str(user.get('role') or user.get('user_type') or '').lower(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/validate")
async def validate_promo_code(request: Request):
    """Validate a promo code for a booking"""
    try:
        user = await verify_user_token(request)
        data = await request.json()
        code = data.get("code", "").upper()
        
        if not code:
            raise HTTPException(status_code=400, detail="Code is required")
        
        promo = await db.promo_codes.find_one({
            "code": code,
            "active": True,
            "start_date": {"$lte": datetime.now(timezone.utc)},
            "$or": [
                {"end_date": None},
                {"end_date": {"$gte": datetime.now(timezone.utc)}}
            ]
        })
        
        if not promo:
            raise HTTPException(status_code=404, detail="Invalid or expired promo code")
        
        # Check usage limits
        if promo.get("max_uses"):
            usage_count = await db.bookings.count_documents({"promo_code": code})
            if usage_count >= promo["max_uses"]:
                raise HTTPException(status_code=400, detail="Promo code usage limit reached")
        
        # Check per-user usage
        if promo.get("max_uses_per_user"):
            user_usage = await db.bookings.count_documents({"promo_code": code, "passenger_id": user['user_id']})
            if user_usage >= promo["max_uses_per_user"]:
                raise HTTPException(status_code=400, detail="You've already used this promo code")
        
        # Check minimum fare requirement
        fare = data.get("fare", 0)
        if promo.get("min_fare") and fare < promo["min_fare"]:
            raise HTTPException(status_code=400, detail=f"Minimum fare of {promo['min_fare']} required")
        
        # Calculate discount
        discount_amount = 0
        if promo.get("discount_type") == "percentage":
            discount_amount = (fare * promo.get("discount_value", 0)) / 100
            max_discount = promo.get("max_discount", None)
            if max_discount and discount_amount > max_discount:
                discount_amount = max_discount
        elif promo.get("discount_type") == "fixed":
            discount_amount = promo.get("discount_value", 0)
        
        logger.info(f"Promo code {code} validated for user {user['user_id']}")
        
        return {
            "valid": True,
            "code": code,
            "discount_type": promo.get("discount_type"),
            "discount_value": promo.get("discount_value"),
            "discount_amount": round(discount_amount, 2),
            "final_fare": round(fare - discount_amount, 2),
            "description": promo.get("description", "")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating promo code: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to validate promo code")

@router.get("")
async def list_available_promos(request: Request):
    """List available promo codes for user"""
    try:
        user = await verify_user_token(request)
        
        promos = await db.promo_codes.find({
            "active": True,
            "start_date": {"$lte": datetime.now(timezone.utc)},
            "$or": [
                {"end_date": None},
                {"end_date": {"$gte": datetime.now(timezone.utc)}}
            ]
        }).to_list(None)
        
        available = []
        for promo in promos:
            usage = await db.bookings.count_documents({"promo_code": promo["code"], "passenger_id": user['user_id']})
            max_per_user = promo.get("max_uses_per_user", 1)
            
            if usage < max_per_user:
                available.append({
                    "code": promo["code"],
                    "description": promo.get("description"),
                    "discount_type": promo.get("discount_type"),
                    "discount_value": promo.get("discount_value"),
                    "min_fare": promo.get("min_fare"),
                    "max_discount": promo.get("max_discount"),
                    "expires_at": promo.get("end_date").isoformat() if promo.get("end_date") else None
                })
        
        return {"promos": available}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing promos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve promo codes")

@router.post("/admin/create")
async def create_promo_code(request: Request):
    """Create new promo code (admin)"""
    try:
        user = await verify_user_token(request)
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        
        promo = {
            "code": data.get("code", "").upper(),
            "description": data.get("description"),
            "discount_type": data.get("discount_type"),  # percentage, fixed
            "discount_value": data.get("discount_value"),
            "max_discount": data.get("max_discount"),
            "min_fare": data.get("min_fare", 0),
            "max_uses": data.get("max_uses"),
            "max_uses_per_user": data.get("max_uses_per_user", 1),
            "start_date": datetime.fromisoformat(data.get("start_date")) if data.get("start_date") else datetime.now(timezone.utc),
            "end_date": datetime.fromisoformat(data.get("end_date")) if data.get("end_date") else None,
            "active": True,
            "created_at": datetime.now(timezone.utc),
            "created_by": user['user_id']
        }
        
        result = await db.promo_codes.insert_one(promo)
        logger.info(f"Promo code {promo['code']} created")
        
        return {"id": str(result.inserted_id), "code": promo["code"], "message": "Promo code created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating promo code: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create promo code")

@router.get("/admin/stats")
async def get_promo_stats(request: Request):
    """Get promo code statistics (admin)"""
    try:
        user = await verify_user_token(request)
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        total_promos = await db.promo_codes.count_documents({})
        active_promos = await db.promo_codes.count_documents({"active": True})
        total_uses = await db.bookings.count_documents({"promo_code": {"$exists": True}})
        
        return {
            "total_promo_codes": total_promos,
            "active_promo_codes": active_promos,
            "total_code_uses": total_uses
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")
