from typing import Callable

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings
from app.db.deps import get_db, get_settings_from_app
from app.services import driver_trust_service
from app.utils.security import decode_token

security = HTTPBearer()


async def get_current_user_secure(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    payload = decode_token(credentials.credentials, settings)
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if str(user.get("status") or "").strip().lower() == "blocked":
        raise HTTPException(status_code=403, detail="Account blocked")
    role = str(user.get("role") or "").strip().lower()
    if role == "driver":
        await driver_trust_service.verify_driver_not_blacklisted(
            db=db,
            redis_client=getattr(request.app.state, "redis_client", None),
            driver_user_id=str(user.get("id") or ""),
        )
    return user


def require_roles(*allowed_roles: str) -> Callable:
    normalized = {str(role or "").strip().lower() for role in allowed_roles if str(role or "").strip()}

    async def checker(current_user: dict = Depends(get_current_user_secure)):
        role = str((current_user or {}).get("role") or "").strip().lower()
        if role not in normalized:
            raise HTTPException(status_code=403, detail="Permission denied")
        return current_user

    return checker
