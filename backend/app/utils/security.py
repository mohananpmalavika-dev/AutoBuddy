import base64
import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.core.config import Settings

ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def _resolve_refresh_secret(settings: Settings) -> str:
    return settings.jwt_refresh_secret or settings.jwt_secret


def _resolve_fernet_secret(settings: Settings) -> str:
    if settings.fernet_secret:
        return settings.fernet_secret
    seed = (settings.jwt_secret or "autobuddy-dev-fernet-seed").encode("utf-8")
    derived = hashlib.sha256(seed).digest()
    return base64.urlsafe_b64encode(derived).decode("utf-8")


def create_access_token(user_id: str, role: str, settings: Settings) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, role: str, token_id: str, settings: Settings) -> str:
    payload = {
        "sub": user_id,
        "jti": token_id,
        "role": role,
        "type": "refresh",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, _resolve_refresh_secret(settings), algorithm=settings.jwt_algorithm)


def create_token(user_id: str, role: str, settings: Settings) -> str:
    # Backward-compatible alias used by legacy code.
    return create_access_token(user_id, role, settings)


def decode_access_token(token: str, settings: Settings) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        token_type = str(payload.get("type") or "access").strip().lower()
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def decode_refresh_token(token: str, settings: Settings) -> Dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            _resolve_refresh_secret(settings),
            algorithms=[settings.jwt_algorithm],
        )
        if str(payload.get("type") or "").strip().lower() != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


def decode_token(token: str, settings: Settings) -> Dict[str, Any]:
    # Backward-compatible alias used by server/socket code.
    return decode_access_token(token, settings)


def encrypt_value(value: str, settings: Settings) -> str:
    if not value:
        return ""
    fernet = Fernet(_resolve_fernet_secret(settings).encode())
    return fernet.encrypt(value.encode()).decode()


def decrypt_value(value: str, settings: Settings) -> str:
    if not value:
        return ""
    fernet = Fernet(_resolve_fernet_secret(settings).encode())
    return fernet.decrypt(value.encode()).decode()
