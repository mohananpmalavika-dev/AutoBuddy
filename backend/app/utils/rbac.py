import copy
import os
import time
from typing import Any, Callable, Dict, Optional, Sequence

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings
from app.db.deps import get_db, get_settings_from_app
from app.services import driver_trust_service
from app.utils.security import decode_token

security = HTTPBearer()
AUTH_USER_CACHE_TTL_SECONDS = max(0, int(os.environ.get("AUTH_USER_CACHE_TTL_SECONDS", "10")))
AUTH_USER_CACHE_MAX_ITEMS = max(100, int(os.environ.get("AUTH_USER_CACHE_MAX_ITEMS", "20000")))
AUTH_USER_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}


def _get_cached_auth_user(user_id: str) -> Optional[dict]:
    if AUTH_USER_CACHE_TTL_SECONDS <= 0:
        return None
    cached = AUTH_USER_CACHE.get(user_id)
    now_monotonic = time.monotonic()
    if not cached:
        return None
    expires_at, user = cached
    if expires_at <= now_monotonic:
        AUTH_USER_CACHE.pop(user_id, None)
        return None
    return copy.deepcopy(user)


def _set_cached_auth_user(user_id: str, user: dict) -> None:
    if AUTH_USER_CACHE_TTL_SECONDS <= 0 or not user_id:
        return
    if len(AUTH_USER_CACHE) >= AUTH_USER_CACHE_MAX_ITEMS:
        AUTH_USER_CACHE.clear()
    AUTH_USER_CACHE[user_id] = (time.monotonic() + AUTH_USER_CACHE_TTL_SECONDS, copy.deepcopy(user))


def _normalize_role(value) -> str:
    role = str(getattr(value, "value", value) or "").strip().lower()
    if "." in role:
        role = role.split(".")[-1]
    if role == "user":
        return "passenger"
    return role


def _is_account_blocked(user: dict) -> bool:
    status = str(user.get("status") or user.get("account_status") or "").strip().lower()
    return status == "blocked" or bool(user.get("is_blocked"))


async def get_current_user_from_request(
    request: Request,
    *,
    db_override: Optional[AsyncIOMotorDatabase] = None,
    settings_override: Optional[Settings] = None,
    allowed_roles: Optional[Sequence[str]] = None,
) -> dict:
    """Verify a real JWT from Authorization and return the database user."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    settings = settings_override or getattr(request.app.state, "settings", None)
    if settings is None:
        settings = get_settings_from_app(request)
    mongo_db = db_override if db_override is not None else getattr(request.app.state, "db", None)
    if mongo_db is None:
        mongo_db = get_db(request)

    payload = decode_token(token, settings)
    user_id = str(payload.get("sub") or payload.get("id") or payload.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    cached_user = _get_cached_auth_user(user_id)
    if cached_user is not None:
        role = _normalize_role(cached_user.get("role") or cached_user.get("user_type") or payload.get("role"))
        if allowed_roles:
            normalized_allowed = {_normalize_role(role_value) for role_value in allowed_roles}
            if role not in normalized_allowed:
                raise HTTPException(status_code=403, detail="Permission denied")
        cached_user["role"] = role
        cached_user["user_type"] = cached_user.get("user_type") or role
        return cached_user

    user = await mongo_db.users.find_one({"$or": [{"id": user_id}, {"user_id": user_id}]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if _is_account_blocked(user):
        raise HTTPException(status_code=403, detail="Account blocked")

    role = _normalize_role(user.get("role") or user.get("user_type") or payload.get("role"))
    if allowed_roles:
        normalized_allowed = {_normalize_role(role_value) for role_value in allowed_roles}
        if role not in normalized_allowed:
            raise HTTPException(status_code=403, detail="Permission denied")

    user["role"] = role
    user["user_type"] = user.get("user_type") or role
    if role == "driver":
        await driver_trust_service.verify_driver_not_blacklisted(
            db=mongo_db,
            redis_client=getattr(request.app.state, "redis_client", None),
            driver_user_id=str(user.get("id") or ""),
        )
    _set_cached_auth_user(user_id, user)
    return user


async def get_current_user_secure(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    user = await get_current_user_from_request(
        request,
        db_override=db,
        settings_override=settings,
    )
    role = _normalize_role(user.get("role") or user.get("user_type"))
    return user


def require_roles(*allowed_roles: str) -> Callable:
    normalized = {_normalize_role(role) for role in allowed_roles if str(role or "").strip()}

    async def checker(current_user: dict = Depends(get_current_user_secure)):
        role = _normalize_role((current_user or {}).get("role") or (current_user or {}).get("user_type"))
        if role not in normalized:
            raise HTTPException(status_code=403, detail="Permission denied")
        return current_user

    return checker
