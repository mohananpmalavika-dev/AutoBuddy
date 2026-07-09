"""
GDPR Models
MongoDB models for data privacy compliance
"""
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from bson import ObjectId


class DataExport(BaseModel):
    """Data export request model"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    status: str  # pending, processing, completed, failed, expired
    format: str  # json, csv, pdf, zip
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    include_rides: bool = True
    include_payments: bool = True
    include_messages: bool = True
    error_message: Optional[str] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class AccountDeletion(BaseModel):
    """Account deletion request model"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    scheduled_deletion_date: datetime
    deleted_at: Optional[datetime] = None
    recovered_at: Optional[datetime] = None
    can_recover_until: Optional[datetime] = None
    deletion_reason: Optional[str] = None
    delete_immediately: bool = False
    status: str  # pending, completed, recovered
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class UserConsent(BaseModel):
    """User consent tracking model"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    consent_type: str
    granted: bool
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    consent_version: str = "1.0"
    consent_text: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class PrivacySettings(BaseModel):
    """User privacy settings model"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    profile_visibility: str = "public"  # public, friends, private
    show_ride_history: bool = True
    allow_location_tracking: bool = True
    allow_analytics: bool = True
    allow_marketing: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class DataAccessAuditLog(BaseModel):
    """Audit log for data access (GDPR requirement)"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    action: str  # export, delete, access, update, consent_change
    resource_type: str  # user_profile, rides, payments, messages, etc.
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}
