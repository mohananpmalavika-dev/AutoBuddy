import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings
from app.db.deps import get_db, get_settings_from_app
from app.schemas.auth import (
    AuthResponse,
    EmailOtpSendRequest,
    GoogleAuthRequestModel,
    LogoutRequest,
    OtpSendRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    RefreshTokenRequest,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services import auth_service
from app.state.runtime_state import RuntimeStateStore
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger("autobuddy.auth_router")


async def get_current_user(
    current_user: dict = Depends(get_current_user_secure),
):
    return current_user


async def verify_token(
    current_user: dict = Depends(get_current_user_secure),
):
    user = dict(current_user or {})
    if user.get("id") and not user.get("driver_id"):
        user["driver_id"] = user["id"]
    return user


def get_request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_runtime_state(request: Request) -> RuntimeStateStore:
    return request.app.state.runtime_state


@router.post("/auth/register", response_model=AuthResponse)
async def register(
    request: Request,
    user_data: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    return await auth_service.register(
        db=db,
        settings=settings,
        user_data=user_data,
        runtime_state=get_runtime_state(request),
        request_ip=get_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )


@router.post("/auth/login", response_model=AuthResponse)
async def login(
    credentials: UserLogin,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    try:
        return await auth_service.login(
            db=db,
            settings=settings,
            credentials=credentials,
            client_ip=get_request_ip(request),
            runtime_state=get_runtime_state(request),
            user_agent=str(request.headers.get("user-agent") or ""),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected login error for ip=%s", get_request_ip(request), exc_info=True)
        try:
            logger.warning("Falling back to legacy login flow for ip=%s", get_request_ip(request))
            return await auth_service.login_via_legacy_service(
                credentials=credentials,
                request=request,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Legacy login fallback failed for ip=%s", get_request_ip(request), exc_info=True)
            try:
                logger.warning("Attempting emergency rescue login flow for ip=%s", get_request_ip(request))
                return await auth_service.login_rescue_path(
                    db=db,
                    settings=settings,
                    credentials=credentials,
                    client_ip=get_request_ip(request),
                    user_agent=str(request.headers.get("user-agent") or ""),
                )
            except HTTPException:
                raise
            except Exception:
                logger.exception("Emergency rescue login failed for ip=%s", get_request_ip(request), exc_info=True)
                raise HTTPException(
                    status_code=503,
                    detail="Login service temporarily unavailable. Please try again.",
                ) from exc


@router.post("/auth/google", response_model=AuthResponse)
async def google_login(
    payload: GoogleAuthRequestModel,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    try:
        return await auth_service.google_login(
            db=db,
            settings=settings,
            payload=payload,
            request_ip=get_request_ip(request),
            user_agent=str(request.headers.get("user-agent") or ""),
        )
    except HTTPException as exc:
        # When primary auth path is temporarily unavailable, fallback to legacy route.
        if exc.status_code != 503:
            raise
        logger.warning("Primary Google auth unavailable; falling back to legacy flow for ip=%s", get_request_ip(request))
        try:
            return await auth_service.google_login_via_legacy_service(
                payload=payload,
                request=request,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Legacy Google auth fallback failed for ip=%s", get_request_ip(request), exc_info=True)
            raise
    except Exception:
        logger.exception("Unexpected Google auth error for ip=%s", get_request_ip(request), exc_info=True)
        try:
            logger.warning("Attempting legacy Google auth fallback for ip=%s", get_request_ip(request))
            return await auth_service.google_login_via_legacy_service(
                payload=payload,
                request=request,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Legacy Google auth fallback failed for ip=%s", get_request_ip(request), exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="Google login service temporarily unavailable. Please try again.",
            )


@router.post("/auth/otp/send", response_model=OtpSendResponse)
async def send_otp(
    request: Request,
    payload: OtpSendRequest,
    settings: Settings = Depends(get_settings_from_app),
):
    return await auth_service.send_otp(
        settings=settings,
        payload=payload,
        runtime_state=get_runtime_state(request),
    )


@router.post("/auth/email-otp/send", response_model=OtpSendResponse)
async def send_email_otp(
    request: Request,
    payload: EmailOtpSendRequest,
    settings: Settings = Depends(get_settings_from_app),
):
    return await auth_service.send_email_otp(
        settings=settings,
        payload=payload,
        runtime_state=get_runtime_state(request),
    )


@router.post("/auth/otp/verify", response_model=AuthResponse)
async def verify_otp(
    request: Request,
    payload: OtpVerifyRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    return await auth_service.verify_otp(
        db=db,
        settings=settings,
        payload=payload,
        runtime_state=get_runtime_state(request),
        request_ip=get_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )


@router.post("/auth/refresh")
async def refresh_access_token(
    payload: RefreshTokenRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings_from_app),
):
    return await auth_service.refresh_access_token(
        db=db,
        settings=settings,
        refresh_token=payload.refresh_token,
        request_ip=get_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )


@router.post("/auth/logout")
async def logout(
    payload: LogoutRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await auth_service.logout(
        db=db,
        refresh_token=payload.refresh_token,
        user_id=current_user.get("id"),
        request_ip=get_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
    )
    return {"message": "Logged out successfully", "user_id": current_user["id"]}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        phone=current_user["phone"],
        role=current_user["role"],
        gender=current_user.get("gender"),
        referral_code=str(current_user.get("referral_code") or "").strip().upper() or None,
        created_at=current_user["created_at"],
    )
