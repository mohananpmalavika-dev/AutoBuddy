from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.services import security_service
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api", tags=["security"])


@router.get("/security/audit-logs")
async def get_audit_logs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles("admin")),
):
    _ = current_user
    return await security_service.get_recent_audit_logs(db=db, limit=200)


@router.get("/security/fraud-score/{user_id}")
async def get_fraud_score(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles("admin")),
):
    _ = current_user
    return await security_service.compute_user_fraud_score(db=db, user_id=user_id)
