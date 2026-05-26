import re
from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRole(str, Enum):
    PASSENGER = "passenger"
    DRIVER = "driver"
    ADMIN = "admin"


PHONE_PATTERN = r"^\d{10}$"
OTP_PATTERN = r"^\d{4,8}$"
PHONE_REGEX = re.compile(r"^[6-9]\d{9}$")
NAME_REGEX = re.compile(r"^[A-Za-z\s]{2,80}$")


class UserBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=PHONE_PATTERN)
    role: UserRole = UserRole.PASSENGER

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not NAME_REGEX.match(cleaned):
            raise ValueError("Name should contain only letters and spaces")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not PHONE_REGEX.match(cleaned):
            raise ValueError("Invalid Indian mobile number")
        return cleaned


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    phone_otp: Optional[str] = Field(default=None, pattern=OTP_PATTERN)
    email_otp: Optional[str] = Field(default=None, pattern=OTP_PATTERN)
    referral_code: Optional[str] = Field(default=None, min_length=4, max_length=20)
    registration_fee_ack: bool = False
    registration_payment_method: Optional[Literal["qr", "upi", "razorpay"]] = None
    registration_payment_utr: Optional[str] = Field(default=None, min_length=6, max_length=80)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        text = str(value or "")
        if not re.search(r"[A-Z]", text):
            raise ValueError("Password must contain one uppercase letter")
        if not re.search(r"[a-z]", text):
            raise ValueError("Password must contain one lowercase letter")
        if not re.search(r"\d", text):
            raise ValueError("Password must contain one number")
        return text


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    google_id_token: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = Field(default=None, pattern=PHONE_PATTERN)
    role: UserRole = UserRole.PASSENGER
    mode: Literal["login", "register"] = "login"
    referral_code: Optional[str] = Field(default=None, min_length=4, max_length=20)
    registration_fee_ack: bool = False
    registration_payment_method: Optional[Literal["qr", "upi", "razorpay"]] = None
    registration_payment_utr: Optional[str] = Field(default=None, min_length=6, max_length=80)


class OtpSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    phone: str = Field(pattern=PHONE_PATTERN)


class EmailOtpSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr


class OtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    phone: str = Field(pattern=PHONE_PATTERN)
    otp: str = Field(pattern=OTP_PATTERN)
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.PASSENGER


class OtpSendResponse(BaseModel):
    message: str
    expires_in_seconds: int
    otp_demo: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    phone: str
    role: UserRole
    referral_code: Optional[str] = None
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    refresh_token: str = Field(min_length=20)


class LogoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    refresh_token: str = Field(min_length=20)
