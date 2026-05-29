"""
Admin Trip Management Router
Features: Bulk trip actions, reassignment, emergency contacts
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/trips", tags=["admin-trips"])


class BulkTripAction(BaseModel):
    trip_ids: List[str]
    action: str = Field(..., description="cancel, reassign, delay, pause, resume")
    reason: str
    new_driver_id: Optional[str] = None
    delay_minutes: Optional[int] = None


class TripReassignment(BaseModel):
    trip_id: str
    current_driver_id: str
    new_driver_id: str
    reason: str = Field(..., description="driver_unavailable, safety, performance, request")


class EmergencyContactOverride(BaseModel):
    trip_id: str
    contact_type: str = Field(..., description="passenger, driver, both")
    action: str = Field(..., description="call, sms, emergency_services")
    reason: str
    message: Optional[str] = None


class TripStatusUpdate(BaseModel):
    trip_id: str
    status: str = Field(..., description="cancelled, paused, resumed, redirected")
    reason: str


# ==================== GET Endpoints ====================

@router.get("/list")
async def get_trips(
    status: Optional[str] = Query(None),
    driver_id: Optional[str] = Query(None),
    passenger_id: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List active/recent trips with advanced filtering"""
    try:
        start_time = datetime.utcnow() - timedelta(hours=hours)
        
        filters = {"created_at": {"$gte": start_time}}
        if status:
            filters["status"] = status
        if driver_id:
            filters["driver_id"] = driver_id
        if passenger_id:
            filters["passenger_id"] = passenger_id
        
        total = await db.bookings.count_documents(filters)
        
        trips = await db.bookings.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "hours": hours,
            "trips": [
                {
                    "trip_id": str(t.get("_id")),
                    "passenger_id": t.get("passenger_id"),
                    "driver_id": t.get("driver_id"),
                    "status": t.get("status"),
                    "pickup": t.get("pickup_location"),
                    "dropoff": t.get("dropoff_location"),
                    "created_at": t.get("created_at"),
                    "fare": t.get("fare_amount"),
                }
                for t in trips
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trips: {str(e)}")


@router.get("/{trip_id}")
async def get_trip_details(
    trip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed trip information"""
    try:
        from bson import ObjectId
        trip = await db.bookings.find_one({"_id": ObjectId(trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        # Get driver info
        driver = await db.users.find_one({"_id": ObjectId(trip.get("driver_id"))})
        passenger = await db.users.find_one({"_id": ObjectId(trip.get("passenger_id"))})
        
        return {
            "trip_id": trip_id,
            "status": trip.get("status"),
            "passenger": {
                "id": str(passenger.get("_id")) if passenger else None,
                "name": passenger.get("name") if passenger else None,
                "phone": passenger.get("phone") if passenger else None,
                "email": passenger.get("email") if passenger else None,
            },
            "driver": {
                "id": str(driver.get("_id")) if driver else None,
                "name": driver.get("name") if driver else None,
                "phone": driver.get("phone") if driver else None,
                "vehicle": driver.get("vehicle_number") if driver else None,
            },
            "pickup": trip.get("pickup_location"),
            "dropoff": trip.get("dropoff_location"),
            "pickup_time": trip.get("pickup_time"),
            "dropoff_time": trip.get("dropoff_time"),
            "fare": trip.get("fare_amount"),
            "created_at": trip.get("created_at"),
            "updated_at": trip.get("updated_at"),
            "special_notes": trip.get("special_notes"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trip: {str(e)}")


@router.get("/reassignment/candidates/{trip_id}")
async def get_reassignment_candidates(
    trip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get available drivers for reassignment"""
    try:
        from bson import ObjectId
        trip = await db.bookings.find_one({"_id": ObjectId(trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        # Find active drivers near the trip location
        available_drivers = await db.users.find({
            "role": "driver",
            "driver_status": "active",
            "on_trip": False,
        }).sort("rating", DESCENDING).limit(10).to_list(10)
        
        return {
            "trip_id": trip_id,
            "candidates": [
                {
                    "driver_id": str(d.get("_id")),
                    "name": d.get("name"),
                    "rating": d.get("rating"),
                    "trips_completed": d.get("trips_completed", 0),
                    "vehicle": d.get("vehicle_number"),
                }
                for d in available_drivers
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching candidates: {str(e)}")


@router.get("/emergency/contacts/{trip_id}")
async def get_emergency_contacts(
    trip_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get emergency contacts for trip participants"""
    try:
        from bson import ObjectId
        trip = await db.bookings.find_one({"_id": ObjectId(trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        passenger = await db.users.find_one({"_id": ObjectId(trip.get("passenger_id"))})
        driver = await db.users.find_one({"_id": ObjectId(trip.get("driver_id"))})
        
        return {
            "trip_id": trip_id,
            "passenger_contacts": {
                "primary": passenger.get("emergency_contact_name") if passenger else None,
                "phone": passenger.get("emergency_contact_phone") if passenger else None,
                "relationship": passenger.get("emergency_contact_relation") if passenger else None,
            },
            "driver_contacts": {
                "primary": driver.get("emergency_contact_name") if driver else None,
                "phone": driver.get("emergency_contact_phone") if driver else None,
                "relationship": driver.get("emergency_contact_relation") if driver else None,
            },
            "sos_enabled": trip.get("sos_enabled", False),
            "sos_status": trip.get("sos_status", "inactive"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching contacts: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/bulk-action")
async def perform_bulk_trip_action(
    action_config: BulkTripAction,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Perform bulk actions on multiple trips"""
    try:
        from bson import ObjectId
        
        results = {
            "success": [],
            "failed": [],
            "processed": 0,
            "total": len(action_config.trip_ids)
        }
        
        for trip_id in action_config.trip_ids:
            try:
                trip = await db.bookings.find_one({"_id": ObjectId(trip_id)})
                if not trip:
                    results["failed"].append({
                        "trip_id": trip_id,
                        "error": "Trip not found"
                    })
                    continue
                
                # Handle different actions
                update_data = {
                    "updated_at": datetime.utcnow(),
                    "admin_id": admin_user.get("user_id"),
                }
                
                if action_config.action == "cancel":
                    update_data["status"] = "cancelled"
                    update_data["cancellation_reason"] = action_config.reason
                    update_data["cancelled_by"] = "admin"
                    update_data["cancelled_at"] = datetime.utcnow()
                
                elif action_config.action == "reassign":
                    if not action_config.new_driver_id:
                        results["failed"].append({
                            "trip_id": trip_id,
                            "error": "new_driver_id required for reassignment"
                        })
                        continue
                    update_data["driver_id"] = action_config.new_driver_id
                    update_data["reassigned_from"] = trip.get("driver_id")
                    update_data["reassignment_reason"] = action_config.reason
                    update_data["reassigned_at"] = datetime.utcnow()
                
                elif action_config.action == "delay":
                    if not action_config.delay_minutes:
                        results["failed"].append({
                            "trip_id": trip_id,
                            "error": "delay_minutes required for delay action"
                        })
                        continue
                    new_time = trip.get("pickup_time") + timedelta(minutes=action_config.delay_minutes)
                    update_data["pickup_time"] = new_time
                    update_data["delay_reason"] = action_config.reason
                    update_data["delayed_minutes"] = action_config.delay_minutes
                
                elif action_config.action == "pause":
                    update_data["status"] = "paused"
                    update_data["pause_reason"] = action_config.reason
                    update_data["paused_at"] = datetime.utcnow()
                
                elif action_config.action == "resume":
                    if trip.get("status") != "paused":
                        results["failed"].append({
                            "trip_id": trip_id,
                            "error": "Trip is not paused"
                        })
                        continue
                    update_data["status"] = "accepted"
                    update_data["resumed_at"] = datetime.utcnow()
                
                # Execute update
                await db.bookings.update_one(
                    {"_id": ObjectId(trip_id)},
                    {"$set": update_data}
                )
                
                # Log action
                await db.audit_logs.insert_one({
                    "action": f"bulk_trip_{action_config.action}",
                    "trip_id": trip_id,
                    "admin_id": admin_user.get("user_id"),
                    "reason": action_config.reason,
                    "created_at": datetime.utcnow(),
                })
                
                results["success"].append(trip_id)
                results["processed"] += 1
                
            except Exception as e:
                results["failed"].append({
                    "trip_id": trip_id,
                    "error": str(e)
                })
        
        return {
            "status": "completed",
            "action": action_config.action,
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing bulk action: {str(e)}")


@router.post("/reassign")
async def reassign_trip(
    reassignment: TripReassignment,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Reassign trip to different driver"""
    try:
        from bson import ObjectId
        
        # Verify trip exists
        trip = await db.bookings.find_one({"_id": ObjectId(reassignment.trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        # Verify new driver exists and is available
        new_driver = await db.users.find_one({"_id": ObjectId(reassignment.new_driver_id)})
        if not new_driver:
            raise HTTPException(status_code=404, detail="New driver not found")
        
        if new_driver.get("driver_status") != "active":
            raise HTTPException(status_code=400, detail="New driver is not active")
        
        # Update trip
        await db.bookings.update_one(
            {"_id": ObjectId(reassignment.trip_id)},
            {
                "$set": {
                    "driver_id": reassignment.new_driver_id,
                    "reassigned_from": reassignment.current_driver_id,
                    "reassignment_reason": reassignment.reason,
                    "reassignment_type": reassignment.reason,
                    "reassigned_at": datetime.utcnow(),
                    "reassigned_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        
        # Log reassignment
        await db.audit_logs.insert_one({
            "action": "trip_reassignment",
            "trip_id": reassignment.trip_id,
            "from_driver_id": reassignment.current_driver_id,
            "to_driver_id": reassignment.new_driver_id,
            "reason": reassignment.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        # Notify drivers
        await db.notifications.insert_one({
            "user_id": reassignment.current_driver_id,
            "type": "trip_reassigned_from",
            "trip_id": reassignment.trip_id,
            "reason": reassignment.reason,
            "created_at": datetime.utcnow(),
        })
        
        await db.notifications.insert_one({
            "user_id": reassignment.new_driver_id,
            "type": "trip_reassigned_to",
            "trip_id": reassignment.trip_id,
            "previous_driver": reassignment.current_driver_id,
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "trip_id": reassignment.trip_id,
            "from_driver": reassignment.current_driver_id,
            "to_driver": reassignment.new_driver_id,
            "message": "Trip reassigned successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reassigning trip: {str(e)}")


@router.post("/emergency-contact")
async def trigger_emergency_contact(
    emergency: EmergencyContactOverride,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Trigger emergency contact notifications"""
    try:
        from bson import ObjectId
        
        trip = await db.bookings.find_one({"_id": ObjectId(emergency.trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        # Get participants
        passenger = await db.users.find_one({"_id": ObjectId(trip.get("passenger_id"))})
        driver = await db.users.find_one({"_id": ObjectId(trip.get("driver_id"))})
        
        # Create emergency record
        emergency_record = {
            "trip_id": emergency.trip_id,
            "contact_type": emergency.contact_type,
            "action": emergency.action,
            "reason": emergency.reason,
            "message": emergency.message,
            "initiated_by": admin_user.get("user_id"),
            "initiated_at": datetime.utcnow(),
            "status": "initiated",
            "contacts_notified": [],
        }
        
        # Notify emergency contacts based on action
        if emergency.contact_type in ["passenger", "both"]:
            if passenger and passenger.get("emergency_contact_phone"):
                emergency_record["contacts_notified"].append({
                    "type": "passenger_emergency",
                    "phone": passenger.get("emergency_contact_phone"),
                    "name": passenger.get("emergency_contact_name"),
                    "action": emergency.action,
                })
        
        if emergency.contact_type in ["driver", "both"]:
            if driver and driver.get("emergency_contact_phone"):
                emergency_record["contacts_notified"].append({
                    "type": "driver_emergency",
                    "phone": driver.get("emergency_contact_phone"),
                    "name": driver.get("emergency_contact_name"),
                    "action": emergency.action,
                })
        
        # If emergency services action, also log incident
        if emergency.action == "emergency_services":
            await db.safety_incidents.insert_one({
                "trip_id": emergency.trip_id,
                "incident_type": "emergency_override",
                "severity": "critical",
                "description": emergency.reason,
                "initiated_by": admin_user.get("user_id"),
                "emergency_message": emergency.message,
                "created_at": datetime.utcnow(),
                "status": "active",
            })
        
        # Save emergency record
        result = await db.emergency_contacts.insert_one(emergency_record)
        
        # Log action
        await db.audit_logs.insert_one({
            "action": "emergency_contact_override",
            "trip_id": emergency.trip_id,
            "contact_type": emergency.contact_type,
            "action_taken": emergency.action,
            "reason": emergency.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "emergency_id": str(result.inserted_id),
            "trip_id": emergency.trip_id,
            "contacts_notified": len(emergency_record["contacts_notified"]),
            "message": f"Emergency contacts notified via {emergency.action}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error triggering emergency contact: {str(e)}")


@router.put("/{trip_id}/status")
async def update_trip_status(
    trip_id: str,
    status_update: TripStatusUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update trip status (cancel, pause, resume, redirect)"""
    try:
        from bson import ObjectId
        
        trip = await db.bookings.find_one({"_id": ObjectId(trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        update_data = {
            "status": status_update.status,
            "updated_at": datetime.utcnow(),
            "admin_id": admin_user.get("user_id"),
        }
        
        if status_update.status == "cancelled":
            update_data["cancellation_reason"] = status_update.reason
            update_data["cancelled_by"] = "admin"
        elif status_update.status == "paused":
            update_data["pause_reason"] = status_update.reason
        elif status_update.status == "redirected":
            update_data["redirect_reason"] = status_update.reason
        
        await db.bookings.update_one(
            {"_id": ObjectId(trip_id)},
            {"$set": update_data}
        )
        
        # Log action
        await db.audit_logs.insert_one({
            "action": "trip_status_update",
            "trip_id": trip_id,
            "new_status": status_update.status,
            "reason": status_update.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "trip_id": trip_id,
            "new_status": status_update.status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating trip status: {str(e)}")
