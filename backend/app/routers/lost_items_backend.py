"""
Lost Item Reporting Backend Router
System for reporting, managing, and recovering lost items from rides
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timezone
from bson import ObjectId
import logging
from typing import Optional, List

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/lost-items", tags=["lost_items"])

db = None
io = None

def set_dependencies(database, socket_io):
    global db, io
    db = database
    io = socket_io

async def verify_user_token(request: Request):
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            raise HTTPException(status_code=401, detail="Invalid token format")
        token = auth_header.replace('Bearer ', '')
        user = await db.users.find_one({'auth_token': token})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid user token")
        return {'user_id': str(user.get('_id')), 'user_type': user.get('user_type', 'passenger')}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("")
async def report_lost_item(request: Request):
    """Report a lost item from a ride"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        data = await request.json()
        
        if not data.get("item_name") or not data.get("booking_id"):
            raise HTTPException(status_code=400, detail="Item name and booking_id required")
        
        item = {
            "user_id": user_id,
            "booking_id": data.get("booking_id"),
            "item_name": data.get("item_name"),
            "description": data.get("description", ""),
            "category": data.get("category", "other"),  # phone, wallet, bag, clothing, accessory, other
            "status": "reported",  # reported, found, returned, not_found, closed
            "location": data.get("location"),
            "reported_at": datetime.now(timezone.utc),
            "found_at": None,
            "resolved_at": None,
            "resolution_notes": None,
            "contact_preference": data.get("contact_preference", "in_app")  # in_app, sms, email
        }
        
        result = await db.lost_items.insert_one(item)
        
        # Notify driver and admin
        if io:
            io.emit('lost_item_reported', {'item_id': str(result.inserted_id), 'item_name': item['item_name']}, room='admin')
        
        logger.info(f"Lost item reported: {result.inserted_id}")
        return {"id": str(result.inserted_id), "status": "reported", "message": "Lost item report created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reporting lost item: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to report lost item")

@router.get("")
async def list_lost_items(request: Request, status: Optional[str] = Query(None), skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500)):
    """List lost items for user"""
    try:
        user = await verify_user_token(request)
        user_id = user['user_id']
        
        query = {"user_id": user_id}
        if status:
            query["status"] = status
        
        total = await db.lost_items.count_documents(query)
        items = await db.lost_items.find(query).sort("reported_at", -1).skip(skip).limit(limit).to_list(None)
        
        formatted = [{"id": str(item["_id"]), "item_name": item.get("item_name"), "category": item.get("category"), "status": item.get("status"), "reported_at": item.get("reported_at").isoformat()} for item in items]
        return {"total": total, "items": formatted}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing lost items: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve items")

@router.get("/{item_id}")
async def get_lost_item(item_id: str, request: Request):
    """Get lost item details"""
    try:
        user = await verify_user_token(request)
        try:
            iid = ObjectId(item_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid item ID")
        
        item = await db.lost_items.find_one({"_id": iid, "user_id": user['user_id']})
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        return {"id": str(item["_id"]), "item_name": item.get("item_name"), "description": item.get("description"), "category": item.get("category"), "status": item.get("status"), "reported_at": item.get("reported_at").isoformat(), "resolution_notes": item.get("resolution_notes")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving lost item: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve item")

@router.put("/{item_id}/status")
async def update_lost_item_status(item_id: str, request: Request):
    """Update lost item status (admin)"""
    try:
        user = await verify_user_token(request)
        if user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            iid = ObjectId(item_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid item ID")
        
        data = await request.json()
        status_val = data.get("status")
        
        update_data = {"status": status_val, "resolution_notes": data.get("resolution_notes")}
        if status_val in ["found", "returned", "not_found"]:
            update_data["resolved_at"] = datetime.now(timezone.utc)
        
        result = await db.lost_items.find_one_and_update({"_id": iid}, {"$set": update_data}, return_document=True)
        if not result:
            raise HTTPException(status_code=404, detail="Item not found")
        
        logger.info(f"Lost item {item_id} status updated to {status_val}")
        return {"message": "Status updated", "status": status_val}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update status")

@router.delete("/{item_id}")
async def close_lost_item(item_id: str, request: Request):
    """Close/delete a lost item report"""
    try:
        user = await verify_user_token(request)
        try:
            iid = ObjectId(item_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid item ID")
        
        result = await db.lost_items.delete_one({"_id": iid, "user_id": user['user_id']})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Item not found")
        
        logger.info(f"Lost item {item_id} closed")
        return {"message": "Item report closed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing item: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to close item")
