"""
Vehicle Management Router
Handles vehicle CRUD operations, validation, and documentation
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, validator
from datetime import datetime, timezone, date
from typing import List, Optional
from bson import ObjectId
import logging

from app.db.deps import get_db
from app.utils.rbac import require_roles
from app.utils.production import FileUploadValidator

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])
logger = logging.getLogger(__name__)


# Models
class VehicleDocument(BaseModel):
    type: str  # 'rc', 'insurance', 'pollution_cert', 'badge_photo'
    url: str
    expiry_date: Optional[date] = None
    verified: bool = False


class VehicleCreate(BaseModel):
    make: str = Field(..., min_length=1, max_length=100)
    model: str = Field(..., min_length=1, max_length=100)
    year: int = Field(..., ge=2000, le=2030)
    color: str = Field(..., min_length=1, max_length=50)
    license_plate: str = Field(..., min_length=1, max_length=20)
    capacity: int = Field(..., ge=2, le=8)
    
    # Insurance & documents
    insurance_expiry_date: Optional[date] = None
    pollution_cert_expiry_date: Optional[date] = None
    
    # Additional info
    registration_number: Optional[str] = None
    chassis_number: Optional[str] = None
    
    @validator('year')
    def validate_year(cls, v):
        current_year = datetime.now().year
        if v > current_year + 1:
            raise ValueError('Year cannot be in the future')
        return v


class VehicleUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    capacity: Optional[int] = None
    insurance_expiry_date: Optional[date] = None
    pollution_cert_expiry_date: Optional[date] = None


class VehicleResponse(BaseModel):
    id: str
    driver_id: str
    make: str
    model: str
    year: int
    color: str
    license_plate: str
    capacity: int
    registration_number: Optional[str]
    chassis_number: Optional[str]
    insurance_expiry_date: Optional[date]
    pollution_cert_expiry_date: Optional[date]
    documents: List[VehicleDocument]
    verification_status: str  # 'pending', 'verified', 'rejected'
    verified_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Endpoints
@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    vehicle: VehicleCreate,
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a new vehicle for the driver"""
    try:
        # Check if driver already has a vehicle (limit to 1 active vehicle)
        existing = await db.vehicles.find_one({
            "driver_id": ObjectId(current_driver["id"]),
            "is_active": True
        })
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver already has an active vehicle"
            )
        
        now = datetime.now(timezone.utc)
        vehicle_doc = {
            "driver_id": ObjectId(current_driver["id"]),
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "color": vehicle.color,
            "license_plate": vehicle.license_plate,
            "capacity": vehicle.capacity,
            "registration_number": vehicle.registration_number,
            "chassis_number": vehicle.chassis_number,
            "insurance_expiry_date": vehicle.insurance_expiry_date,
            "pollution_cert_expiry_date": vehicle.pollution_cert_expiry_date,
            "documents": [],
            "verification_status": "pending",
            "verified_at": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        
        result = await db.vehicles.insert_one(vehicle_doc)
        vehicle_doc["_id"] = result.inserted_id
        
        logger.info(f"Vehicle created: {result.inserted_id} for driver {current_driver['id']}")
        
        return _format_vehicle(vehicle_doc)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating vehicle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create vehicle"
        )


@router.get("/", response_model=List[VehicleResponse])
async def list_driver_vehicles(
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all vehicles for the current driver"""
    try:
        vehicles = await db.vehicles.find({
            "driver_id": ObjectId(current_driver["id"])
        }).to_list(None)
        
        return [_format_vehicle(v) for v in vehicles]
    
    except Exception as e:
        logger.error(f"Error listing vehicles: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve vehicles"
        )


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(
    vehicle_id: str,
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific vehicle"""
    try:
        vehicle = await db.vehicles.find_one({
            "_id": ObjectId(vehicle_id),
            "driver_id": ObjectId(current_driver["id"])
        })
        
        if not vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        return _format_vehicle(vehicle)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving vehicle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve vehicle"
        )


@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: str,
    update: VehicleUpdate,
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update vehicle information"""
    try:
        vehicle = await db.vehicles.find_one({
            "_id": ObjectId(vehicle_id),
            "driver_id": ObjectId(current_driver["id"])
        })
        
        if not vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        # Prepare update data
        update_data = {}
        if update.make:
            update_data["make"] = update.make
        if update.model:
            update_data["model"] = update.model
        if update.color:
            update_data["color"] = update.color
        if update.capacity:
            update_data["capacity"] = update.capacity
        if update.insurance_expiry_date:
            update_data["insurance_expiry_date"] = update.insurance_expiry_date
        if update.pollution_cert_expiry_date:
            update_data["pollution_cert_expiry_date"] = update.pollution_cert_expiry_date
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        updated_vehicle = await db.vehicles.find_one_and_update(
            {"_id": ObjectId(vehicle_id)},
            {"$set": update_data},
            return_document=True
        )
        
        logger.info(f"Vehicle updated: {vehicle_id}")
        return _format_vehicle(updated_vehicle)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating vehicle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update vehicle"
        )


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: str,
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete a vehicle"""
    try:
        # Check if vehicle is in use
        active_ride = await db.rides.find_one({
            "vehicle_id": ObjectId(vehicle_id),
            "status": {"$in": ["waiting_for_driver", "driver_arriving", "in_progress"]}
        })
        
        if active_ride:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete vehicle with active rides"
            )
        
        result = await db.vehicles.delete_one({
            "_id": ObjectId(vehicle_id),
            "driver_id": ObjectId(current_driver["id"])
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        logger.info(f"Vehicle deleted: {vehicle_id}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vehicle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete vehicle"
        )


@router.post("/{vehicle_id}/documents/{doc_type}")
async def upload_vehicle_document(
    vehicle_id: str,
    doc_type: str,
    file: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Upload vehicle document (RC, insurance, pollution certificate, etc.)"""
    try:
        # Validate doc type
        valid_types = ["rc", "insurance", "pollution_cert", "badge_photo"]
        if doc_type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid document type. Must be one of: {', '.join(valid_types)}"
            )
        
        # Read and validate file
        content = await file.read()
        validation = FileUploadValidator.validate_file(
            content,
            file.filename,
            allowed_types="image" if doc_type == "badge_photo" else "document",
            max_size_mb=50
        )
        
        if not validation["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation["error"]
            )
        
        # In production, upload to S3/cloud storage
        # For now, create document record
        document = {
            "type": doc_type,
            "url": f"s3://uploads/{vehicle_id}/{doc_type}/{file.filename}",
            "expiry_date": expiry_date,
            "verified": False,
            "uploaded_at": datetime.now(timezone.utc)
        }
        
        # Update vehicle with document
        updated_vehicle = await db.vehicles.find_one_and_update(
            {
                "_id": ObjectId(vehicle_id),
                "driver_id": ObjectId(current_driver["id"])
            },
            {
                "$push": {"documents": document},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            },
            return_document=True
        )
        
        if not updated_vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        logger.info(f"Vehicle document uploaded: {vehicle_id}/{doc_type}")
        return _format_vehicle(updated_vehicle)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading vehicle document: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload document"
        )


@router.post("/{vehicle_id}/verify", response_model=VehicleResponse)
async def verify_vehicle(
    vehicle_id: str,
    admin_user: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Admin: Verify a vehicle"""
    try:
        # Check documents completeness
        vehicle = await db.vehicles.find_one({"_id": ObjectId(vehicle_id)})
        
        if not vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        required_docs = {"rc", "insurance", "pollution_cert", "badge_photo"}
        uploaded_docs = {doc["type"] for doc in vehicle.get("documents", [])}
        
        if not required_docs.issubset(uploaded_docs):
            missing = required_docs - uploaded_docs
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required documents: {', '.join(missing)}"
            )
        
        # Verify vehicle
        updated_vehicle = await db.vehicles.find_one_and_update(
            {"_id": ObjectId(vehicle_id)},
            {
                "$set": {
                    "verification_status": "verified",
                    "verified_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        logger.info(f"Vehicle verified: {vehicle_id} by admin {admin_user['id']}")
        return _format_vehicle(updated_vehicle)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying vehicle: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify vehicle"
        )


@router.get("/{vehicle_id}/expiry-check")
async def check_vehicle_expiry(
    vehicle_id: str,
    current_driver: dict = Depends(require_roles("driver")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Check expiry status of vehicle documents"""
    try:
        vehicle = await db.vehicles.find_one({
            "_id": ObjectId(vehicle_id),
            "driver_id": ObjectId(current_driver["id"])
        })
        
        if not vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found"
            )
        
        today = date.today()
        expiry_status = {
            "insurance": "valid",
            "pollution_cert": "valid",
            "vehicle_active": True
        }
        
        # Check insurance
        insurance_expiry = vehicle.get("insurance_expiry_date")
        if insurance_expiry:
            days_left = (insurance_expiry - today).days
            if days_left < 0:
                expiry_status["insurance"] = "expired"
                expiry_status["vehicle_active"] = False
            elif days_left < 30:
                expiry_status["insurance"] = "expiring_soon"
        
        # Check pollution certificate
        pollution_expiry = vehicle.get("pollution_cert_expiry_date")
        if pollution_expiry:
            days_left = (pollution_expiry - today).days
            if days_left < 0:
                expiry_status["pollution_cert"] = "expired"
                expiry_status["vehicle_active"] = False
            elif days_left < 30:
                expiry_status["pollution_cert"] = "expiring_soon"
        
        return expiry_status
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking vehicle expiry: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check expiry status"
        )


# Helper Functions
def _format_vehicle(vehicle: dict) -> VehicleResponse:
    """Format vehicle document for response"""
    return VehicleResponse(
        id=str(vehicle.get("_id", "")),
        driver_id=str(vehicle.get("driver_id", "")),
        make=vehicle.get("make"),
        model=vehicle.get("model"),
        year=vehicle.get("year"),
        color=vehicle.get("color"),
        license_plate=vehicle.get("license_plate"),
        capacity=vehicle.get("capacity"),
        registration_number=vehicle.get("registration_number"),
        chassis_number=vehicle.get("chassis_number"),
        insurance_expiry_date=vehicle.get("insurance_expiry_date"),
        pollution_cert_expiry_date=vehicle.get("pollution_cert_expiry_date"),
        documents=[VehicleDocument(**doc) for doc in vehicle.get("documents", [])],
        verification_status=vehicle.get("verification_status", "pending"),
        verified_at=vehicle.get("verified_at"),
        created_at=vehicle.get("created_at"),
        updated_at=vehicle.get("updated_at")
    )
