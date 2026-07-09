"""
Privacy & GDPR Compliance Router
Endpoints for data export, deletion, and consent management
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from typing import List, Optional
import os

from app.schemas.gdpr import (
    DataExportRequest,
    DataExportResponse,
    AccountDeletionRequest,
    AccountDeletionResponse,
    ConsentUpdate,
    ConsentResponse,
    UserConsentPreferences,
    PrivacySettingsUpdate,
    PrivacySettingsResponse,
)
from app.services.gdpr_service import GDPRService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/privacy", tags=["privacy"])
gdpr_service = GDPRService()


@router.post("/export", response_model=DataExportResponse)
async def request_data_export(
    request: DataExportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Request data export (GDPR Right to Access)
    
    User receives all personal data in specified format.
    Download link expires after 7 days.
    """
    try:
        export = await gdpr_service.request_data_export(
            user_id=current_user["id"],
            export_format=request.format.value,
            include_rides=request.include_rides,
            include_payments=request.include_payments,
            include_messages=request.include_messages
        )
        
        return DataExportResponse(
            export_id=export.id,
            status=export.status,
            requested_at=export.requested_at,
            completed_at=export.completed_at,
            download_url=export.download_url,
            expires_at=export.expires_at,
            file_size_bytes=export.file_size_bytes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/export/{export_id}/status", response_model=DataExportResponse)
async def get_export_status(
    export_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check data export status"""
    export = await gdpr_service.get_export_status(export_id)
    
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    
    if export.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return DataExportResponse(
        export_id=export.id,
        status=export.status,
        requested_at=export.requested_at,
        completed_at=export.completed_at,
        download_url=export.download_url,
        expires_at=export.expires_at,
        file_size_bytes=export.file_size_bytes
    )


@router.get("/download/{export_id}")
async def download_export(
    export_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download data export file"""
    export = await gdpr_service.get_export_status(export_id)
    
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    
    if export.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if export.status != "completed":
        raise HTTPException(status_code=400, detail="Export not ready")
    
    if not export.file_path or not os.path.exists(export.file_path):
        raise HTTPException(status_code=404, detail="Export file not found")
    
    return FileResponse(
        export.file_path,
        media_type="application/zip",
        filename=f"autobuddy_data_export_{export_id}.zip"
    )


@router.post("/delete-account", response_model=AccountDeletionResponse)
async def request_account_deletion(
    request: AccountDeletionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Request account deletion (GDPR Right to be Forgotten)
    
    - Default: 30-day grace period to recover
    - Immediate: Instant deletion (cannot be recovered)
    """
    if not request.confirm_deletion:
        raise HTTPException(status_code=400, detail="Must confirm deletion")
    
    try:
        deletion = await gdpr_service.request_account_deletion(
            user_id=current_user["id"],
            reason=request.reason,
            delete_immediately=request.delete_immediately
        )
        
        message = (
            "Account will be deleted immediately" if request.delete_immediately
            else f"Account scheduled for deletion on {deletion.scheduled_deletion_date.strftime('%Y-%m-%d')}. You can recover it before then."
        )
        
        return AccountDeletionResponse(
            deletion_id=deletion.id,
            scheduled_deletion_date=deletion.scheduled_deletion_date,
            can_recover_until=deletion.can_recover_until,
            message=message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


@router.post("/consent", response_model=ConsentResponse)
async def update_consent(
    consent: ConsentUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Update user consent preferences"""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    try:
        updated_consent = await gdpr_service.update_consent(
            user_id=current_user["id"],
            consent_type=consent.consent_type.value,
            granted=consent.granted,
            consent_text=consent.consent_text,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return ConsentResponse(
            consent_type=consent.consent_type,
            granted=updated_consent.granted,
            granted_at=updated_consent.granted_at,
            revoked_at=updated_consent.revoked_at,
            consent_version=updated_consent.consent_version,
            ip_address=updated_consent.ip_address,
            user_agent=updated_consent.user_agent
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consent update failed: {str(e)}")


@router.get("/consents", response_model=UserConsentPreferences)
async def get_user_consents(current_user: dict = Depends(get_current_user)):
    """Get all user consent preferences"""
    consents = await gdpr_service.get_user_consents(current_user["id"])
    
    consent_responses = [
        ConsentResponse(
            consent_type=c.consent_type,
            granted=c.granted,
            granted_at=c.granted_at,
            revoked_at=c.revoked_at,
            consent_version=c.consent_version,
            ip_address=c.ip_address,
            user_agent=c.user_agent
        )
        for c in consents
    ]
    
    return UserConsentPreferences(
        user_id=current_user["id"],
        consents=consent_responses,
        last_updated=max([c.updated_at for c in consents]) if consents else None
    )


@router.get("/policy/terms")
async def get_terms_of_service():
    """Get current Terms of Service"""
    return {
        "version": "1.0",
        "effective_date": "2026-01-01",
        "content_url": "https://autobuddy.com/terms",
        "summary": "Terms of Service for AutoBuddy platform"
    }


@router.get("/policy/privacy")
async def get_privacy_policy():
    """Get current Privacy Policy"""
    return {
        "version": "1.0",
        "effective_date": "2026-01-01",
        "content_url": "https://autobuddy.com/privacy",
        "summary": "Privacy Policy compliant with GDPR, CCPA"
    }
