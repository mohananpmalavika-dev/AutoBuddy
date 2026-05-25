import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.db.deps import get_db
from app.services import driver_trust_service
from app.utils.rbac import get_current_user_secure, require_roles

router = APIRouter(prefix="/api", tags=["driver_trust"])


class AadhaarVerifyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    aadhaar_number: str = Field(..., min_length=12, max_length=18)


class SelfiePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selfie_url: str = Field(..., min_length=8, max_length=500)
    liveness_score: Optional[float] = Field(default=0.75, ge=0.0, le=1.0)
    face_match_score: Optional[float] = Field(default=0.85, ge=0.0, le=1.0)


class ComplaintPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    driver_id: str = Field(..., min_length=6, max_length=120)
    booking_id: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(default="general", min_length=2, max_length=80)
    message: str = Field(..., min_length=5, max_length=1000)
    severity: str = Field(default="medium", min_length=3, max_length=30)


class BlacklistPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    driver_id: str = Field(..., min_length=6, max_length=120)
    reason: str = Field(..., min_length=5, max_length=500)


def _request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _redis_from_request(request: Request):
    return getattr(request.app.state, "redis_client", None)


@router.post("/driver-trust/aadhaar/verify")
async def verify_aadhaar(
    payload: AadhaarVerifyPayload,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("driver")),
):
    result = driver_trust_service.basic_aadhaar_check(payload.aadhaar_number)
    if not result["valid_format"]:
        raise HTTPException(status_code=400, detail=result["message"])

    await db.drivers.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "aadhaar_masked": result["masked"],
                "aadhaar_verified": True,
                "aadhaar_verified_at": datetime.utcnow(),
                "kyc_status": "aadhaar_verified",
            }
        },
        upsert=True,
    )
    return {
        "message": "Aadhaar basic verification completed",
        "aadhaar": result,
        "next_step": "Upload selfie for liveness and face-match verification",
    }


@router.post("/driver-trust/selfie/verify")
async def verify_selfie(
    payload: SelfiePayload,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("driver")),
):
    liveness_ok = float(payload.liveness_score or 0.0) >= 0.70
    face_match_ok = float(payload.face_match_score or 0.0) >= 0.80
    verified = liveness_ok and face_match_ok

    await db.drivers.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "selfie_url": payload.selfie_url,
                "selfie_liveness_score": float(payload.liveness_score or 0.0),
                "selfie_face_match_score": float(payload.face_match_score or 0.0),
                "selfie_verified": verified,
                "selfie_verified_at": datetime.utcnow(),
                "kyc_status": "selfie_verified" if verified else "manual_review",
            }
        },
        upsert=True,
    )

    return {
        "message": "Selfie verification completed" if verified else "Selfie sent for manual review",
        "selfie_verified": verified,
        "liveness_score": payload.liveness_score,
        "face_match_score": payload.face_match_score,
    }


@router.post("/driver-trust/kyc-ai/review")
async def run_kyc_ai_review(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("driver")),
):
    return await driver_trust_service.kyc_ai_review(db, user["id"])


@router.get("/driver-trust/score/me")
async def my_driver_trust_score(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("driver")),
):
    return await driver_trust_service.calculate_driver_fraud_score(db, user["id"])


@router.get("/driver-trust/score/{driver_id}")
async def admin_driver_trust_score(
    driver_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    return await driver_trust_service.calculate_driver_fraud_score(db, driver_id)


@router.post("/driver-trust/complaints")
async def create_driver_complaint(
    payload: ComplaintPayload,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    complaint, outcome = await driver_trust_service.record_complaint_and_apply_trust_engine(
        db=db,
        redis_client=_redis_from_request(request),
        driver_id=payload.driver_id,
        booking_id=payload.booking_id,
        reported_by=user["id"],
        reported_by_role=user.get("role", ""),
        category=payload.category,
        message=payload.message,
        severity=payload.severity,
        request_ip=_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )
    return {
        "complaint": complaint,
        "action": outcome["action"],
        "fraud_score": outcome["fraud_score"],
    }


@router.get("/driver-trust/complaints/{driver_id}")
async def list_driver_complaints(
    driver_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    return await db.driver_complaints.find(
        {"driver_id": driver_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)


@router.post("/driver-trust/blacklist")
async def blacklist_driver(
    payload: BlacklistPayload,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    return await driver_trust_service.blacklist_driver(
        db=db,
        redis_client=_redis_from_request(request),
        driver_id=payload.driver_id,
        reason=payload.reason,
        admin_user_id=user["id"],
        request_ip=_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )


@router.put("/driver-trust/blacklist/{driver_id}/remove")
async def remove_blacklist(
    driver_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    return await driver_trust_service.remove_driver_from_blacklist(
        db=db,
        redis_client=_redis_from_request(request),
        driver_id=driver_id,
        admin_user_id=user["id"],
        request_ip=_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )


@router.get("/driver-trust/admin/kyc-reviews")
async def admin_kyc_reviews(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    return await db.kyc_ai_reviews.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)


@router.get("/driver-trust/admin/blacklist")
async def admin_blacklist_list(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    return await db.driver_blacklist.find({"active": True}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
