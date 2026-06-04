import importlib
import hashlib
import logging
import random
import uuid
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, Optional

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError

from app.core.config import Settings
from pydantic import ValidationError
from app.schemas.auth import (
    AuthResponse,
    EmailOtpSendRequest,
    GoogleAuthRequestModel,
    Gender,
    OtpSendRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.audit_service import write_audit_log
from app.services.email_delivery import send_otp_email_message
from app.services import driver_trust_service, revenue_service
from app.state.runtime_state import RuntimeStateStore
from app.utils.security import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)

try:
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import id_token as google_id_token
except Exception:  # pragma: no cover
    GoogleAuthRequest = None
    google_id_token = None

logger = logging.getLogger("autobuddy.auth_service")
VALID_USER_ROLES = {"passenger", "driver", "operator", "admin"}


async def _audit_auth_event(
    *,
    db: AsyncIOMotorDatabase,
    action: str,
    success: bool,
    user_id: Optional[str] = None,
    request_ip: str = "",
    user_agent: str = "",
    path: str = "/api/auth",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    await write_audit_log(
        db=db,
        action=action,
        success=success,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        method="POST",
        path=path,
        resource=path,
        metadata=metadata,
    )


def _legacy_module():
    return importlib.import_module("server")


def normalize_phone(raw_phone: str) -> str:
    digits_only = "".join(char for char in str(raw_phone) if char.isdigit())
    if len(digits_only) != 10:
        raise HTTPException(status_code=400, detail="Invalid phone. Phone number must be exactly 10 digits.")
    return digits_only


def normalize_email(raw_email: str) -> str:
    return str(raw_email or "").strip().lower()


def _hash_refresh_token(refresh_token: str) -> str:
    return hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()


async def _store_refresh_token(
    *,
    db: AsyncIOMotorDatabase,
    user_id: str,
    refresh_token: str,
    request_ip: str,
    user_agent: str,
) -> None:
    now = get_ist_now()
    await db.refresh_tokens.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "token_hash": _hash_refresh_token(refresh_token),
            "ip": request_ip,
            "user_agent": user_agent,
            "revoked": False,
            "created_at": now,
            "expires_at": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        }
    )


def build_default_operator_profile(user_id: str, user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source = user or {}
    return {
        "operator_id": user_id,
        "company_name": f"{str(source.get('name') or 'AutoBuddy').strip()} Fleet",
        "contact_name": str(source.get("name") or "").strip(),
        "contact_email": str(source.get("email") or "").strip().lower(),
        "contact_phone": str(source.get("phone") or "").strip(),
        "service_regions": ["all"],
        "verification_status": "pending",
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now(),
    }


async def ensure_operator_profile(
    db: AsyncIOMotorDatabase,
    user_id: str,
    user: Optional[Dict[str, Any]] = None,
) -> None:
    await db.operator_profiles.update_one(
        {"operator_id": user_id},
        {"$setOnInsert": build_default_operator_profile(user_id, user)},
        upsert=True,
    )


async def _revoke_refresh_token(db: AsyncIOMotorDatabase, refresh_token: str) -> None:
    await db.refresh_tokens.update_one(
        {"token_hash": _hash_refresh_token(refresh_token)},
        {"$set": {"revoked": True, "revoked_at": get_ist_now()}},
    )


def _role_value(raw_role: Any) -> str:
    raw_value = getattr(raw_role, "value", raw_role)
    normalized = str(raw_value or "passenger").strip().lower()
    if "." in normalized:
        normalized = normalized.split(".")[-1]
    return normalized


def _build_user_response(user: Dict[str, Any]) -> UserResponse:
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please contact support.")

    role = _role_value(user.get("role"))
    if role not in VALID_USER_ROLES:
        logger.warning("Unexpected user role '%s' for user_id=%s; defaulting to passenger", role, user_id)
        role = "passenger"

    created_at = user.get("created_at")
    if not isinstance(created_at, datetime):
        created_at = get_ist_now()

    try:
        return UserResponse.model_validate(
            {
                "id": user_id,
                "email": str(user.get("email") or ""),
                "name": str(user.get("name") or "User"),
                "phone": str(user.get("phone") or ""),
                "role": role,
                "gender": str(user.get("gender") or "").strip().lower() or None,
                "referral_code": str(user.get("referral_code") or "").strip().upper() or None,
                "created_at": created_at,
            }
        )
    except ValidationError as exc:
        logger.exception("Invalid user record during login response creation: %s", user.get("id"))
        raise HTTPException(
            status_code=401,
            detail="User account data is invalid. Please contact support.",
        ) from exc


def _normalize_user_role(raw_role: Any) -> str:
    role = _role_value(raw_role)
    return role if role in VALID_USER_ROLES else "passenger"


def _normalize_user_id(raw_user_id: Any) -> str:
    user_id = str(raw_user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please contact support.")
    return user_id


def _auth_response_for_user(
    user: Dict[str, Any],
    settings: Settings,
    *,
    refresh_token: Optional[str] = None,
) -> AuthResponse:
    user_id = _normalize_user_id(user.get("id"))

    role = _role_value(user.get("role"))
    if role not in VALID_USER_ROLES:
        role = "passenger"
    token = create_access_token(user_id, role, settings)
    return AuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=_build_user_response(user),
    )


async def _consume_phone_otp(runtime_state: RuntimeStateStore, phone: str, otp_code: str):
    await runtime_state.consume_phone_otp(phone, otp_code)


async def _consume_email_otp(runtime_state: RuntimeStateStore, email: str, otp_code: str):
    await runtime_state.consume_email_otp(email, otp_code)


async def register(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    user_data: UserCreate,
    runtime_state: RuntimeStateStore,
    request_ip: str,
    user_agent: str,
) -> AuthResponse:
    legacy = _legacy_module()
    if len(str(user_data.password or "").strip()) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    normalized_email = normalize_email(user_data.email)
    normalized_phone = normalize_phone(user_data.phone)
    if user_data.phone_otp:
        await _consume_phone_otp(runtime_state, normalized_phone, user_data.phone_otp)
    if not user_data.email_otp:
        raise HTTPException(status_code=400, detail="Email OTP is required for registration")
    await _consume_email_otp(runtime_state, normalized_email, user_data.email_otp)

    role_value = _normalize_user_role(user_data.role)
    registration_fee_settings = await legacy.get_registration_fee_settings()
    required_registration_fee = legacy.get_registration_fee_for_role(registration_fee_settings, role_value)
    legacy.validate_registration_payment_details(
        settings=registration_fee_settings,
        required_fee=required_registration_fee,
        registration_fee_ack=user_data.registration_fee_ack,
        payment_method=user_data.registration_payment_method,
        payment_utr=user_data.registration_payment_utr,
    )

    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_phone = await db.users.find_one({"phone": normalized_phone})
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone already registered")

    user_id = str(uuid.uuid4())
    user_dict = {
        "id": user_id,
        "email": normalized_email,
        "name": user_data.name,
        "phone": normalized_phone,
        "role": role_value,
        "gender": user_data.gender.value if isinstance(user_data.gender, Gender) else str(user_data.gender),
        "password_hash": hash_password(user_data.password),
        "created_at": get_ist_now(),
        "registration_fee_amount": float(required_registration_fee),
        "registration_payment_required": required_registration_fee > 0,
        "registration_payment_status": "submitted" if required_registration_fee > 0 else "not_required",
        "registration_payment_method": user_data.registration_payment_method,
        "registration_payment_utr": user_data.registration_payment_utr,
        "registration_verified_by_admin": required_registration_fee <= 0,
    }
    await db.users.insert_one(user_dict)

    if role_value == "driver":
        driver_profile = legacy.build_default_driver_profile(user_id)
        await db.drivers.update_one({"user_id": user_id}, {"$setOnInsert": driver_profile}, upsert=True)
    elif role_value == "operator":
        await ensure_operator_profile(db, user_id, user_dict)

    try:
        referral = await revenue_service.create_referral_if_missing(db, user_dict)
        user_dict["referral_code"] = referral.get("code")
        incoming_referral_code = str(user_data.referral_code or "").strip().upper()
        if incoming_referral_code:
            applied = await revenue_service.apply_referral_signup(db, user_dict, incoming_referral_code)
            if not applied:
                raise HTTPException(status_code=400, detail="Invalid or already used referral code")
    except Exception:
        await db.users.delete_one({"id": user_id})
        await db.drivers.delete_one({"user_id": user_id})
        await db.operator_profiles.delete_one({"operator_id": user_id})
        await db.referrals.delete_one({"user_id": user_id})
        raise

    refresh_token = create_refresh_token(user_dict["id"], role_value, str(uuid.uuid4()), settings)
    await _store_refresh_token(
        db=db,
        user_id=user_dict["id"],
        refresh_token=refresh_token,
        request_ip=request_ip,
        user_agent=user_agent,
    )
    await _audit_auth_event(
        db=db,
        action="REGISTER_SUCCESS",
        success=True,
        user_id=user_dict["id"],
        request_ip=request_ip,
        user_agent=user_agent,
        path="/api/auth/register",
    )
    return _auth_response_for_user(user_dict, settings, refresh_token=refresh_token)


async def login(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    credentials: UserLogin,
    client_ip: str,
    runtime_state: RuntimeStateStore,
    user_agent: str,
) -> AuthResponse:
    try:
        return await _login_primary(
            db=db,
            settings=settings,
            credentials=credentials,
            client_ip=client_ip,
            runtime_state=runtime_state,
            user_agent=user_agent,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Primary login flow failed unexpectedly for ip=%s", client_ip, exc_info=True)
        return await _login_compatibility_fallback(
            db=db,
            settings=settings,
            credentials=credentials,
            client_ip=client_ip,
            runtime_state=runtime_state,
            user_agent=user_agent,
        )


def _normalize_role_for_response(raw_role: Any) -> str:
    normalized = _role_value(raw_role)
    return normalized if normalized in VALID_USER_ROLES else "passenger"


def _to_auth_response_from_any(payload: Any) -> AuthResponse:
    if isinstance(payload, AuthResponse):
        return payload

    source_user = None
    if isinstance(payload, dict):
        source_user = payload.get("user") or {}
        access_token = str(payload.get("access_token") or "")
        refresh_token = payload.get("refresh_token")
    else:
        source_user = getattr(payload, "user", None) or {}
        access_token = str(getattr(payload, "access_token", "") or "")
        refresh_token = getattr(payload, "refresh_token", None)

    if not access_token:
        raise HTTPException(status_code=503, detail="Authentication token generation failed")

    if not isinstance(source_user, dict):
        source_user = {
            "id": getattr(source_user, "id", ""),
            "email": getattr(source_user, "email", ""),
            "name": getattr(source_user, "name", ""),
            "phone": getattr(source_user, "phone", ""),
            "role": getattr(source_user, "role", "passenger"),
            "gender": getattr(source_user, "gender", None),
            "referral_code": getattr(source_user, "referral_code", None),
            "created_at": getattr(source_user, "created_at", get_ist_now()),
        }

    created_at = source_user.get("created_at")
    if not isinstance(created_at, datetime):
        created_at = get_ist_now()

    user_response = UserResponse(
        id=str(source_user.get("id") or ""),
        email=str(source_user.get("email") or ""),
        name=str(source_user.get("name") or "User"),
        phone=str(source_user.get("phone") or ""),
        role=_normalize_role_for_response(source_user.get("role")),
        gender=str(source_user.get("gender") or "").strip().lower() or None,
        referral_code=str(source_user.get("referral_code") or "").strip().upper() or None,
        created_at=created_at,
    )
    return AuthResponse(
        access_token=access_token,
        refresh_token=str(refresh_token) if refresh_token else None,
        user=user_response,
    )


async def login_via_legacy_service(
    *,
    credentials: UserLogin,
    request: Any,
) -> AuthResponse:
    legacy = _legacy_module()
    legacy_result = await legacy.login(credentials, request)
    return _to_auth_response_from_any(legacy_result)


async def google_login_via_legacy_service(
    *,
    payload: GoogleAuthRequestModel,
    request: Any,
) -> AuthResponse:
    legacy = _legacy_module()
    legacy_result = await legacy.google_login(payload, request)
    return _to_auth_response_from_any(legacy_result)


async def login_rescue_path(
    *,
    db: AsyncIOMotorDatabase,
    settings: Settings,
    credentials: UserLogin,
    client_ip: str,
    user_agent: str,
) -> AuthResponse:
    normalized_email = normalize_email(credentials.email)
    try:
        user = await db.users.find_one({"email": normalized_email})
    except ServerSelectionTimeoutError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    password_ok = False
    password_hash = str((user or {}).get("password_hash") or "").strip()
    if password_hash:
        try:
            password_ok = verify_password(credentials.password, password_hash)
        except Exception:
            password_ok = False
    if not password_ok:
        legacy_password = str((user or {}).get("password") or "").strip()
        if legacy_password and legacy_password == str(credentials.password or ""):
            password_ok = True
            try:
                await db.users.update_one(
                    {"_id": user.get("_id")},
                    {"$set": {"password_hash": hash_password(credentials.password)}, "$unset": {"password": ""}},
                )
            except Exception:
                pass

    if not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if str(user.get("status") or "").strip().lower() == "blocked":
        raise HTTPException(status_code=403, detail="Account blocked")

    user_id = str(user.get("id") or "").strip()
    if not user_id:
        user_id = str(uuid.uuid4())
        try:
            await db.users.update_one({"_id": user.get("_id")}, {"$set": {"id": user_id}})
            user["id"] = user_id
        except Exception:
            pass

    normalized_role = _normalize_user_role(user.get("role"))
    if normalized_role == "driver":
        await driver_trust_service.verify_driver_not_blacklisted(
            db=db,
            redis_client=None,
            driver_user_id=user_id,
        )
    elif normalized_role == "operator":
        await ensure_operator_profile(db, user_id, user)
    if normalized_role != _role_value(user.get("role")):
        try:
            await db.users.update_one({"_id": user.get("_id")}, {"$set": {"role": normalized_role}})
        except Exception:
            pass
        user["role"] = normalized_role

    refresh_token: Optional[str] = None
    try:
        refresh_token = create_refresh_token(user_id, normalized_role, str(uuid.uuid4()), settings)
        await _store_refresh_token(
            db=db,
            user_id=user_id,
            refresh_token=refresh_token,
            request_ip=client_ip,
            user_agent=user_agent,
        )
    except Exception:
        logger.exception("Rescue login refresh token issue for user_id=%s", user_id, exc_info=True)
        refresh_token = None

    await _audit_auth_event(
        db=db,
        action="LOGIN_RESCUE_SUCCESS",
        success=True,
        user_id=user_id,
        request_ip=client_ip,
        user_agent=user_agent,
        path="/api/auth/login",
        metadata={"email": normalized_email},
    )
    return _auth_response_for_user(user, settings, refresh_token=refresh_token)


async def _login_primary(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    credentials: UserLogin,
    client_ip: str,
    runtime_state: RuntimeStateStore,
    user_agent: str,
) -> AuthResponse:
    normalized_email = normalize_email(credentials.email)
    try:
        user = await db.users.find_one({"email": normalized_email})
    except ServerSelectionTimeoutError as exc:
        logger.error("MongoDB server selection timed out during login for %s", normalized_email)
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc
    except PyMongoError as exc:
        logger.exception("MongoDB error during login for %s", normalized_email, exc_info=True)
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc

    password_hash = str((user or {}).get("password_hash") or "").strip()
    password_ok = False
    if user and password_hash:
        try:
            password_ok = verify_password(credentials.password, password_hash)
        except Exception:
            logger.warning("Password hash verification failed for user_id=%s", user.get("id"))
            password_ok = False
    elif user:
        legacy_password = str((user or {}).get("password") or "").strip()
        if legacy_password and legacy_password == str(credentials.password or ""):
            password_ok = True
            try:
                await db.users.update_one(
                    {"id": user.get("id")},
                    {
                        "$set": {"password_hash": hash_password(credentials.password)},
                        "$unset": {"password": ""},
                    },
                )
            except Exception:
                logger.warning("Legacy password migration failed for user_id=%s", user.get("id"))

    if not user or not password_ok:
        await _audit_auth_event(
            db=db,
            action="LOGIN_FAILED",
            success=False,
            user_id=str((user or {}).get("id") or ""),
            request_ip=client_ip,
            user_agent=user_agent,
            path="/api/auth/login",
            metadata={"reason": "invalid_credentials", "email": normalized_email},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("registration_payment_required") and user.get("registration_payment_status") != "verified":
        raise HTTPException(status_code=403, detail="Registration payment verification is in progress")

    user_id = _normalize_user_id(user.get("id"))
    normalized_role = _normalize_user_role(user.get("role"))
    if normalized_role == "driver":
        await driver_trust_service.verify_driver_not_blacklisted(
            db=db,
            redis_client=None,
            driver_user_id=user_id,
        )
    elif normalized_role == "operator":
        await ensure_operator_profile(db, user_id, user)
    if normalized_role != _role_value(user.get("role")):
        try:
            await db.users.update_one({"id": user_id}, {"$set": {"role": normalized_role}})
            user["role"] = normalized_role
        except Exception:
            logger.warning("Failed to normalize missing/invalid role for user_id=%s", user.get("id"))
            user["role"] = normalized_role

    refresh_token = create_refresh_token(user_id, normalized_role, str(uuid.uuid4()), settings)
    try:
        await _store_refresh_token(
            db=db,
            user_id=user_id,
            refresh_token=refresh_token,
            request_ip=client_ip,
            user_agent=user_agent,
        )
    except ServerSelectionTimeoutError as exc:
        logger.error("MongoDB server selection timed out while storing refresh token for user_id=%s", user.get("id"))
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc
    except PyMongoError as exc:
        logger.exception("MongoDB error while storing refresh token for user_id=%s", user.get("id"), exc_info=True)
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc
    await _audit_auth_event(
        db=db,
        action="LOGIN_SUCCESS",
        success=True,
        user_id=user_id,
        request_ip=client_ip,
        user_agent=user_agent,
        path="/api/auth/login",
    )
    return _auth_response_for_user(user, settings, refresh_token=refresh_token)


async def _login_compatibility_fallback(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    credentials: UserLogin,
    client_ip: str,
    runtime_state: RuntimeStateStore,
    user_agent: str,
) -> AuthResponse:
    normalized_email = normalize_email(credentials.email)
    try:
        user = await db.users.find_one({"email": normalized_email})
    except ServerSelectionTimeoutError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.") from exc

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    password_hash = str((user or {}).get("password_hash") or "").strip()
    password_ok = False
    if password_hash:
        try:
            password_ok = verify_password(credentials.password, password_hash)
        except Exception:
            password_ok = False
    else:
        legacy_password = str((user or {}).get("password") or "").strip()
        if legacy_password and legacy_password == str(credentials.password or ""):
            password_ok = True

    if not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = _normalize_user_id(user.get("id"))
    role = _normalize_user_role(user.get("role"))
    if role == "driver":
        await driver_trust_service.verify_driver_not_blacklisted(
            db=db,
            redis_client=None,
            driver_user_id=user_id,
        )
    elif role == "operator":
        await ensure_operator_profile(db, user_id, user)
    refresh_token: Optional[str] = None
    try:
        refresh_token = create_refresh_token(user_id, role, str(uuid.uuid4()), settings)
        await _store_refresh_token(
            db=db,
            user_id=user_id,
            refresh_token=refresh_token,
            request_ip=client_ip,
            user_agent=user_agent,
        )
    except Exception:
        logger.exception("Compatibility login refresh-token issue for user_id=%s", user_id, exc_info=True)
        refresh_token = None

    return _auth_response_for_user(user, settings, refresh_token=refresh_token)


async def google_login(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    payload: GoogleAuthRequestModel,
    request_ip: str,
    user_agent: str,
) -> AuthResponse:
    legacy = _legacy_module()
    profile_email: Optional[str] = None
    profile_name: Optional[str] = None

    if payload.google_id_token:
        if not google_id_token or not GoogleAuthRequest:
            raise HTTPException(status_code=500, detail="Google login is not configured on server")
        try:
            idinfo = google_id_token.verify_oauth2_token(
                payload.google_id_token,
                GoogleAuthRequest(),
                settings.google_oauth_client_id or None,
            )
            profile_email = str(idinfo.get("email") or "").lower()
            profile_name = str(idinfo.get("name") or "").strip()
            if not profile_email:
                raise HTTPException(status_code=400, detail="Google account did not return email")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid Google login token")
    else:
        if not payload.email or not payload.name:
            raise HTTPException(status_code=400, detail="Provide Google token or email + name")
        profile_email = str(payload.email).lower()
        profile_name = str(payload.name).strip()

    user = await db.users.find_one({"email": profile_email})
    created_new_user = False
    if user and payload.mode == "register":
        raise HTTPException(status_code=400, detail="Email already registered. Please login with Google.")

    if not user:
        if payload.mode != "register":
            raise HTTPException(status_code=404, detail="Account not found. Please register with Google first.")
        if not str(payload.name or "").strip():
            raise HTTPException(status_code=400, detail="Name is required for Google registration")
        if not str(payload.phone or "").strip():
            raise HTTPException(status_code=400, detail="Phone number is required for Google registration")
        if not payload.gender:
            raise HTTPException(status_code=400, detail="Gender is required for Google registration")

        role_value = _normalize_user_role(payload.role)
        registration_fee_settings = await legacy.get_registration_fee_settings()
        required_registration_fee = legacy.get_registration_fee_for_role(registration_fee_settings, role_value)
        legacy.validate_registration_payment_details(
            settings=registration_fee_settings,
            required_fee=required_registration_fee,
            registration_fee_ack=payload.registration_fee_ack,
            payment_method=payload.registration_payment_method,
            payment_utr=payload.registration_payment_utr,
        )

        phone = normalize_phone(payload.phone)
        user = await legacy.create_user_for_social_or_otp(
            name=str(payload.name or profile_name or "").strip(),
            phone=phone,
            role=role_value,
            gender=payload.gender,
            email=profile_email,
        )
        created_new_user = True
        if role_value == "operator":
            await ensure_operator_profile(db, str(user.get("id") or ""), user)

        if required_registration_fee > 0:
            await db.users.update_one(
                {"id": user["id"]},
                {
                    "$set": {
                        "registration_fee_amount": float(required_registration_fee),
                        "registration_payment_required": True,
                        "registration_payment_status": "submitted",
                        "registration_payment_method": payload.registration_payment_method,
                        "registration_payment_utr": payload.registration_payment_utr,
                        "registration_verified_by_admin": False,
                    }
                },
            )
            user = await db.users.find_one({"id": user["id"]})

    try:
        referral = await revenue_service.create_referral_if_missing(db, user)
        user["referral_code"] = referral.get("code")
        incoming_referral_code = str(payload.referral_code or "").strip().upper()
        if payload.mode == "register" and incoming_referral_code:
            applied = await revenue_service.apply_referral_signup(db, user, incoming_referral_code)
            if not applied:
                raise HTTPException(status_code=400, detail="Invalid or already used referral code")
    except Exception:
        if created_new_user:
            await db.users.delete_one({"id": str(user.get("id") or "")})
            await db.drivers.delete_one({"user_id": str(user.get("id") or "")})
            await db.operator_profiles.delete_one({"operator_id": str(user.get("id") or "")})
            await db.referrals.delete_one({"user_id": str(user.get("id") or "")})
        raise

    if user.get("registration_payment_required") and user.get("registration_payment_status") != "verified":
        raise HTTPException(status_code=403, detail="Registration payment verification is in progress")

    user_id = _normalize_user_id(user.get("id"))
    if _normalize_user_role(user.get("role")) == "operator":
        await ensure_operator_profile(db, user_id, user)
    refresh_token = create_refresh_token(user_id, _normalize_user_role(user.get("role")), str(uuid.uuid4()), settings)
    await _store_refresh_token(
        db=db,
        user_id=user_id,
        refresh_token=refresh_token,
        request_ip=request_ip,
        user_agent=user_agent,
    )
    await _audit_auth_event(
        db=db,
        action="GOOGLE_AUTH_SUCCESS",
        success=True,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        path="/api/auth/google",
        metadata={"mode": payload.mode},
    )
    return _auth_response_for_user(user, settings, refresh_token=refresh_token)


async def send_otp(
    settings: Settings,
    payload: OtpSendRequest,
    runtime_state: RuntimeStateStore,
) -> OtpSendResponse:
    phone = normalize_phone(payload.phone)
    otp_code = f"{random.randint(100000, 999999)}"
    await runtime_state.store_phone_otp(phone, otp_code)
    return OtpSendResponse(
        message="OTP sent successfully",
        expires_in_seconds=max(60, settings.otp_expiry_minutes * 60),
        otp_demo=otp_code if settings.environment != "production" else None,
    )


async def send_email_otp(
    settings: Settings,
    payload: EmailOtpSendRequest,
    runtime_state: RuntimeStateStore,
) -> OtpSendResponse:
    email = normalize_email(payload.email)
    otp_code = f"{random.randint(100000, 999999)}"
    await runtime_state.store_email_otp(email, otp_code)
    try:
        delivered = await send_otp_email_message(
            recipient_email=email,
            otp_code=otp_code,
            production=settings.is_production_env,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return OtpSendResponse(
        message="Email OTP sent successfully" if delivered else "Email OTP generated for development",
        expires_in_seconds=max(60, settings.otp_expiry_minutes * 60),
        otp_demo=otp_code if settings.environment != "production" else None,
    )


async def verify_otp(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    payload: OtpVerifyRequest,
    runtime_state: RuntimeStateStore,
    request_ip: str,
    user_agent: str,
) -> AuthResponse:
    legacy = _legacy_module()
    phone = normalize_phone(payload.phone)
    await _consume_phone_otp(runtime_state, phone, payload.otp)
    user = await db.users.find_one({"phone": phone})
    if not user:
        generated_email = payload.email or f"{phone}@otp.autobuddy.app"
        user = await legacy.create_user_for_social_or_otp(
            name=payload.name or "OTP User",
            phone=phone,
            role=_normalize_user_role(payload.role),
            email=generated_email,
        )
    referral = await revenue_service.create_referral_if_missing(db, user)
    user["referral_code"] = referral.get("code")
    user_id = _normalize_user_id(user.get("id"))
    refresh_token = create_refresh_token(user_id, _normalize_user_role(user.get("role")), str(uuid.uuid4()), settings)
    await _store_refresh_token(
        db=db,
        user_id=user_id,
        refresh_token=refresh_token,
        request_ip=request_ip,
        user_agent=user_agent,
    )
    await _audit_auth_event(
        db=db,
        action="OTP_LOGIN_SUCCESS",
        success=True,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        path="/api/auth/otp/verify",
    )
    return _auth_response_for_user(user, settings, refresh_token=refresh_token)


async def refresh_access_token(
    *,
    db: AsyncIOMotorDatabase,
    settings: Settings,
    refresh_token: str,
    request_ip: str = "",
    user_agent: str = "",
) -> Dict[str, str]:
    try:
        decoded = decode_refresh_token(refresh_token, settings)
    except HTTPException:
        await _audit_auth_event(
            db=db,
            action="REFRESH_FAILED",
            success=False,
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
            metadata={"reason": "decode_failed"},
        )
        raise
    token_hash = _hash_refresh_token(refresh_token)
    stored = await db.refresh_tokens.find_one({"token_hash": token_hash})
    if not stored:
        await _audit_auth_event(
            db=db,
            action="REFRESH_FAILED",
            success=False,
            user_id=str(decoded.get("sub") or ""),
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
            metadata={"reason": "token_not_found"},
        )
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if bool(stored.get("revoked")):
        user_id = str(stored.get("user_id") or decoded.get("sub") or "").strip()
        if user_id:
            await db.refresh_tokens.update_many(
                {"user_id": user_id, "revoked": False},
                {"$set": {"revoked": True, "revoked_at": get_ist_now(), "revoke_reason": "refresh_token_reuse"}},
            )
        await _audit_auth_event(
            db=db,
            action="REFRESH_REUSE_DETECTED",
            success=False,
            user_id=user_id,
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
        )
        raise HTTPException(status_code=401, detail="Refresh token reuse detected. Please login again.")
    if stored.get("expires_at") and stored["expires_at"] < get_ist_now():
        await _audit_auth_event(
            db=db,
            action="REFRESH_FAILED",
            success=False,
            user_id=str(stored.get("user_id") or decoded.get("sub") or ""),
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
            metadata={"reason": "expired"},
        )
        raise HTTPException(status_code=401, detail="Refresh token expired")
    stored_user_id = str(stored.get("user_id") or "").strip()
    decoded_user_id = str(decoded.get("sub") or "").strip()
    if stored_user_id and decoded_user_id and stored_user_id != decoded_user_id:
        await _audit_auth_event(
            db=db,
            action="REFRESH_FAILED",
            success=False,
            user_id=decoded_user_id,
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
            metadata={"reason": "token_subject_mismatch"},
        )
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await db.users.find_one({"id": decoded_user_id})
    if not user:
        await _audit_auth_event(
            db=db,
            action="REFRESH_FAILED",
            success=False,
            user_id=str(decoded.get("sub") or ""),
            request_ip=request_ip,
            user_agent=user_agent,
            path="/api/auth/refresh",
            metadata={"reason": "user_not_found"},
        )
        raise HTTPException(status_code=401, detail="User not found")
    user_id = _normalize_user_id(user.get("id"))
    role = _normalize_user_role(user.get("role"))
    await db.refresh_tokens.update_one(
        {"token_hash": token_hash},
        {
            "$set": {
                "revoked": True,
                "revoked_at": get_ist_now(),
                "revoke_reason": "rotated",
            }
        },
    )
    new_refresh_token = create_refresh_token(user_id, role, str(uuid.uuid4()), settings)
    await _store_refresh_token(
        db=db,
        user_id=user_id,
        refresh_token=new_refresh_token,
        request_ip=request_ip,
        user_agent=user_agent,
    )
    await _audit_auth_event(
        db=db,
        action="REFRESH_ROTATED",
        success=True,
        user_id=user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        path="/api/auth/refresh",
    )
    return {
        "access_token": create_access_token(user_id, role, settings),
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


async def logout(
    *,
    db: AsyncIOMotorDatabase,
    refresh_token: str,
    user_id: Optional[str] = None,
    request_ip: str = "",
    user_agent: str = "",
) -> None:
    await _revoke_refresh_token(db, refresh_token)
    await _audit_auth_event(
        db=db,
        action="LOGOUT",
        success=True,
        user_id=str(user_id or ""),
        request_ip=request_ip,
        user_agent=user_agent,
        path="/api/auth/logout",
    )
