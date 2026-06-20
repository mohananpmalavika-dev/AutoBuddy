"""
Driver Insurance & Coverage API Routes - Production Implementation
Endpoints for insurance plans, claims, and policy management
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.db.deps import get_db
from app.utils.time_helpers import get_ist_now
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api/v3/insurance", tags=["insurance"])


# ============================================================================
# PYDANTIC MODELS (Request/Response)
# ============================================================================

class FileClaimRequest(BaseModel):
    trip_id: str = Field(..., min_length=1)
    claim_type: str = Field(..., min_length=1, max_length=50)
    claim_description: str = Field(..., min_length=10, max_length=1000)
    incident_datetime: str = Field(...)
    incident_location: str = Field(..., min_length=5, max_length=300)
    claim_amount: float = Field(..., gt=0)


class ClaimDecisionRequest(BaseModel):
    approved: bool = Field(...)
    amount: Optional[float] = Field(None, ge=0)
    message: str = Field(..., min_length=5, max_length=500)


class DriverInsurancePlanResponse(BaseModel):
    plan_id: str
    driver_id: str
    plan_name: str
    coverage_type: str
    status: str
    monthly_premium: float
    trip_deductible: float
    trip_limit: float
    coverage_limits: Dict[str, float]
    accident_coverage: bool
    liability_coverage: bool
    injury_coverage: bool
    theft_coverage: bool
    active_from: str
    active_until: str
    auto_renew: bool


class InsuranceClaimResponse(BaseModel):
    claim_id: str
    trip_id: str
    driver_id: str
    claim_type: str
    claim_description: str
    claim_amount: float
    claim_status: str
    incident_datetime: str
    incident_location: str
    document_count: int
    approved_amount: Optional[float]
    rejection_reason: Optional[str]
    decision_message: Optional[str]
    reviewed_at: Optional[str]
    created_at: str


class TripsInsuredResponse(BaseModel):
    trip_id: str
    booking_id: str
    driver_id: str
    insurance_premium: float
    ride_type: str
    start_time: str
    end_time: Optional[str]
    claim_filed: bool
    claim_id: Optional[str]


class PolicyTermsResponse(BaseModel):
    policy_id: str
    plan_name: str
    coverage_type: str
    coverage_limits: Dict[str, float]
    deductible: float
    what_covered: List[str]
    what_not_covered: List[str]
    claim_process: str
    max_claims_per_year: int
    document_upload_limit: int
    claim_processing_days: int
    terms_html: str


# ============================================================================
# SERVICE FUNCTIONS
# ============================================================================

async def get_active_plan(db: AsyncIOMotorDatabase, driver_id: str) -> Optional[Dict]:
    """Get driver's currently active insurance plan"""
    now = get_ist_now().isoformat()
    plan = await db.driver_insurance_plans.find_one({
        "driver_id": driver_id,
        "status": "active",
        "active_from": {"$lte": now},
        "active_until": {"$gte": now}
    }, {"_id": 0})
    return plan


async def create_trips_insured(db: AsyncIOMotorDatabase, trip_data: Dict) -> Dict:
    """Record trip as insured and deduct premium from payment"""
    trip_record = {
        "trip_id": trip_data.get("trip_id") or str(uuid.uuid4()),
        "driver_id": trip_data["driver_id"],
        "booking_id": trip_data["booking_id"],
        "plan_id": trip_data["plan_id"],
        "insurance_premium": trip_data["insurance_premium"],
        "ride_type": trip_data["ride_type"],
        "start_time": trip_data["start_time"],
        "end_time": trip_data.get("end_time"),
        "claim_filed": False,
        "created_at": get_ist_now().isoformat()
    }
    result = await db.trips_insured.insert_one(trip_record)
    trip_record["_id"] = str(result.inserted_id)
    return trip_record


async def file_insurance_claim(
    db: AsyncIOMotorDatabase,
    driver_id: str,
    trip_id: str,
    claim_type: str,
    description: str,
    incident_datetime: str,
    incident_location: str,
    claim_amount: float,
    documents: List[str] = None
) -> Dict:
    """File new insurance claim"""
    plan = await get_active_plan(db, driver_id)
    if not plan:
        raise HTTPException(status_code=403, detail="No active insurance plan")

    # Get trip to verify it exists and belongs to driver
    trip = await db.trips_insured.find_one({"trip_id": trip_id, "driver_id": driver_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found or not insured")

    if trip.get("claim_filed"):
        raise HTTPException(status_code=400, detail="Claim already filed for this trip")

    claim_id = str(uuid.uuid4())
    claim_record = {
        "claim_id": claim_id,
        "driver_id": driver_id,
        "trip_id": trip_id,
        "plan_id": plan["plan_id"],
        "claim_type": claim_type,
        "claim_description": description,
        "claim_amount": min(claim_amount, plan.get("trip_limit", 100000)),
        "incident_datetime": incident_datetime,
        "incident_location": incident_location,
        "claim_status": "submitted",
        "supporting_documents": documents or [],
        "document_count": len(documents) if documents else 0,
        "created_at": get_ist_now().isoformat(),
        "updated_at": get_ist_now().isoformat()
    }

    await db.insurance_claims.insert_one(claim_record)

    # Mark trip as having claim filed
    await db.trips_insured.update_one(
        {"trip_id": trip_id},
        {"$set": {"claim_filed": True, "claim_id": claim_id}}
    )

    return claim_record


async def process_claim_decision(
    db: AsyncIOMotorDatabase,
    claim_id: str,
    approved: bool,
    amount: Optional[float] = None,
    message: str = None
) -> Dict:
    """Admin: approve or reject insurance claim"""
    claim = await db.insurance_claims.find_one({"claim_id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    update_data = {
        "claim_status": "approved" if approved else "rejected",
        "decision_message": message,
        "reviewed_at": get_ist_now().isoformat(),
        "updated_at": get_ist_now().isoformat()
    }

    if approved and amount:
        update_data["approved_amount"] = min(amount, claim["claim_amount"])
        # TODO: Credit amount to driver's wallet
    else:
        update_data["rejection_reason"] = message

    result = await db.insurance_claims.find_one_and_update(
        {"claim_id": claim_id},
        {"$set": update_data},
        return_document=True
    )
    return result


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/driver/{driver_id}/plan")
async def get_driver_insurance_plan(
    driver_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get driver's active insurance plan and coverage details"""
    if user["id"] != driver_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    plan = await get_active_plan(db, driver_id)
    if not plan:
        raise HTTPException(status_code=404, detail="No active insurance plan")

    return {"plan": plan}


@router.get("/plans")
async def list_insurance_plans(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get available insurance plans"""
    plans = await db.insurance_policy_terms.find({}, {"_id": 0}).to_list(10)
    return {"plans": plans}


@router.get("/plans/{plan_type}/terms")
async def get_policy_terms(
    plan_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get detailed policy terms for a plan type"""
    terms = await db.insurance_policy_terms.find_one(
        {"plan_name": plan_type.capitalize()},
        {"_id": 0}
    )
    if not terms:
        raise HTTPException(status_code=404, detail="Policy not found")

    return {"policy": terms}


@router.get("/driver/{driver_id}/trips-insured")
async def get_trips_insured(
    driver_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get list of insured trips for driver"""
    if user["id"] != driver_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    query = {"driver_id": driver_id}
    if start_date and end_date:
        query["start_time"] = {"$gte": start_date, "$lte": end_date}

    trips = await db.trips_insured.find(query, {"_id": 0}).sort("start_time", -1).to_list(100)
    return {"trips": trips}


@router.post("/claim/file")
async def file_claim(
    request: FileClaimRequest,
    documents: Optional[List[UploadFile]] = File(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """File new insurance claim with supporting documents"""
    doc_paths = []
    if documents:
        for doc in documents[:5]:  # Max 5 documents
            # TODO: Save file to storage and get path
            doc_paths.append(f"claims/{user['id']}/{doc.filename}")

    claim = await file_insurance_claim(
        db,
        user["id"],
        request.trip_id,
        request.claim_type,
        request.claim_description,
        request.incident_datetime,
        request.incident_location,
        request.claim_amount,
        doc_paths
    )

    return {
        "message": "Claim submitted successfully",
        "claim_id": claim["claim_id"],
        "status": "submitted"
    }


@router.get("/claims/{driver_id}")
async def get_driver_claims(
    driver_id: str,
    status: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get insurance claims for driver"""
    if user["id"] != driver_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    query = {"driver_id": driver_id}
    if status and status != "all":
        query["claim_status"] = status

    claims = await db.insurance_claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)

    # Calculate statistics
    total_claims = len(claims)
    approved_claims = [c for c in claims if c["claim_status"] == "approved"]
    approved_amount = sum(c.get("approved_amount", 0) for c in approved_claims)
    pending_claims = [c for c in claims if c["claim_status"] == "submitted"]

    return {
        "claims": claims,
        "statistics": {
            "total_claims": total_claims,
            "approved_count": len(approved_claims),
            "approved_amount": approved_amount,
            "pending_count": len(pending_claims)
        }
    }


@router.get("/claims/{claim_id}/status")
async def get_claim_status(
    claim_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get status of specific insurance claim"""
    claim = await db.insurance_claims.find_one({"claim_id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if user["id"] != claim["driver_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    return {"claim": claim}


@router.post("/admin/claims/{claim_id}/decide")
async def admin_decide_claim(
    claim_id: str,
    request: ClaimDecisionRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Admin: Approve or reject insurance claim"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    claim = await process_claim_decision(
        db,
        claim_id,
        request.approved,
        request.amount,
        request.message
    )

    return {
        "message": "Claim decision processed",
        "claim_id": claim["claim_id"],
        "status": claim["claim_status"]
    }
