"""
GDPR Compliance Schemas
Data privacy, export, and deletion request schemas
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from pydantic import BaseModel, Field, EmailStr


class DataExportStatus(str, Enum):
    """Data export request status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class DataExportFormat(str, Enum):
    """Data export format"""
    JSON = "json"
    CSV = "csv"
    PDF = "pdf"
    ZIP = "zip"


class ConsentType(str, Enum):
    """Types of user consent"""
    MARKETING_EMAIL = "marketing_email"
    MARKETING_SMS = "marketing_sms"
    MARKETING_PUSH = "marketing_push"
    DATA_PROCESSING = "data_processing"
    THIRD_PARTY_SHARING = "third_party_sharing"
    COOKIES_FUNCTIONAL = "cookies_functional"
    COOKIES_ANALYTICS = "cookies_analytics"
    COOKIES_MARKETING = "cookies_marketing"


class DataExportRequest(BaseModel):
    """Request data export"""
    format: DataExportFormat = Field(DataExportFormat.ZIP, description="Export format")
    email: Optional[EmailStr] = Field(None, description="Email to send download link")
    include_rides: bool = Field(True, description="Include ride history")
    include_payments: bool = Field(True, description="Include payment history")
    include_messages: bool = Field(True, description="Include messages")


class DataExportResponse(BaseModel):
    """Data export response"""
    export_id: str
    status: DataExportStatus
    requested_at: datetime
    completed_at: Optional[datetime] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    file_size_bytes: Optional[int] = None
    
    class Config:
        from_attributes = True


class AccountDeletionRequest(BaseModel):
    """Request account deletion"""
    confirm_deletion: bool = Field(..., description="Must be true to confirm")
    reason: Optional[str] = Field(None, max_length=500, description="Deletion reason")
    delete_immediately: bool = Field(False, description="Delete immediately vs 30-day grace period")


class AccountDeletionResponse(BaseModel):
    """Account deletion response"""
    deletion_id: str
    scheduled_deletion_date: datetime
    can_recover_until: Optional[datetime] = None
    message: str


class ConsentUpdate(BaseModel):
    """Update user consent preferences"""
    consent_type: ConsentType
    granted: bool
    consent_text: Optional[str] = None


class ConsentResponse(BaseModel):
    """User consent response"""
    consent_type: ConsentType
    granted: bool
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    consent_version: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class UserConsentPreferences(BaseModel):
    """All user consent preferences"""
    user_id: str
    consents: List[ConsentResponse]
    last_updated: datetime


class DataRetentionPolicy(BaseModel):
    """Data retention policy"""
    data_type: str
    retention_days: int
    description: str


class PrivacySettingsUpdate(BaseModel):
    """Update privacy settings"""
    profile_visibility: Optional[str] = Field(None, description="public, friends, private")
    show_ride_history: Optional[bool] = None
    allow_location_tracking: Optional[bool] = None
    allow_analytics: Optional[bool] = None


class PrivacySettingsResponse(BaseModel):
    """Privacy settings response"""
    user_id: str
    profile_visibility: str
    show_ride_history: bool
    allow_location_tracking: bool
    allow_analytics: bool
    updated_at: datetime


class DataAccessLog(BaseModel):
    """Log entry for data access (audit trail)"""
    log_id: str
    user_id: str
    action: str  # export, delete, access, update
    resource_type: str  # user_profile, rides, payments, etc.
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None


class GDPRComplianceReport(BaseModel):
    """GDPR compliance report"""
    total_users: int
    total_export_requests: int
    total_deletion_requests: int
    average_export_time_hours: float
    pending_exports: int
    pending_deletions: int
    data_breaches: int
    compliance_score: float
    generated_at: datetime
